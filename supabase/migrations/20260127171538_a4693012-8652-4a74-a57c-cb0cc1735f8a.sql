-- Enum con 4 stati semanticamente corretti
CREATE TYPE ingest_status AS ENUM ('pending', 'success', 'rejected', 'failed');

-- Nuove colonne
ALTER TABLE incoming_requests 
ADD COLUMN user_agent text,
ADD COLUMN status ingest_status DEFAULT 'pending';

-- Backfill conservativo con cast esplicito
UPDATE incoming_requests 
SET status = CASE 
  WHEN processed AND error_message IS NULL THEN 'success'::ingest_status
  WHEN processed AND error_message IS NOT NULL THEN 'failed'::ingest_status
  ELSE 'pending'::ingest_status
END;

-- Indice per query audit (source + data descending)
CREATE INDEX idx_incoming_requests_source_created_desc
ON incoming_requests (source_id, created_at DESC);