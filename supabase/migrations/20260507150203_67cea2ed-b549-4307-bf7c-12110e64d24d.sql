
CREATE OR REPLACE FUNCTION public.trg_audit_finance_writes()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_action text;
  v_brand uuid;
  v_entity uuid;
  v_old jsonb := NULL;
  v_new jsonb := NULL;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_action := 'create';
    v_brand := NEW.brand_id;
    v_entity := NEW.id;
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'UPDATE' THEN
    v_action := 'update';
    v_brand := NEW.brand_id;
    v_entity := NEW.id;
    v_old := to_jsonb(OLD);
    v_new := to_jsonb(NEW);
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'delete';
    v_brand := OLD.brand_id;
    v_entity := OLD.id;
    v_old := to_jsonb(OLD);
  END IF;

  PERFORM public.log_audit_event(
    TG_TABLE_NAME,
    v_action,
    v_brand,
    v_entity,
    v_old,
    v_new,
    jsonb_build_object('trigger', TG_NAME, 'op', TG_OP),
    'trigger'
  );

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_audit_expenses_writes ON public.expenses;
CREATE TRIGGER trg_audit_expenses_writes
AFTER INSERT OR UPDATE OR DELETE ON public.expenses
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_finance_writes();

DROP TRIGGER IF EXISTS trg_audit_budgets_writes ON public.budgets;
CREATE TRIGGER trg_audit_budgets_writes
AFTER INSERT OR UPDATE OR DELETE ON public.budgets
FOR EACH ROW EXECUTE FUNCTION public.trg_audit_finance_writes();
