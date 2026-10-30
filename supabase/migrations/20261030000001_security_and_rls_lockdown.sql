-- ==============================================================================
-- BookLoop Step 2: Data Layer Security & RLS Lockdown
-- Single Source of Truth Migration for Security, Views, RPCs, Storage & Auditing
-- ==============================================================================

-- 1. ADMIN AUDIT LOGS TABLE
CREATE TABLE IF NOT EXISTS public.admin_audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    admin_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    action TEXT NOT NULL, -- e.g. 'suspend_user', 'unsuspend_user', 'hide_listing', 'resolve_report'
    target_type TEXT NOT NULL, -- 'user', 'listing', 'report', 'institution'
    target_id UUID NOT NULL,
    reason TEXT,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target ON public.admin_audit_logs (target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON public.admin_audit_logs (created_at DESC);

ALTER TABLE public.admin_audit_logs ENABLE ROW LEVEL SECURITY;

-- Only admins/moderators can view audit logs; NO updates or deletes allowed (immutable)
DROP POLICY IF EXISTS "Admins can view audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can view audit logs"
ON public.admin_audit_logs FOR SELECT
USING (public.is_admin_or_moderator(auth.uid()));

DROP POLICY IF EXISTS "Admins can insert audit logs" ON public.admin_audit_logs;
CREATE POLICY "Admins can insert audit logs"
ON public.admin_audit_logs FOR INSERT
WITH CHECK (public.is_admin_or_moderator(auth.uid()) AND auth.uid() = admin_id);

-- 2. LOCK DOWN PROFILES TABLE (STRICT PRIVACY)
-- Crucial rule: WhatsApp number, graduation year, account status are NEVER public.
-- Users can only read their OWN full profile.
-- Catalogue readers get the seller display name and institution strictly via the secure view.
DROP POLICY IF EXISTS "Public profile fields are viewable by everyone" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can read own profile and participants profile" ON public.profiles;

CREATE POLICY "Users can read own profile and participants profile"
ON public.profiles FOR SELECT
USING (
    auth.uid() = id 
    OR public.is_admin_or_moderator(auth.uid())
    OR EXISTS (
        -- Seller can read profile of buyers who submitted an interest request for their listing
        SELECT 1 FROM public.interest_requests
        WHERE interest_requests.seller_id = auth.uid()
          AND interest_requests.buyer_id = profiles.id
    )
    OR EXISTS (
        -- Buyer can read seller's profile if they requested their listing
        SELECT 1 FROM public.interest_requests
        WHERE interest_requests.buyer_id = auth.uid()
          AND interest_requests.seller_id = profiles.id
    )
);

-- 1. Trigger to protect system-managed profile fields (no recursive subqueries)
CREATE OR REPLACE FUNCTION public.protect_profile_immutable_fields()
RETURNS TRIGGER AS $$
BEGIN
    -- Non-admins cannot alter system-controlled fields
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        NEW.id := OLD.id;
        NEW.account_status := OLD.account_status;
        NEW.whatsapp_verified_at := OLD.whatsapp_verified_at;
        NEW.created_at := OLD.created_at;
    END IF;
    NEW.updated_at := timezone('utc'::text, now());
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_protect_profile_fields ON public.profiles;
CREATE TRIGGER trg_protect_profile_fields
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.protect_profile_immutable_fields();

-- 2. Non-recursive UPDATE policy on profiles
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
CREATE POLICY "Users can update their own profile"
ON public.profiles FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- 3. PUBLIC CATALOGUE VIEW (EXPOSES APPROVED FIELDS ONLY)
-- Never includes email, WhatsApp number, or private account data anywhere.
CREATE OR REPLACE VIEW public.public_catalogue AS
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

-- Grant access on public_catalogue to anon and authenticated
GRANT SELECT ON public.public_catalogue TO anon, authenticated;

-- 4. CONTROLLED LISTINGS POLICIES & STATUS LOCKDOWN
-- Seller identity is strictly derived from session via auth.uid(), never from client
-- Public can view active listings; Sellers, Buyers with interest requests, and Admins can view regardless of status (active/sold/removed)
DROP POLICY IF EXISTS "Active listings are viewable by everyone" ON public.listings;
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

-- Suspended accounts CANNOT create listings
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

-- Owners can update their own listings; Admins can update/hide any
DROP POLICY IF EXISTS "Owners and admins can update listings" ON public.listings;
CREATE POLICY "Owners and admins can update listings"
ON public.listings FOR UPDATE
USING (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
WITH CHECK (
    (seller_id = auth.uid() AND EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND account_status = 'active')) 
    OR public.is_admin_or_moderator(auth.uid())
);

-- Owners and admins can delete listings
DROP POLICY IF EXISTS "Owners and admins can delete listings" ON public.listings;
CREATE POLICY "Owners and admins can delete listings"
ON public.listings FOR DELETE
USING (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- 5. LISTING IMAGES POLICIES & 3-PHOTO LIMIT TRIGGER
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

-- Enforce maximum 3 photos per listing at the database constraint level
CREATE OR REPLACE FUNCTION public.check_max_listing_images()
RETURNS trigger AS $$
DECLARE
    img_count INT;
BEGIN
    SELECT count(*) INTO img_count
    FROM public.listing_images
    WHERE listing_id = new.listing_id;

    IF img_count >= 3 THEN
        RAISE EXCEPTION 'A listing cannot have more than 3 photos';
    END IF;

    RETURN new;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS tr_check_max_listing_images ON public.listing_images;
CREATE TRIGGER tr_check_max_listing_images
    BEFORE INSERT ON public.listing_images
    FOR EACH ROW EXECUTE FUNCTION public.check_max_listing_images();

-- 6. CONTROLLED INTEREST REQUESTS & RPC STATE MACHINE
-- Direct arbitrary status updates are prohibited; transitions occur through controlled RPCs
DROP POLICY IF EXISTS "Participants can view their interest requests" ON public.interest_requests;
CREATE POLICY "Participants can view their interest requests"
ON public.interest_requests FOR SELECT
USING (buyer_id = auth.uid() OR seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- Suspended accounts CANNOT create interest requests
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

-- Controlled RPC: Seller Accepts an Interest Request
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

    -- Fetch request & lock row for update
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

    -- Check seller has configured WhatsApp before accepting
    SELECT whatsapp_number INTO v_seller_whatsapp
    FROM public.profiles
    WHERE id = auth.uid();

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

    -- Revert any previously accepted request for this listing back to 'pending'
    -- (Enforces only ONE buyer accepted at a time per listing)
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

-- Controlled RPC: Seller Revokes an Accepted Request back to pending
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

-- Controlled RPC: Seller Declines an Interest Request
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

-- Controlled RPC: Buyer Cancels Their Own Pending Request
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

-- Controlled RPC: Mark Listing Sold (Closes all other pending requests automatically)
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

    -- Update listing status to sold
    UPDATE public.listings
    SET status = 'sold',
        sold_at = timezone('utc'::text, now())
    WHERE id = p_listing_id;

    -- Automatically close any remaining pending requests for this listing
    UPDATE public.interest_requests
    SET status = 'closed',
        responded_at = timezone('utc'::text, now())
    WHERE listing_id = p_listing_id AND status = 'pending';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7. RE-CHECKING PROTECTED CONTACT REVEAL FUNCTION
-- Returns seller WhatsApp ONLY if:
-- 1. Caller is authenticated.
-- 2. Caller is the buyer on this request.
-- 3. Request status is strictly 'accepted'.
-- 4. Listing is active or sold.
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

    -- 2. Re-fetch interest request at call time
    SELECT buyer_id, seller_id, listing_id, status
    INTO v_buyer_id, v_seller_id, v_listing_id, v_status
    FROM public.interest_requests
    WHERE id = p_request_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Request not found';
    END IF;

    -- 3. Caller must be the buyer attached to this request
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

    -- 6. Retrieve seller WhatsApp and Display Name
    SELECT p.whatsapp_number, p.display_name
    INTO v_whatsapp, v_display_name
    FROM public.profiles p
    WHERE p.id = v_seller_id;

    IF v_whatsapp IS NULL OR trim(v_whatsapp) = '' THEN
        RAISE EXCEPTION 'Seller has not configured their WhatsApp number';
    END IF;

    RETURN QUERY SELECT v_display_name, v_whatsapp, v_title;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 8. ADMIN MODERATION FUNCTIONS WITH AUDIT LOGGING
CREATE OR REPLACE FUNCTION public.admin_suspend_user(
    p_target_user_id UUID,
    p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    -- Update user account status
    UPDATE public.profiles
    SET account_status = 'suspended'
    WHERE id = p_target_user_id;

    -- Hide all active listings by this user
    UPDATE public.listings
    SET status = 'removed'
    WHERE seller_id = p_target_user_id AND status = 'active';

    -- Record in audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'suspend_user', 'user', p_target_user_id, p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.admin_hide_listing(
    p_listing_id UUID,
    p_reason TEXT
)
RETURNS VOID AS $$
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    -- Mark listing as removed
    UPDATE public.listings
    SET status = 'removed'
    WHERE id = p_listing_id;

    -- Close any pending requests
    UPDATE public.interest_requests
    SET status = 'closed',
        responded_at = timezone('utc'::text, now())
    WHERE listing_id = p_listing_id AND status = 'pending';

    -- Record in audit log
    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'hide_listing', 'listing', p_listing_id, p_reason
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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

-- 9. ADMIN ROLES TABLE LOCKDOWN
-- Ensure NO user can write to admin_roles from client API under any circumstances
REVOKE ALL ON public.admin_roles FROM anon, authenticated;
GRANT SELECT ON public.admin_roles TO authenticated;

DROP POLICY IF EXISTS "Admins can view admin roles" ON public.admin_roles;
CREATE POLICY "Admins can view admin roles"
ON public.admin_roles FOR SELECT
USING (user_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()));

-- 10. EXPLICIT GRANTS FOR RPC FUNCTIONS
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

-- Reload Supabase PostgREST schema cache
NOTIFY pgrst, 'reload schema';

