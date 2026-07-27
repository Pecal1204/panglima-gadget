/* =============================================================================
   INSIDE YOUR SMARTPHONE — real-time 3D exploded view  (ES module)
   -----------------------------------------------------------------------------
   Vanilla Three.js (React-Three-Fiber is only a wrapper around this API) so the
   experience drops into the existing static site with no build step.

   • Procedural PBR geometry — real meshes, not a flat image, zero binary assets.
   • Scroll-scrubbed timeline: reveal → staged explosion → guided component tour
     → exploded overview. Scrolling up reverses it (everything is a pure function
     of scroll progress `p`).
   • Falls back to the accessible card grid on no-WebGL / reduced-motion / error.
   • Pauses rendering when off-screen or the tab is hidden.
   ========================================================================== */

const IP = window.PG_INSIDE;
const REDUCED = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/* ---- 0. Capability gate ------------------------------------------------- */
function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(window.WebGLRenderingContext &&
      (c.getContext("webgl2") || c.getContext("webgl") || c.getContext("experimental-webgl")));
  } catch (e) { return false; }
}

if (!IP) {
  /* data/content script failed — nothing we can do */
} else if (REDUCED || !hasWebGL()) {
  IP.renderFallback(REDUCED ? "reduced-motion" : "no-webgl");
} else {
  boot();
}

async function boot() {
  let THREE, RoomEnvironment;
  try {
    THREE = await import("three");
    ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js"));
  } catch (err) {
    console.warn("[inside-phone] three.js failed to load — showing fallback.", err);
    IP.renderFallback("load-error");
    return;
  }
  try {
    run(THREE, RoomEnvironment);
  } catch (err) {
    console.error("[inside-phone] init error — showing fallback.", err);
    IP.renderFallback("init-error");
  }
}

/* ========================================================================= */
function run(THREE, RoomEnvironment) {
  if (IP.build) IP.build();            // ensure DOM refs exist (module runs before DOMContentLoaded)
  const els = IP.els;
  if (!els.section || !els.scroller || !els.canvasWrap) { IP.renderFallback("no-shell"); return; }
  // If a failed native pass rendered the fallback and es-module-shims then
  // re-ran us successfully, restore interactive mode.
  els.section.classList.remove("ip-static");
  els.section.removeAttribute("data-ip-mode");
  if (els.fallback) els.fallback.hidden = true;
  const CFG = IP.data.config;
  const TOUR = IP.data.tour;
  // Renderer-quality knobs are fixed at init; layout decisions (card side,
  // model shift) track the CSS 820px breakpoint live via `mq`.
  const mq = matchMedia("(max-width: 820px)");
  const isMobile = mq.matches;
  const LOD = isMobile ? 0 : 1;                 // 0 = light, 1 = full
  const COL = CFG.colors;

  /* ---- math helpers ---- */
  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
  const lerp = (a, b, t) => a + (b - a) * t;
  const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const easeIO = t => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

  /* ---- renderer / scene / camera ---- */
  const canvas = document.createElement("canvas");
  canvas.className = "ip-canvas";
  els.canvasWrap.appendChild(canvas);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);
  camera.position.set(0, 0, 7.6); // refined per-aspect in resize()

  /* Studio reflections via generated room environment (no HDR asset).
     The generator and room scene are one-shot — free them once baked. */
  const pmrem = new THREE.PMREMGenerator(renderer);
  const roomScene = new RoomEnvironment();
  const envTex = pmrem.fromScene(roomScene, 0.04).texture;
  scene.environment = envTex;
  pmrem.dispose();
  roomScene.traverse(o => {
    if (o.isMesh) { o.geometry.dispose(); if (o.material && o.material.dispose) o.material.dispose(); }
  });

  /* Cinematic key/rim lights: cool blue key, warm orange rim. */
  const key = new THREE.DirectionalLight(0xbcd8ff, 2.3); key.position.set(-4, 6, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(COL.orange), 1.5); rim.position.set(5, -3, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.85); fill.position.set(3, 1, 5); scene.add(fill);
  const bounce = new THREE.DirectionalLight(0x40507a, 0.6); bounce.position.set(-2, -5, 3); scene.add(bounce);
  scene.add(new THREE.AmbientLight(0x323a4c, 0.8));

  /* Soft grounding glow behind the device. */
  const glowTex = radialTexture(THREE, COL.blue);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.5, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(9, 9, 1); glow.position.set(0, 0, -3);
  scene.add(glow);

  /* ---- root groups ---- */
  const root = new THREE.Group();          // holds rotation/scale/position
  scene.add(root);
  const phone = new THREE.Group();         // holds the components
  root.add(phone);

  /* ======================================================================
     PHONE GEOMETRY  — mechanically layered stack (front +z … back -z)
     Local units: width 1.44 (x ±0.72), height 3.0 (y ±1.5), thin z.
     ==================================================================== */
  const HW = 0.72, HH = 1.5;
  const seg = LOD ? 9 : 4;                  // curve segments for rounded corners
  const bevSeg = LOD ? 4 : 2;               // chamfer segments (smooth premium edges)

  const TEX = buildTextures(THREE);
  const M = buildMaterials(THREE, COL, LOD, TEX);
  const geomCache = {};

  const components = [];   // { id, group, cardId, name, home, exp, t0, t1, base:[{mesh,mat,color,emi}] }

  /* helper: register a component */
  function addComponent(def) {
    const g = new THREE.Group();
    g.position.copy(def.home);
    def.build(g);
    phone.add(g);
    // Clone each mesh's material so dim/highlight is isolated per component
    // (the M.* library materials are shared across many components).
    const base = [];
    g.traverse(o => {
      if (o.isMesh && o.material && o.material.color) {
        o.material = o.material.clone();
        base.push({ mat: o.material, color: o.material.color.clone(), emi: (o.material.emissive ? o.material.emissive.clone() : null), env: o.material.envMapIntensity != null ? o.material.envMapIntensity : 1 });
        if (def.cardId) { o.userData.cardId = def.cardId; o.userData.cIndex = def.index; clickable.push(o); }
      }
    });
    components.push({ id: def.id, group: g, cardId: def.cardId, index: def.index, name: def.name, home: def.home.clone(), exp: def.exp.clone(), t0: def.t0, t1: def.t1, spin: def.spin || 0, base });
  }
  const clickable = [];

  /* rounded-rect shape + extruded plate */
  function rrShape(w, h, r) {
    const s = new THREE.Shape();
    const x = -w / 2, y = -h / 2;
    r = Math.min(r, w / 2, h / 2);
    s.moveTo(x + r, y);
    s.lineTo(x + w - r, y); s.quadraticCurveTo(x + w, y, x + w, y + r);
    s.lineTo(x + w, y + h - r); s.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    s.lineTo(x + r, y + h); s.quadraticCurveTo(x, y + h, x, y + h - r);
    s.lineTo(x, y + r); s.quadraticCurveTo(x, y, x + r, y);
    return s;
  }
  /* Every plate is chamfered on both faces, so edges catch a highlight like a
     machined part instead of reading as cut card. Total thickness stays `d`:
     a bevelled ExtrudeGeometry spans [-bev, depth+bev], so depth is reduced by
     2*bev and the re-centring offset must add bev back — otherwise the part
     sinks by bev and every decal plane anchored to ±d/2 lands inside the solid. */
  function plate(w, h, d, r) {
    const key = "p" + [w, h, d, r].join("_");
    if (!geomCache[key]) {
      const bev = Math.min(0.009, d * 0.34, r * 0.5);
      const g = new THREE.ExtrudeGeometry(rrShape(w, h, r), {
        depth: d - bev * 2, curveSegments: seg,
        bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
        bevelOffset: 0, bevelSegments: bevSeg
      });
      g.translate(0, 0, bev - d / 2);   // span [-bev, d-bev] -> exactly ±d/2
      geomCache[key] = g;
    }
    return geomCache[key];
  }
  function mesh(geo, mat) { return new THREE.Mesh(geo, mat); }
  /* Rounded box: same centred bounds as BoxGeometry, but with softened corners
     and chamfered faces — every call site upgrades for free. */
  function box(w, h, d) { return plate(w, h, d, Math.min(w, h) * 0.22); }
  function cyl(r, h, s) {
    s = Math.max(s || 12, LOD ? 24 : 12);   // no visible facets on barrels/rings
    const k = "c" + [r, h, s].join("_");
    if (!geomCache[k]) geomCache[k] = new THREE.CylinderGeometry(r, r, h, s);
    return geomCache[k];
  }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* =====================================================================
     PANGLIMA X1 — internal layout
     ---------------------------------------------------------------------
     Proportions follow a 2019-flagship-class architecture: one rectangular
     pouch cell, a stacked two-deck mainboard on one side rail, a square rear
     camera mesa with two lenses on the diagonal, and a notch. Scale is
     52 mm per scene unit in x/y; z is exaggerated 1.25x uniformly (41.5 mm
     per unit) so the 8.3 mm body reads as z -0.100 .. +0.100.

     The z bands below are exclusive: no two parts share both an xy footprint
     and a z range, so nothing intersects at rest. The rear mesa is the one
     deliberate exception — it projects past the back face, which is what
     gives the silhouette its shape.
     ===================================================================== */

  /* ---------- 1. FRONT COVER GLASS (printed mask + notch cutout) ---------- */
  addComponent({
    id: "frontglass", name: "Front Cover Glass", cardId: null, index: null,
    home: V(0, 0, 0.0925), exp: V(0, 0, 2.05), t0: 0.37, t1: 0.44,
    build: g => {
      g.add(mesh(plate(1.38, 2.94, 0.015, 0.27), M.glass));
      /* printed black border mask; the notch is a downward tab in the mask */
      const mask = new THREE.Mesh(new THREE.PlaneGeometry(1.38, 2.94), M.rearArt);
      mask.position.z = -0.0085; mask.material = M.rearArt; g.add(mask);
      const notch = mesh(plate(0.68, 0.10, 0.004, 0.045), M.silicon);
      notch.position.set(0, 1.342, -0.006); g.add(notch);
    }
  });

  /* ---------- 2. OLED PANEL (bonded module: glass, touch, emissive) ---------- */
  addComponent({
    id: "display", name: "OLED Display Panel", cardId: "display", index: TOUR.indexOf("display"),
    home: V(0, 0, 0.074), exp: V(0, 0, 1.45), t0: 0.35, t1: 0.42,
    build: g => {
      g.add(mesh(plate(1.36, 2.92, 0.022, 0.26), M.display));
      /* lit active area, inset by the inactive border */
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(1.224, 2.784), M.screen);
      screen.position.z = 0.012; g.add(screen);
      /* notch is cut out of the lit area, so mask it back to black */
      const notch = mesh(plate(0.68, 0.10, 0.006, 0.045), M.silicon);
      notch.position.set(0, 1.342, 0.013); g.add(notch);
      /* foam + graphite backing foils on the rear face */
      const foil = mesh(plate(1.30, 2.86, 0.004, 0.24), M.graphite);
      foil.position.z = -0.013; g.add(foil);
      /* driver flex folding off the bottom edge toward the board */
      const flex = mesh(box(0.34, 0.16, 0.004), M.filmCopper);
      flex.position.set(0.10, -1.36, -0.016); g.add(flex);
    }
  });

  /* ---------- 3. FRONT SENSOR CLUSTER (display-side notch group) ---------- */
  addComponent({
    id: "frontsensors", name: "Front Sensor Cluster", cardId: "proximity", index: TOUR.indexOf("proximity"),
    home: V(-0.17, 1.342, 0.0355), exp: V(-0.45, 2.15, 1.05), t0: 0.33, t1: 0.40,
    build: g => {
      /* flood emitter + proximity as one bonded module, then ambient light */
      const modA = mesh(box(0.062, 0.052, 0.03), M.silicon); modA.position.x = -0.026; g.add(modA);
      const win = mesh(cyl(0.017, 0.008, LOD ? 16 : 8), M.sensorBlue);
      win.rotation.x = Math.PI / 2; win.position.set(-0.026, 0, 0.019); g.add(win);
      const als = mesh(box(0.028, 0.028, 0.024), M.plastic); als.position.x = 0.034; g.add(als);
      /* shared ribbon bonded to the back of the panel */
      const rib = mesh(box(0.115, 0.022, 0.003), M.filmCopper);
      rib.position.set(0, -0.03, -0.024); g.add(rib);
    }
  });

  /* ---------- 4. SHIELDING CANS & BRACKETS (over the board stack) ---------- */
  addComponent({
    id: "emishields", name: "Shielding Cans & Connector Brackets", cardId: null, index: null,
    home: V(0.434, 0.3, 0.034), exp: V(2.15, 0.8, 0.5), t0: 0.24, t1: 0.31,
    build: g => {
      const can = (w, h, x, y) => {
        const c = mesh(box(w, h, 0.019), M.shield); c.position.set(x, y, 0); g.add(c);
        const lid = new THREE.Mesh(new THREE.PlaneGeometry(w * 0.86, h * 0.86), M.shieldArt);
        lid.position.set(x, y, 0.0102); g.add(lid);
      };
      can(0.30, 0.23, 0, 0.30);
      can(0.26, 0.19, 0, -0.02);
      if (LOD) { can(0.15, 0.11, -0.05, -0.28); can(0.12, 0.09, 0.09, -0.30); }
      /* graphite patches adhered to the can tops */
      const gp = mesh(plate(0.22, 0.14, 0.002, 0.03), M.graphite);
      gp.position.set(0, 0.30, 0.011); g.add(gp);
      /* stamped steel bracket strip screwed over the ribbon sockets */
      const br = mesh(plate(0.32, 0.16, 0.006, 0.03), M.frame);
      br.position.set(0, -0.40, 0.004); g.add(br);
      if (LOD) for (const x of [-0.11, 0.11]) {
        const sc = mesh(cyl(0.018, 0.012, 10), M.screw);
        sc.rotation.x = Math.PI / 2; sc.position.set(x, -0.40, 0.011); g.add(sc);
      }
    }
  });

  /* ---------- 5. EARPIECE (glued to the panel, lifts with the screen) ---------- */
  addComponent({
    id: "earpiece", name: "Earpiece Speaker", cardId: "earpiece", index: TOUR.indexOf("earpiece"),
    home: V(0, 1.342, 0.026), exp: V(0.15, 2.15, 1.05), t0: 0.33, t1: 0.40,
    build: g => {
      g.add(mesh(box(0.2, 0.1, 0.072), M.frame));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.17, 0.028), M.grille);
      face.position.z = 0.037; g.add(face);
      const tail = mesh(box(0.07, 0.03, 0.003), M.filmCopper);
      tail.position.set(0.12, -0.02, 0.02); g.add(tail);
    }
  });

  /* ---------- 6. MAINBOARD — UPPER (compute) DECK ---------- */
  addComponent({
    id: "boardupper", name: "Mainboard (Upper Deck)", cardId: "motherboard", index: TOUR.indexOf("motherboard"),
    home: V(0.434, 0.194, 0.014), exp: V(1.65, 0.78, 0.5), t0: 0.22, t1: 0.29,
    build: g => {
      g.add(mesh(plate(0.38, 1.15, 0.016, 0.04), M.pcb));
      const art = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.11), M.pcbArt);
      art.position.z = 0.009; g.add(art);
      /* the perimeter via ring is what visually marks the sandwich */
      if (LOD) {
        const ring = (n, x0, y0, dx, dy) => {
          for (let i = 0; i < n; i++) {
            const v = mesh(cyl(0.005, 0.018, 6), M.gold);
            v.rotation.x = Math.PI / 2; v.position.set(x0 + dx * i, y0 + dy * i, 0);
            g.add(v);
          }
        };
        ring(16, -0.175, -0.55, 0, 0.0733);
        ring(16, 0.175, -0.55, 0, 0.0733);
      }
      /* application processor + stacked memory, then support ICs */
      const soc = mesh(box(0.17, 0.17, 0.022), M.soc); soc.position.set(0, 0.30, 0.018); g.add(soc);
      const die = new THREE.Mesh(new THREE.PlaneGeometry(0.145, 0.145), M.socTop);
      die.position.set(0, 0.30, 0.030); g.add(die);
      const mem = mesh(box(0.11, 0.11, 0.014), M.memory); mem.position.set(0, -0.02, 0.016); g.add(mem);
      const sto = mesh(box(0.13, 0.10, 0.014), M.storage); sto.position.set(0, -0.26, 0.016); g.add(sto);
      const pmic = mesh(box(0.10, 0.08, 0.013), M.pmic); pmic.position.set(0, -0.44, 0.015); g.add(pmic);
      /* press-fit ribbon sockets, all on the display-facing face */
      for (const y of [0.52, -0.56]) {
        const s = mesh(box(0.15, 0.045, 0.012), M.gold); s.position.set(0, y, 0.014); g.add(s);
      }
    }
  });

  /* ---------- 7. 3D FACE-SCANNING ASSEMBLY (chassis-side notch hardware) ---------- */
  addComponent({
    id: "facescancam", name: "3D Face-Scanning Assembly", cardId: "proximity", index: TOUR.indexOf("proximity"),
    home: V(0, 1.3315, 0.014), exp: V(0.75, 2.15, 1.05), t0: 0.31, t1: 0.38,
    build: g => {
      /* receiver at the far -x end; the wide baseline to the emitter is what
         makes depth sensing work, so the two are never modelled together */
      const rx = mesh(box(0.075, 0.09, 0.055), M.silicon); rx.position.set(-0.2825, 0, 0); g.add(rx);
      const rxw = mesh(cyl(0.022, 0.01, LOD ? 16 : 8), M.sensorBlue);
      rxw.rotation.x = Math.PI / 2; rxw.position.set(-0.2825, 0, 0.031); g.add(rxw);
      /* front camera + dot emitter block at the +x end */
      const cam = mesh(box(0.081, 0.081, 0.062), M.silicon); cam.position.set(0.1505, 0, 0); g.add(cam);
      const lens = mesh(cyl(0.026, 0.012, LOD ? 18 : 9), M.lensGlass);
      lens.rotation.x = Math.PI / 2; lens.position.set(0.1505, 0, 0.034); g.add(lens);
      const dot = mesh(box(0.077, 0.077, 0.058), M.silicon); dot.position.set(0.2755, 0, 0); g.add(dot);
      const dotw = mesh(cyl(0.02, 0.01, LOD ? 16 : 8), M.sensorBlue);
      dotw.rotation.x = Math.PI / 2; dotw.position.set(0.2755, 0, 0.032); g.add(dotw);
      /* ribbon linking them, routed just below the notch mouth */
      const rib = mesh(box(0.60, 0.018, 0.003), M.filmCopper);
      rib.position.set(0, -0.052, 0.005); g.add(rib);
    }
  });

  /* ---------- 8. MICROPHONE ARRAY ---------- */
  addComponent({
    id: "microphones", name: "Microphone Array", cardId: "microphones", index: TOUR.indexOf("microphones"),
    home: V(-0.2, -1.44, -0.012), exp: V(-0.5, -2.15, 0.5), t0: 0.30, t1: 0.37,
    build: g => {
      const m = mesh(box(0.05, 0.045, 0.028), M.plastic); g.add(m);
      if (LOD) {
        const bt = mesh(cyl(0.026, 0.01, 10), M.boot);
        bt.rotation.x = Math.PI / 2; bt.position.z = 0.019; g.add(bt);
      }
      /* the other two ports are markers on their host parts */
      const p2 = mesh(cyl(0.012, 0.006, 8), M.silicon);
      p2.rotation.x = Math.PI / 2; p2.position.set(0.06, 0.02, 0.016); g.add(p2);
    }
  });

  /* ---------- 9. BATTERY — one rectangular pouch cell ---------- */
  addComponent({
    id: "battery", name: "Battery", cardId: "battery", index: TOUR.indexOf("battery"),
    home: V(-0.23, -0.115, -0.018), exp: V(-1.75, 0.35, 0.5), t0: 0.20, t1: 0.27,
    build: g => {
      g.add(mesh(plate(0.86, 1.87, 0.096, 0.06), M.battery));
      const label = new THREE.Mesh(new THREE.PlaneGeometry(0.80, 1.60), M.battLabel);
      label.position.z = 0.049; g.add(label);
      /* six stretch-release pull tabs: three at each end */
      if (LOD) for (const y of [0.86, -0.86]) for (const x of [-0.26, 0, 0.26]) {
        const tab = mesh(box(0.13, 0.09, 0.004), M.tab);
        tab.position.set(x, y, -0.050); g.add(tab);
      }
      /* protection circuit + single ribbon tail to one board connector */
      const bms = mesh(box(0.26, 0.06, 0.02), M.pcb); bms.position.set(0.24, 0.96, 0.02); g.add(bms);
      const tail = mesh(box(0.07, 0.14, 0.003), M.filmCopper); tail.position.set(0.36, 1.02, 0.02); g.add(tail);
    }
  });

  /* ---------- 10. SIM TRAY & READER ---------- */
  addComponent({
    id: "simtray", name: "SIM Tray & Reader", cardId: null, index: null,
    home: V(0.565, -0.6, -0.02), exp: V(2.15, 0.05, 0.5), t0: 0.29, t1: 0.36,
    build: g => {
      g.add(mesh(box(0.23, 0.3, 0.058), M.frame));
      const card = mesh(box(0.16, 0.20, 0.012), M.gold); card.position.z = 0.026; g.add(card);
      if (LOD) {
        const seal = mesh(box(0.012, 0.26, 0.05), M.boot); seal.position.x = 0.112; g.add(seal);
        const pin = mesh(cyl(0.007, 0.016, 8), M.silicon);
        pin.rotation.z = Math.PI / 2; pin.position.set(0.118, 0, 0); g.add(pin);
      }
    }
  });

  /* ---------- 11. REAR DUAL CAMERA (one bracket, two lenses, diagonal) ---------- */
  addComponent({
    id: "camera", name: "Rear Dual Camera Module", cardId: "camera", index: TOUR.indexOf("camera"),
    home: V(0.27, 1.055, -0.025), exp: V(1.15, 1.85, 0.5), t0: 0.25, t1: 0.32, spin: Math.PI,
    build: g => {
      g.add(mesh(plate(0.5, 0.44, 0.05, 0.09), M.camDeck));
      const decal = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.36), M.deckArt);
      decal.rotation.y = Math.PI; decal.position.z = -0.027; g.add(decal);
      /* barrels project toward the back; ring sizes differ per the spec */
      const lens = (x, y, r, stab) => {
        const barrel = mesh(cyl(r * 0.78, 0.055, LOD ? 24 : 12), M.lensBarrel);
        barrel.rotation.x = Math.PI / 2; barrel.position.set(x, y, -0.05); g.add(barrel);
        const ring = mesh(cyl(r, 0.014, LOD ? 24 : 12), M.lensRing);
        ring.rotation.x = Math.PI / 2; ring.position.set(x, y, -0.082); g.add(ring);
        const glass = mesh(cyl(r * 0.66, 0.012, LOD ? 24 : 12), M.lensGlass);
        glass.rotation.x = Math.PI / 2; glass.position.set(x, y, -0.089); g.add(glass);
        const pupil = mesh(cyl(r * 0.3, 0.014, LOD ? 16 : 8), M.silicon);
        pupil.rotation.x = Math.PI / 2; pupil.position.set(x, y, -0.093); g.add(pupil);
        /* the stabilised lens carries a visibly larger suspension block */
        if (stab) {
          const ois = mesh(box(r * 1.7, r * 1.7, 0.022), M.silicon);
          ois.position.set(x, y, -0.012); g.add(ois);
        }
      };
      lens(0.15, 0.15, 0.115, true);    // stabilised main
      lens(-0.15, -0.15, 0.105, false); // wide view
      /* two independent ribbon tails to separate board sockets */
      for (const x of [-0.06, 0.06]) {
        const t = mesh(box(0.05, 0.10, 0.003), M.filmCopper);
        t.position.set(x, -0.25, 0.01); g.add(t);
      }
    }
  });

  /* ---------- 12. BOTTOM LOUDSPEAKER (sealed chamber, deepest part) ---------- */
  addComponent({
    id: "loudspeaker", name: "Bottom Loudspeaker", cardId: "loudspeaker", index: TOUR.indexOf("loudspeaker"),
    home: V(0.455, -1.21, -0.0295), exp: V(-1.8, -1.35, 0.5), t0: 0.27, t1: 0.34,
    build: g => {
      g.add(mesh(box(0.46, 0.35, 0.111), M.plastic));
      const face = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.20), M.grille);
      face.position.z = 0.057; g.add(face);
      if (LOD) {
        const gasket = mesh(plate(0.42, 0.31, 0.006, 0.04), M.boot);
        gasket.position.z = -0.057; g.add(gasket);
        for (const x of [-0.14, 0.14]) {
          const nub = mesh(box(0.026, 0.02, 0.01), M.gold);
          nub.position.set(x, 0.15, 0.05); g.add(nub);
        }
      }
    }
  });

  /* ---------- 13. LINEAR VIBRATION MOTOR (flat block, long axis across) ---------- */
  addComponent({
    id: "haptic", name: "Linear Vibration Motor", cardId: "haptic", index: TOUR.indexOf("haptic"),
    home: V(-0.4, -1.19, -0.044), exp: V(-1.8, -1.9, 0.5), t0: 0.27, t1: 0.34,
    build: g => {
      g.add(mesh(box(0.52, 0.21, 0.082), M.frame));
      const lid = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.15), M.shieldArt);
      lid.position.z = 0.042; g.add(lid);
      /* the moving mass slides along the long axis */
      const mass = mesh(box(0.22, 0.11, 0.03), M.copper); mass.position.z = 0.01; g.add(mass);
      const tail = mesh(box(0.10, 0.05, 0.003), M.filmCopper);
      tail.position.set(0.30, 0.02, 0.02); g.add(tail);
    }
  });

  /* ---------- 14. MAINBOARD — LOWER (radio) DECK ---------- */
  addComponent({
    id: "boardlower", name: "Mainboard (Lower Deck)", cardId: null, index: null,
    home: V(0.434, 0.194, -0.054), exp: V(1.65, -0.62, 0.5), t0: 0.18, t1: 0.25,
    build: g => {
      g.add(mesh(plate(0.38, 1.15, 0.016, 0.04), M.pcb));
      const art = new THREE.Mesh(new THREE.PlaneGeometry(0.35, 1.11), M.pcbArt);
      art.rotation.y = Math.PI; art.position.z = -0.009; g.add(art);
      const modem = mesh(box(0.14, 0.14, 0.016), M.soc); modem.position.set(0, 0.34, -0.016); g.add(modem);
      const rf = mesh(box(0.11, 0.09, 0.013), M.silicon); rf.position.set(0, 0.02, -0.015); g.add(rf);
      const pa = mesh(box(0.09, 0.07, 0.012), M.pmic); pa.position.set(0, -0.28, -0.014); g.add(pa);
      /* antenna feed clips along the outboard edge */
      if (LOD) for (const y of [0.46, -0.10, -0.50]) {
        const clip = mesh(box(0.03, 0.05, 0.012), M.gold); clip.position.set(0.17, y, -0.014); g.add(clip);
      }
    }
  });

  /* ---------- 15. CHARGING PORT ASSEMBLY (one wide bottom flex) ---------- */
  addComponent({
    id: "chargingport", name: "Charging Port Assembly", cardId: "chargingport", index: TOUR.indexOf("chargingport"),
    home: V(0, -1.43, -0.055), exp: V(-1.15, -2.15, 0.5), t0: 0.29, t1: 0.36,
    build: g => {
      g.add(mesh(plate(1.3, 0.08, 0.008, 0.02), M.filmCopper));
      /* connector receptacle centred on the bottom edge */
      const shell = mesh(box(0.20, 0.075, 0.048), M.frame); shell.position.z = 0.012; g.add(shell);
      const mouth = mesh(box(0.155, 0.04, 0.05), M.silicon); mouth.position.z = 0.02; g.add(mouth);
      if (LOD) {
        const gasket = new THREE.Mesh(new THREE.TorusGeometry(0.095, 0.009, 8, 22), M.boot);
        gasket.position.z = 0.03; gasket.scale.y = 0.42; g.add(gasket);
        /* screw eyelets grounding the flex to the frame */
        for (const x of [-0.44, 0.44]) {
          const sc = mesh(cyl(0.018, 0.01, 10), M.screw);
          sc.rotation.x = Math.PI / 2; sc.position.set(x, 0, 0.008); g.add(sc);
        }
        /* antenna contact tabs */
        for (const x of [-0.30, 0.30]) {
          const tb = mesh(box(0.05, 0.04, 0.008), M.gold); tb.position.set(x, 0, 0.008); g.add(tb);
        }
      }
      /* interconnect run up the side rail to the board */
      const run = mesh(box(0.07, 0.30, 0.003), M.filmCopper);
      run.position.set(0.42, 0.20, -0.002); g.add(run);
    }
  });

  /* ---------- 16. GRAPHITE THERMAL LAYER (films only — no vapour chamber) ---------- */
  addComponent({
    id: "cooling", name: "Graphite Thermal Layer", cardId: "cooling", index: TOUR.indexOf("cooling"),
    home: V(0.434, 0.194, -0.0655), exp: V(2.15, -0.78, 0.5), t0: 0.16, t1: 0.23,
    build: g => {
      g.add(mesh(plate(0.4, 1.18, 0.007, 0.05), M.graphite));
      /* Laminated sheets read as slightly offset layers. No stamped-channel
         overlay here: channels would depict a vapour chamber, which this class
         of device does not use — the cooling is graphite film only. */
      const l2 = mesh(plate(0.36, 1.10, 0.003, 0.04), M.graphite);
      l2.position.set(0.008, 0.01, -0.005); g.add(l2);
      const l3 = mesh(plate(0.32, 1.02, 0.002, 0.03), M.graphite);
      l3.position.set(-0.006, -0.01, -0.008); g.add(l3);
    }
  });

  /* ---------- 17. WIRELESS CHARGING COIL (spiral + ferrite shield) ---------- */
  addComponent({
    id: "wireless", name: "Wireless Charging Coil", cardId: "wireless", index: TOUR.indexOf("wireless"),
    home: V(0, -0.1, -0.08), exp: V(1.5, -1.9, 0.5), t0: 0.13, t1: 0.20,
    build: g => {
      const coil = new THREE.Mesh(new THREE.PlaneGeometry(0.85, 0.85), M.coilArt);
      coil.rotation.y = Math.PI; g.add(coil);
      /* ferrite sheet behind the winding keeps the field off the cell */
      const ferrite = mesh(plate(0.88, 0.88, 0.004, 0.08), M.graphite);
      ferrite.position.z = -0.005; g.add(ferrite);
      const tail = mesh(box(0.06, 0.22, 0.003), M.filmCopper);
      tail.position.set(0.40, 0.42, -0.002); g.add(tail);
    }
  });

  /* ---------- 18. REAR GLASS ---------- */
  addComponent({
    id: "rearglass", name: "Rear Glass Panel", cardId: null, index: null,
    home: V(0, 0, -0.0925), exp: V(0, 0, -0.85), t0: 0.10, t1: 0.17, spin: Math.PI,
    build: g => {
      g.add(mesh(plate(1.38, 2.94, 0.015, 0.27), M.rearGlass));
      const art = new THREE.Mesh(new THREE.PlaneGeometry(1.34, 2.90), M.rearArt);
      art.rotation.y = Math.PI; art.position.z = -0.009; g.add(art);
    }
  });

  /* ---------- 19. REAR CAMERA MESA (formed in the rear glass, proud of it) ---------- */
  addComponent({
    id: "camerabump", name: "Rear Camera Mesa", cardId: null, index: null,
    home: V(0.27, 1.055, -0.1245), exp: V(0.27, 1.055, -1.0), t0: 0.10, t1: 0.17,
    build: g => {
      /* plateau */
      g.add(mesh(plate(0.58, 0.58, 0.034, 0.12), M.rearGlass));
      /* trim rings step a further stage proud, matching the lens centres */
      const ring = (x, y, r) => {
        const rg = mesh(cyl(r, 0.015, LOD ? 24 : 12), M.lensRing);
        rg.rotation.x = Math.PI / 2; rg.position.set(x, y, -0.024); g.add(rg);
      };
      ring(0.15, 0.15, 0.115);
      ring(-0.15, -0.15, 0.105);
      /* flash disc and the rear microphone pinhole complete the square */
      const flash = mesh(cyl(0.0435, 0.012, LOD ? 18 : 9), M.flash);
      flash.rotation.x = Math.PI / 2; flash.position.set(-0.15, 0.15, -0.022); g.add(flash);
      const pin = mesh(cyl(0.01, 0.01, 8), M.silicon);
      pin.rotation.x = Math.PI / 2; pin.position.set(0.15, -0.15, -0.021); g.add(pin);
    }
  });

  /* ---------- 20. MID-FRAME CHASSIS (the structural spine) ---------- */
  addComponent({
    id: "midframe", name: "Mid-Frame Chassis", cardId: null, index: null,
    home: V(0, 0, 0), exp: V(0, 0, 0), t0: 0.05, t1: 0.12,
    build: g => {
      const outer = rrShape(1.42, 2.98, 0.27);
      const inner = rrShape(1.38, 2.94, 0.25);
      outer.holes.push(new THREE.Path(inner.getPoints(seg * 4)));
      const geo = new THREE.ExtrudeGeometry(outer, {
        depth: 0.2, curveSegments: seg, bevelEnabled: true,
        bevelThickness: 0.006, bevelSize: 0.006, bevelOffset: 0, bevelSegments: bevSeg
      });
      geo.translate(0, 0, -0.1);
      g.add(mesh(geo, M.frame));
    }
  });

  /* ---------- 21. ANTENNA BANDS (splits in the metal rail) ---------- */
  addComponent({
    id: "antennabands", name: "Antenna Bands", cardId: null, index: null,
    home: V(0, 0, 0), exp: V(0, 0, -0.3), t0: 0.05, t1: 0.12,
    build: g => {
      /* hairline non-conductive fills breaking the rail's continuity */
      const band = (w, h, x, y) => {
        const b = mesh(box(w, h, 0.2), M.plastic); b.position.set(x, y, 0); g.add(b);
      };
      band(0.34, 0.016, -0.30, 1.49);
      band(0.34, 0.016, 0.30, -1.49);
      band(0.016, 0.30, 0.71, 0.90);
      band(0.016, 0.30, -0.71, -0.90);
    }
  });

  /* ======================================================================
     ANCHORS for connector lines / labels (world space, computed per frame)
     ==================================================================== */
  const byCard = {};
  components.forEach(c => { if (c.cardId) byCard[c.cardId] = c; });
  const tourComps = TOUR.map(id => byCard[id]).filter(Boolean);

  /* ======================================================================
     SCROLL TIMELINE
     ==================================================================== */
  /* Rebalanced: shorter reveal/explosion, longer tour dwell per component. */
  const P = {
    revealEnd: 0.08,
    explodeStart: 0.08, explodeEnd: 0.42,
    tourStart: 0.46, tourEnd: 0.92,
    overviewStart: 0.92
  };

  let progress = 0;          // 0..1 scroll progress
  let userYaw = 0, userPitch = 0;   // drag offsets
  let idleYaw = 0;
  let stageW = 1, stageH = 1;       // cached in resize(); no layout reads per frame
  const tmpV = new THREE.Vector3();
  const controlsEl = document.getElementById("ip-controls");

  function computeProgress() {
    const r = els.scroller.getBoundingClientRect();
    const denom = els.scroller.offsetHeight - window.innerHeight;
    if (denom <= 0) return 0;
    return clamp(-r.top / denom, 0, 1);
  }

  function phaseLabel(p) {
    if (p < P.revealEnd) return "Assembled";
    if (p < P.explodeEnd) return "Disassembling";
    if (p < P.tourStart) return "Exploded view";
    if (p < P.overviewStart) return "Component " + (activeIdx + 1 || 1) + " / " + tourComps.length;
    return "Full teardown";
  }

  let activeIdx = -1;

  function apply(p, time, dt) {
    dt = dt || 0;
    /* --- base pose: reveal turn → settle to 3/4 --- */
    const a = smooth(0, 0.04, p);
    const b = smooth(0.04, 0.10, p);
    let yaw = lerp(0, -1.30, a);
    yaw = lerp(yaw, -0.72, b);
    const pitch = lerp(0, -0.36, smooth(0.02, 0.12, p));

    /* explode scale so the tall stack stays framed */
    const e = smooth(P.explodeStart, P.explodeEnd, p);
    let sc = lerp(1.0, 0.60, e);

    /* idle life before scrolling; gentle sway (not endless spin) in the
       overview so the composition and labels stay stable */
    const sway = p > P.overviewStart ? Math.sin(time * 0.35) * 0.05 : 0;
    idleYaw = (p < 0.02 ? Math.sin(time * 0.6) * 0.04 : 0) + sway;

    root.rotation.set(pitch + userPitch, yaw + userYaw + idleYaw, 0);

    /* --- per-component explosion (some parts turn face-up as they detach) --- */
    for (const c of components) {
      const t = easeIO(smooth(c.t0, c.t1, p));
      tmpV.copy(c.home).lerp(c.exp, t);
      c.group.position.copy(tmpV);
      if (c.spin) c.group.rotation.y = t * c.spin;
    }

    /* --- focus tour: dim others, highlight active, card + line --- */
    let inTour = p >= P.tourStart && p < P.overviewStart;
    let idx = -1;
    if (inTour) {
      const tt = (p - P.tourStart) / (P.tourEnd - P.tourStart);
      idx = clamp(Math.floor(tt * tourComps.length), 0, tourComps.length - 1);
    }
    if (idx !== activeIdx) {
      activeIdx = idx;
      if (idx >= 0) { IP.setActive(tourComps[idx].index); markPicker(tourComps[idx].index); }
      else { IP.clearActive(); markPicker(-1); }
    }

    const overview = p >= P.overviewStart;
    const dimAmt = inTour ? 1 : 0;
    const activeComp = idx >= 0 ? tourComps[idx] : null;

    for (const c of components) {
      const isActive = c === activeComp;
      const dim = isActive ? 0 : dimAmt;
      for (const b2 of c.base) {
        // Dim non-active parts to readable silhouettes (never to black), and
        // lift the active part with reflections + a faint blue cast instead of
        // a heavy emissive wash that would erase its own detail.
        b2.mat.color.copy(b2.color).lerp(DIM_COL, dim * 0.5);
        if (b2.mat.envMapIntensity != null)
          b2.mat.envMapIntensity = b2.env * (1 - dim * 0.45) * (isActive ? 1.5 : 1);
        if (b2.emi) {
          b2.mat.emissive.copy(b2.emi).multiplyScalar(1 - dim * 0.7);
          if (isActive) b2.mat.emissive.lerp(BLUE_EMI, 0.3);
        }
      }
    }

    /* group offset so the active part isn't hidden behind the card;
       on mobile also shrink slightly so more of the model clears the sheet */
    const shift = inTour ? 1 : 0;
    if (mq.matches) {
      root.position.set(0, lerp(0, 0.5, shift), 0);
      sc *= lerp(1, 0.9, shift);
    } else {
      root.position.set(lerp(0, -0.55, shift), 0, 0);
    }
    root.scale.setScalar(sc);

    /* --- connector line + card anchor --- */
    updateLine(activeComp);

    /* --- overview labels --- */
    updateLabels(overview);

    /* --- HUD + intro fade --- */
    if (els.bar) els.bar.style.width = (p * 100).toFixed(1) + "%";
    if (els.phase) els.phase.textContent = phaseLabel(p);
    const introFade = 1 - smooth(0.0, 0.06, p);
    if (els.intro) els.intro.style.opacity = introFade;
    if (els.intro) els.intro.style.pointerEvents = introFade < 0.05 ? "none" : "";
    const hudFade = smooth(0.02, 0.1, p);
    if (els.deviceTag) els.deviceTag.style.opacity = hudFade;
    if (els.hud) els.hud.style.opacity = hudFade;
    if (controlsEl) controlsEl.classList.toggle("on", hudFade > 0.5);

    /* grab cursor once exploded enough */
    els.canvasWrap.classList.toggle("ip-grab", p >= 0.16 && !dragging);
  }

  const DIM_COL = new THREE.Color(0x14161d);
  const BLUE_EMI = new THREE.Color(0x123a6e);

  /* ---- connector line (SVG) ---- */
  let linePath, lineDot;
  (function ensureLine() {
    const ns = "http://www.w3.org/2000/svg";
    linePath = document.createElementNS(ns, "path"); linePath.setAttribute("class", "dash");
    lineDot = document.createElementNS(ns, "circle"); lineDot.setAttribute("r", "3.5");
    els.lines.appendChild(linePath); els.lines.appendChild(lineDot);
  })();

  function project(v3) {
    tmpV.copy(v3).project(camera);
    return { x: (tmpV.x * 0.5 + 0.5) * stageW, y: (-tmpV.y * 0.5 + 0.5) * stageH, vis: tmpV.z < 1 };
  }
  function worldAnchor(comp) {
    comp.group.getWorldPosition(tmpV);
    return tmpV.clone();
  }

  function updateLine(comp) {
    if (!comp) { linePath.classList.remove("on"); lineDot.classList.remove("on"); return; }
    const p2 = project(worldAnchor(comp));
    const cardRect = els.card.getBoundingClientRect();
    const stageRect = els.stage.getBoundingClientRect();
    let cx, cy;
    if (mq.matches) { cx = p2.x; cy = Math.min(p2.y + 40, stageRect.height * 0.42); }
    else {
      cx = cardRect.left - stageRect.left; cy = cardRect.top - stageRect.top + cardRect.height * 0.34;
    }
    const midx = mq.matches ? p2.x : (p2.x + cx) / 2;
    const d = "M " + p2.x + " " + p2.y + " C " + midx + " " + p2.y + ", " + midx + " " + cy + ", " + cx + " " + cy;
    linePath.setAttribute("d", d);
    linePath.classList.add("on");
    lineDot.setAttribute("cx", p2.x); lineDot.setAttribute("cy", p2.y); lineDot.classList.add("on");
  }

  /* ---- overview labels ---- */
  const chips = els.labels ? Array.from(els.labels.querySelectorAll(".chip")) : [];
  function updateLabels(show) {
    if (!chips.length) return;
    for (let i = 0; i < tourComps.length; i++) {
      const chip = chips.find(ch => +ch.getAttribute("data-idx") === tourComps[i].index);
      if (!chip) continue;
      if (!show) { chip.classList.remove("on"); continue; }
      const p2 = project(worldAnchor(tourComps[i]));
      // small deterministic stagger so clustered chips don't stack
      const oy = ((i % 3) - 1) * 24, ox = (i % 2 ? 22 : -22);
      chip.style.left = (p2.x + ox) + "px"; chip.style.top = (p2.y + oy) + "px";
      chip.classList.toggle("on", p2.vis);
    }
  }

  function markPicker(compIndex) {
    if (!els.picker) return;
    els.picker.querySelectorAll("button").forEach(b => {
      const on = +b.getAttribute("data-idx") === compIndex;
      b.classList.toggle("is-active", on);
      if (on) b.setAttribute("aria-current", "true");
      else b.removeAttribute("aria-current");
    });
  }

  /* The site header slides back in on scroll-up; shift our controls below it
     so they are never covered. */
  const siteHeader = document.querySelector("header");
  if (siteHeader && controlsEl) {
    const syncHeader = () => {
      const visible = !siteHeader.classList.contains("header-hidden");
      controlsEl.classList.toggle("shifted", visible);
    };
    new MutationObserver(syncHeader).observe(siteHeader, { attributes: true, attributeFilter: ["class"] });
    syncHeader();
  }

  /* ======================================================================
     INTERACTION
     ==================================================================== */
  /* drag rotation (enabled once the phone starts opening).
     touch-action: pan-y pinch-zoom arbitrates scroll/zoom; a gesture the browser
     hands to us is ours for its whole duration (pointercancel ends the others). */
  let dragging = false, lastX = 0, lastY = 0, dragPointer = null, dragDist = 0;
  function canDrag() { return progress >= 0.16; }

  els.canvasWrap.addEventListener("pointerdown", e => {
    dragDist = 0;
    if (dragging) { endDrag({ pointerId: dragPointer }); return; } // second finger = pinch, not drag
    if (!canDrag()) return;
    if (e.pointerType === "touch" && !(progress >= P.explodeEnd)) return; // don't hijack scroll before fully open
    dragging = true; dragPointer = e.pointerId; lastX = e.clientX; lastY = e.clientY; dragDist = 0;
    els.canvasWrap.classList.add("ip-grabbing");
    try { els.canvasWrap.setPointerCapture(e.pointerId); } catch (_) {}
  });
  window.addEventListener("pointermove", e => {
    if (!dragging || e.pointerId !== dragPointer) { hover(e); return; }
    const dx = e.clientX - lastX, dy = e.clientY - lastY;
    lastX = e.clientX; lastY = e.clientY;
    dragDist += Math.abs(dx) + Math.abs(dy);
    userYaw = clamp(userYaw + dx * 0.006, -1.1, 1.1);
    userPitch = clamp(userPitch + dy * 0.004, -0.7, 0.7);
    requestRender();
  }, { passive: true });
  function endDrag(e) {
    if (!dragging || (e && e.pointerId != null && e.pointerId !== dragPointer)) return;
    dragging = false; els.canvasWrap.classList.remove("ip-grabbing");
    try { els.canvasWrap.releasePointerCapture(dragPointer); } catch (_) {}
  }
  window.addEventListener("pointerup", endDrag);
  window.addEventListener("pointercancel", endDrag);

  /* hover / click raycast for card-bearing parts */
  const ray = new THREE.Raycaster();
  const pointerNDC = new THREE.Vector2();
  let hovered = null;
  function hover(e) {
    if (e.pointerType === "touch") return;   // no hover concept on touch; tap uses click
    if (!running) return;                    // section off-screen — no raycasting page-wide
    if (progress < P.explodeStart) return;
    const rect = els.stage.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointerNDC, camera);
    const hit = ray.intersectObjects(clickable, false)[0];
    hovered = hit ? hit.object : null;
    els.canvasWrap.style.cursor = hovered ? "pointer" : "";
  }
  els.canvasWrap.addEventListener("click", e => {
    if (progress < P.explodeStart) return;
    if (dragDist > 8) return;                // this was a rotate-drag release, not a tap/click
    // fresh raycast (hover state doesn't exist for touch)
    const rect = els.stage.getBoundingClientRect();
    pointerNDC.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNDC.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
    ray.setFromCamera(pointerNDC, camera);
    const hit = ray.intersectObjects(clickable, false)[0];
    if (!hit) return;
    const ci = hit.object.userData.cIndex;
    if (ci == null) return;
    const pos = tourComps.findIndex(c => c.index === ci);
    if (pos >= 0) scrollToP(P.tourStart + (pos + 0.5) / tourComps.length * (P.tourEnd - P.tourStart));
  });

  /* controls */
  function scrollToP(p, instant) {
    const rect = els.scroller.getBoundingClientRect();
    const top = window.scrollY + rect.top;
    const max = els.scroller.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + p * max, behavior: instant ? "auto" : "smooth" });
  }
  const tourP = i => P.tourStart + (i + 0.5) / tourComps.length * (P.tourEnd - P.tourStart);
  IP.onPick = i => scrollToP(tourP(i));
  /* Prev/next stepper. Jumps instantly rather than smooth-scrolling: the
     active component is derived from scroll position, so during a smooth
     scroll the card still shows the old component and a quick second click
     would recompute the same destination. */
  IP.goTo = i => scrollToP(tourP(i), true);
  const reassembleBtn = document.getElementById("ip-reassemble");
  const viewAllBtn = document.getElementById("ip-viewall");
  if (reassembleBtn) reassembleBtn.addEventListener("click", () => scrollToP(0));
  if (viewAllBtn) viewAllBtn.addEventListener("click", () => scrollToP(0.95));

  /* ======================================================================
     RENDER LOOP  (paused when off-screen / hidden)
     ==================================================================== */
  let running = false, needsRender = true, rafId = 0, startTime = performance.now();
  function requestRender() { needsRender = true; }

  let lastFrameT = 0;
  function frame() {
    if (!running) return;
    rafId = requestAnimationFrame(frame);
    const p = computeProgress();
    const now = performance.now();
    const time = (now - startTime) / 1000;
    const dt = lastFrameT ? Math.min((now - lastFrameT) / 1000, 0.1) : 0;
    lastFrameT = now;
    const moving = Math.abs(p - progress) > 1e-4;
    const animating = p < 0.02 || (p > P.overviewStart && !dragging); // idle animations
    if (moving || needsRender || animating || dragging) {
      progress = p;
      apply(p, time, dt);
      renderer.render(scene, camera);
      needsRender = false;
    }
  }
  function start() { if (running) return; running = true; lastFrameT = 0; rafId = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(rafId); }

  const io = new IntersectionObserver(entries => {
    entries.forEach(en => { if (en.isIntersecting) start(); else stop(); });
  }, { rootMargin: "120px" });
  io.observe(els.section);
  document.addEventListener("visibilitychange", () => { if (document.hidden) stop(); else if (isInView()) start(); });
  function isInView() { const r = els.section.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; }

  /* ---- resize ---- */
  function resize() {
    const w = els.stage.clientWidth || els.section.clientWidth;
    const h = els.stage.clientHeight || window.innerHeight;
    stageW = w; stageH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h; camera.updateProjectionMatrix();
    // Frame the device with breathing room whatever the aspect:
    // fit its (rotated) height and width against the vertical/horizontal fov.
    const halfV = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
    const distH = (HH + 0.62) / halfV;                     // fit height
    const distW = (HW + 0.55) / (halfV * camera.aspect);   // fit width
    camera.position.z = Math.max(distH, distW);
    els.lines.setAttribute("viewBox", "0 0 " + w + " " + h);
    els.lines.setAttribute("width", w); els.lines.setAttribute("height", h);
    requestRender();
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---- reveal: hide loading, first paint ---- */
  progress = computeProgress();
  apply(progress, 0);
  renderer.render(scene, camera);
  // Hide the loader after first paint; the timeout covers hidden/background
  // tabs where rAF is throttled to zero.
  const hideLoading = () => { if (els.loading) els.loading.classList.add("is-hidden"); };
  requestAnimationFrame(hideLoading);
  setTimeout(hideLoading, 600);
  if (isInView()) start();
}

/* ========================================================================= */
/* materials + tiny radial texture                                            */
function buildMaterials(THREE, COL, LOD, TEX) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const c = (x) => new THREE.Color(x);

  // No transmission: it forces three.js into an extra full-scene render pass
  // per frame for marginal visual gain on this dark scene. Plain transparency
  // + clearcoat reads as glass at a fraction of the GPU cost.
  const glass = phys({
    color: c(COL.glassTint), metalness: 0.0, roughness: 0.06,
    transparent: true, opacity: 0.22, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05
  });
  const rearGlass = phys({
    color: c(0x0a0b10), metalness: 0.2, roughness: 0.12,
    transparent: true, opacity: 0.5, envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.08
  });
  const display = std({ color: c(0x04060c), roughness: 0.22, metalness: 0.1, emissive: c(0x0a1a38), emissiveIntensity: 0.8, envMapIntensity: 1.2 });
  /* generated-texture materials (screen, rear artwork, battery label, PCB
     traces, coil spiral) — white base so the map's own colours show */
  const screen = std({ color: c(0xffffff), roughness: 0.35, metalness: 0.0, map: TEX.screen, emissive: c(0xffffff), emissiveMap: TEX.screen, emissiveIntensity: 0.9 });
  const rearArt = std({ color: c(0xffffff), roughness: 0.3, metalness: 0.35, map: TEX.rear, envMapIntensity: 1.2 });
  const battLabel = std({ color: c(0xffffff), roughness: 0.55, metalness: 0.05, map: TEX.battery });
  const pcbArt = std({ color: c(0xffffff), roughness: 0.5, metalness: 0.4, map: TEX.pcb });
  const coilArt = std({ color: c(0xffffff), roughness: 0.4, metalness: 0.85, map: TEX.coil, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  const socTop = std({ color: c(0xffffff), roughness: 0.32, metalness: 0.55, map: TEX.soc, envMapIntensity: 1.1 });
  const shieldArt = std({ color: c(0xffffff), roughness: 0.34, metalness: 0.9, map: TEX.shield, envMapIntensity: 1.15 });
  const vaporArt = std({ color: c(0xffffff), roughness: 0.3, metalness: 0.9, map: TEX.vapor, envMapIntensity: 1.15 });
  const grille = std({ color: c(0xffffff), roughness: 0.75, metalness: 0.15, map: TEX.grille });
  const deckArt = std({ color: c(0xffffff), roughness: 0.4, metalness: 0.3, map: TEX.deck, transparent: true });
  const tab = std({ color: c(0x2f6fd6), roughness: 0.5, metalness: 0.05 });
  const boot = std({ color: c(0x1a1b1f), roughness: 0.9, metalness: 0.0 });
  const flash = std({ color: c(0xf5efdd), roughness: 0.3, metalness: 0.1, emissive: c(0xfff3d0), emissiveIntensity: 0.5 });
  const filmFlex = std({ color: c(0x14100c), roughness: 0.6, metalness: 0.2 });
  const filmCopper = std({ color: c(0x7a4a20), roughness: 0.55, metalness: 0.8, envMapIntensity: 0.9 });
  // Showpiece metals get a clearcoat so the new chamfers read as polished edges.
  const frame = phys({ color: c(0x6b7280), roughness: 0.26, metalness: 1.0, envMapIntensity: 1.5, clearcoat: 0.65, clearcoatRoughness: 0.16 });
  const shield = phys({ color: c(0xb9bfc8), roughness: 0.30, metalness: 1.0, envMapIntensity: 1.3, clearcoat: 0.4, clearcoatRoughness: 0.24 });
  const pcb = std({ color: c(COL.pcb), roughness: 0.55, metalness: 0.3 });
  const soc = std({ color: c(0x0c0d12), roughness: 0.35, metalness: 0.6, emissive: c(0x06131f), emissiveIntensity: 0.4 });
  const memory = std({ color: c(0x1a1c22), roughness: 0.4, metalness: 0.5 });
  const storage = std({ color: c(0x101116), roughness: 0.4, metalness: 0.5 });
  const pmic = std({ color: c(0x14151a), roughness: 0.45, metalness: 0.5 });
  const silicon = std({ color: c(COL.silicon), roughness: 0.4, metalness: 0.55 });
  const copper = std({ color: c(COL.copper), roughness: 0.32, metalness: 1.0, envMapIntensity: 1.3 });
  const gold = std({ color: c(0xd9b25a), roughness: 0.35, metalness: 1.0, envMapIntensity: 1.2 });
  const camDeck = phys({ color: c(0x0b0c10), roughness: 0.22, metalness: 0.85, envMapIntensity: 1.3, clearcoat: 0.8, clearcoatRoughness: 0.1 });
  const lensBarrel = std({ color: c(0x08090c), roughness: 0.35, metalness: 0.9 });
  const lensRing = phys({ color: c(COL.titanium), roughness: 0.13, metalness: 1.0, envMapIntensity: 1.7, clearcoat: 1.0, clearcoatRoughness: 0.06 });
  const lensGlass = phys({ color: c(0x0b1830), roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.7, envMapIntensity: 2.0, clearcoat: 1 });
  const vapor = phys({ color: c(0x9fa6ae), roughness: 0.24, metalness: 1.0, envMapIntensity: 1.35, clearcoat: 0.35, clearcoatRoughness: 0.2 });
  const graphite = std({ color: c(0x111318), roughness: 0.7, metalness: 0.2 });
  const battery = std({ color: c(0x191b21), roughness: 0.5, metalness: 0.3 });
  const batteryLabel = std({ color: c(COL.orange), roughness: 0.45, metalness: 0.2, emissive: c(COL.orange), emissiveIntensity: 0.12 });
  const plastic = std({ color: c(0x15161c), roughness: 0.6, metalness: 0.1 });
  const mesh = std({ color: c(0x0b0c10), roughness: 0.8, metalness: 0.1 });
  const screw = std({ color: c(0x9aa0aa), roughness: 0.3, metalness: 1.0 });
  const sensorBlue = std({ color: c(0x0a1730), roughness: 0.2, metalness: 0.4, emissive: c(0x123a7a), emissiveIntensity: 0.5 });

  return { glass, rearGlass, display, screen, rearArt, battLabel, pcbArt, coilArt, socTop, shieldArt, vaporArt, grille, deckArt, tab, boot, flash, filmFlex, filmCopper, frame, shield, pcb, soc, memory, storage, pmic, silicon, copper, gold, camDeck, lensBarrel, lensRing, lensGlass, vapor, graphite, battery, batteryLabel, plastic, mesh, screw, sensorBlue };
}

/* =============================================================================
   Generated detail textures — everything is drawn on canvas at init, so the
   model gains photo-real surface detail with zero downloads.
   ========================================================================== */
function buildTextures(THREE) {
  function make(w, h, draw) {
    const cv = document.createElement("canvas"); cv.width = w; cv.height = h;
    draw(cv.getContext("2d"), w, h);
    const t = new THREE.CanvasTexture(cv);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  }
  function rrPath(ctx, x, y, w, h, r) {
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, w, h, r);
    else ctx.rect(x, y, w, h);
  }

  /* Lit AMOLED face: black bezel margin, wallpaper glow, status bar, clock,
     notification pills, lockscreen shortcuts, dock */
  const screen = make(512, 1088, (ctx, w, h) => {
    ctx.fillStyle = "#000"; ctx.fillRect(0, 0, w, h);
    const m = 16, r = 54;
    rrPath(ctx, m, m, w - m * 2, h - m * 2, r); ctx.save(); ctx.clip();
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#060c1a"); g.addColorStop(0.5, "#0b1834"); g.addColorStop(1, "#170a14");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    let rg = ctx.createRadialGradient(w * 0.8, h * 0.28, 10, w * 0.8, h * 0.28, w * 0.8);
    rg.addColorStop(0, "rgba(58,160,255,.5)"); rg.addColorStop(1, "rgba(58,160,255,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    rg = ctx.createRadialGradient(w * 0.18, h * 0.78, 10, w * 0.18, h * 0.78, w * 0.72);
    rg.addColorStop(0, "rgba(255,122,26,.34)"); rg.addColorStop(1, "rgba(255,122,26,0)");
    ctx.fillStyle = rg; ctx.fillRect(0, 0, w, h);
    // status bar
    ctx.fillStyle = "rgba(255,255,255,.8)";
    ctx.font = "600 20px Inter, system-ui, sans-serif"; ctx.textBaseline = "top"; ctx.textAlign = "left";
    ctx.fillText("22:04", 40, 34);
    ctx.fillStyle = "rgba(255,255,255,.75)";
    ctx.fillRect(w - 74, 40, 34, 15);
    ctx.fillRect(w - 38, 44, 4, 7);
    ctx.fillStyle = "#0a1428"; ctx.fillRect(w - 71, 43, 28, 9);
    ctx.fillStyle = "#4ade80"; ctx.fillRect(w - 71, 43, 20, 9);
    // signal bars
    for (let i = 0; i < 4; i++) { ctx.fillStyle = "rgba(255,255,255," + (i < 3 ? .75 : .3) + ")"; ctx.fillRect(w - 122 + i * 9, 52 - i * 4, 6, 4 + i * 4); }
    // clock + date
    ctx.textAlign = "center"; ctx.fillStyle = "rgba(255,255,255,.95)";
    ctx.font = "700 108px Archivo, Inter, sans-serif";
    ctx.fillText("22:04", w / 2, h * 0.13);
    ctx.font = "500 26px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("Thursday, 24 July", w / 2, h * 0.13 + 122);
    // notification pills
    const pills = [["Panglima Gadget", "Your repair is ready for pickup 🎉"], ["Messages", "Boss: nice, the X1 looks great"]];
    pills.forEach((p, i) => {
      const py = h * 0.34 + i * 86;
      ctx.fillStyle = "rgba(16,22,38,.72)"; rrPath(ctx, 44, py, w - 88, 72, 20); ctx.fill();
      ctx.textAlign = "left";
      ctx.font = "700 19px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.85)";
      ctx.fillText(p[0], 66, py + 14);
      ctx.font = "400 18px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.55)";
      ctx.fillText(p[1], 66, py + 40);
    });
    // lockscreen shortcut circles
    for (const sx of [72, w - 72]) {
      ctx.fillStyle = "rgba(20,28,46,.8)";
      ctx.beginPath(); ctx.arc(sx, h * 0.815, 30, 0, 7); ctx.fill();
      ctx.strokeStyle = "rgba(255,255,255,.5)"; ctx.lineWidth = 2.4;
      ctx.beginPath(); ctx.arc(sx, h * 0.815, sx === 72 ? 8 : 11, 0, 7); ctx.stroke();
    }
    // dock icons
    const ds = 62, gap = (w - 4 * ds) / 5, dy = h * 0.885;
    ["#3aa0ff", "#ff7a1a", "#4ade80", "#e05a68"].forEach((col2, i) => {
      const dx = gap + i * (ds + gap);
      ctx.fillStyle = col2; rrPath(ctx, dx, dy, ds, ds, 16); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.22)"; rrPath(ctx, dx, dy, ds, ds / 2, 16); ctx.fill();
    });
    ctx.restore();
  });

  /* Rear glass underside print: gradient, sheen, wordmark, regulatory row */
  const rear = make(512, 1056, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w * 0.7, h);
    g.addColorStop(0, "#14161d"); g.addColorStop(0.55, "#0b0c11"); g.addColorStop(1, "#0f1017");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    const s = ctx.createLinearGradient(0, 0, w, h * 0.45);
    s.addColorStop(0, "rgba(255,255,255,.06)"); s.addColorStop(0.6, "rgba(255,255,255,0)");
    ctx.fillStyle = s; ctx.fillRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.font = "700 40px Archivo, Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.42)";
    ctx.fillText("P A N G L I M A", w / 2, h * 0.60);
    ctx.font = "600 24px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.fillText("X 1", w / 2, h * 0.60 + 40);
    // generic regulatory pictogram row (brand-neutral)
    const ry = h * 0.905; ctx.strokeStyle = "rgba(255,255,255,.3)"; ctx.lineWidth = 2;
    // recycle triangle
    ctx.beginPath(); ctx.moveTo(w / 2 - 96, ry + 18); ctx.lineTo(w / 2 - 78, ry - 12); ctx.lineTo(w / 2 - 60, ry + 18); ctx.closePath(); ctx.stroke();
    // crossed-out bin
    ctx.strokeRect(w / 2 - 26, ry - 8, 22, 26); ctx.beginPath(); ctx.moveTo(w / 2 - 32, ry + 24); ctx.lineTo(w / 2 + 2, ry - 14); ctx.stroke();
    // cert box
    ctx.strokeRect(w / 2 + 30, ry - 8, 34, 26);
    ctx.font = "600 15px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.fillText("X1", w / 2 + 47, ry - 2);
    ctx.font = "400 13px Inter, sans-serif";
    ctx.fillStyle = "rgba(255,255,255,.2)";
    ctx.fillText("Designed for Panglima Gadget · Model PGX1-2026", w / 2, h * 0.955);
  });

  /* Battery pouch label: title, specs, safety row, barcode */
  const battery = make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#191b21"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#22252d"; rrPath(ctx, 26, 30, w - 52, h - 60, 18); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.font = "700 30px Archivo, Inter, sans-serif";
    ctx.fillText("PANGLIMA X1 BATTERY", 48, 56);
    ctx.font = "500 20px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.6)";
    /* Single rectangular cell, and deliberately no capacity/energy figure —
       the X1 is an illustrative model, not a spec sheet for a real device. */
    ctx.fillText("Single-cell Li-ion polymer", 48, 110);
    ctx.fillText("Rechargeable  ·  Model PGX1-B1", 48, 142);
    ctx.strokeStyle = "rgba(255,180,64,.8)"; ctx.lineWidth = 3;
    for (let i = 0; i < 3; i++) {
      const x = 52 + i * 64;
      ctx.beginPath(); ctx.moveTo(x + 22, 196); ctx.lineTo(x + 44, 234); ctx.lineTo(x, 234); ctx.closePath(); ctx.stroke();
      ctx.fillStyle = "rgba(255,180,64,.8)"; ctx.fillRect(x + 20, 208, 4, 12); ctx.fillRect(x + 20, 224, 4, 4);
    }
    ctx.font = "400 14px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.42)";
    ctx.fillText("Do not puncture, crush, or expose to heat.", 48, 258);
    ctx.fillText("Replace only with a compatible battery.", 48, 280);
    let x = 48;
    while (x < w - 100) {
      const bw = 2 + Math.random() * 6;
      ctx.fillStyle = "rgba(235,238,244," + (Math.random() > 0.4 ? 0.85 : 0) + ")";
      ctx.fillRect(x, h - 150, bw, 74);
      x += bw + 2;
    }
    ctx.font = "400 15px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.fillText("S/N PGX1 2026 07 24 0001", 48, h - 64);
  });

  /* PCB: solder-mask green with structured routing — bus bundles, via arrays,
     IC footprints with pin rows, gold edge fingers, silkscreen */
  const pcb = make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#0d2b25"; ctx.fillRect(0, 0, w, h);
    // parallel bus bundles with 45° bends
    for (let b = 0; b < 5; b++) {
      const y0 = 40 + b * 95, n = 5;
      for (let i = 0; i < n; i++) {
        ctx.strokeStyle = "rgba(202,165,87," + (0.35 + 0.3 * Math.random()) + ")";
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        const y = y0 + i * 6;
        ctx.moveTo(0, y);
        ctx.lineTo(w * 0.35 - i * 6, y);
        ctx.lineTo(w * 0.5 - i * 6, y + 60);
        ctx.lineTo(w, y + 60);
        ctx.stroke();
      }
    }
    // via arrays
    for (let c = 0; c < 8; c++) {
      const cx = 30 + Math.random() * (w - 60), cy = 30 + Math.random() * (h - 60);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = "rgba(202,165,87,.8)";
        ctx.beginPath(); ctx.arc(cx + (i % 3) * 9, cy + ((i / 3) | 0) * 9, 2.4, 0, 7); ctx.fill();
        ctx.fillStyle = "#0d2b25";
        ctx.beginPath(); ctx.arc(cx + (i % 3) * 9, cy + ((i / 3) | 0) * 9, 1.0, 0, 7); ctx.fill();
      }
    }
    // IC footprints with pin rows
    for (let f = 0; f < 4; f++) {
      const fx = 40 + Math.random() * (w - 160), fy = 40 + Math.random() * (h - 140), fw = 60 + Math.random() * 50, fh = 40 + Math.random() * 40;
      ctx.strokeStyle = "rgba(255,255,255,.45)"; ctx.lineWidth = 1.6;
      ctx.strokeRect(fx, fy, fw, fh);
      ctx.fillStyle = "rgba(202,165,87,.85)";
      for (let px = fx + 5; px < fx + fw - 4; px += 7) { ctx.fillRect(px, fy - 5, 3.4, 4); ctx.fillRect(px, fy + fh + 1, 3.4, 4); }
    }
    // gold edge connector fingers
    for (let px = 14; px < w - 14; px += 16) {
      ctx.fillStyle = "rgba(217,178,90,.9)"; ctx.fillRect(px, h - 12, 9, 10);
    }
    ctx.font = "600 16px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.fillText("PGX1-MB REV 2.1", 26, h - 34);
    ctx.fillText("◉", w - 40, 22);
  });

  /* SoC die: silicon top with laser markings */
  const soc = make(128, 128, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#23262e"); g.addColorStop(.5, "#161920"); g.addColorStop(1, "#20232b");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = "rgba(255,255,255,.14)"; ctx.lineWidth = 1;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    ctx.font = "700 17px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.7)";
    ctx.fillText("PANGLIMA", w / 2, 30);
    ctx.font = "600 15px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("PX1 · 4 nm", w / 2, 54);
    ctx.font = "400 11px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.4)";
    ctx.fillText("A2607 2ND26", w / 2, 78);
    // corner polarity dot
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(20, h - 20, 4, 0, 7); ctx.fill();
  });

  /* EMI shield can: brushed tin with laser etch + datamatrix */
  const shield = make(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#b9bfc8"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = "rgba(255,255,255," + (Math.random() * 0.09) + ")"; ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = "rgba(70,76,88," + (Math.random() * 0.10) + ")"; ctx.fillRect(0, y + 1, w, 1);
    }
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.font = "600 15px Inter, sans-serif"; ctx.fillStyle = "rgba(60,66,78,.75)";
    ctx.fillText("PGX1-EMI-01", 18, 18);
    ctx.font = "400 12px Inter, sans-serif"; ctx.fillStyle = "rgba(60,66,78,.6)";
    ctx.fillText("SPTE 0.15", 18, 40);
    // datamatrix square
    for (let i = 0; i < 100; i++) {
      if (Math.random() > 0.5) continue;
      ctx.fillStyle = "rgba(50,56,68,.8)";
      ctx.fillRect(w - 66 + (i % 10) * 4.4, 18 + ((i / 10) | 0) * 4.4, 3.6, 3.6);
    }
    // test points
    for (const [tx, ty] of [[40, h - 40], [w - 44, h - 36]]) {
      ctx.fillStyle = "rgba(217,178,90,.9)"; ctx.beginPath(); ctx.arc(tx, ty, 7, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(120,96,40,.9)"; ctx.beginPath(); ctx.arc(tx, ty, 2.6, 0, 7); ctx.fill();
    }
  });

  /* LEGACY — no longer applied to any part. The X1 cools with graphite film,
     not a vapour chamber, so these stamped channels would misrepresent it.
     Kept only so the texture/material tables keep their shape. */
  const vapor = make(256, 512, (ctx, w, h) => {
    ctx.fillStyle = "#a8aeb6"; ctx.fillRect(0, 0, w, h);
    // brushed vertical grain
    for (let x = 0; x < w; x += 2) {
      ctx.fillStyle = "rgba(255,255,255," + (Math.random() * 0.07) + ")"; ctx.fillRect(x, 0, 1, h);
      ctx.fillStyle = "rgba(90,96,106," + (Math.random() * 0.08) + ")"; ctx.fillRect(x + 1, 0, 1, h);
    }
    // serpentine channel (stamped depression)
    ctx.strokeStyle = "rgba(96,102,112,.55)"; ctx.lineWidth = 10; ctx.lineCap = "round";
    ctx.beginPath();
    let dir = 1;
    for (let y = 46; y < h - 40; y += 56) {
      if (dir > 0) { ctx.moveTo(34, y); ctx.lineTo(w - 34, y); ctx.arc(w - 34, y + 28, 28, -Math.PI / 2, Math.PI / 2); }
      else { ctx.lineTo(34, y); ctx.arc(34, y + 28, 28, -Math.PI / 2, Math.PI / 2, true); }
      dir = -dir;
    }
    ctx.stroke();
    ctx.strokeStyle = "rgba(230,234,240,.5)"; ctx.lineWidth = 3;
    ctx.stroke();
    // spot-weld dot grid
    for (let gy = 40; gy < h - 30; gy += 34) for (let gx = 28; gx < w - 20; gx += 34) {
      ctx.fillStyle = "rgba(120,126,136,.5)";
      ctx.beginPath(); ctx.arc(gx, gy, 3.4, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(235,238,244,.4)";
      ctx.beginPath(); ctx.arc(gx - 1, gy - 1, 1.2, 0, 7); ctx.fill();
    }
    ctx.font = "600 13px Inter, sans-serif"; ctx.fillStyle = "rgba(80,86,96,.8)";
    ctx.textAlign = "left"; ctx.fillText("VC-PGX1 CU 0.35", 18, h - 24);
  });

  /* Speaker grille dot matrix (transparent backing) */
  const grille = make(128, 96, (ctx, w, h) => {
    ctx.fillStyle = "#101116"; ctx.fillRect(0, 0, w, h);
    for (let gy = 6; gy < h - 3; gy += 9) for (let gx = 6 + (gy % 18 ? 4 : 0); gx < w - 3; gx += 9) {
      ctx.fillStyle = "#000309";
      ctx.beginPath(); ctx.arc(gx, gy, 2.6, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,.10)";
      ctx.beginPath(); ctx.arc(gx - 0.8, gy - 0.8, 0.9, 0, 7); ctx.fill();
    }
  });

  /* Camera deck rear: laser microtext */
  const deck = make(256, 384, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    ctx.textAlign = "center";
    ctx.font = "600 15px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.4)";
    ctx.fillText("PANGLIMA OPTICS", w / 2, 40);
    ctx.font = "400 12px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.fillText("50 MP · OIS · f/1.7", w / 2, 62);
    ctx.fillText("ULTRA 0.6× · TELE 3×", w / 2, h - 30);
  });

  /* Wireless coil: copper spiral + NFC loop on a ferrite pad */
  const coil = make(256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    // ferrite pad backing
    ctx.fillStyle = "#26282e"; rrPath(ctx, 8, 8, w - 16, h - 16, 26); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.04)"; rrPath(ctx, 8, 8, w - 16, 40, 26); ctx.fill();
    const cx = w / 2, cy = h / 2;
    // outer NFC loop traces
    ctx.strokeStyle = "#9a6428"; ctx.lineWidth = 2.6;
    for (const inset of [16, 22]) { rrPath(ctx, inset, inset, w - inset * 2, h - inset * 2, 22); ctx.stroke(); }
    // charging spiral
    for (let r = 96; r > 30; r -= 6) {
      ctx.strokeStyle = r % 12 ? "#c9772f" : "#a95f22";
      ctx.lineWidth = 3.4;
      ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.stroke();
    }
    // lead-out track + solder pads
    ctx.strokeStyle = "#c9772f"; ctx.lineWidth = 5;
    ctx.beginPath(); ctx.moveTo(cx, cy + 30); ctx.lineTo(cx, h - 14); ctx.stroke();
    ctx.fillStyle = "#d9b25a"; ctx.fillRect(cx - 14, h - 24, 12, 14); ctx.fillRect(cx + 2, h - 24, 12, 14);
  });

  return { screen, rear, battery, pcb, soc, shield, vapor, grille, deck, coil };
}

function radialTexture(THREE, color) {
  const s = 128;
  const cv = document.createElement("canvas"); cv.width = cv.height = s;
  const ctx = cv.getContext("2d");
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  const col = new THREE.Color(color);
  const rgb = Math.round(col.r * 255) + "," + Math.round(col.g * 255) + "," + Math.round(col.b * 255);
  g.addColorStop(0, "rgba(" + rgb + ",0.55)");
  g.addColorStop(0.4, "rgba(" + rgb + ",0.18)");
  g.addColorStop(1, "rgba(" + rgb + ",0)");
  ctx.fillStyle = g; ctx.fillRect(0, 0, s, s);
  const tex = new THREE.CanvasTexture(cv); tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
