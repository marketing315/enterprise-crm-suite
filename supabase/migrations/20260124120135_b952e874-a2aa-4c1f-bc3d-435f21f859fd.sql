-- E2E-3: Create second brand for cross-brand isolation test
INSERT INTO public.brands (id, name, slug)
VALUES ('b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2', 'Test Brand 2', 'test-brand-2');

-- Create webhook source for second brand (api_key_hash for "test456")
INSERT INTO public.webhook_sources (id, brand_id, name, api_key_hash, rate_limit_per_min)
VALUES (
  'c3c3c3c3-c3c3-c3c3-c3c3-c3c3c3c3c3c3',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'test-source-brand2',
  '77b8ec999a33d17a1b5e64e01a36c7b6c45c9e99e7c52a86f7ed24e0a858f18d', -- SHA256 of "test456"
  60
);

-- Create initial pipeline stage for second brand
INSERT INTO public.pipeline_stages (id, brand_id, name, order_index)
VALUES (
  'd4d4d4d4-d4d4-d4d4-d4d4-d4d4d4d4d4d4',
  'b2b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2',
  'Nuovo Lead',
  0
);