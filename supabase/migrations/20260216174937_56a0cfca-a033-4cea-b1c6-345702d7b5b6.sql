
-- Drop the old overload with ad_platform enum type
DROP FUNCTION IF EXISTS get_ad_platform_stats_summary(uuid, date, date, public.ad_platform, uuid);
