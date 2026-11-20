import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

export function isTestLead(event) {
  const payload = event.raw_payload ?? {};
  return [event.first_name, payload.nome, payload.name, payload.full_name, payload.first_name]
    .some(name => typeof name === 'string' && /^(TEST|PROVA)/i.test(name.trim()));
}

export function romeMinute(iso) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(new Date(iso));
  const get = type => parts.find(part => part.type === type)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}`;
}

const key = (stamp, brand, source) => JSON.stringify([stamp, brand, source]);
const digits = value => String(value ?? '').replace(/\D/g, '').replace(/^39(?=\d{10}$)/, '');

// Read-only: consume each matching row once. Absence of a retained export log
// is NOT evidence that a row is missing from Google Sheets.
export function auditSheet(events, rows, exclusions = []) {
  const index = new Map();
  rows.forEach((row, offset) => {
    if (row.length < 8) return;
    const k = key(row[0], row[1], row[7]);
    const group = index.get(k) ?? [];
    group.push({ rowNumber: offset + 1, row });
    index.set(k, group);
  });
  const result = { matched: [], missing: [], excluded: [] };
  for (const event of events) {
    if (event.archived || isTestLead(event)) {
      result.excluded.push({ id: event.id, reason: event.archived ? 'archived' : 'TEST/PROVA' });
      continue;
    }
    const k = key(romeMinute(event.received_at), event.brand, event.source_name);
    const candidates = index.get(k) ?? [];
    const phone = digits(event.primary_phone ?? event.phone_normalized ?? event.phone);
    const offset = candidates.findIndex(({ row }) => phone
      ? digits(row[4]) === phone
      : String(row[2] ?? '').trim() === String(event.first_name ?? '').trim()
        && String(row[3] ?? '').trim() === String(event.last_name ?? '').trim());
    if (offset >= 0) {
      const [match] = candidates.splice(offset, 1);
      result.matched.push({ id: event.id, rowNumber: match.rowNumber });
    } else if (exclusions.some(exclusion => exclusion.form_id === event.meta_form_id
      && exclusion.is_active && Date.parse(event.received_at) >= Date.parse(exclusion.created_at))) {
      result.excluded.push({ id: event.id, reason: 'configured_form_exclusion' });
    } else {
      result.missing.push(event);
    }
  }
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [eventsPath, sheetPath, exclusionsPath] = process.argv.slice(2);
  if (!eventsPath || !sheetPath) throw new Error('Provide events JSON and Google Sheets batchGet JSON');
  const read = path => JSON.parse(readFileSync(path, 'utf8'));
  const sheet = read(sheetPath);
  const rows = sheet.valueRanges.find(range => range.range.startsWith('LEADS!'))?.values;
  if (!rows) throw new Error('LEADS rows not found');
  console.log(JSON.stringify(auditSheet(read(eventsPath), rows, exclusionsPath ? read(exclusionsPath) : []), null, 2));
}