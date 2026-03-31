/**
 * Proof: price-interval overlap helper + optional HTTP happy path (--http, API_URL + CRM_INTERNAL_TOKEN).
 */
import { ingredientPriceIntervalsOverlap } from '../src/kitchenCatalogRoutes.js';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const d = (s) => new Date(s);

// Adjacent half-open [a,b) and [b,c) — no overlap
assert(
  !ingredientPriceIntervalsOverlap(d('2020-01-01'), d('2020-02-01'), d('2020-02-01'), d('2020-03-01')),
  'adjacent intervals should not overlap'
);

// Open end overlaps a bounded interval
assert(
  ingredientPriceIntervalsOverlap(d('2020-01-01'), null, d('2030-01-01'), d('2031-01-01')),
  'open-ended should overlap future bounded interval'
);

// Disjoint
assert(
  !ingredientPriceIntervalsOverlap(d('2020-01-01'), d('2020-02-01'), d('2020-06-01'), null),
  'disjoint should not overlap'
);

console.log('prove-kitchen-catalog: overlap helper OK');

const http = process.argv.includes('--http');
if (!http) {
  process.exit(0);
}

const origin = process.env.API_URL || 'http://localhost:4000';
const token = process.env.CRM_INTERNAL_TOKEN || 'dev';
const suffix = Date.now().toString(36);

async function j(path, opts = {}) {
  const r = await fetch(`${origin}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      'X-CRM-Token': token,
      ...(opts.headers || {})
    }
  });
  const json = await r.json();
  if (!r.ok || !json.ok) {
    throw new Error(`${path} -> ${r.status} ${JSON.stringify(json)}`);
  }
  return json.data;
}

const unit = await j('/api/kitchen/units', {
  method: 'POST',
  body: JSON.stringify({ code: `u-${suffix}`, displayName: 'Test unit' })
});

const ing = await j('/api/kitchen/ingredients', {
  method: 'POST',
  body: JSON.stringify({ name: `Ing ${suffix}`, defaultUnitId: unit.id })
});

await j(`/api/kitchen/ingredients/${ing.id}/prices`, {
  method: 'POST',
  body: JSON.stringify({
    unitId: ing.defaultUnitId,
    pricePerUnitKopeks: 100,
    effectiveFrom: '2020-01-01T00:00:00.000Z',
    effectiveTo: null
  })
});

const dish = await j('/api/kitchen/dishes', {
  method: 'POST',
  body: JSON.stringify({ name: `Dish ${suffix}` })
});

const ver = await j(`/api/kitchen/dishes/${dish.id}/versions`, {
  method: 'POST',
  body: JSON.stringify({})
});

await j(`/api/kitchen/dish-versions/${ver.id}/ingredients`, {
  method: 'PUT',
  body: JSON.stringify({
    lines: [{ ingredientId: ing.id, quantity: 1, unitId: ing.defaultUnitId }]
  })
});

const published = await j(`/api/kitchen/dish-versions/${ver.id}/publish`, {
  method: 'POST',
  body: JSON.stringify({})
});

assert(published.status === 'published', 'expected published');
assert(typeof published.publishedFoodCostKopeks === 'number', 'expected cost');
console.log('prove-kitchen-catalog: HTTP happy path OK', {
  dishVersionId: published.id,
  publishedFoodCostKopeks: published.publishedFoodCostKopeks
});
