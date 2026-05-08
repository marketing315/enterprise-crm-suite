
-- Per-minute → every 2 minutes
SELECT cron.alter_job(job_id := 84, schedule := '*/2 * * * *'); -- notification-webhook-dispatcher
SELECT cron.alter_job(job_id := 87, schedule := '*/2 * * * *'); -- sheets-export-dispatcher
SELECT cron.alter_job(job_id := 74, schedule := '*/2 * * * *'); -- webhook-dispatcher-cron
SELECT cron.alter_job(job_id := 126, schedule := '*/2 * * * *'); -- process-email-queue

-- Every 15 min → every 30 min
SELECT cron.alter_job(job_id := 51, schedule := '*/30 * * * *'); -- detect-anomalies
SELECT cron.alter_job(job_id := 52, schedule := '*/30 * * * *'); -- slo-snapshot
SELECT cron.alter_job(job_id := 94, schedule := '*/30 * * * *'); -- sheets-export-slo-check
SELECT cron.alter_job(job_id := 130, schedule := '*/30 * * * *'); -- ads-stats-meta-sync
SELECT cron.alter_job(job_id := 88, schedule := '*/30 * * * *'); -- sales-route-dispatcher

-- Every 15 min cleanup → hourly
SELECT cron.alter_job(job_id := 46, schedule := '13 * * * *'); -- cleanup-webhook-dedup
SELECT cron.alter_job(job_id := 93, schedule := '23 * * * *'); -- f3-cleanup-session-data

-- Every 10 min → every 30 min
SELECT cron.alter_job(job_id := 99, schedule := '*/30 * * * *'); -- cron-health-monitor

-- Every 30 min → hourly
SELECT cron.alter_job(job_id := 54, schedule := '37 * * * *'); -- notify-high-risk-appointments
