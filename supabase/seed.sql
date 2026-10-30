-- ==============================================================================
-- BookLoop Seed Data
-- Launch city: Pune, Maharashtra
-- Categorized: 'School' vs 'College' vs 'Other'
-- ==============================================================================

-- 1. INSTITUTIONS SEED
INSERT INTO public.institutions (name, institution_type, city, area, verification_method, is_active)
VALUES 
    -- ---------------------------------------------------------
    -- SCHOOLS & JUNIOR COLLEGES (1st to 12th / CBSE / ICSE / State)
    -- ---------------------------------------------------------
    ('The Bishop’s School & Junior College', 'School', 'Pune', 'Camp', 'self_selected', true),
    ('The Bishop’s Co-Ed School', 'School', 'Pune', 'Kalyani Nagar', 'self_selected', true),
    ('St. Vincent’s High School and Junior College', 'School', 'Pune', 'Camp', 'self_selected', true),
    ('Loyola High School and Junior College', 'School', 'Pune', 'Pashan', 'self_selected', true),
    ('Delhi Public School (DPS Pune)', 'School', 'Pune', 'Mohammadwadi', 'self_selected', true),
    ('Orchid School', 'School', 'Pune', 'Baner', 'self_selected', true),
    ('Viman Nagar Kendriya Vidyalaya (KV 1 & 2)', 'School', 'Pune', 'Viman Nagar', 'self_selected', true),
    ('Jnana Prabodhini Prashala', 'School', 'Pune', 'Sadashiv Peth', 'self_selected', true),
    ('Abhinava Vidyalaya English Medium High School', 'School', 'Pune', 'Erandwane', 'self_selected', true),
    ('Symbiosis School & Junior College', 'School', 'Pune', 'Prabhat Road', 'self_selected', true),
    ('Modern High School & Junior College', 'School', 'Pune', 'Shivajinagar', 'self_selected', true),
    ('St. Mary’s School & Junior College', 'School', 'Pune', 'Camp', 'self_selected', true),

    -- ---------------------------------------------------------
    -- HIGHER EDUCATION (Engineering, Medical, Commerce, Science, Arts)
    -- ---------------------------------------------------------
    ('College of Engineering, Pune (COEP Tech)', 'College', 'Pune', 'Shivajinagar', 'self_selected', true),
    ('Pune Institute of Computer Technology (PICT)', 'College', 'Pune', 'Dhankawadi', 'self_selected', true),
    ('Vishwakarma Institute of Technology (VIT)', 'College', 'Pune', 'Bibwewadi', 'self_selected', true),
    ('Cummins College of Engineering for Women', 'College', 'Pune', 'Karve Nagar', 'self_selected', true),
    ('Maharashtra Institute of Technology (MIT-WPU)', 'College', 'Pune', 'Kothrud', 'self_selected', true),
    ('Army Institute of Technology (AIT)', 'College', 'Pune', 'Dighi', 'self_selected', true),
    ('B. J. Government Medical College & Sassoon Hospital', 'College', 'Pune', 'Pune Station', 'self_selected', true),
    ('Armed Forces Medical College (AFMC)', 'College', 'Pune', 'Wanowrie', 'self_selected', true),
    ('Bharati Vidyapeeth Medical College & Hospital', 'College', 'Pune', 'Dhankawadi', 'self_selected', true),
    ('Fergusson College (Autonomous)', 'College', 'Pune', 'FC Road', 'self_selected', true),
    ('Symbiosis College of Arts and Commerce', 'College', 'Pune', 'SB Road', 'self_selected', true),
    ('Brihan Maharashtra College of Commerce (BMCC)', 'College', 'Pune', 'Shivajinagar', 'self_selected', true),
    ('Sir Parashurambhau College (SP College)', 'College', 'Pune', 'Sadashiv Peth', 'self_selected', true),
    ('Modern College of Arts, Science and Commerce', 'College', 'Pune', 'Shivajinagar', 'self_selected', true),
    ('Nowrosjee Wadia College', 'College', 'Pune', 'Camp', 'self_selected', true),
    ('ILS Law College', 'College', 'Pune', 'Law College Road', 'self_selected', true),

    -- ---------------------------------------------------------
    -- OTHER (Competitive Exam Coaching / Preparatory Hubs)
    -- ---------------------------------------------------------
    ('Allen Career Institute - Pune Center', 'Other', 'Pune', 'FC Road & Swargate', 'self_selected', true),
    ('Aakash Institute - Pune Hub', 'Other', 'Pune', 'Kothrud & Camp', 'self_selected', true),
    ('Chate Coaching Classes', 'Other', 'Pune', 'Sadashiv Peth', 'self_selected', true)
ON CONFLICT DO NOTHING;

-- 2. Storage Bucket setup for Supabase Storage
-- Creates public bucket 'listing-photos' for book photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('listing-photos', 'listing-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: Anyone can view listing photos
CREATE POLICY "Public Read Access for Listing Photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'listing-photos');

-- Storage RLS: Authenticated users can upload to listing-photos
CREATE POLICY "Authenticated Users Can Upload Photos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'listing-photos' AND 
    auth.role() = 'authenticated'
);

-- Storage RLS: Users can update or delete their uploaded photos
CREATE POLICY "Users can manage own uploaded photos"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'listing-photos' AND 
    auth.uid() = owner
);
