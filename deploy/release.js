// deploy/release.js
// Usage: npm run release -- <tag>
import { spawnSync } from 'node:child_process';

const CONTROL = 'http://127.0.0.1:8081';
const FIRST_STAGE_PCT = 10;   // <= 25% required by L4
const FIRST_STAGE_SECS = 12;  // >= 10s required by L4
const SECOND_STAGE_PCT = 50;  // 2nd stage below 100% required by L4
const SECOND_STAGE_SECS = 12;

const tag = process.argv[2];
if (!tag) {
  console.error('Usage: npm run release -- <tag>');
  process.exit(2);
}

// ---------------------------------------------------------------- Router API helpers
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

// ---------------------------------------------------------------- Docker helpers
async function waitForHealthy(slot, maxWaitSeconds = 60) {
  process.stdout.write(`Waiting for container ${slot} to become healthy...`);
  const deadline = Date.now() + maxWaitSeconds * 1000;
  let containerId = '';

  while (Date.now() < deadline && !containerId) {
    const r = spawnSync('docker', ['compose', 'ps', '-q', slot], { encoding: 'utf8' });
    if (r.status === 0 && r.stdout?.trim()) {
      containerId = r.stdout.trim().split(/\s+/)[0];
    } else {
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  }

  if (!containerId) {
    throw new Error(`Could not find container for service "${slot}"`);
  }

  while (Date.now() < deadline) {
    const insp = spawnSync('docker', ['inspect', '-f', '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}', containerId], { encoding: 'utf8' });
    const status = insp.stdout?.trim();
    if (status === 'healthy') {
      console.log(' healthy!');
      return;
    }
    if (status === 'unhealthy') {
      throw new Error(`Container ${slot} reported UNHEALTHY`);
    }
    if (status === 'exited' || status === 'dead') {
      throw new Error(`Container ${slot} terminated unexpectedly (status: ${status})`);
    }
    process.stdout.write('.');
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Timeout waiting for ${slot} to become healthy (${maxWaitSeconds}s)`);
}

// ---------------------------------------------------------------- Main Release Workflow
const state = await getState();
const { slots } = state;

// Determine active slot and idle slot
let activeSlot, idleSlot;
if (slots.blue.weight > slots.green.weight) {
  activeSlot = 'blue';
  idleSlot = 'green';
} else if (slots.green.weight > slots.blue.weight) {
  activeSlot = 'green';
  idleSlot = 'blue';
} else {
  activeSlot = slots.blue.weight >= 50 ? 'blue' : 'green';
  idleSlot = activeSlot === 'blue' ? 'green' : 'blue';
}

console.log(`Current state: active=${activeSlot} (${slots[activeSlot].weight}%), idle=${idleSlot} (${slots[idleSlot].weight}%)`);
console.log(`Deploying image linkbox:${tag} to idle slot: ${idleSlot}`);

// 1. Start the new container in idleSlot
const envKey = `${idleSlot.toUpperCase()}_TAG`;
const composeUp = spawnSync('docker', ['compose', 'up', '-d', '--no-deps', idleSlot], {
  stdio: 'inherit',
  env: { ...process.env, [envKey]: tag },
});
if (composeUp.status !== 0) {
  console.error(`docker compose up failed with exit code ${composeUp.status}`);
  process.exit(1);
}

// 2. Wait for health check
try {
  await waitForHealthy(idleSlot);
} catch (err) {
  console.error(`Healthcheck failed: ${err.message}`);
  console.error(`Traffic remains 100% on active slot ${activeSlot}. Release aborted.`);
  process.exit(1);
}

// 3. Canary traffic shift helper with automated quality gate
async function runStage(pct, durationSecs) {
  const wIdle = pct;
  const wActive = 100 - pct;
  const weights = {
    blue: idleSlot === 'blue' ? wIdle : wActive,
    green: idleSlot === 'green' ? wIdle : wActive,
  };

  console.log(`\n[Stage ${pct}%] Shifting traffic: ${idleSlot}=${wIdle}%, ${activeSlot}=${wActive}% (holding for ${durationSecs}s)`);
  await setWeights(weights.blue, weights.green);
  await postMark(`release ${tag}: ${idleSlot}=${wIdle}%`);

  const s0 = await getState();
  const baseErrors = s0.slots[idleSlot].errors;
  const baseRequests = s0.slots[idleSlot].requests;

  const deadline = Date.now() + durationSecs * 1000;
  while (Date.now() < deadline) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const curr = await getState();
    const deltaErrors = curr.slots[idleSlot].errors - baseErrors;
    const deltaRequests = curr.slots[idleSlot].requests - baseRequests;

    // Automated Quality Gate: Trip immediately on canary error
    if (deltaErrors >= 1) {
      console.error(`\n======================================================`);
      console.error(`[AUTOMATED GATE TRIGGERED] Quality check failed at ${pct}%!`);
      console.error(`Canary slot "${idleSlot}" produced ${deltaErrors} errors in ${deltaRequests} requests.`);
      console.error(`Reverting traffic immediately: 100% back to "${activeSlot}"...`);
      console.error(`======================================================`);

      const rollbackWeights = {
        blue: activeSlot === 'blue' ? 100 : 0,
        green: activeSlot === 'green' ? 100 : 0,
      };
      await setWeights(rollbackWeights.blue, rollbackWeights.green);
      await postMark(`GATE: rolled back ${tag} on ${idleSlot} to ${activeSlot} (${deltaErrors} errors)`);
      console.error(`Revert completed. Active slot ${activeSlot} is now serving 100%.`);
      process.exit(1);
    }
  }
}

// Run Canary Stage 1: 10% for 12 seconds
await runStage(FIRST_STAGE_PCT, FIRST_STAGE_SECS);

// Run Canary Stage 2: 50% for 12 seconds
await runStage(SECOND_STAGE_PCT, SECOND_STAGE_SECS);

// 4. Final Stage: 100% on new slot
console.log(`\n[Final Stage] Shifting 100% traffic to ${idleSlot}...`);
const finalWeights = {
  blue: idleSlot === 'blue' ? 100 : 0,
  green: idleSlot === 'green' ? 100 : 0,
};
await setWeights(finalWeights.blue, finalWeights.green);
await postMark(`release ${tag}: 100% on ${idleSlot}`);

const confirmed = await getState();
console.log(`Release successful! Traffic distribution: blue=${confirmed.slots.blue.weight}%, green=${confirmed.slots.green.weight}%`);
console.log(`Slot "${activeSlot}" is kept running in standby to allow instant rollback.`);
