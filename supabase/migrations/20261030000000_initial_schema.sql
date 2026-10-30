-- ==============================================================================
-- BookLoop Database Schema
-- Single Source of Truth Migration: Tables, Indexes, Constraints, Triggers & RLS
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

-- Index for searching and filtering active institutions
CREATE INDEX IF NOT EXISTS idx_institutions_city_active ON public.institutions (city, is_active);

-- 3. PROFILES TABLE
-- Linked directly to auth.users. Never created directly by the browser; populated via trigger.
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT NOT NULL,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    course_or_class TEXT,
    graduation_year INTEGER,
    whatsapp_number TEXT,
    whatsapp_verified_at TIMESTAMPTZ,
    account_status TEXT NOT NULL DEFAULT 'active' CHECK (account_status IN ('active', 'suspended', 'deleted')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_profiles_institution ON public.profiles (institution_id);
CREATE INDEX IF NOT EXISTS idx_profiles_status ON public.profiles (account_status);

-- 4. ADMIN ROLES TABLE
-- Roles are strictly database-controlled; users cannot assign their own roles.
CREATE TABLE IF NOT EXISTS public.admin_roles (
    user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
    role TEXT NOT NULL CHECK (role IN ('admin', 'moderator')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

-- Helper function to check if current authenticated user is an admin or moderator
CREATE OR REPLACE FUNCTION public.is_admin_or_moderator(user_uuid UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 FROM public.admin_roles 
        WHERE user_id = user_uuid
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 5. LISTINGS TABLE
-- Money is stored strictly in integer paise (1 INR = 100 paise), never floats.
CREATE TABLE IF NOT EXISTS public.listings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    seller_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    institution_id UUID REFERENCES public.institutions(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    author TEXT,
    edition TEXT,
    category TEXT NOT NULL, -- e.g. Engineering, Medical, School, Competitive Exams
    course_or_exam TEXT,
    condition TEXT NOT NULL, -- e.g. Like New, Good, Fair
    description TEXT,
    price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
    status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'reserved', 'sold', 'removed')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now()),
    sold_at TIMESTAMPTZ
);

-- Indexes for catalogue filtering & search performance
CREATE INDEX IF NOT EXISTS idx_listings_status ON public.listings (status);
CREATE INDEX IF NOT EXISTS idx_listings_institution ON public.listings (institution_id);
CREATE INDEX IF NOT EXISTS idx_listings_category ON public.listings (category);
CREATE INDEX IF NOT EXISTS idx_listings_created_at ON public.listings (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_listings_price_paise ON public.listings (price_paise ASC);
CREATE INDEX IF NOT EXISTS idx_listings_seller ON public.listings (seller_id);

-- Full text search index for title, author, course_or_exam
CREATE INDEX IF NOT EXISTS idx_listings_fts ON public.listings USING gin (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(author, '') || ' ' || coalesce(course_or_exam, ''))
);

-- 6. LISTING IMAGES TABLE (Max 3 photos per listing)
CREATE TABLE IF NOT EXISTS public.listing_images (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    display_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_listing_images_listing ON public.listing_images (listing_id, display_order);

-- 7. INTEREST REQUESTS TABLE
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

-- Unique index to prevent duplicate pending or accepted requests for buyer + listing
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_active_request 
ON public.interest_requests (listing_id, buyer_id) 
WHERE status IN ('pending', 'accepted');

CREATE INDEX IF NOT EXISTS idx_interest_requests_buyer ON public.interest_requests (buyer_id, status);
CREATE INDEX IF NOT EXISTS idx_interest_requests_seller ON public.interest_requests (seller_id, status);

-- 8. REPORTS TABLE
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

-- ==============================================================================
-- TRIGGERS & FUNCTIONS
-- ==============================================================================

-- A. Auto-create Profile on Supabase User Signup (Trusted database trigger)
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

-- B. Updated_at touch trigger
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS trigger AS $$
BEGIN
    new.updated_at = timezone('utc'::text, now());
    RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_profiles_updated_at ON public.profiles;
CREATE TRIGGER tr_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_listings_updated_at ON public.listings;
CREATE TRIGGER tr_listings_updated_at BEFORE UPDATE ON public.listings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

DROP TRIGGER IF EXISTS tr_interest_requests_updated_at ON public.interest_requests;
CREATE TRIGGER tr_interest_requests_updated_at BEFORE UPDATE ON public.interest_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- C. Protected Server-side WhatsApp Reveal Function
-- Only the accepted buyer can retrieve the seller's contact details.
-- Phone is NEVER exposed in catalogue responses or public endpoints.
CREATE OR REPLACE FUNCTION public.get_seller_contact(p_request_id UUID)
RETURNS TABLE (
    seller_name TEXT,
    whatsapp_number TEXT,
    listing_title TEXT
) AS $$
DECLARE
    v_buyer_id UUID;
    v_status TEXT;
    v_seller_id UUID;
    v_listing_id UUID;
    v_whatsapp TEXT;
    v_display_name TEXT;
    v_title TEXT;
BEGIN
    -- Check caller is authenticated
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    -- Retrieve interest request details
    SELECT buyer_id, seller_id, listing_id, status
    INTO v_buyer_id, v_seller_id, v_listing_id, v_status
    FROM public.interest_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    -- Security check: Caller must be the buyer
    IF v_buyer_id <> auth.uid() THEN
        RAISE EXCEPTION 'Unauthorized: only the buyer can view contact info';
    END IF;

    -- Security check: Status must be accepted
    IF v_status <> 'accepted' THEN
        RAISE EXCEPTION 'Contact reveal only allowed after request is accepted';
    END IF;

    -- Fetch seller details & listing title
    SELECT p.whatsapp_number, p.display_name, l.title
    INTO v_whatsapp, v_display_name, v_title
    FROM public.profiles p
    JOIN public.listings l ON l.id = v_listing_id
    WHERE p.id = v_seller_id;

    IF v_whatsapp IS NULL OR trim(v_whatsapp) = '' THEN
        RAISE EXCEPTION 'Seller has not set a WhatsApp contact number';
    END IF;

    RETURN QUERY SELECT v_display_name, v_whatsapp, v_title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

ALTER TABLE public.institutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.listing_images ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.interest_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_roles ENABLE ROW LEVEL SECURITY;

-- 1. INSTITUTIONS POLICIES
-- Anyone can view active institutions (for sign-up and filter dropdowns)
CREATE POLICY "Active institutions are publicly viewable"
ON public.institutions FOR SELECT
USING (is_active = true);

-- Admins can manage institutions
CREATE POLICY "Admins can manage institutions"
ON public.institutions FOR ALL
USING (public.is_admin_or_moderator(auth.uid()));

-- 2. PROFILES POLICIES
-- Public display fields (id, display_name, institution_id, course_or_class) readable by all active users
CREATE POLICY "Public profile fields are viewable by everyone"
ON public.profiles FOR SELECT
USING (account_status != 'deleted');

-- Users can update only their own profile
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (
    auth.uid() = id AND 
    account_status = (SELECT account_status FROM public.profiles WHERE id = auth.uid()) -- Prevents self-un-suspension
);

-- 3. LISTINGS POLICIES
-- Anyone can view active listings
CREATE POLICY "Active listings are viewable by everyone"
ON public.listings FOR SELECT
USING (status = 'active' OR seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- Authenticated users can insert their own listing (seller_id must match auth.uid())
CREATE POLICY "Users can insert their own listings"
ON public.listings FOR INSERT
WITH CHECK (
    auth.uid() = seller_id AND 
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')
);

-- Owners and admins can update listings
CREATE POLICY "Owners and admins can update listings"
ON public.listings FOR UPDATE
USING (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
WITH CHECK (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- Owners and admins can delete listings
CREATE POLICY "Owners and admins can delete listings"
ON public.listings FOR DELETE
USING (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- 4. LISTING IMAGES POLICIES
CREATE POLICY "Listing images are viewable by everyone"
ON public.listing_images FOR SELECT
USING (true);

CREATE POLICY "Listing owners can manage listing images"
ON public.listing_images FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.listings 
        WHERE id = listing_images.listing_id 
        AND (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
    )
);

-- 5. INTEREST REQUESTS POLICIES
-- Buyers and sellers can view their own requests
CREATE POLICY "Participants can view their interest requests"
ON public.interest_requests FOR SELECT
USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- Buyers can create interest requests
CREATE POLICY "Buyers can create interest requests"
ON public.interest_requests FOR INSERT
WITH CHECK (
    auth.uid() = buyer_id AND 
    buyer_id <> seller_id AND
    EXISTS (
        SELECT 1 FROM public.listings 
        WHERE id = listing_id AND status = 'active' AND seller_id = interest_requests.seller_id
    )
);

-- Participants can update requests (seller: accept/decline; buyer: cancel)
CREATE POLICY "Participants can update request status"
ON public.interest_requests FOR UPDATE
USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
WITH CHECK (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- 6. REPORTS POLICIES
-- Authenticated users can create reports
CREATE POLICY "Authenticated users can submit reports"
ON public.reports FOR INSERT
WITH CHECK (auth.uid() = reporter_id);

-- Admins can view and manage reports
CREATE POLICY "Admins can view and manage reports"
ON public.reports FOR ALL
USING (public.is_admin_or_moderator(auth.uid()));

-- 7. ADMIN ROLES POLICIES
CREATE POLICY "Admins can view admin roles"
ON public.admin_roles FOR SELECT
USING (user_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

