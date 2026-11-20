import test from 'node:test';
import assert from 'node:assert/strict';

function normalizePhoneE164(rawPhone) {
  const digits = String(rawPhone || '').replace(/[^\d+]/g, '');
  if (digits.startsWith('+') && digits.length >= 11) return digits;
  const only = digits.replace(/\D/g, '');
  if (only.length === 10) return '+91' + only;
  if (only.length === 12 && only.startsWith('91')) return '+' + only;
  return null;
}

function evaluateImportRow(row, tenantId) {
  if (!tenantId) return { ok: false, error: 'missing_tenant' };
  const name = String(row.full_name || '').trim();
  if (name.length < 2) return { ok: false, error: 'invalid_name' };
  const phoneE164 = normalizePhoneE164(String(row.phone || ''));
  if (!phoneE164) return { ok: false, error: 'invalid_phone' };
  const suppressed =
    row.suppressed === true ||
    String(row.suppressed || '').toLowerCase() === 'true';
  const consent =
    row.consent_given === true ||
    String(row.consent_given || '').toLowerCase() === 'true';
  if (suppressed) {
    return {
      ok: true,
      lead: {
        tenant_id: tenantId,
        full_name: name,
        phone_e164: phoneE164,
        source: String(row.source || 'csv_import'),
        consent_given: false,
        status: 'excluded',
        reason: 'suppressed',
      },
    };
  }
  return {
    ok: true,
    lead: {
      tenant_id: tenantId,
      full_name: name,
      phone_e164: phoneE164,
      source: String(row.source || 'csv_import'),
      consent_given: consent,
      status: consent ? 'new' : 'review_required',
    },
  };
}

test('lead import normalizes Indian numbers and gates unconsented or suppressed leads', () => {
  const ok = evaluateImportRow(
    { full_name: 'Rohan Sharma', phone: '9876543210', consent_given: true },
    't1'
  );
  assert.equal(ok.ok, true);
  assert.equal(ok.lead.phone_e164, '+919876543210');
  assert.equal(ok.lead.status, 'new');

  const rev = evaluateImportRow(
    { full_name: 'Asha Patel', phone: '9876543211', consent_given: false },
    't1'
  );
  assert.equal(rev.lead.status, 'review_required');

  const sup = evaluateImportRow(
    { full_name: 'Blocked Lead', phone: '9876543212', suppressed: true, consent_given: true },
    't1'
  );
  assert.equal(sup.lead.status, 'excluded');
});

test('parseCsvText and batch deduplication classify eligible, review, excluded, and duplicate rows', () => {
  const csv = [
    'full_name,phone,consent_given,suppressed',
    'Rohan Sharma,9876543210,true,false',
    'Rohan Duplicate,+919876543210,true,false',
    'Asha Patel,9876543211,false,false',
    'DNC User,9876543212,true,true',
    'X,123,true,false',
  ].join('\n');

  const lines = csv.split(/\r?\n/).filter(Boolean);
  const headers = lines[0].split(',');
  const rows = lines.slice(1).map((line) => {
    const cols = line.split(',');
    const r = {};
    headers.forEach((h, i) => (r[h] = cols[i]));
    return r;
  });

  const seen = new Set();
  const counts = { total: rows.length, eligible: 0, review_required: 0, excluded: 0, duplicates: 0, invalid: 0 };
  for (const row of rows) {
    const res = evaluateImportRow(row, 't1');
    if (!res.ok) { counts.invalid++; continue; }
    if (seen.has(res.lead.phone_e164)) { counts.duplicates++; continue; }
    seen.add(res.lead.phone_e164);
    if (res.lead.status === 'new') counts.eligible++;
    else if (res.lead.status === 'review_required') counts.review_required++;
    else if (res.lead.status === 'excluded') counts.excluded++;
  }

  assert.deepEqual(counts, {
    total: 5,
    eligible: 1,
    review_required: 1,
    excluded: 1,
    duplicates: 1,
    invalid: 1,
  });
});
