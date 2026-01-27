-- Permette audit "sempre scritto" anche quando source/brand non risolvibili
ALTER TABLE incoming_requests 
ALTER COLUMN brand_id DROP NOT NULL;

-- Permette salvare audit anche con JSON invalido (raw_body = null + error_message)
ALTER TABLE incoming_requests 
ALTER COLUMN raw_body DROP NOT NULL;