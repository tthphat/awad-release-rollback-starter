// deploy/rollback.js
// Usage: npm run rollback
const CONTROL = 'http://127.0.0.1:8081';

async function getState() {
  try {
    const res = await fetch(`${CONTROL}/state`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } catch (err) {
    console.error(`Cannot connect to router control port at ${CONTROL}: ${err.message}`);
    process.exit(1);
  }
}

async function setWeights(blue, green) {
  const res = await fetch(`${CONTROL}/weights`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ blue, green }),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Failed to set weights (${res.status}): ${text}`);
  }
  return await res.json();
}

async function postMark(text) {
  try {
    await fetch(`${CONTROL}/mark`, { method: 'POST', body: text });
  } catch {}
}

const t0 = Date.now();
const state = await getState();
const { slots } = state;

// Target slot is the standby slot (the one with lower weight, or 0% weight)
const targetSlot = slots.blue.weight <= slots.green.weight ? 'blue' : 'green';
const currentSlot = targetSlot === 'blue' ? 'green' : 'blue';

console.log(`Initiating rollback from ${currentSlot} (${slots[currentSlot].weight}%) to ${targetSlot} (100%)...`);

const weights = {
  blue: targetSlot === 'blue' ? 100 : 0,
  green: targetSlot === 'green' ? 100 : 0,
};

await setWeights(weights.blue, weights.green);
await postMark(`rollback: 100% on ${targetSlot}`);

// Confirm with GET :8081/state
const confirmed = await getState();
if (confirmed.slots[targetSlot].weight !== 100) {
  console.error(`Rollback confirmation failed: ${targetSlot} weight is ${confirmed.slots[targetSlot].weight}%`);
  process.exit(1);
}

const elapsed = ((Date.now() - t0) / 1000).toFixed(2);
console.log(`Rolled back: 100% on ${targetSlot} in ${elapsed}s`);
process.exit(0);
