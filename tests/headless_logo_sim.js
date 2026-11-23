import { LOGO_DEFINITIONS, createLogoAnimationEngine } from '../client/src/components/logoAnimationEngine.js';

export function runSimulationForResolution({ width, height, minutes = 20, fps = 60, chaseP = 0.16 }) {
  const cardWidth = 420;
  const cardHeight = 560; // Approximate card height
  const cardLeft = (width - cardWidth) / 2;
  const cardRight = cardLeft + cardWidth;
  const cardTop = (height - cardHeight) / 2;
  const cardBottom = cardTop + cardHeight;

  let collisionCount = 0;
  let framesOverlapCount = 0;
  let framesBehindCardCount = 0;
  let errorsCount = 0;

  // Mock DOM elements
  const elements = LOGO_DEFINITIONS.map((def) => {
    const el = {
      style: { transform: '', opacity: '0' },
      offsetWidth: def.size,
      offsetHeight: def.size
    };
    return {
      id: def.id,
      size: def.size,
      el
    };
  });

  const engine = createLogoAnimationEngine({
    getContainerSize: () => ({
      width,
      height,
      clientWidth: width,
      clientHeight: height,
      getBoundingClientRect: () => ({ left: 0, top: 0, right: width, bottom: height, width, height })
    }),
    getCardRect: () => ({
      left: cardLeft,
      right: cardRight,
      top: cardTop,
      bottom: cardBottom,
      width: cardWidth,
      height: cardHeight
    }),
    elements,
    onCollision: () => {
      collisionCount++;
    },
    CHASE_P: chaseP
  });

  const totalFrames = minutes * fps * 60;
  const dt = 1 / fps; // 0.016667s

  const k = engine.getK();
  const CL = engine.getCL();
  const CR = engine.getCR();

  for (let frameIdx = 0; frameIdx < totalFrames; frameIdx++) {
    try {
      engine.step(dt);
      engine.renderDom();

      const logos = engine.getLogos();

      // Check card x-range overlap for rising logos
      // If width <= 440 (tiny window fallback), left/right zones don't exist (<10px)
      const hasZones = (CL - 8 >= 10) || (width - CR - 8 >= 10);

      for (let i = 0; i < logos.length; i++) {
        const b = logos[i];
        if (Number.isNaN(b.x) || Number.isNaN(b.y) || Number.isNaN(b.vx) || Number.isNaN(b.vy)) {
          errorsCount++;
        }

        if (hasZones && b.state === 'rise') {
          const h = (b.size * k) / 2 * 0.92;
          // Check if logo bounding box overlaps card bounding box horizontally
          // Real card is at [cardLeft, cardRight]
          if (b.x + h > cardLeft && b.x - h < cardRight) {
            framesBehindCardCount++;
          }
        }
      }

      // Check overlap between any two rising logos
      let hadOverlapThisFrame = false;
      for (let i = 0; i < logos.length; i++) {
        for (let j = i + 1; j < logos.length; j++) {
          const a = logos[i];
          const b = logos[j];
          if (a.state === 'rise' && b.state === 'rise') {
            const ha = (a.size * k) / 2 * 0.92;
            const hb = (b.size * k) / 2 * 0.92;
            const dx = Math.abs(b.x - a.x);
            const dy = Math.abs(b.y - a.y);
            // Check if boxes overlap significantly (> 1px margin)
            if (dx < ha + hb - 1 && dy < ha + hb - 1) {
              hadOverlapThisFrame = true;
            }
          }
        }
      }
      if (hadOverlapThisFrame) {
        framesOverlapCount++;
      }
    } catch (err) {
      errorsCount++;
      console.error(err);
    }
  }

  const collisionsPerMin = collisionCount / minutes;

  return {
    resolution: `${width}x${height}`,
    minutes,
    totalFrames,
    collisionCount,
    collisionsPerMin: Number(collisionsPerMin.toFixed(2)),
    framesOverlapCount,
    framesBehindCardCount,
    errorsCount,
    k: Number(k.toFixed(3))
  };
}

export function runFullHeadlessSimulation(chaseP = 0.16) {
  const testConfigs = [
    { width: 1440, height: 860 },
    { width: 1536, height: 700 },
    { width: 1920, height: 1080 },
    { width: 900, height: 600 }
  ];

  console.log('='.repeat(80));
  console.log(`RUNNING 20-MINUTE HEADLESS SIMULATION (CHASE_P = ${chaseP})`);
  console.log('='.repeat(80));

  const results = [];
  for (const cfg of testConfigs) {
    const t0 = Date.now();
    const res = runSimulationForResolution({
      width: cfg.width,
      height: cfg.height,
      minutes: 20,
      fps: 60,
      chaseP
    });
    res.elapsedMs = Date.now() - t0;
    results.push(res);

    console.log(`Resolution: ${res.resolution} (k=${res.k})`);
    console.log(`  - Total Frames: ${res.totalFrames} (20 min at 60 fps)`);
    console.log(`  - Collisions: ${res.collisionCount} total (${res.collisionsPerMin}/min) [target: 1.5 - 4.0/min]`);
    console.log(`  - Rising Logos Overlapping Frames: ${res.framesOverlapCount}`);
    console.log(`  - Rising Logos Behind Card Frames: ${res.framesBehindCardCount}`);
    console.log(`  - Errors: ${res.errorsCount}`);
    console.log(`  - Simulation Time: ${res.elapsedMs}ms`);
    console.log('-'.repeat(80));
  }

  return results;
}

// If executed directly via node
if (process.argv[1]?.includes('headless_logo_sim.js')) {
  runFullHeadlessSimulation();
}
