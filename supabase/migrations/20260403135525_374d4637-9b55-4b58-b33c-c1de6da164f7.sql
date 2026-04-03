
UPDATE outbound_webhooks
SET payload_mapping = jsonb_set(payload_mapping::jsonb, '{extra}', '"contact_snapshot.pipeline_stage_name"')
WHERE name ILIKE '%sileads%';
