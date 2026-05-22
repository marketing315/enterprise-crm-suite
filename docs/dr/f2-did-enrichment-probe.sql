-- F2 DID enrichment — probe SQL eseguibile (no scritture su prod).
-- Vedi docs/admin-runbook.md §8 e docs/voispeed-integration.md §F2.
WITH fixture(id, brand_id, phone_e164, voispeed_did, is_active) AS (
  VALUES
    ('11111111-1111-1111-1111-111111111111'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, '+39800111111', NULL, true),
    ('22222222-2222-2222-2222-222222222222'::uuid, '00000000-0000-0000-0000-000000000001'::uuid, NULL, '+39800222222', true),
    ('33333333-3333-3333-3333-333333333333'::uuid, '00000000-0000-0000-0000-000000000002'::uuid, '+39800333333', '+39800333333', false)
),
probe(label, dnis, expected_id) AS (
  VALUES
    ('match phone_e164',        '+39800111111', '11111111-1111-1111-1111-111111111111'::uuid),
    ('match voispeed_did',      '+39800222222', '22222222-2222-2222-2222-222222222222'::uuid),
    ('inactive must NOT match', '+39800333333', NULL::uuid),
    ('unknown number',          '+39800999999', NULL::uuid)
)
SELECT p.label, p.dnis,
       (SELECT f.id FROM fixture f WHERE (f.phone_e164 = p.dnis OR f.voispeed_did = p.dnis) AND f.is_active LIMIT 1) AS resolved,
       p.expected_id,
       CASE WHEN (SELECT f.id FROM fixture f WHERE (f.phone_e164 = p.dnis OR f.voispeed_did = p.dnis) AND f.is_active LIMIT 1)
                 IS NOT DISTINCT FROM p.expected_id
            THEN 'PASS' ELSE 'FAIL' END AS verdict
FROM probe p;
