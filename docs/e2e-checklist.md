# E2E Test Pre-Run Checklist

## 1. Environment file
```bash
cp .env.e2e.example .env.e2e
# Fill in E2E_EMAIL, E2E_PASSWORD, E2E_BRAND_NAME
```

## 2. Install Playwright browsers
```bash
npx playwright install --with-deps chromium
```

## 3. Seed test data (if using direct DB)
```bash
psql "$DATABASE_URL" -f scripts/seed-e2e-sla-breach.sql
psql "$DATABASE_URL" -f scripts/seed-e2e-inbound-source.sql
```

## 4. Run tests
```bash
# Against local dev server (auto-started)
npx playwright test

# Against remote preview
PW_BASE_URL=https://your-preview.lovable.app npx playwright test
```

## 5. Safety rules
- **Never run E2E against production data** – use a dedicated test brand.
- Webhook tests use mock receivers or httpbin; never point at real endpoints.
- The CI pipeline uses isolated credentials stored as GitHub Secrets.
