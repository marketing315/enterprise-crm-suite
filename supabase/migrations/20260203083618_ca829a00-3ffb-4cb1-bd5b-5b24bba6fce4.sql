-- Create call_logs table for VoIP click-to-call logging
CREATE TABLE public.call_logs (
    id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
    brand_id UUID NOT NULL REFERENCES public.brands(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES public.contacts(id) ON DELETE CASCADE,
    deal_id UUID REFERENCES public.deals(id) ON DELETE SET NULL,
    user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
    phone_number TEXT NOT NULL,
    call_type TEXT NOT NULL DEFAULT 'outbound' CHECK (call_type IN ('outbound', 'inbound')),
    status TEXT NOT NULL DEFAULT 'initiated' CHECK (status IN ('initiated', 'ringing', 'answered', 'completed', 'failed', 'busy', 'no_answer')),
    duration_seconds INTEGER,
    notes TEXT,
    recording_url TEXT,
    started_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
    ended_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.call_logs ENABLE ROW LEVEL SECURITY;

-- Create indexes for performance
CREATE INDEX idx_call_logs_brand_id ON public.call_logs(brand_id);
CREATE INDEX idx_call_logs_contact_id ON public.call_logs(contact_id);
CREATE INDEX idx_call_logs_user_id ON public.call_logs(user_id);
CREATE INDEX idx_call_logs_started_at ON public.call_logs(started_at DESC);

-- RLS Policies
-- Users can view call logs in their brands
CREATE POLICY "Users can view call logs in their brands"
ON public.call_logs
FOR SELECT
USING (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Users can insert call logs in their brands
CREATE POLICY "Users can insert call logs"
ON public.call_logs
FOR INSERT
WITH CHECK (user_belongs_to_brand(get_user_id(auth.uid()), brand_id));

-- Users can update their own call logs
CREATE POLICY "Users can update their own call logs"
ON public.call_logs
FOR UPDATE
USING (user_id = get_user_id(auth.uid()));

-- Enable realtime for call_logs
ALTER PUBLICATION supabase_realtime ADD TABLE public.call_logs;