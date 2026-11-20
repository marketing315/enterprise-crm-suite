import test from 'node:test';
import assert from 'node:assert/strict';
import { isTestLead, auditSheet } from './lead-sheet-audit.mjs';

const lead = { id: 'real-sonimed', brand: 'Sonimed', source_name: 'Sonimed',
  received_at: '2026-11-20T13:25:46Z', first_name: 'Maria', last_name: 'Rossi', phone: '3331234567' };
const row = ['2026-11-20 14:25', 'Sonimed', 'Maria', 'Rossi', '3331234567', '', '', 'Sonimed'];

test('recovery excludes names beginning with TEST, including the Sonimed test', () => {
  assert.equal(isTestLead({ first_name: 'TEST Claude – da cancellare' }), true);
  assert.equal(auditSheet([{ ...lead, first_name: 'TEST Claude – da cancellare' }], []).missing.length, 0);
});
test('recovery excludes names beginning with PROVA', () => {
  assert.equal(isTestLead({ raw_payload: { nome: ' PROVA sito Sonimed' } }), true);
  assert.equal(isTestLead({ first_name: 'Maria Rossi' }), false);
});
test('existing website row is not recovered again even when its export log expired', () => {
  const result = auditSheet([{ ...lead, export_status: null }], [row]);
  assert.deepEqual(result.matched, [{ id: 'real-sonimed', rowNumber: 1 }]);
  assert.equal(result.missing.length, 0);
});
test('a matching row can only cover one event, so a missing second row is detected', () => {
  const result = auditSheet([lead, { ...lead, id: 'second-real-lead' }], [row]);
  assert.equal(result.matched.length, 1);
  assert.equal(result.missing[0].id, 'second-real-lead');
});
test('a different phone at the same minute does not hide a missing lead', () => {
  assert.equal(auditSheet([lead], [[...row.slice(0, 4), '3339999999', ...row.slice(5)]]).missing.length, 1);
});