-- Create trigger function to auto-set closed_at when deal is closed
CREATE OR REPLACE FUNCTION public.set_deal_closed_at()
RETURNS TRIGGER AS $$
BEGIN
  -- If status changed to won, lost, or closed and closed_at is NULL
  IF NEW.status IN ('won', 'lost', 'closed') 
     AND (OLD.status IS DISTINCT FROM NEW.status)
     AND NEW.closed_at IS NULL THEN
    NEW.closed_at = now();
  END IF;
  
  -- If status changed back to open, clear closed_at
  IF NEW.status = 'open' AND OLD.status IN ('won', 'lost', 'closed') THEN
    NEW.closed_at = NULL;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- Create trigger on deals table
DROP TRIGGER IF EXISTS trigger_set_deal_closed_at ON public.deals;
CREATE TRIGGER trigger_set_deal_closed_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.set_deal_closed_at();

-- Also backfill existing closed deals that have NULL closed_at
UPDATE public.deals
SET closed_at = updated_at
WHERE status IN ('won', 'lost', 'closed')
  AND closed_at IS NULL;