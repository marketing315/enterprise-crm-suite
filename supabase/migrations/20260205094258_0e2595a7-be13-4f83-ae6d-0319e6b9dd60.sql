-- Add archived column to tickets table
ALTER TABLE public.tickets ADD COLUMN archived boolean NOT NULL DEFAULT false;

-- Add archived_at timestamp
ALTER TABLE public.tickets ADD COLUMN archived_at timestamp with time zone;

-- Add archived_by_user_id
ALTER TABLE public.tickets ADD COLUMN archived_by_user_id uuid REFERENCES public.users(id);

-- Create index for faster filtering of non-archived tickets
CREATE INDEX idx_tickets_archived ON public.tickets(brand_id, archived) WHERE archived = false;