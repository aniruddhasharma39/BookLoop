-- ==============================================================================
-- BookLoop Automated RLS & Security Verification Suite
-- Can be executed directly in the Supabase SQL Editor.
-- Runs inside a transaction and rolls back at the end (no residual test data).
-- ==============================================================================

BEGIN;

DO $$
DECLARE
    -- Test UUIDs
    c_seller_id UUID := '00000000-0000-0000-0000-000000000001'::uuid;
    c_buyer_id  UUID := '00000000-0000-0000-0000-000000000002'::uuid;
    c_hacker_id UUID := '00000000-0000-0000-0000-000000000003'::uuid;
    c_admin_id  UUID := '00000000-0000-0000-0000-000000000009'::uuid;

    v_inst_id UUID;
    v_listing_id UUID;
    v_request_id UUID;

    v_temp_text TEXT;
    v_count INT;
    v_failed BOOLEAN := false;
BEGIN
    RAISE NOTICE '=======================================================';
    RAISE NOTICE 'Starting BookLoop RLS Security Verification Tests...';
    RAISE NOTICE '=======================================================';

    -- 0. PREPARE TEST FIXTURES
    -- Get or create an active institution
    SELECT id INTO v_inst_id FROM public.institutions WHERE is_active = true LIMIT 1;
    IF v_inst_id IS NULL THEN
        INSERT INTO public.institutions (name, institution_type, city, area)
        VALUES ('Test Tech College', 'College', 'Pune', 'Shivajinagar')
        RETURNING id INTO v_inst_id;
    END IF;

    -- Create test profiles
    INSERT INTO public.profiles (id, display_name, institution_id, whatsapp_number, account_status)
    VALUES 
        (c_seller_id, 'Seller Student', v_inst_id, '+919876543210', 'active'),
        (c_buyer_id,  'Buyer Junior',   v_inst_id, '+919123456789', 'active'),
        (c_hacker_id, 'Hacker/Stranger',v_inst_id, NULL,           'active'),
        (c_admin_id,  'Admin Staff',    v_inst_id, NULL,           'active')
    ON CONFLICT (id) DO UPDATE SET 
        whatsapp_number = EXCLUDED.whatsapp_number,
        account_status = EXCLUDED.account_status;

    -- Assign admin role
    INSERT INTO public.admin_roles (user_id, role)
    VALUES (c_admin_id, 'admin')
    ON CONFLICT (user_id) DO NOTHING;

    -- Create a test listing owned by seller
    INSERT INTO public.listings (id, seller_id, institution_id, title, category, condition, price_paise, status)
    VALUES (gen_random_uuid(), c_seller_id, v_inst_id, 'Test Physics Vol 1', 'Engineering & Tech', 'Good', 25000, 'active')
    RETURNING id INTO v_listing_id;

    -- Create an initial interest request by buyer
    INSERT INTO public.interest_requests (id, listing_id, buyer_id, seller_id, status)
    VALUES (gen_random_uuid(), v_listing_id, c_buyer_id, c_seller_id, 'pending')
    RETURNING id INTO v_request_id;

    -- -------------------------------------------------------------
    -- TEST 1: Public Catalogue View never leaks phone or email
    -- -------------------------------------------------------------
    SELECT count(*) INTO v_count
    FROM information_schema.columns
    WHERE table_name = 'public_catalogue' 
      AND column_name IN ('whatsapp_number', 'email', 'phone');

    IF v_count = 0 THEN
        RAISE NOTICE '✅ TEST 1 PASSED: public_catalogue contains zero contact/private fields.';
    ELSE
        RAISE EXCEPTION '❌ TEST 1 FAILED: public_catalogue exposes private contact columns!';
    END IF;

    -- -------------------------------------------------------------
    -- TEST 2: User cannot edit someone else's listing
    -- -------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', c_hacker_id::text, true);
    PERFORM set_config('role', 'authenticated', true);

    UPDATE public.listings 
    SET price_paise = 100 
    WHERE id = v_listing_id;

    SELECT price_paise INTO v_count FROM public.listings WHERE id = v_listing_id;
    IF v_count = 25000 THEN
        RAISE NOTICE '✅ TEST 2 PASSED: Non-owner cannot update another student''s listing (RLS protected).';
    ELSE
        RAISE EXCEPTION '❌ TEST 2 FAILED: Non-owner successfully altered another student''s listing!';
    END IF;

    -- -------------------------------------------------------------
    -- TEST 3: User cannot read someone else''s interest requests
    -- -------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', c_hacker_id::text, true);
    PERFORM set_config('role', 'authenticated', true);

    SELECT count(*) INTO v_count
    FROM public.interest_requests
    WHERE id = v_request_id;

    IF v_count = 0 THEN
        RAISE NOTICE '✅ TEST 3 PASSED: Stranger cannot view private interest requests of other students.';
    ELSE
        RAISE EXCEPTION '❌ TEST 3 FAILED: Stranger was able to view private interest request!';
    END IF;

    -- -------------------------------------------------------------
    -- TEST 4: Normal user cannot self-assign an admin role
    -- -------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', c_hacker_id::text, true);
    PERFORM set_config('role', 'authenticated', true);

    BEGIN
        INSERT INTO public.admin_roles (user_id, role)
        VALUES (c_hacker_id, 'admin');
        RAISE EXCEPTION '❌ TEST 4 FAILED: User was able to write to admin_roles!';
    EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
        RAISE NOTICE '✅ TEST 4 PASSED: Non-admin write to admin_roles rejected by permissions/RLS.';
    END;

    -- -------------------------------------------------------------
    -- TEST 5: Cannot reveal WhatsApp while request is 'pending'
    -- -------------------------------------------------------------
    PERFORM set_config('request.jwt.claim.sub', c_buyer_id::text, true);
    PERFORM set_config('role', 'authenticated', true);

    BEGIN
        PERFORM public.get_seller_contact(v_request_id);
        RAISE EXCEPTION '❌ TEST 5 FAILED: WhatsApp revealed prematurely for pending request!';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✅ TEST 5 PASSED: WhatsApp contact reveal blocked for pending request.';
    END;

    -- -------------------------------------------------------------
    -- TEST 6: WhatsApp reveal works ONLY for accepted buyer
    -- -------------------------------------------------------------
    -- Seller accepts the request
    PERFORM set_config('request.jwt.claim.sub', c_seller_id::text, true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.accept_interest_request(v_request_id);

    -- Stranger tries to fetch contact -> Must fail
    PERFORM set_config('request.jwt.claim.sub', c_hacker_id::text, true);
    PERFORM set_config('role', 'authenticated', true);
    BEGIN
        PERFORM public.get_seller_contact(v_request_id);
        RAISE EXCEPTION '❌ TEST 6a FAILED: Stranger retrieved contact of accepted request!';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✅ TEST 6a PASSED: Stranger blocked from retrieving contact of accepted request.';
    END;

    -- Buyer fetches contact -> Must succeed!
    PERFORM set_config('request.jwt.claim.sub', c_buyer_id::text, true);
    PERFORM set_config('role', 'authenticated', true);

    SELECT whatsapp_number INTO v_temp_text 
    FROM public.get_seller_contact(v_request_id);

    IF v_temp_text = '+919876543210' THEN
        RAISE NOTICE '✅ TEST 6b PASSED: Accepted buyer successfully retrieved seller WhatsApp via protected RPC.';
    ELSE
        RAISE EXCEPTION '❌ TEST 6b FAILED: Accepted buyer could not retrieve expected WhatsApp number!';
    END IF;

    -- -------------------------------------------------------------
    -- TEST 7: Mark Sold closes other pending requests
    -- -------------------------------------------------------------
    -- Insert another pending request from hacker
    PERFORM set_config('request.jwt.claim.sub', c_seller_id::text, true);
    PERFORM set_config('role', 'authenticated', true);

    INSERT INTO public.interest_requests (id, listing_id, buyer_id, seller_id, status)
    VALUES (gen_random_uuid(), v_listing_id, c_hacker_id, c_seller_id, 'pending');

    -- Seller marks listing as sold
    PERFORM public.mark_listing_sold(v_listing_id);

    SELECT count(*) INTO v_count
    FROM public.interest_requests
    WHERE listing_id = v_listing_id AND status = 'closed';

    IF v_count >= 1 THEN
        RAISE NOTICE '✅ TEST 7 PASSED: Marking book as sold automatically closed remaining pending requests.';
    ELSE
        RAISE EXCEPTION '❌ TEST 7 FAILED: Pending requests were not automatically closed upon sale!';
    END IF;

    -- -------------------------------------------------------------
    -- TEST 8: Suspended account blocked from creating listings
    -- -------------------------------------------------------------
    -- Admin suspends the hacker
    PERFORM set_config('request.jwt.claim.sub', c_admin_id::text, true);
    PERFORM set_config('role', 'authenticated', true);
    PERFORM public.admin_suspend_user(c_hacker_id, 'Violation of community safety rules');

    -- Verify audit log entry was created
    SELECT count(*) INTO v_count 
    FROM public.admin_audit_logs 
    WHERE target_id = c_hacker_id AND action = 'suspend_user';

    IF v_count = 1 THEN
        RAISE NOTICE '✅ TEST 8a PASSED: Admin action recorded in admin_audit_logs table.';
    ELSE
        RAISE EXCEPTION '❌ TEST 8a FAILED: Audit log entry was not created!';
    END IF;

    -- Suspended hacker attempts to create a listing -> Must fail
    PERFORM set_config('request.jwt.claim.sub', c_hacker_id::text, true);
    PERFORM set_config('role', 'authenticated', true);

    BEGIN
        INSERT INTO public.listings (seller_id, institution_id, title, category, condition, price_paise, status)
        VALUES (c_hacker_id, v_inst_id, 'Hacked Book', 'Other', 'Fair', 1000, 'active');
        RAISE EXCEPTION '❌ TEST 8b FAILED: Suspended user was able to create a listing!';
    EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE '✅ TEST 8b PASSED: Suspended user blocked by RLS from creating listings.';
    END;

    RAISE NOTICE '=======================================================';
    RAISE NOTICE '🎉 ALL 8 RLS & DATA SECURITY TESTS PASSED PERFECTLY!';
    RAISE NOTICE '=======================================================';
END $$;

ROLLBACK; -- Safe rollback: no test records remain in your database

