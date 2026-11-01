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

CREATE SEQUENCE IF NOT EXISTS public.listing_ref_seq START WITH 1001;

-- 7. LISTINGS TABLE
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference_no TEXT DEFAULT ('BL-' || nextval('public.listing_ref_seq')::text),
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

ALTER TABLE public.listings ADD COLUMN IF NOT EXISTS reference_no TEXT DEFAULT ('BL-' || nextval('public.listing_ref_seq')::text);

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
CREATE INDEX IF NOT EXISTS idx_interest_requests_buyer_created ON public.interest_requests (buyer_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_interest_requests_seller_created ON public.interest_requests (seller_id, created_at DESC);

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

-- 11. LISTING ACTIVITY & BEHAVIOR AUDIT LOGS
CREATE TABLE IF NOT EXISTS public.listing_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL,
    summary TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_listing_activity_listing ON public.listing_activity_logs (listing_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_listing_activity_actor ON public.listing_activity_logs (actor_id);

-- 12. MIGRATION TRACKER TABLE
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

-- Clean up any legacy guard trigger on interest_requests
DROP TRIGGER IF EXISTS trg_guard_interest_request_updates ON public.interest_requests;
DROP FUNCTION IF EXISTS public.guard_interest_request_updates();

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

    -- Log to listing activity audit trail
    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        v_listing_id,
        auth.uid(),
        'request_accepted',
        'Seller accepted request from buyer and revealed WhatsApp',
        jsonb_build_object('request_id', p_request_id, 'buyer_id', v_buyer_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 2. Seller Revokes Acceptance (Switch Buyer)
CREATE OR REPLACE FUNCTION public.revoke_interest_request_acceptance(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_listing_id UUID;
    v_buyer_id UUID;
    v_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT seller_id, listing_id, buyer_id, status
    INTO v_seller_id, v_listing_id, v_buyer_id, v_status
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

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        v_listing_id,
        auth.uid(),
        'request_revoked',
        'Seller revoked acceptance to switch to another buyer',
        jsonb_build_object('request_id', p_request_id, 'previous_buyer_id', v_buyer_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 3. Seller Declines Request
CREATE OR REPLACE FUNCTION public.decline_interest_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_listing_id UUID;
    v_buyer_id UUID;
    v_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT seller_id, listing_id, buyer_id, status
    INTO v_seller_id, v_listing_id, v_buyer_id, v_status
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

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        v_listing_id,
        auth.uid(),
        'request_declined',
        'Seller declined interest request',
        jsonb_build_object('request_id', p_request_id, 'buyer_id', v_buyer_id)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Buyer Cancels Own Request
CREATE OR REPLACE FUNCTION public.cancel_interest_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_buyer_id UUID;
    v_listing_id UUID;
    v_status TEXT;
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    SELECT buyer_id, listing_id, status
    INTO v_buyer_id, v_listing_id, v_status
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

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        v_listing_id,
        auth.uid(),
        'request_cancelled',
        'Buyer cancelled their interest request',
        jsonb_build_object('request_id', p_request_id, 'buyer_id', v_buyer_id)
    );
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

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        p_listing_id,
        auth.uid(),
        'marked_sold',
        'Listing marked as SOLD; all remaining pending requests archived',
        jsonb_build_object('status', 'sold')
    );
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

-- 11. Admin: Permanently Delete User (Cascasdes from auth.users)
CREATE OR REPLACE FUNCTION public.admin_delete_user(
    p_target_user_id UUID,
    p_reason TEXT DEFAULT 'User requested permanent account deletion'
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    IF p_target_user_id = auth.uid() THEN
        RAISE EXCEPTION 'Administrators cannot delete their own account from the console.';
    END IF;

    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'delete_user', 'user', p_target_user_id, p_reason
    );

    DELETE FROM auth.users WHERE id = p_target_user_id;
    DELETE FROM public.profiles WHERE id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 12. Admin: Delete Institution with Safety Reassignment Guard
CREATE OR REPLACE FUNCTION public.admin_delete_institution(
    p_institution_id UUID,
    p_reassign_to_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
DECLARE
    v_inst_name TEXT;
    v_user_count INT;
    v_listing_count INT;
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    SELECT name INTO v_inst_name FROM public.institutions WHERE id = p_institution_id;
    IF v_inst_name IS NULL THEN
        RAISE EXCEPTION 'Institution not found';
    END IF;

    SELECT count(*) INTO v_user_count FROM public.profiles WHERE institution_id = p_institution_id;
    SELECT count(*) INTO v_listing_count FROM public.listings WHERE institution_id = p_institution_id;

    IF p_reassign_to_id IS NOT NULL THEN
        UPDATE public.profiles SET institution_id = p_reassign_to_id WHERE institution_id = p_institution_id;
        UPDATE public.listings SET institution_id = p_reassign_to_id WHERE institution_id = p_institution_id;
    ELSE
        UPDATE public.profiles SET institution_id = NULL WHERE institution_id = p_institution_id;
        UPDATE public.listings SET institution_id = NULL WHERE institution_id = p_institution_id;
    END IF;

    DELETE FROM public.institutions WHERE id = p_institution_id;

    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'delete_institution', 'institution', p_institution_id,
        'Deleted institution "' || v_inst_name || '" (Reassigned/Unlinked users: ' || v_user_count || ', listings: ' || v_listing_count || ')'
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 13. Admin: Purge Pune Institutes & Seed Categorized Indore Institutions
CREATE OR REPLACE FUNCTION public.admin_seed_indore_institutions()
RETURNS INT AS $$
DECLARE
    v_inserted_count INT := 0;
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    UPDATE public.profiles SET institution_id = NULL;
    UPDATE public.listings SET institution_id = NULL;
    DELETE FROM public.institutions;

    INSERT INTO public.institutions (name, institution_type, city, area, verification_method, is_active)
    VALUES 
        -- Engineering Colleges (Indore)
        ('Acropolis Institute of Technology & Research (AITR)', 'College', 'Indore', 'Bypass Road, Manglia', 'self_selected', true),
        ('Shri Govindram Seksaria Institute of Technology and Science (SGSITS)', 'College', 'Indore', 'Vallabh Nagar', 'self_selected', true),
        ('Institute of Engineering & Technology, DAVV (IET DAVV)', 'College', 'Indore', 'Khandwa Road', 'self_selected', true),
        ('IPS Academy, Institute of Engineering & Science', 'College', 'Indore', 'Rajendra Nagar', 'self_selected', true),
        ('Medi-Caps University (Faculty of Engineering)', 'College', 'Indore', 'A.B. Road, Pigdamber', 'self_selected', true),
        ('Oriental Institute of Science and Technology (OIST)', 'College', 'Indore', 'Sanwer Road', 'self_selected', true),
        ('SVKM''s NMIMS MPSTME (Indore Campus)', 'College', 'Indore', 'Super Corridor', 'self_selected', true),
        ('Indian Institute of Technology Indore (IIT Indore)', 'College', 'Indore', 'Simrol', 'self_selected', true),

        -- Medical & Health Sciences (Indore)
        ('Mahatma Gandhi Memorial Medical College (MGM Medical College)', 'College', 'Indore', 'A.B. Road', 'self_selected', true),
        ('Sri Aurobindo Institute of Medical Sciences (SAIMS)', 'College', 'Indore', 'Sanwer Road', 'self_selected', true),
        ('Index Medical College Hospital & Research Centre', 'College', 'Indore', 'Nemawar Road', 'self_selected', true),
        ('Government College of Dentistry (GDC Indore)', 'College', 'Indore', 'Sardar Patel Marg', 'self_selected', true),
        ('Choithram College of Nursing & Health Sciences', 'College', 'Indore', 'Manik Bagh Road', 'self_selected', true),

        -- Pharmacy Colleges (Indore)
        ('Department of Pharmacy, SGSITS', 'College', 'Indore', 'Vallabh Nagar', 'self_selected', true),
        ('Acropolis Institute of Pharmaceutical Education and Research (AIPER)', 'College', 'Indore', 'Manglia', 'self_selected', true),
        ('Modern Institute of Pharmaceutical Sciences', 'College', 'Indore', 'Alwasa, Sanwer Road', 'self_selected', true),
        ('Indore Institute of Pharmacy (IIP)', 'College', 'Indore', 'Rau-Pithampur Bypass Road', 'self_selected', true),
        ('Smriti College of Pharmaceutical Education (SCOPE)', 'College', 'Indore', 'MR-11, Pipliya Kumar', 'self_selected', true),

        -- Commerce, Business and Management (Indore)
        ('Institute of Management Studies, DAVV (IMS DAVV)', 'College', 'Indore', 'Khandwa Road', 'self_selected', true),
        ('Prestige Institute of Management and Research (PIMR)', 'College', 'Indore', 'Scheme 54, Vijay Nagar', 'self_selected', true),
        ('Jaipuria Institute of Management', 'College', 'Indore', 'Indore-Dewas Highway', 'self_selected', true),
        ('Daly College Business School (DCBS)', 'College', 'Indore', 'Residency Area', 'self_selected', true),
        ('Renaissance College of Commerce and Management', 'College', 'Indore', 'Bypass Road', 'self_selected', true),
        ('Shri Vaishnav Institute of Management (SVIM)', 'College', 'Indore', 'Gumasta Nagar', 'self_selected', true),
        ('Indian Institute of Management Indore (IIM Indore)', 'College', 'Indore', 'Prabandh Shikhar, Rau', 'self_selected', true),

        -- Schools & Junior Colleges (Indore)
        ('The Daly College', 'School', 'Indore', 'Residency Area', 'self_selected', true),
        ('Delhi Public School (DPS Indore)', 'School', 'Indore', 'Nipania, Bypass Road', 'self_selected', true),
        ('Choithram School', 'School', 'Indore', 'Manik Bagh Road', 'self_selected', true),
        ('The Emerald Heights International School', 'School', 'Indore', 'A.B. Road, Rau', 'self_selected', true),
        ('The Shishukunj International School', 'School', 'Indore', 'Jhalaria, Bypass Road', 'self_selected', true),
        ('St. Raphael''s Higher Secondary School', 'School', 'Indore', '15 Old Palasia', 'self_selected', true),
        ('Advanced Academy', 'School', 'Indore', 'Nipania', 'self_selected', true),
        ('Sri Sathya Sai Vidya Vihar', 'School', 'Indore', 'Scheme 54, Vijay Nagar', 'self_selected', true),
        ('St. Paul Higher Secondary School', 'School', 'Indore', 'Boundary Road', 'self_selected', true),

        -- Coaching Hubs (Indore)
        ('Allen Career Institute - Indore Center', 'Other', 'Indore', 'South Tukoganj & Geeta Bhawan', 'self_selected', true),
        ('Aakash Institute - Indore Hub', 'Other', 'Indore', 'Vijay Nagar & Old Palasia', 'self_selected', true),
        ('Kautilya Academy', 'Other', 'Indore', 'Bhawarkua', 'self_selected', true),
        ('Physics Wallah Vidyapeeth', 'Other', 'Indore', 'Bhawarkua', 'self_selected', true);

    GET DIAGNOSTICS v_inserted_count = ROW_COUNT;

    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'seed_institutions', 'institution', gen_random_uuid(),
        'Purged Pune institutes and seeded ' || v_inserted_count || ' categorized Indore institutions'
    );

    RETURN v_inserted_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 14. Admin: Get Complete Listing Lifecycle Audit Trail
CREATE OR REPLACE FUNCTION public.get_listing_lifecycle_audit(p_listing_id UUID)
RETURNS TABLE (
    id UUID,
    listing_id UUID,
    actor_id UUID,
    actor_name TEXT,
    action_type TEXT,
    summary TEXT,
    details JSONB,
    created_at TIMESTAMPTZ
) AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    RETURN QUERY
    SELECT 
        l.id,
        l.listing_id,
        l.actor_id,
        p.display_name AS actor_name,
        l.action_type,
        l.summary,
        l.details,
        l.created_at
    FROM public.listing_activity_logs l
    LEFT JOIN public.profiles p ON p.id = l.actor_id
    WHERE l.listing_id = p_listing_id
    ORDER BY l.created_at ASC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 15. Triggers for Automatic Lifecycle Logging
CREATE OR REPLACE FUNCTION public.trg_log_listing_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
    v_actor UUID;
    v_diff JSONB;
BEGIN
    v_actor := auth.uid();

    IF TG_OP = 'INSERT' THEN
        INSERT INTO public.listing_activity_logs (
            listing_id, actor_id, action_type, summary, details, created_at
        )
        VALUES (
            NEW.id,
            COALESCE(v_actor, NEW.seller_id),
            'created',
            'Listing published on marketplace',
            jsonb_build_object(
                'title', NEW.title,
                'price_paise', NEW.price_paise,
                'condition', NEW.condition,
                'category', NEW.category,
                'author', NEW.author
            ),
            NEW.created_at
        );
        RETURN NEW;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.title IS DISTINCT FROM NEW.title OR
           OLD.price_paise IS DISTINCT FROM NEW.price_paise OR
           OLD.description IS DISTINCT FROM NEW.description OR
           OLD.condition IS DISTINCT FROM NEW.condition OR
           OLD.category IS DISTINCT FROM NEW.category THEN

            v_diff := jsonb_build_object(
                'previous', jsonb_build_object('title', OLD.title, 'price_paise', OLD.price_paise, 'condition', OLD.condition, 'description', OLD.description),
                'updated', jsonb_build_object('title', NEW.title, 'price_paise', NEW.price_paise, 'condition', NEW.condition, 'description', NEW.description)
            );

            INSERT INTO public.listing_activity_logs (
                listing_id, actor_id, action_type, summary, details
            )
            VALUES (
                NEW.id,
                COALESCE(v_actor, NEW.seller_id),
                'edited',
                'Seller updated listing details (Title/Price/Description)',
                v_diff
            );
        END IF;
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_listings_lifecycle ON public.listings;
CREATE TRIGGER trg_listings_lifecycle
AFTER INSERT OR UPDATE ON public.listings
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_listing_lifecycle();

CREATE OR REPLACE FUNCTION public.trg_log_interest_request_lifecycle()
RETURNS TRIGGER AS $$
DECLARE
    v_buyer_name TEXT;
BEGIN
    IF TG_OP = 'INSERT' THEN
        SELECT display_name INTO v_buyer_name FROM public.profiles WHERE id = NEW.buyer_id;

        INSERT INTO public.listing_activity_logs (
            listing_id, actor_id, action_type, summary, details, created_at
        )
        VALUES (
            NEW.listing_id,
            NEW.buyer_id,
            'request_received',
            'Buyer expressed interest: ' || COALESCE(v_buyer_name, 'Student'),
            jsonb_build_object(
                'request_id', NEW.id,
                'buyer_id', NEW.buyer_id,
                'buyer_name', COALESCE(v_buyer_name, 'Student')
            ),
            NEW.created_at
        );
        RETURN NEW;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_requests_lifecycle ON public.interest_requests;
CREATE TRIGGER trg_requests_lifecycle
AFTER INSERT ON public.interest_requests
FOR EACH ROW
EXECUTE FUNCTION public.trg_log_interest_request_lifecycle();

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

-- Listing Activity Logs
ALTER TABLE public.listing_activity_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can view all listing activity logs" ON public.listing_activity_logs;
CREATE POLICY "Admins can view all listing activity logs"
ON public.listing_activity_logs FOR SELECT
USING (public.is_admin_or_moderator(auth.uid()));

DROP POLICY IF EXISTS "Sellers can view own listing activity logs" ON public.listing_activity_logs;
CREATE POLICY "Sellers can view own listing activity logs"
ON public.listing_activity_logs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.listings l 
        WHERE l.id = listing_activity_logs.listing_id 
          AND l.seller_id = auth.uid()
    )
);

-- Public Catalogue View (Security Invoker)
DROP VIEW IF EXISTS public.public_catalogue;
CREATE OR REPLACE VIEW public.public_catalogue
WITH (security_invoker = true) AS
SELECT 
    l.id AS id,
    l.reference_no AS reference_no,
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
GRANT EXECUTE ON FUNCTION public.admin_delete_user(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_institution(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_seed_indore_institutions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_listing_lifecycle_audit(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_hide_listing(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_update_report_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_admin_or_moderator(UUID) TO anon, authenticated;

-- Record migration versions
INSERT INTO public.schema_migrations_tracker (version, description)
VALUES 
    ('20261030000000_initial_schema', 'Initial BookLoop schema'),
    ('20261030000001_security_and_rls_lockdown', 'RLS and security lockdown'),
    ('20261030000002_admin_and_reports', 'Admin roles and moderation'),
    ('20261030000003_security_remediation_and_hardening', 'Complete consolidated setup and security hardening'),
    ('20261101000000_account_deletion_indore_institutes_and_listing_audit', 'User deletion, Indore institutes catalog, and listing audit lifecycle')
ON CONFLICT (version) DO NOTHING;

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

