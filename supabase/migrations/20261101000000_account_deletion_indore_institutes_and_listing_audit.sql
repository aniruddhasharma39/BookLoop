-- ==============================================================================
-- Migration: 20261101000000_account_deletion_indore_institutes_and_listing_audit.sql
-- 1. Full Account Deletion (admin_delete_user) cascading auth.users & public.profiles
-- 2. Indore Institutions Catalog (purge Pune institutes & seed categorized Indore institutions)
-- 3. Institution Deletion with safety guard & reassignment (admin_delete_institution)
-- 4. Listing Reference Numbers (BL-XXXXX sequence & column)
-- 5. End-to-End Listing Activity & Behavior Audit Trail (listing_activity_logs & triggers)
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. LISTING REFERENCE NUMBERS
-- ------------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.listing_ref_seq START WITH 1001;

ALTER TABLE public.listings 
ADD COLUMN IF NOT EXISTS reference_no TEXT;

-- Set default for new rows
ALTER TABLE public.listings 
ALTER COLUMN reference_no SET DEFAULT ('BL-' || nextval('public.listing_ref_seq')::text);

-- Populate existing rows where reference_no is null
UPDATE public.listings
SET reference_no = 'BL-' || nextval('public.listing_ref_seq')::text
WHERE reference_no IS NULL;

-- ------------------------------------------------------------------------------
-- 2. LISTING ACTIVITY & BEHAVIOR AUDIT LOGS
-- ------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.listing_activity_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    listing_id UUID NOT NULL REFERENCES public.listings(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action_type TEXT NOT NULL, 
    -- 'created', 'edited', 'request_received', 'request_accepted', 'request_declined', 
    -- 'request_revoked', 'request_cancelled', 'marked_sold', 'admin_hidden', 'admin_reactivated'
    summary TEXT NOT NULL,
    details JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT timezone('utc'::text, now())
);

CREATE INDEX IF NOT EXISTS idx_listing_activity_listing ON public.listing_activity_logs (listing_id, created_at ASC);
CREATE INDEX IF NOT EXISTS idx_listing_activity_actor ON public.listing_activity_logs (actor_id);

ALTER TABLE public.listing_activity_logs ENABLE ROW LEVEL SECURITY;

-- Admins can view all activity logs
CREATE POLICY "Admins can view all listing activity logs"
ON public.listing_activity_logs FOR SELECT
USING (public.is_admin_or_moderator(auth.uid()));

-- Sellers can view logs for their own listings
CREATE POLICY "Sellers can view own listing activity logs"
ON public.listing_activity_logs FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.listings l 
        WHERE l.id = listing_activity_logs.listing_id 
          AND l.seller_id = auth.uid()
    )
);

-- Buyers can view logs where they are the actor
CREATE POLICY "Actors can view own activity logs"
ON public.listing_activity_logs FOR SELECT
USING (actor_id = auth.uid());

-- ------------------------------------------------------------------------------
-- 3. AUTOMATIC ACTIVITY LOGGING TRIGGERS ON LISTINGS & REQUESTS
-- ------------------------------------------------------------------------------

-- Trigger on listings (created / edited)
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
        -- Log significant user edits (title, price, condition, description, category)
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

-- Trigger on interest_requests (new request received)
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

-- ------------------------------------------------------------------------------
-- 4. UPDATE STORED PROCEDURES TO LOG ACCEPT, DECLINE, REVOKE, SOLD, HIDE
-- ------------------------------------------------------------------------------

-- Accept Interest Request with Activity Logging
CREATE OR REPLACE FUNCTION public.accept_interest_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_listing_id UUID;
    v_buyer_id UUID;
    v_buyer_name TEXT;
    v_status TEXT;
    v_whatsapp TEXT;
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
        RAISE EXCEPTION 'Unauthorized: Only the seller can accept this request';
    END IF;

    IF v_status <> 'pending' THEN
        RAISE EXCEPTION 'Only pending requests can be accepted';
    END IF;

    -- Require verified WhatsApp number before accepting
    SELECT whatsapp_number INTO v_whatsapp
    FROM public.user_contacts
    WHERE user_id = auth.uid();

    IF v_whatsapp IS NULL OR trim(v_whatsapp) = '' THEN
        RAISE EXCEPTION 'WhatsApp number missing. Please update your profile before accepting requests.';
    END IF;

    -- Revert any other accepted request for this listing back to pending (single buyer rule)
    UPDATE public.interest_requests
    SET status = 'pending',
        responded_at = NULL
    WHERE listing_id = v_listing_id
      AND status = 'accepted'
      AND id <> p_request_id;

    -- Accept the chosen request
    UPDATE public.interest_requests
    SET status = 'accepted',
        responded_at = timezone('utc'::text, now())
    WHERE id = p_request_id;

    -- Log to listing activity audit trail
    SELECT display_name INTO v_buyer_name FROM public.profiles WHERE id = v_buyer_id;

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        v_listing_id,
        auth.uid(),
        'request_accepted',
        'Seller accepted request from ' || COALESCE(v_buyer_name, 'Buyer') || ' and revealed WhatsApp',
        jsonb_build_object(
            'request_id', p_request_id,
            'buyer_id', v_buyer_id,
            'buyer_name', COALESCE(v_buyer_name, 'Buyer')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Revoke Interest Request Acceptance (Switch Buyer) with Activity Logging
CREATE OR REPLACE FUNCTION public.revoke_interest_request_acceptance(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_listing_id UUID;
    v_buyer_id UUID;
    v_buyer_name TEXT;
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

    -- Log to listing activity audit trail
    SELECT display_name INTO v_buyer_name FROM public.profiles WHERE id = v_buyer_id;

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        v_listing_id,
        auth.uid(),
        'request_revoked',
        'Seller revoked acceptance of ' || COALESCE(v_buyer_name, 'Buyer') || ' to switch buyers',
        jsonb_build_object(
            'request_id', p_request_id,
            'previous_buyer_id', v_buyer_id,
            'previous_buyer_name', COALESCE(v_buyer_name, 'Buyer')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Decline Interest Request with Activity Logging
CREATE OR REPLACE FUNCTION public.decline_interest_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_seller_id UUID;
    v_listing_id UUID;
    v_buyer_id UUID;
    v_buyer_name TEXT;
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

    -- Log to listing activity audit trail
    SELECT display_name INTO v_buyer_name FROM public.profiles WHERE id = v_buyer_id;

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        v_listing_id,
        auth.uid(),
        'request_declined',
        'Seller declined request from ' || COALESCE(v_buyer_name, 'Buyer'),
        jsonb_build_object(
            'request_id', p_request_id,
            'buyer_id', v_buyer_id,
            'buyer_name', COALESCE(v_buyer_name, 'Buyer')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Buyer Cancels Request with Activity Logging
CREATE OR REPLACE FUNCTION public.cancel_interest_request(p_request_id UUID)
RETURNS VOID AS $$
DECLARE
    v_buyer_id UUID;
    v_listing_id UUID;
    v_status TEXT;
    v_buyer_name TEXT;
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

    -- Log to listing activity audit trail
    SELECT display_name INTO v_buyer_name FROM public.profiles WHERE id = v_buyer_id;

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        v_listing_id,
        auth.uid(),
        'request_cancelled',
        'Buyer cancelled their interest request',
        jsonb_build_object(
            'request_id', p_request_id,
            'buyer_id', v_buyer_id,
            'buyer_name', COALESCE(v_buyer_name, 'Buyer')
        )
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Mark Listing Sold with Activity Logging
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

-- Admin Hide Listing with Activity Logging
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

    INSERT INTO public.listing_activity_logs (
        listing_id, actor_id, action_type, summary, details
    )
    VALUES (
        p_listing_id,
        auth.uid(),
        'admin_hidden',
        'Moderator removed listing: ' || p_reason,
        jsonb_build_object('reason', p_reason)
    );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 5. FUNCTION: GET COMPLETE LISTING LIFECYCLE AUDIT TRAIL
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 6. PERMANENT ACCOUNT DELETION (admin_delete_user)
-- ------------------------------------------------------------------------------
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

    -- 1. Log audit record before deleting user data
    INSERT INTO public.admin_audit_logs (
        admin_id, action, target_type, target_id, reason
    )
    VALUES (
        auth.uid(), 'delete_user', 'user', p_target_user_id, p_reason
    );

    -- 2. Delete from auth.users (cascades to profiles, user_contacts, listings, etc.)
    DELETE FROM auth.users WHERE id = p_target_user_id;

    -- Safety check: ensure profiles row is removed if FK was deferred
    DELETE FROM public.profiles WHERE id = p_target_user_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ------------------------------------------------------------------------------
-- 7. INSTITUTION DELETION WITH SAFETY GUARD (admin_delete_institution)
-- ------------------------------------------------------------------------------
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

-- ------------------------------------------------------------------------------
-- 8. RESET & SEED INDORE INSTITUTIONS (admin_seed_indore_institutions)
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_seed_indore_institutions()
RETURNS INT AS $$
DECLARE
    v_inserted_count INT := 0;
BEGIN
    IF NOT public.is_admin_or_moderator(auth.uid()) THEN
        RAISE EXCEPTION 'Unauthorized: Admin privileges required';
    END IF;

    -- 1. Unlink profiles and listings from old institutions before purging
    UPDATE public.profiles SET institution_id = NULL;
    UPDATE public.listings SET institution_id = NULL;

    -- 2. Clear out all institutions
    DELETE FROM public.institutions;

    -- 3. Seed Comprehensive Categorized Indore Institutions
    INSERT INTO public.institutions (name, institution_type, city, area, verification_method, is_active)
    VALUES 
        -- ---------------------------------------------------------
        -- ENGINEERING COLLEGES (Indore)
        -- ---------------------------------------------------------
        ('Acropolis Institute of Technology & Research (AITR)', 'College', 'Indore', 'Bypass Road, Manglia', 'self_selected', true),
        ('Shri Govindram Seksaria Institute of Technology and Science (SGSITS)', 'College', 'Indore', 'Vallabh Nagar', 'self_selected', true),
        ('Institute of Engineering & Technology, DAVV (IET DAVV)', 'College', 'Indore', 'Khandwa Road', 'self_selected', true),
        ('IPS Academy, Institute of Engineering & Science', 'College', 'Indore', 'Rajendra Nagar', 'self_selected', true),
        ('Medi-Caps University (Faculty of Engineering)', 'College', 'Indore', 'A.B. Road, Pigdamber', 'self_selected', true),
        ('Oriental Institute of Science and Technology (OIST)', 'College', 'Indore', 'Sanwer Road', 'self_selected', true),
        ('SVKM''s NMIMS MPSTME (Indore Campus)', 'College', 'Indore', 'Super Corridor', 'self_selected', true),
        ('Indian Institute of Technology Indore (IIT Indore)', 'College', 'Indore', 'Simrol', 'self_selected', true),

        -- ---------------------------------------------------------
        -- MEDICAL & HEALTH SCIENCES (Indore)
        -- ---------------------------------------------------------
        ('Mahatma Gandhi Memorial Medical College (MGM Medical College)', 'College', 'Indore', 'A.B. Road', 'self_selected', true),
        ('Sri Aurobindo Institute of Medical Sciences (SAIMS)', 'College', 'Indore', 'Sanwer Road', 'self_selected', true),
        ('Index Medical College Hospital & Research Centre', 'College', 'Indore', 'Nemawar Road', 'self_selected', true),
        ('Government College of Dentistry (GDC Indore)', 'College', 'Indore', 'Sardar Patel Marg', 'self_selected', true),
        ('Choithram College of Nursing & Health Sciences', 'College', 'Indore', 'Manik Bagh Road', 'self_selected', true),

        -- ---------------------------------------------------------
        -- PHARMACY COLLEGES (Indore)
        -- ---------------------------------------------------------
        ('Department of Pharmacy, SGSITS', 'College', 'Indore', 'Vallabh Nagar', 'self_selected', true),
        ('Acropolis Institute of Pharmaceutical Education and Research (AIPER)', 'College', 'Indore', 'Manglia', 'self_selected', true),
        ('Modern Institute of Pharmaceutical Sciences', 'College', 'Indore', 'Alwasa, Sanwer Road', 'self_selected', true),
        ('Indore Institute of Pharmacy (IIP)', 'College', 'Indore', 'Rau-Pithampur Bypass Road', 'self_selected', true),
        ('Smriti College of Pharmaceutical Education (SCOPE)', 'College', 'Indore', 'MR-11, Pipliya Kumar', 'self_selected', true),

        -- ---------------------------------------------------------
        -- COMMERCE, BUSINESS AND MANAGEMENT (Indore)
        -- ---------------------------------------------------------
        ('Institute of Management Studies, DAVV (IMS DAVV)', 'College', 'Indore', 'Khandwa Road', 'self_selected', true),
        ('Prestige Institute of Management and Research (PIMR)', 'College', 'Indore', 'Scheme 54, Vijay Nagar', 'self_selected', true),
        ('Jaipuria Institute of Management', 'College', 'Indore', 'Indore-Dewas Highway', 'self_selected', true),
        ('Daly College Business School (DCBS)', 'College', 'Indore', 'Residency Area', 'self_selected', true),
        ('Renaissance College of Commerce and Management', 'College', 'Indore', 'Bypass Road', 'self_selected', true),
        ('Shri Vaishnav Institute of Management (SVIM)', 'College', 'Indore', 'Gumasta Nagar', 'self_selected', true),
        ('Indian Institute of Management Indore (IIM Indore)', 'College', 'Indore', 'Prabandh Shikhar, Rau', 'self_selected', true),

        -- ---------------------------------------------------------
        -- SCHOOLS & JUNIOR COLLEGES (Indore)
        -- ---------------------------------------------------------
        ('The Daly College', 'School', 'Indore', 'Residency Area', 'self_selected', true),
        ('Delhi Public School (DPS Indore)', 'School', 'Indore', 'Nipania, Bypass Road', 'self_selected', true),
        ('Choithram School', 'School', 'Indore', 'Manik Bagh Road', 'self_selected', true),
        ('The Emerald Heights International School', 'School', 'Indore', 'A.B. Road, Rau', 'self_selected', true),
        ('The Shishukunj International School', 'School', 'Indore', 'Jhalaria, Bypass Road', 'self_selected', true),
        ('St. Raphael''s Higher Secondary School', 'School', 'Indore', '15 Old Palasia', 'self_selected', true),
        ('Advanced Academy', 'School', 'Indore', 'Nipania', 'self_selected', true),
        ('Sri Sathya Sai Vidya Vihar', 'School', 'Indore', 'Scheme 54, Vijay Nagar', 'self_selected', true),
        ('St. Paul Higher Secondary School', 'School', 'Indore', 'Boundary Road', 'self_selected', true),

        -- ---------------------------------------------------------
        -- COMPETITIVE EXAMS & COACHING HUBS (Indore)
        -- ---------------------------------------------------------
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
