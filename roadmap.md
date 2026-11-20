# Lead export repair and incident audit

- [x] Repair webhook-ingest durable Google Sheets enqueue and run regression tests (31 Deno tests passed; function deployed).
- [x] Compare real website leads with the sheet; recover missing rows without duplicates, excluding TEST/PROVA (38 real events matched; zero missing; no rows appended; 5 recovery-policy tests passed).
- [x] Audit retained lead receipt/processing records from 20 September 2026 through today and report recovery status and evidence limits (report delivered in Files; unresolved unrelated integration incidents documented, not modified).
- [x] Verify deployed behavior and save the requested source changes; never delete business data (HTTP export check returned already_exported for a real Sonimed lead; a new signed website submission was not made).