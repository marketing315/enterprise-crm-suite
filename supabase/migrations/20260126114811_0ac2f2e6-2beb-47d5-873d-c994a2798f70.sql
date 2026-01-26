
-- Add missing auto_assign_enabled column to brands table
ALTER TABLE public.brands
ADD COLUMN auto_assign_enabled boolean NOT NULL DEFAULT true;

-- Add comment for documentation
COMMENT ON COLUMN public.brands.auto_assign_enabled IS 'Controls whether new support tickets are automatically assigned via Round Robin';
