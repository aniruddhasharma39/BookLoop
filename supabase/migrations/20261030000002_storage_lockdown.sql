-- ==============================================================================
-- BookLoop Step 2: Storage Bucket Configuration & Security Lockdown
-- Bucket: listing-photos (Max 5MB, JPEG/PNG/WebP, Owner Restricted)
-- ==============================================================================

-- 1. Configure Storage Bucket with constraints
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
    'listing-photos',
    'listing-photos',
    true, -- Public read for CDN cacheability & fast mobile browsing
    5242880, -- 5MB file size limit
    ARRAY['image/jpeg', 'image/png', 'image/webp']::text[]
)
ON CONFLICT (id) DO UPDATE SET
    public = true,
    file_size_limit = 5242880,
    allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'image/webp']::text[];

-- 2. Storage Objects RLS Policies
-- Public Read: Anyone can view listing photos
DROP POLICY IF EXISTS "Public Read Access for Listing Photos" ON storage.objects;
CREATE POLICY "Public Read Access for Listing Photos"
ON storage.objects FOR SELECT
USING (bucket_id = 'listing-photos');

-- Write Restriction: Only listing owners can upload to their listing's folder
-- Folder format: <listing_id>/<filename>
DROP POLICY IF EXISTS "Listing owners can upload photos" ON storage.objects;
CREATE POLICY "Listing owners can upload photos"
ON storage.objects FOR INSERT
WITH CHECK (
    bucket_id = 'listing-photos' AND 
    auth.role() = 'authenticated' AND
    EXISTS (
        SELECT 1 FROM public.listings
        WHERE id = (
            CASE 
                -- Safely parse UUID from folder prefix
                WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN split_part(name, '/', 1)::uuid
                ELSE NULL
            END
        )
        AND (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
    )
);

-- Delete Restriction: Only listing owners or admins can remove photos
DROP POLICY IF EXISTS "Listing owners can delete photos" ON storage.objects;
CREATE POLICY "Listing owners can delete photos"
ON storage.objects FOR DELETE
USING (
    bucket_id = 'listing-photos' AND 
    auth.role() = 'authenticated' AND
    EXISTS (
        SELECT 1 FROM public.listings
        WHERE id = (
            CASE 
                WHEN split_part(name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
                THEN split_part(name, '/', 1)::uuid
                ELSE NULL
            END
        )
        AND (seller_id = auth.uid() OR public.is_admin_or_moderator(auth.uid()))
    )
);

