/**
 * OffCode Join Screen: Animated Language-Logo Background Engine
 * Exact port of tested reference implementation.
 */

export const LOGO_DEFINITIONS = [
  { id: 'python', name: 'Python', size: 105, src: '/logos/python.svg' },
  { id: 'cplusplus', name: 'C++', size: 140, src: '/logos/cplusplus.svg' },
  { id: 'c', name: 'C', size: 100, src: '/logos/c.svg' },
  { id: 'ruby', name: 'Ruby', size: 115, src: '/logos/ruby.svg' },
  { id: 'javascript', name: 'JavaScript', size: 100, src: '/logos/javascript.svg' },
  { id: 'java', name: 'Java', size: 128, src: '/logos/java.svg' },
  { id: 'go', name: 'Go', size: 135, src: '/logos/go.svg' },
  { id: 'php', name: 'PHP', size: 148, src: '/logos/php.svg' },
  { id: 'typescript', name: 'TypeScript', size: 102, src: '/logos/typescript.svg' },
  { id: 'rust', name: 'Rust', size: 120, src: '/logos/rust.svg' }
];

export function createLogoAnimationEngine({
  getContainerSize,
  getCardRect,
  elements,
  onCollision = null,
  CHASE_P = 0.16,
  PEAK = 0.3
}) {
  let W = 0;
  let H = 0;
  let k = 1;
  let L = [];
  let CL = 0;
  let CR = 0;

  function rnd(a, b) {
    return a + Math.random() * (b - a);
  }

  function measure() {
    const size = getContainerSize();
    W = size.width || size.clientWidth || 0;
    H = size.height || size.clientHeight || 0;
    k = Math.max(0.45, Math.min(1.1, Math.min(W / 1440, H / 860)));

    const cr = getCardRect ? getCardRect() : null;
    const br = size.getBoundingClientRect ? size.getBoundingClientRect() : { left: 0, top: 0, right: W, bottom: H };
    CL = cr ? cr.left - br.left : W / 2;
    CR = cr ? cr.right - br.left : W / 2;
  }

  function sideX(x, h, r) {
    const okL = CL - 8 - h >= r;
    const okR = CR + 8 + h <= W - r;
    if (!okL && !okR) {
      return x;
    }
    if (x + h > CL - 8 && x - h < CR + 8) {
      if (okL && (!okR || x < (CL + CR) / 2)) {
        return CL - 8 - h;
      }
      return CR + 8 + h;
    }
    return x;
  }

  function pickX(b, h) {
    const z = [];
    const l1 = CL - 8 - h;
    const r0 = CR + 8 + h;
    let tot = 0;
    let i;
    let w;
    let q;

    if (l1 - b.r >= 10) {
      z.push([b.r, l1]);
    }
    if (W - b.r - r0 >= 10) {
      z.push([r0, W - b.r]);
    }
    if (!z.length) {
      z.push([b.r, Math.max(b.r, W - b.r)]);
    }

    for (i = 0; i < z.length; i++) {
      tot += z[i][1] - z[i][0];
    }
    q = Math.random() * tot;
    for (i = 0; i < z.length; i++) {
      w = z[i][1] - z[i][0];
      if (q <= w || i === z.length - 1) {
        return rnd(z[i][0], z[i][1]);
      }
      q -= w;
    }
    return rnd(b.r, Math.max(b.r, W - b.r));
  }

  function laneFree(x, h, self, ign) {
    for (let i = 0; i < L.length; i++) {
      const o = L[i];
      if (o === self || o === ign || o.state === 'wait') {
        continue;
      }
      const ho = (o.size * k) / 2 * 0.92 + 10;
      if (Math.abs(o.x - x) < h + ho && o.y > H * (ign ? 0.75 : 0.45)) {
        return false;
      }
    }
    return true;
  }

  function chase(b) {
    const c = [];
    let i;
    let o;
    for (i = 0; i < L.length; i++) {
      o = L[i];
      if (o !== b && o.state === 'rise' && o.entered && o.vy < 0 && o.y > H * 0.3 && o.y < H * 0.75) {
        c.push(o);
      }
    }
    if (!c.length) return false;
    const T = c[Math.floor(Math.random() * c.length)];
    const h = (b.size * k) / 2 * 0.92;
    const hT = (T.size * k) / 2 * 0.92;
    const vT = -T.vy;
    const yM = rnd(H * 0.2, H * 0.55);
    if (T.y < yM + 20) return false;
    const tm = (T.y - yM) / vT;
    const y0 = H + b.r * 0.6;
    const vN = (y0 - yM) / tm;
    if (tm < 0.5 || vN < vT + 25 || vN > 170) return false;
    let x = T.x + rnd(-0.35, 0.35) * (h + hT);
    x = Math.min(Math.max(x, b.r), Math.max(W - b.r, b.r));
    x = sideX(x, h, b.r);
    if (!laneFree(x, h, b, T)) return false;
    b.x = x;
    b.y = y0;
    b.vy = -vN;
    b.vx = 0;
    return true;
  }

  function spawn(b, pos) {
    b.r = (b.size / 2) * k * 0.9;
    b.state = 'rise';
    b.age = 0;
    b.t = 0;
    b.vr = 0;
    b.rot = 0;
    b.entered = true;
    if (pos) {
      b.x = pos.x;
      b.y = pos.y;
      b.age = 2;
      b.vy = -rnd(45, 115);
      b.vx = 0;
      return;
    }
    if (Math.random() < CHASE_P && chase(b)) {
      return;
    }
    const h = (b.size * k) / 2 * 0.92;
    let ok = false;
    let tries = 0;
    while (tries < 40 && !ok) {
      b.x = pickX(b, h);
      ok = laneFree(b.x, h, b);
      tries++;
    }
    if (!ok) {
      b.state = 'wait';
      b.wait = 0.3;
      return;
    }
    b.y = H + b.r * 0.6;
    b.vy = -rnd(45, 115);
    b.vx = 0;
  }

  function relax() {
    let it;
    let i;
    let j;
    let a;
    let b;
    let ha;
    let hb;
    let dx;
    let dy;
    let ox;
    let oy;
    let s;
    for (it = 0; it < 40; it++) {
      for (i = 0; i < L.length; i++) {
        for (j = i + 1; j < L.length; j++) {
          a = L[i];
          b = L[j];
          ha = (a.size * k) / 2 * 0.92 + 4;
          hb = (b.size * k) / 2 * 0.92 + 4;
          dx = b.x - a.x;
          dy = b.y - a.y;
          ox = ha + hb - Math.abs(dx);
          oy = ha + hb - Math.abs(dy);
          if (ox > 0 && oy > 0) {
            if (ox < oy) {
              s = dx >= 0 ? 1 : -1;
              a.x -= (s * ox) / 2;
              b.x += (s * ox) / 2;
            } else {
              s = dy >= 0 ? 1 : -1;
              a.y -= (s * oy) / 2;
              b.y += (s * oy) / 2;
            }
            a.x = Math.min(Math.max(a.x, a.r), Math.max(W - a.r, a.r));
            b.x = Math.min(Math.max(b.x, b.r), Math.max(W - b.r, b.r));
            a.y = Math.min(Math.max(a.y, a.r), Math.max(H - a.r, a.r));
            b.y = Math.min(Math.max(b.y, b.r), Math.max(H - b.r, b.r));
            a.x = sideX(a.x, ha - 4, a.r);
            b.x = sideX(b.x, hb - 4, b.r);
          }
        }
      }
    }
  }

  function seedAll() {
    measure();
    const n = L.length;
    const cols = Math.max(1, Math.round(Math.sqrt((n * W) / Math.max(H, 1))));
    const rows = Math.ceil(n / cols);
    const cw = W / cols;
    const ch = H / rows;
    const cells = [];
    let i;
    let j;
    let t;
    for (i = 0; i < n; i++) cells.push(i);
    for (i = n - 1; i > 0; i--) {
      j = Math.floor(Math.random() * (i + 1));
      t = cells[i];
      cells[i] = cells[j];
      cells[j] = t;
    }
    L.forEach((b, idx) => {
      b.r = (b.size / 2) * k * 0.9;
      const c = cells[idx];
      const cx = c % cols;
      const cy = Math.floor(c / cols);
      const mx = Math.min(b.r, cw / 2);
      const my = Math.min(b.r, ch / 2);
      const x0 = cx * cw + mx;
      const y0 = cy * ch + my;
      spawn(b, {
        x: rnd(x0, Math.max(x0, (cx + 1) * cw - mx)),
        y: rnd(y0, Math.max(y0, (cy + 1) * ch - my))
      });
    });
    L.forEach((b) => {
      b.x = sideX(b.x, (b.size * k) / 2 * 0.92, b.r);
    });
    relax();
  }

  function collide(a, b) {
    if (
      a.state !== 'rise' ||
      b.state !== 'rise' ||
      !a.entered ||
      !b.entered ||
      a.t < 1.2 ||
      b.t < 1.2 ||
      a.y > H * 0.85 ||
      b.y > H * 0.85
    ) {
      return;
    }
    const ha = (a.size * k) / 2 * 0.92;
    const hb = (b.size * k) / 2 * 0.92;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const ox = ha + hb - Math.abs(dx);
    const oy = ha + hb - Math.abs(dy);
    if (ox <= 0 || oy <= 0) {
      return;
    }
    const lo = a.y >= b.y ? a : b;
    const up = lo === a ? b : a;
    let ex = lo.x - up.x;
    let ey = lo.y - up.y;
    let d = Math.sqrt(ex * ex + ey * ey);
    if (d < 0.001) {
      ex = 0;
      ey = 1;
      d = 1;
    }
    let ux = ex / d;
    let uy = ey / d;
    const sg = ex >= 0 ? 1 : -1;
    const hx = 0.42;
    if (ox < oy) {
      lo.x += sg * ox;
    } else {
      lo.y += oy;
    }
    if (Math.abs(ux) < hx) {
      ux = sg * hx;
      uy = (uy >= 0 ? 1 : -1) * Math.sqrt(1 - hx * hx);
    }
    const sp = Math.max(50, Math.sqrt(lo.vx * lo.vx + lo.vy * lo.vy));
    lo.vx = ux * sp;
    lo.vy = uy * sp;
    lo.vr = -sg * 70;
    lo.state = 'hit';
    lo.hit = 0;
    lo.op0 = lo.op;

    if (onCollision) {
      onCollision(lo, up);
    }
  }

  function step(dt) {
    let i;
    let j;
    let b;
    for (i = 0; i < L.length; i++) {
      b = L[i];
      if (b.state === 'wait') {
        b.wait -= dt;
        if (b.wait <= 0) {
          spawn(b);
        }
        continue;
      }
      b.age += dt;
      b.t += dt;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.vr * dt;
      if (!b.entered) {
        if (b.x >= b.r && b.x <= W - b.r) {
          b.entered = true;
        }
      } else {
        if (b.x < b.r) {
          b.x = b.r;
          b.vx = Math.abs(b.vx);
        } else if (b.x > W - b.r) {
          b.x = W - b.r;
          b.vx = -Math.abs(b.vx);
        }
      }
      if (b.state === 'rise') {
        const fin = Math.min(1, b.age / 0.8);
        const fout = Math.max(0, Math.min(1, (b.y + b.r) / (H * 0.2)));
        b.op = PEAK * fin * fout;
        if (b.y < -b.r) {
          b.state = 'wait';
          b.wait = rnd(0.1, 1.0);
          b.op = 0;
        }
      } else {
        b.hit += dt;
        b.op = b.op0 * Math.max(0, 1 - b.hit / 1.2);
        if (b.hit >= 1.2) {
          b.state = 'wait';
          b.wait = rnd(0.2, 1.2);
          b.op = 0;
        }
      }
    }
    for (i = 0; i < L.length; i++) {
      for (j = i + 1; j < L.length; j++) {
        collide(L[i], L[j]);
      }
    }
  }

  function renderDom() {
    for (let i = 0; i < L.length; i++) {
      const b = L[i];
      if (b.el && b.el.style) {
        b.el.style.opacity = b.state === 'wait' ? '0' : b.op.toFixed(3);
        b.el.style.transform = `translate(${(b.x - b.size / 2).toFixed(1)}px,${(b.y - b.size / 2).toFixed(1)}px) rotate(${b.rot.toFixed(1)}deg) scale(${k.toFixed(3)})`;
      }
    }
  }

  function onSize() {
    const oW = W;
    const oH = H;
    measure();
    if (oW < 400 || oH < 300) {
      seedAll();
      renderDom();
      return;
    }
    L.forEach((b) => {
      b.r = (b.size / 2) * k * 0.9;
      b.x *= W / oW;
      b.y *= H / oH;
      b.x = sideX(b.x, (b.size * k) / 2 * 0.92, b.r);
    });
    renderDom();
  }

  // Initialize logos array
  measure();
  L = elements.map((item) => {
    const el = item.el || item;
    const size = item.size || (el.offsetWidth ? el.offsetWidth : 100);
    if (el && el.style) {
      el.style.left = '0';
      el.style.top = '0';
      el.style.opacity = '0';
    }
    return {
      id: item.id || '',
      el,
      size,
      r: 0,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      rot: 0,
      vr: 0,
      state: 'wait',
      route: 'seed',
      entered: true,
      wait: 0,
      age: 0,
      t: 0,
      op: 0,
      op0: 0,
      hit: 0
    };
  });

  seedAll();

  return {
    step,
    renderDom,
    onSize,
    measure,
    seedAll,
    getLogos: () => L,
    getW: () => W,
    getH: () => H,
    getK: () => k,
    getCL: () => CL,
    getCR: () => CR
  };
}
