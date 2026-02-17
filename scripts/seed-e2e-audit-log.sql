-- Seed: audit_log verification entries
-- Idempotent: uses ON CONFLICT on primary key (deterministic UUIDs)
-- Purpose: QA validation that audit system records actions correctly

INSERT INTO public.audit_log (id, brand_id, entity_type, entity_id, action, actor_user_id, old_value, new_value, metadata, created_at)
VALUES
  -- Appointment status change
  (
    'a0000000-0000-0000-0000-000000000001',
    (SELECT id FROM brands WHERE slug = 'demo' LIMIT 1),
    'appointment',
    'a0000000-0000-0000-0000-0000000000a1',
    'status_changed',
    NULL,
    '{"status": "scheduled"}'::jsonb,
    '{"status": "completed"}'::jsonb,
    '{"source": "e2e-seed"}'::jsonb,
    NOW() - INTERVAL '2 hours'
  ),
  -- Deal stage move
  (
    'a0000000-0000-0000-0000-000000000002',
    (SELECT id FROM brands WHERE slug = 'demo' LIMIT 1),
    'deal',
    'a0000000-0000-0000-0000-0000000000d1',
    'stage_changed',
    NULL,
    '{"stage": "Nuovo"}'::jsonb,
    '{"stage": "Qualificato"}'::jsonb,
    '{"source": "e2e-seed"}'::jsonb,
    NOW() - INTERVAL '1 hour'
  ),
  -- Ticket assignment
  (
    'a0000000-0000-0000-0000-000000000003',
    (SELECT id FROM brands WHERE slug = 'demo' LIMIT 1),
    'ticket',
    'a0000000-0000-0000-0000-0000000000t1',
    'assigned',
    NULL,
    '{"assigned_to": null}'::jsonb,
    '{"assigned_to": "operator-1"}'::jsonb,
    '{"source": "e2e-seed"}'::jsonb,
    NOW() - INTERVAL '30 minutes'
  )
ON CONFLICT (id) DO UPDATE SET
  old_value = EXCLUDED.old_value,
  new_value = EXCLUDED.new_value,
  metadata  = EXCLUDED.metadata;
