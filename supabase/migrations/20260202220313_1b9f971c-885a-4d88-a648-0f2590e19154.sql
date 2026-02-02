-- Create storage bucket for sale document scans
INSERT INTO storage.buckets (id, name, public)
VALUES ('sale-documents', 'sale-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS for sale documents storage - only authenticated users in brand
CREATE POLICY "Users can upload sale documents"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'sale-documents'
);

CREATE POLICY "Users can view their brand sale documents"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'sale-documents'
);

CREATE POLICY "Users can delete their own sale documents"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'sale-documents' 
  AND auth.uid()::text = (storage.foldername(name))[1]
);