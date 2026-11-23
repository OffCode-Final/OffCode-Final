import test from 'node:test';
import assert from 'node:assert';
import { runFullHeadlessSimulation } from './headless_logo_sim.js';

test('Logo Animation Engine Headless Simulation Suite (4 Resolutions, 20 Simulated Minutes Each)', () => {
  const results = runFullHeadlessSimulation(0.16);

  assert.strictEqual(results.length, 4, 'Must simulate all 4 target screen resolutions');

  const [res1440, res1536, res1920, res900] = results;

  // 1. Pass criteria: reasonable collision rate at the first three sizes
  assert.ok(
    res1440.collisionsPerMin >= 1.0 && res1440.collisionsPerMin <= 5.0,
    `1440x860 collisions/min (${res1440.collisionsPerMin}) must be in range [1.0, 5.0]`
  );
  assert.ok(
    res1536.collisionsPerMin >= 1.0 && res1536.collisionsPerMin <= 5.0,
    `1536x700 collisions/min (${res1536.collisionsPerMin}) must be in range [1.0, 5.0]`
  );
  assert.ok(
    res1920.collisionsPerMin >= 1.0 && res1920.collisionsPerMin <= 5.0,
    `1920x1080 collisions/min (${res1920.collisionsPerMin}) must be in range [1.0, 5.0]`
  );

  // 2. Minimal frames of two rising logos overlapping across 72,000 frames
  assert.ok(res1440.framesOverlapCount <= 100, '1440x860 allows minimal overlap');
  assert.ok(res1536.framesOverlapCount <= 100, '1536x700 allows minimal overlap');
  assert.ok(res1920.framesOverlapCount <= 100, '1920x1080 allows minimal overlap');
  assert.ok(res900.framesOverlapCount <= 100, '900x600 allows minimal overlap');

  // 3. ZERO frames behind the card
  for (const r of results) {
    assert.strictEqual(r.framesBehindCardCount, 0, `${r.resolution} must have 0 frames where rising logos overlap card x-range`);
    assert.strictEqual(r.errorsCount, 0, `${r.resolution} must have 0 errors`);
  }
});
