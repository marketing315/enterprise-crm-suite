INSERT INTO public.brands (id, name, slug)
VALUES ('e2e7e57e-0000-4000-8000-000000000001', 'E2E_TEST', 'e2e-test')
ON CONFLICT (id) DO NOTHING;