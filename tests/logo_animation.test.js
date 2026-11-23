import test from 'node:test';
import assert from 'node:assert';
import { runFullHeadlessSimulation } from './headless_logo_sim.js';

test('Logo Animation Engine Headless Simulation Suite (4 Resolutions, 20 Simulated Minutes Each)', () => {
  const results = runFullHeadlessSimulation(0.16);

  assert.strictEqual(results.length, 4, 'Must simulate all 4 target screen resolutions');

  const [res1440, res1536, res1920, res900] = results;

  // 1. Pass criteria: 1.5 to 4 collisions per minute at the first three sizes
  assert.ok(
    res1440.collisionsPerMin >= 1.5 && res1440.collisionsPerMin <= 4.0,
    `1440x860 collisions/min (${res1440.collisionsPerMin}) must be in range [1.5, 4.0]`
  );
  assert.ok(
    res1536.collisionsPerMin >= 1.5 && res1536.collisionsPerMin <= 4.0,
    `1536x700 collisions/min (${res1536.collisionsPerMin}) must be in range [1.5, 4.0]`
  );
  assert.ok(
    res1920.collisionsPerMin >= 1.5 && res1920.collisionsPerMin <= 4.0,
    `1920x1080 collisions/min (${res1920.collisionsPerMin}) must be in range [1.5, 4.0]`
  );

  // 2. Zero frames of two rising logos overlapping at first three sizes
  assert.strictEqual(res1440.framesOverlapCount, 0, '1440x860 must have 0 overlapping frames between rising logos');
  assert.strictEqual(res1536.framesOverlapCount, 0, '1536x700 must have 0 overlapping frames between rising logos');
  assert.strictEqual(res1920.framesOverlapCount, 0, '1920x1080 must have 0 overlapping frames between rising logos');
  assert.ok(res900.framesOverlapCount <= 20, '900x600 allows at most a handful of overlapping frames');

  // 3. ZERO frames behind the card
  for (const r of results) {
    assert.strictEqual(r.framesBehindCardCount, 0, `${r.resolution} must have 0 frames where rising logos overlap card x-range`);
    assert.strictEqual(r.errorsCount, 0, `${r.resolution} must have 0 errors`);
  }
});
