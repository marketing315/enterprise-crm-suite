REVOKE ALL ON public.mv_channel_perf_daily     FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.mv_salesperson_perf_daily FROM PUBLIC, anon, authenticated;
-- service_role e SECURITY DEFINER functions continuano a leggerle