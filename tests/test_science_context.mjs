import assert from 'node:assert/strict';
import { recordsForSite, scienceRecords } from '../src/science-context.mjs';

const jezero = recordsForSite('jezero', false);
const gale = recordsForSite('gale', false);
assert(jezero.some(r => r.id === 'atmospheric' && r.text.includes('718 Pa')));
assert(!jezero.some(r => r.scope === 'gale'));
assert(gale.some(r => r.id === 'radiation' && r.text.includes('0.67')));
assert(!gale.some(r => r.scope === 'jezero'));
assert(recordsForSite('jezero', true).every(r => r.scope === 'global'));
assert(recordsForSite('unknown', false).every(r => r.scope === 'global'));
for (const record of scienceRecords) {
  assert.equal(new URL(record.url).protocol, 'https:');
  assert(record.period && record.limit && record.source);
}
console.log('Science context keeps historical observations scoped to their regions and preserves provenance.');
