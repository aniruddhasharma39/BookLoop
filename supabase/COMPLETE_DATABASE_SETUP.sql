-- ==============================================================================
-- BookLoop Complete & Consolidated Database Setup
-- Run this script once in Supabase Dashboard -> SQL Editor
-- Completely idempotent: safe to run multiple times
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. INSTITUTIONS TABLE
CREATE TABLE IF NOT EXISTS public.institutions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    institution_type TEXT NOT NULL, -- e.g. College, University, High School
    city TEXT NOT NULL,
    area TEXT NOT NULL,
    verification_method TEXT NOT NULL DEFAULT 'self_selected',
    is_active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_institutions_city_active ON public.institutions (city, is_active);

-- 3. PROFILES TABLE (Public fields only; whatsapp_number moved to user_contacts)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    course_or_class TEXT,
    graduation_year INTEGER,
    whatsapp_number TEXT, -- Kept for backward compatibility, automatically synced to user_contacts
    whatsapp_verified_at TIMESTAMPTZ,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_institution ON public.profiles (institution_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (account_status);

-- 4. PRIVATE USER CONTACTS TABLE (STRICT PRIVACY FOR WHATSAPP)
CREATE TABLE IF NOT EXISTS public.user_contacts (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED,
    whatsapp_number TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_user_contacts_user ON public.user_contacts(user_id);

-- Migrate any existing WhatsApp numbers
INSERT INTO public.user_contacts (user_id, whatsapp_number)
SELECT id, whatsapp_number
FROM public.profiles
WHERE whatsapp_number IS NOT NULL AND trim(whatsapp_number) <> ''
ON CONFLICT (user_id) DO UPDATE SET whatsapp_number = EXCLUDED.whatsapp_number;

-- Clear whatsapp_number from public.profiles
UPDATE public.profiles SET whatsapp_number = NULL WHERE whatsapp_number IS NOT NULL;

-- 5. ADMIN ROLES TABLE
CREATE TABLE IF NOT EXISTS public.admin_roles (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE OR REPLACE FUNCTION public.is_admin_or_moderator(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles 
        WHERE user_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. ADMIN AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL,
    target_type TEXT NOT NULL,
    target_id UUID NOT NULL,
    reason TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.admin_audit_logs (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);

-- 7. LISTINGS TABLE
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    author TEXT,
    edition TEXT,
    category TEXT NOT NULL,
    course_or_exam TEXT,
    condition TEXT NOT NULL,
    description TEXT,
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'sold', 'removed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    sold_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_institution ON public.listings (institution_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON public.listings (category);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_price_paise ON public.listings (price_paise ASC);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON public.listings (seller_id);

CREATE INDEX IF NOT EXISTS idx_listings_fts ON public.listings USING gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(course_or_exam, ''))
);

-- 8. LISTING IMAGES TABLE
CREATE TABLE IF NOT EXISTS public.listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON public.listing_images (listing_id, display_order);

-- 9. INTEREST REQUESTS TABLE
CREATE TABLE IF NOT EXISTS public.interest_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    buyer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'cancelled', 'closed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    responded_at TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_request 
ON public.interest_requests (listing_id, buyer_id) 
WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS idx_interest_requests_buyer ON public.interest_requests (buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_interest_requests_seller ON public.interest_requests (seller_id, status);

-- 10. REPORTS TABLE
CREATE TABLE IF NOT EXISTS public.reports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reporter_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    reported_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    listing_id UUID REFERENCES public.listings(id) ON DELETE SET NULL,
    reason TEXT NOT NULL,
    details TEXT,
    status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'reviewing', 'resolved', 'dismissed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    resolved_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_reports_status ON public.reports (status, created_at DESC);

-- 11. MIGRATION TRACKER TABLE
CREATE TABLE IF NOT EXISTS public.schema_migrations_tracker (
    version TEXT PRIMARY KEY,
    description TEXT NOT NULL,
    applied_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- ==============================================================================
-- TRIGGERS & PROCEDURES
-- ==============================================================================

-- New user trigger: handles signup and creates profile
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
DECLARE
    inst_id UUID := NULL;
    raw_inst TEXT;
BEGIN
    raw_inst := new.raw_user_meta_data->>'institution_id';
    IF raw_inst IS NOT NULL AND raw_inst <> '' THEN
        BEGIN
            inst_id := raw_inst::UUID;
        EXCEPTION WHEN OTHERS THEN
            inst_id := NULL;
        END;
    END IF;

    INSERT INTO public.profiles (
        id,
        display_name,
        institution_id,
        course_or_class,
        account_status
    )
    VALUES (
        new.id,
        COALESCE(new.raw_user_meta_data->>'display_name', split_part(new.email, '@', 1)),
        inst_id,
        new.raw_user_meta_data->>'course_or_class',
        'active'
    )
    ON CONFLICT (id) DO NOTHING;

    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- Trigger to sync profile updates to private user_contacts table
CREATE OR REPLACE FUNCTION public.sync_profile_whatsapp_to_private()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.whatsapp_number IS NOT NULL AND trim(NEW.whatsapp_number) <> '' THEN
        INSERT INTO public.user_contacts (user_id, whatsapp_number, updated_at)
        VALUES (NEW.id, NEW.whatsapp_number, timezone('utc'::text, now()))
        ON CONFLICT (user_id) DO UPDATE 
        SET whatsapp_number = EXCLUDED.whatsapp_number,
            updated_at = timezone('utc'::text, now());

        -- Clear the plaintext column from profiles so it is never exposed in queries
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

-- Trigger to protect listing status from seller reactivation
CREATE OR REPLACE FUNCTION public.protect_listing_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        IF OLD.status = 'removed' AND NEW.status <> 'removed' THEN
            RAISE EXCEPTION 'Unauthorized: A removed listing cannot be reactivated by the seller';
        END IF;

        NEW.seller_id := OLD.seller_id;
        NEW.created_at := OLD.created_at;

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

-- Trigger to prevent direct interest request updates
CREATE OR REPLACE FUNCTION public.guard_interest_request_updates()
RETURNS TRIGGER AS $$
BEGIN
    IF public.is_admin_or_moderator(auth.uid()) THEN
        NEW.updated_at := timezone('utc'::text, now());
        RETURN NEW;
    END IF;

    IF OLD.status IS DISTINCT FROM NEW.status THEN
        IF session_user = current_user AND auth.uid() IS NOT NULL THEN
            RAISE EXCEPTION 'Direct interest request status updates are prohibited. Use accept_interest_request, decline_interest_request, or cancel_interest_request.';
        END IF;
    END IF;

    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_guard_interest_request_updates ON public.interest_requests;
CREATE TRIGGER trg_guard_interest_request_updates
BEFORE UPDATE ON public.interest_requests
FOR EACH ROW
EXECUTE FUNCTION public.guard_interest_request_updates();

-- ==============================================================================
-- CONTROLLED STORED PROCEDURES (RPCS)
-- ==============================================================================

-- 1. Seller Accepts Request
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

    SELECT whatsapp_number INTO v_seller_whatsapp
    FROM public.user_contacts
    WHERE user_id = auth.uid();

    IF v_seller_whatsapp IS NULL OR trim(v_seller_whatsapp) = '' THEN
        RAISE EXCEPTION 'You must save a valid WhatsApp contact number in your profile before accepting requests';
    END IF;

    SELECT status INTO v_listing_status
    FROM public.listings
    WHERE id = v_listing_id;

    IF v_listing_status <> 'active' THEN
        RAISE EXCEPTION 'This listing is no longer active';
    END IF;

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

-- 2. Seller Revokes Acceptance
CREATE OR REPLACE FUNCTION public.revoke_interest_request_acceptance(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT seller_id, status
    INTO v_seller_id, v_status
    FROM public.interest_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_seller_id <> auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Only the seller can revoke this acceptance';
    END IF;

    IF v_status <> 'accepted' THEN
        RAISE EXCEPTION 'Only accepted requests can be revoked';
    END IF;

    UPDATE public.interest_requests
    SET status = 'pending',
        responded_at = NULL
    WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Seller Declines Request
CREATE OR REPLACE FUNCTION public.decline_interest_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT seller_id, status
    INTO v_seller_id, v_status
    FROM public.interest_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_seller_id <> auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Only the seller can decline this request';
    END IF;

    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending requests can be declined';
    END IF;

    UPDATE public.interest_requests
    SET status = 'declined',
        responded_at = timezone('utc'::text, now())
    WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Buyer Cancels Own Request
CREATE OR REPLACE FUNCTION public.cancel_interest_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_buyer_id UUID;
    v_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT buyer_id, status
    INTO v_buyer_id, v_status
    FROM public.interest_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_buyer_id <> auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: Only the buyer can cancel their request';
    END IF;

    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending requests can be cancelled';
    END IF;

    UPDATE public.interest_requests
    SET status = 'cancelled',
        responded_at = timezone('utc'::text, now())
    WHERE id = p_request_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. Mark Listing Sold
CREATE OR REPLACE FUNCTION public.mark_listing_sold(p_listing_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT seller_id, status
    INTO v_seller_id, v_status
    FROM public.listings
    WHERE id = p_listing_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Listing not found';
    END IF;

    IF v_seller_id <> auth.uid() AND NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Only the owner or admin can mark this book as sold';
    END IF;

    UPDATE public.listings
    SET status = 'sold',
        sold_at = timezone('utc'::text, now())
    WHERE id = p_listing_id;

    UPDATE public.interest_requests
    SET status = 'closed',
        responded_at = timezone('utc'::text, now())
    WHERE listing_id = p_listing_id AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 6. Protected WhatsApp Reveal Function
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
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT buyer_id, seller_id, listing_id, status
    INTO v_buyer_id, v_seller_id, v_listing_id, v_status
    FROM public.interest_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    IF v_buyer_id <> auth.uid() THEN
        RAISE EXCEPTION 'Access denied: Only the accepted buyer can retrieve seller contact';
    END IF;

    IF v_status <> 'accepted' THEN
        RAISE EXCEPTION 'Contact reveal unavailable: Request is not accepted';
    END IF;

    SELECT title, status INTO v_title, v_listing_status
    FROM public.listings
    WHERE id = v_listing_id;

    IF v_listing_status NOT IN ('active', 'sold') THEN
        RAISE EXCEPTION 'Listing is no longer available';
    END IF;

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

-- 7. Admin: Update Report Status
CREATE OR REPLACE FUNCTION public.admin_update_report_status(
    p_report_id UUID,
    p_status TEXT,
    p_note TEXT DEFAULT 'Status updated by admin'
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    UPDATE public.reports
    SET status = p_status,
        resolved_at = CASE WHEN p_status IN ('resolved', 'dismissed') THEN timezone('utc'::text, now()) ELSE NULL END
    WHERE id = p_report_id;

    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'update_report_status', 'report', p_report_id, p_note
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. Admin: Hide Listing
CREATE OR REPLACE FUNCTION public.admin_hide_listing(
    p_listing_id UUID,
    p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    UPDATE public.listings
    SET status = 'removed'
    WHERE id = p_listing_id;

    UPDATE public.interest_requests
    SET status = 'closed',
        responded_at = timezone('utc'::text, now())
    WHERE listing_id = p_listing_id AND status = 'pending';

    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'hide_listing', 'listing', p_listing_id, p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 9. Admin: Suspend User
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
    p_target_user_id UUID,
    p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    UPDATE public.profiles
    SET account_status = 'suspended'
    WHERE id = p_target_user_id;

    UPDATE public.listings
    SET status = 'removed'
    WHERE seller_id = p_target_user_id AND status = 'active';

    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'suspend_user', 'user', p_target_user_id, p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 10. Admin: Reactivate User
CREATE OR REPLACE FUNCTION public.admin_reactivate_user(
    p_target_user_id UUID,
    p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    UPDATE public.profiles
    SET account_status = 'active'
    WHERE id = p_target_user_id;

    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'reactivate_user', 'user', p_target_user_id, p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================
ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.schema_migrations_tracker ENABLE ROW LEVEL SECURITY;

-- Institutions
DROP POLICY IF EXISTS "Active institutions are publicly viewable" ON public.institutions;
CREATE POLICY "Active institutions are publicly viewable"
ON public.institutions FOR SELECT
USING (is_active = true);

DROP POLICY IF EXISTS "Admins can manage institutions" ON public.institutions;
CREATE POLICY "Admins can manage institutions"
ON public.institutions FOR ALL
USING (public.is_admin_or_moderator(auth.uid()));

-- Profiles (Public fields only)
DROP POLICY IF EXISTS "Public profile fields are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile and participants profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;

CREATE POLICY "Public profile fields are viewable by everyone"
ON public.profiles FOR SELECT
USING (account_status != 'deleted');

CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Private User Contacts
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

-- Listings
DROP POLICY IF EXISTS "Listings are viewable by public if active, or by participants / admins" ON public.listings;
CREATE POLICY "Listings are viewable by public if active, or by participants / admins"
ON public.listings FOR SELECT
USING (
    status = 'active' 
    OR seller_id = auth.uid() 
    OR EXISTS (
        SELECT 1 FROM public.interest_requests 
        WHERE interest_requests.listing_id = listings.id 
        AND interest_requests.buyer_id = auth.uid()
    )
    OR public.is_admin_or_moderator(auth.uid())
);

DROP POLICY IF EXISTS "Users can insert their own listings" ON public.listings;
CREATE POLICY "Users can insert their own listings"
ON public.listings FOR INSERT
WITH CHECK (
    auth.uid() = seller_id AND 
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND account_status = 'active'
    )
);

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

DROP POLICY IF EXISTS "Owners and admins can delete listings" ON public.listings;
CREATE POLICY "Owners and admins can delete listings"
ON public.listings FOR DELETE
USING (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- Listing Images
DROP POLICY IF EXISTS "Listing images are viewable by everyone" ON public.listing_images;
CREATE POLICY "Listing images are viewable by everyone"
ON public.listing_images FOR SELECT
USING (true);

DROP POLICY IF EXISTS "Listing owners can manage listing images" ON public.listing_images;
CREATE POLICY "Listing owners can manage listing images"
ON public.listing_images FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.listings 
        WHERE id = listing_images.listing_id 
        AND (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
    )
);

-- Interest Requests (Direct UPDATE revoked from regular users)
REVOKE UPDATE ON public.interest_requests FROM anon, authenticated;

DROP POLICY IF EXISTS "Participants can view their interest requests" ON public.interest_requests;
CREATE POLICY "Participants can view their interest requests"
ON public.interest_requests FOR SELECT
USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

DROP POLICY IF EXISTS "Buyers can create interest requests" ON public.interest_requests;
CREATE POLICY "Buyers can create interest requests"
ON public.interest_requests FOR INSERT
WITH CHECK (
    auth.uid() = buyer_id AND 
    buyer_id <> seller_id AND
    EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() AND account_status = 'active'
    ) AND
    EXISTS (
        SELECT 1 FROM public.listings 
        WHERE id = listing_id AND status = 'active' AND seller_id = interest_requests.seller_id
    )
);

DROP POLICY IF EXISTS "Admins can update request status" ON public.interest_requests;
CREATE POLICY "Admins can update request status"
ON public.interest_requests FOR UPDATE
USING (public.is_admin_or_moderator(auth.uid()))
WITH CHECK (public.is_admin_or_moderator(auth.uid()));

-- Reports
DROP POLICY IF EXISTS "Authenticated users can submit reports" ON public.reports;
CREATE POLICY "Authenticated users can submit reports"
ON public.reports FOR INSERT
WITH CHECK (auth.uid() = reporter_id);

DROP POLICY IF EXISTS "Admins can view and manage reports" ON public.reports;
CREATE POLICY "Admins can view and manage reports"
ON public.reports FOR ALL
USING (public.is_admin_or_moderator(auth.uid()));

-- Admin Audit Logs
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_admin_or_moderator(auth.uid()));

-- Public Catalogue View (Security Invoker)
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

-- Grants
GRANT SELECT ON public.public_catalogue TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.user_contacts TO authenticated;
GRANT EXECUTE ON FUNCTION public.accept_interest_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.revoke_interest_request_acceptance(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decline_interest_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_interest_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.mark_listing_sold(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_seller_contact(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_suspend_user(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_reactivate_user(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hide_listing(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_report_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator(UUID) TO anon, authenticated;

-- Record migration version
INSERT INTO public.schema_migrations_tracker (version, description)
VALUES ('20261030000003_security_remediation_and_hardening', 'Complete consolidated setup')
ON CONFLICT (version) DO NOTHING;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

