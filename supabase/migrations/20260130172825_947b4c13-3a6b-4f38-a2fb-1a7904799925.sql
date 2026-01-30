-- ========================================
-- DLQ System - Part 1: Enums and Columns
-- ========================================

-- 1. Add DLQ enum for ingest reasons
DO $$ BEGIN
    CREATE TYPE dlq_reason AS ENUM (
        'invalid_json',
        'mapping_error', 
        'missing_required',
        'signature_failed',
        'rate_limited',
        'ai_extraction_failed',
        'contact_creation_failed',
        'unknown_error'
    );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Add dlq_reason column to incoming_requests
ALTER TABLE incoming_requests 
ADD COLUMN IF NOT EXISTS dlq_reason dlq_reason DEFAULT NULL;

-- 3. Add raw_body_text column for invalid JSON fallback
ALTER TABLE incoming_requests 
ADD COLUMN IF NOT EXISTS raw_body_text TEXT DEFAULT NULL;

-- 4. Add 'dead' status to webhook_delivery_status enum
ALTER TYPE webhook_delivery_status ADD VALUE IF NOT EXISTS 'dead';

-- 5. Add dead_at timestamp to outbound_webhook_deliveries
ALTER TABLE outbound_webhook_deliveries 
ADD COLUMN IF NOT EXISTS dead_at TIMESTAMPTZ DEFAULT NULL;