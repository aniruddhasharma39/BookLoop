-- ==============================================================================
-- BookLoop Step 3: Security Remediation & System Hardening
-- Migration 20261030000003_security_remediation_and_hardening.sql
--
-- Addresses:
-- 1. Disallow buyers from directly updating interest requests (force RPC usage).
-- 2. Move WhatsApp numbers into private public.user_contacts table with strict RLS.
-- 3. Rebuild public_catalogue view WITH (security_invoker = true) to fix Supabase warning.
-- 4. Prevent sellers from reactivating admin-hidden or removed listings.
-- 5. Track applied migrations via public.schema_migrations_tracker.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. MIGRATION TRACKING TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.schema_migrations_tracker (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.schema_migrations_tracker ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view migration history"
ON public.schema_migrations_tracker FOR SELECT
USING (public.is_admin_or_moderator(auth.uid()));

-- Record previous migrations
INSERT INTO public.schema_migrations_tracker (version, description)
VALUES 
    ('20261030000000_initial_schema', 'Initial schema: tables, indexes, initial RLS'),
    ('20261030000001_security_and_rls_lockdown', 'Security lockdown: RPCs, audit logs, catalogue view'),
    ('20261030000002_storage_lockdown', 'Storage bucket security lockdown'),
    ('20261030000003_security_remediation_and_hardening', 'Remediate buyer request accept, whatsapp privacy, security definer view, listing reactivation')
ON CONFLICT (version) DO NOTHING;

-- ------------------------------------------------------------------------------
-- 2. FIX ISSUE 1: PROHIBIT DIRECT STATUS UPDATES ON INTEREST REQUESTS
-- ------------------------------------------------------------------------------
-- Drop the flawed update policy from initial migration that allowed participants
-- to update rows directly via PostgREST
DROP POLICY IF EXISTS "Participants can update request status" ON public.interest_requests;
DROP POLICY IF EXISTS "Admins can update request status" ON public.interest_requests;

-- Revoke direct UPDATE from anon and authenticated users
REVOKE UPDATE ON public.interest_requests FROM anon, authenticated;

-- Only admins / moderators can directly update via PostgREST if absolutely necessary;
-- standard users MUST use controlled SECURITY DEFINER RPCs (accept_interest_request, etc.)
CREATE POLICY "Admins can update request status"
ON public.interest_requests FOR UPDATE
USING (public.is_admin_or_moderator(auth.uid()))
WITH CHECK (public.is_admin_or_moderator(auth.uid()));

-- Direct updates on interest_requests are blocked at the engine level:
-- 1. REVOKE UPDATE ON public.interest_requests FROM anon, authenticated (line 46)
-- 2. "Admins can update request status" policy restricts UPDATE strictly to admins.
-- Drop any legacy trigger to avoid syntax or timing conflicts:
DROP TRIGGER IF EXISTS trg_guard_interest_request_updates ON public.interest_requests;
DROP FUNCTION IF EXISTS public.guard_interest_request_updates();

-- ------------------------------------------------------------------------------
-- 3. FIX ISSUE 2: MOVE WHATSAPP CONTACT NUMBERS TO PRIVATE TABLE
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.user_contacts (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    whatsapp_number TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_contacts_user ON public.user_contacts(user_id);
ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;

-- Migrate any existing WhatsApp numbers from profiles table
INSERT INTO public.user_contacts (user_id, whatsapp_number)
SELECT id, whatsapp_number
FROM public.profiles
WHERE whatsapp_number IS NOT NULL AND trim(whatsapp_number) <> ''
ON CONFLICT (user_id) DO UPDATE SET whatsapp_number = EXCLUDED.whatsapp_number;

-- Clear whatsapp_number from profiles table to prevent any row-level leakage
UPDATE public.profiles SET whatsapp_number = NULL WHERE whatsapp_number IS NOT NULL;

-- Strict RLS: ONLY the account owner and admins can SELECT/INSERT/UPDATE their own contact
DROP POLICY IF EXISTS "Users can read own contact" ON public.user_contacts;
CREATE POLICY "Users can read own contact"
ON public.user_contacts FOR SELECT
USING (auth.uid() = user_id OR public.is_admin_or_moderator(auth.uid()));

DROP POLICY IF EXISTS "Users can insert own contact" ON public.user_contacts;
CREATE POLICY "Users can insert own contact"
ON public.user_contacts FOR INSERT
WITH CHECK (auth.uid() = user_id OR public.is_admin_or_moderator(auth.uid()));

DROP POLICY IF EXISTS "Users can update own contact" ON public.user_contacts;
CREATE POLICY "Users can update own contact"
ON public.user_contacts FOR UPDATE
USING (auth.uid() = user_id OR public.is_admin_or_moderator(auth.uid()))
WITH CHECK (auth.uid() = user_id OR public.is_admin_or_moderator(auth.uid()));

-- Forwarding trigger: If an update is made to profiles with whatsapp_number,
-- automatically save it to user_contacts and keep profiles.whatsapp_number NULL
CREATE OR REPLACE FUNCTION public.sync_profile_whatsapp_to_private()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.whatsapp_number IS NOT NULL AND trim(NEW.whatsapp_number) <> '' THEN
        INSERT INTO public.user_contacts (user_id, whatsapp_number, updated_at)
        VALUES (NEW.id, NEW.whatsapp_number, timezone('utc'::text, now()))
        ON CONFLICT (user_id) DO UPDATE 
        SET whatsapp_number = EXCLUDED.whatsapp_number,
            updated_at = timezone('utc'::text, now());

        -- Always keep profiles.whatsapp_number clean/null for privacy
        UPDATE public.profiles
        SET whatsapp_number = NULL
        WHERE id = NEW.id AND whatsapp_number IS NOT NULL;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_sync_profile_whatsapp ON public.profiles;
CREATE TRIGGER trg_sync_profile_whatsapp
AFTER INSERT OR UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.sync_profile_whatsapp_to_private();

-- Reset profiles SELECT policy: Now that whatsapp_number is completely stripped from profiles,
-- public profiles (display_name, institution_id, course_or_class) are safe for everyone to read
DROP POLICY IF EXISTS "Users can read own profile and participants profile" ON public.profiles;
DROP POLICY IF EXISTS "Public profile fields are viewable by everyone" ON public.profiles;

CREATE POLICY "Public profile fields are viewable by everyone"
ON public.profiles FOR SELECT
USING (account_status != 'deleted');

-- Update get_seller_contact RPC to read strictly from user_contacts table
CREATE OR REPLACE FUNCTION public.get_seller_contact(p_request_id UUID)
RETURNS TABLE (
    seller_name TEXT,
    whatsapp_number TEXT,
    listing_title TEXT
) AS $$
DECLARE
    v_buyer_id UUID;
    v_seller_id UUID;
    v_listing_id UUID;
    v_status TEXT;
    v_listing_status TEXT;
    v_whatsapp TEXT;
    v_display_name TEXT;
    v_title TEXT;
BEGIN
    -- 1. Caller must be authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- 2. Fetch interest request
    SELECT buyer_id, seller_id, listing_id, status
    INTO v_buyer_id, v_seller_id, v_listing_id, v_status
    FROM public.interest_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    -- 3. Security check: Caller must be the buyer
    IF v_buyer_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Only the accepted buyer can retrieve seller contact';
    END IF;

    -- 4. Status must be strictly 'accepted'
    IF v_status <> 'accepted' THEN
        RAISE EXCEPTION 'Contact reveal unavailable: Request is not accepted';
    END IF;

    -- 5. Re-check listing status
    SELECT title, status INTO v_title, v_listing_status
    FROM public.listings
    WHERE id = v_listing_id;

    IF v_listing_status NOT IN ('active', 'sold') THEN
        RAISE EXCEPTION 'Listing is no longer available';
    END IF;

    -- 6. Retrieve seller display name from profiles and WhatsApp from user_contacts
    SELECT p.display_name INTO v_display_name
    FROM public.profiles p
    WHERE p.id = v_seller_id;

    SELECT c.whatsapp_number INTO v_whatsapp
    FROM public.user_contacts c
    WHERE c.user_id = v_seller_id;

    IF v_whatsapp IS NULL OR trim(v_whatsapp) = '' THEN
        RAISE EXCEPTION 'Seller has not configured their WhatsApp number';
    END IF;

    RETURN QUERY SELECT v_display_name, v_whatsapp, v_title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Update accept_interest_request RPC to check user_contacts table
CREATE OR REPLACE FUNCTION public.accept_interest_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_status TEXT;
    v_listing_id UUID;
    v_listing_status TEXT;
    v_seller_whatsapp TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT seller_id, listing_id, status
    INTO v_seller_id, v_listing_id, v_status
    FROM public.interest_requests
    WHERE id = p_request_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_seller_id <> auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Only the seller can accept this request';
    END IF;

    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending requests can be accepted';
    END IF;

    -- Check seller has configured WhatsApp in user_contacts before accepting
    SELECT whatsapp_number INTO v_seller_whatsapp
    FROM public.user_contacts
    WHERE user_id = auth.uid();

    IF v_seller_whatsapp IS NULL OR trim(v_seller_whatsapp) = '' THEN
        RAISE EXCEPTION 'You must save a valid WhatsApp contact number in your profile before accepting requests';
    END IF;

    -- Check listing is still active
    SELECT status INTO v_listing_status
    FROM public.listings
    WHERE id = v_listing_id;

    IF v_listing_status <> 'active' THEN
        RAISE EXCEPTION 'This listing is no longer active';
    END IF;

    -- Revert any other accepted request for this listing back to 'pending'
    UPDATE public.interest_requests
    SET status = 'pending',
        responded_at = NULL
    WHERE listing_id = v_listing_id 
      AND id <> p_request_id 
      AND status = 'accepted';

    UPDATE public.interest_requests
    SET status = 'accepted',
        responded_at = timezone('utc'::text, now())
    WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 4. FIX ISSUE 3: REBUILD public_catalogue WITH (security_invoker = true)
-- ------------------------------------------------------------------------------
DROP VIEW IF EXISTS public.public_catalogue;

CREATE OR REPLACE VIEW public.public_catalogue
WITH (security_invoker = true) AS
SELECT 
    l.id AS id,
    l.title AS title,
    l.author AS author,
    l.edition AS edition,
    l.category AS category,
    l.course_or_exam AS course_or_exam,
    l.condition AS condition,
    l.description AS description,
    l.price_paise AS price_paise,
    l.status AS status,
    l.created_at AS created_at,
    l.institution_id AS institution_id,
    i.name AS institution_name,
    i.institution_type AS institution_type,
    i.area AS institution_area,
    i.city AS institution_city,
    l.seller_id AS seller_id,
    p.display_name AS seller_display_name,
    COALESCE(
        json_agg(
            json_build_object(
                'storage_path', img.storage_path,
                'display_order', img.display_order
            ) ORDER BY img.display_order ASC
        ) FILTER (WHERE img.id IS NOT NULL), 
        '[]'::json
    ) AS images
FROM public.listings l
LEFT JOIN public.institutions i ON i.id = l.institution_id
JOIN public.profiles p ON p.id = l.seller_id
LEFT JOIN public.listing_images img ON img.listing_id = l.id
WHERE l.status = 'active'
GROUP BY l.id, i.id, p.id;

GRANT SELECT ON public.public_catalogue TO anon, authenticated;

-- ------------------------------------------------------------------------------
-- 5. FIX ISSUE 4: PREVENT SELLERS FROM REACTIVATING ADMIN-HIDDEN / REMOVED LISTINGS
-- ------------------------------------------------------------------------------
-- Update RLS on listings: Sellers can only update active or reserved or sold listings,
-- and cannot touch or reactivate listings with status = 'removed'
DROP POLICY IF EXISTS "Owners and admins can update listings" ON public.listings;
CREATE POLICY "Owners and admins can update listings"
ON public.listings FOR UPDATE
USING (
    (seller_id = auth.uid() AND status <> 'removed') 
    OR public.is_admin_or_moderator(auth.uid())
)
WITH CHECK (
    (
        seller_id = auth.uid() 
        AND status <> 'removed'
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')
    ) 
    OR public.is_admin_or_moderator(auth.uid())
);

-- Trigger to block any reactivation of 'removed' listings at the database engine level
CREATE OR REPLACE FUNCTION public.protect_listing_status()
RETURNS TRIGGER AS $$
BEGIN
    -- If caller is not admin
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        -- Prevent seller from reactivating any listing that was marked 'removed'
        IF OLD.status = 'removed' AND NEW.status <> 'removed' THEN
            RAISE EXCEPTION 'Unauthorized: A removed listing cannot be reactivated by the seller';
        END IF;

        -- Prevent seller from altering seller_id or creation date
        NEW.seller_id := OLD.seller_id;
        NEW.created_at := OLD.created_at;

        -- If seller marks listing as sold, automatically record sold_at
        IF NEW.status = 'sold' AND OLD.status <> 'sold' THEN
            NEW.sold_at := timezone('utc'::text, now());
        END IF;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_listing_status ON public.listings;
CREATE TRIGGER trg_protect_listing_status
BEFORE UPDATE ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.protect_listing_status();

-- ------------------------------------------------------------------------------
-- 6. EXPLICIT GRANTS & SCHEMA CACHE RELOAD
-- ------------------------------------------------------------------------------
GRANT SELECT, INSERT, UPDATE ON public.user_contacts TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_contact(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_interest_request(UUID) TO authenticated;

NOTIFY pgrst, 'reload schema';

