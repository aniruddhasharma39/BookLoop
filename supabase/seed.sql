-- ==============================================================================
-- BookLoop Seed Data
-- Launch city: Indore, Madhya Pradesh
-- Categorized: Engineering, Medical, Pharmacy, Commerce/Management, Schools, Coaching
-- ==============================================================================

-- 1. INSTITUTIONS SEED (Indore)
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
    ('Physics Wallah Vidyapeeth', 'Other', 'Indore', 'Bhawarkua', 'self_selected', true)
ON CONFLICT DO NOTHING;

-- 2. Storage Bucket setup for Supabase Storage
-- Creates public bucket 'listing-photos' for book photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Anyone can view listing photos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Public Read Access for Listing Photos'
    ) THEN
        CREATE POLICY "Public Read Access for Listing Photos"
        ON storage.objects FOR SELECT
        USING (bucket_id = 'listing-photos');
    END IF;
END $$;

-- Storage RLS: Authenticated users can upload to listing-photos
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_policies 
        WHERE schemaname = 'storage' AND tablename = 'objects' AND policyname = 'Authenticated Users Can Upload Photos'
    ) THEN
        CREATE POLICY "Authenticated Users Can Upload Photos"
        ON storage.objects FOR INSERT
        WITH CHECK (
            bucket_id = 'listing-photos' AND 
            auth.role() = 'authenticated'
        );
    END IF;
END $$;
