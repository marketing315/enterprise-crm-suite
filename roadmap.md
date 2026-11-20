# Requested test-lead deletion and CallAI explanation

- [x] Identify only today's Sonimed TEST Claude contacts, their related records and exact rows in all three sheet tabs (11 website submissions; 8 exported events, 3 suppressed duplicates).
- [x] Permanently remove the confirmed test data, then verify no targeted CRM records or sheet rows remain (7 contacts and deals created today; 11 events; related receipt/export/AI records and notifications; 8 rows per requested tab removed).
- [x] Also remove the explicitly confirmed 5 November test and its shared contact/deal, including any sheet row for that test (1 additional contact/deal/event; 1 additional row each in LEADS and ALL_RAW; 26 sheet rows total; all unrelated captured rows unchanged).
- [x] Explain the inactive CallAI source using retained evidence, without changing its settings (986 rejected requests at latest check, 219 distinct phone numbers, 212 matching MyMed contacts by normalized phone suffix; last configuration update 21 September; cause/author of deactivation not present in retained audit).

# Lead export repair and incident audit

- [x] Repair webhook-ingest durable Google Sheets enqueue and run regression tests (31 Deno tests passed; function deployed).
- [x] Compare real website leads with the sheet; recover missing rows without duplicates, excluding TEST/PROVA (38 real events matched; zero missing; no rows appended; 5 recovery-policy tests passed).
- [x] Audit retained lead receipt/processing records from 20 September 2026 through today and report recovery status and evidence limits (report delivered in Files; unresolved unrelated integration incidents documented, not modified).
- [x] Verify deployed behavior and save the requested source changes; never delete business data (HTTP export check returned already_exported for a real Sonimed lead; a new signed website submission was not made).