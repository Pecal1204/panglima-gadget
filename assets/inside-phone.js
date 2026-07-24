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
  const key = new THREE.DirectionalLight(0xbcd8ff, 2.1); key.position.set(-4, 6, 6); scene.add(key);
  const rim = new THREE.DirectionalLight(new THREE.Color(COL.orange), 1.5); rim.position.set(5, -3, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x8fb4ff, 0.5); fill.position.set(3, 1, 5); scene.add(fill);
  scene.add(new THREE.AmbientLight(0x2a3140, 0.5));

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
  const seg = LOD ? 5 : 2;                  // curve segments for rounded shapes

  const M = buildMaterials(THREE, COL, LOD);
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
    components.push({ id: def.id, group: g, cardId: def.cardId, index: def.index, name: def.name, home: def.home.clone(), exp: def.exp.clone(), t0: def.t0, t1: def.t1, base });
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
  function plate(w, h, d, r) {
    const key = "p" + [w, h, d, r].join("_");
    if (!geomCache[key]) {
      const g = new THREE.ExtrudeGeometry(rrShape(w, h, r), { depth: d, bevelEnabled: false, curveSegments: seg });
      g.translate(0, 0, -d / 2); g.computeVertexNormals();
      geomCache[key] = g;
    }
    return geomCache[key];
  }
  function mesh(geo, mat) { return new THREE.Mesh(geo, mat); }
  function box(w, h, d) { const k = "b" + [w, h, d].join("_"); if (!geomCache[k]) geomCache[k] = new THREE.BoxGeometry(w, h, d); return geomCache[k]; }
  function cyl(r, h, s) { const k = "c" + [r, h, s].join("_"); if (!geomCache[k]) geomCache[k] = new THREE.CylinderGeometry(r, r, h, s); return geomCache[k]; }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* ---------- 1. FRONT GLASS ---------- */
  addComponent({
    id: "frontGlass", name: "Front Glass", cardId: null, index: null,
    home: V(0, 0, 0.082), exp: V(0, 0, 1.78), t0: 0.40, t1: 0.48,
    build: g => { g.add(mesh(plate(HW * 2, HH * 2, 0.02, 0.28), M.glass)); }
  });

  /* ---------- 2. OLED DISPLAY + DIGITIZER ---------- */
  addComponent({
    id: "display", name: "OLED Display & Touch Digitizer", cardId: "display", index: TOUR.indexOf("display"),
    home: V(0, 0, 0.060), exp: V(0, 0, 1.34), t0: 0.38, t1: 0.46,
    build: g => {
      g.add(mesh(plate(HW * 2 - 0.06, HH * 2 - 0.06, 0.02, 0.25), M.display));
      // punch-hole hint handled by selfie cam; add a thin digitizer film behind
      const film = mesh(plate(HW * 2 - 0.08, HH * 2 - 0.08, 0.008, 0.24), M.filmFlex);
      film.position.z = -0.02; g.add(film);
    }
  });

  /* ---------- 3. FRONT SENSORS: earpiece / proximity / ambient / selfie ---------- */
  addComponent({
    id: "earpiece", name: "Earpiece Speaker", cardId: "earpiece", index: TOUR.indexOf("earpiece"),
    home: V(0, 1.34, 0.05), exp: V(-0.28, 1.34, 1.06), t0: 0.36, t1: 0.5,
    build: g => { const m = mesh(box(0.34, 0.05, 0.05), M.mesh); g.add(m); }
  });
  addComponent({
    id: "proximity", name: "Proximity Sensor", cardId: "proximity", index: TOUR.indexOf("proximity"),
    home: V(0.26, 1.33, 0.05), exp: V(0.30, 1.33, 1.06), t0: 0.36, t1: 0.5,
    build: g => {
      g.add(mesh(box(0.07, 0.07, 0.04), M.plastic));
      const led = mesh(box(0.03, 0.03, 0.045), M.sensorBlue); led.position.z = 0.005; g.add(led);
    }
  });
  addComponent({
    id: "selfie", name: "Front Selfie Camera", cardId: null, index: null,
    home: V(0, 1.16, 0.05), exp: V(0.02, 1.16, 1.06), t0: 0.36, t1: 0.5,
    build: g => {
      g.add(mesh(cyl(0.05, 0.06, LOD ? 20 : 10), M.lensBarrel).rotateX(Math.PI / 2));
      const l = mesh(cyl(0.032, 0.02, LOD ? 20 : 10), M.lensGlass); l.rotation.x = Math.PI / 2; l.position.z = 0.03; g.add(l);
    }
  });

  /* ---------- 4. MID-FRAME (aluminium/titanium ring) ---------- */
  addComponent({
    id: "frame", name: "Aluminium / Titanium Mid-Frame", cardId: null, index: null,
    home: V(0, 0, 0), exp: V(0, 0, 0.72), t0: 0.34, t1: 0.42,
    build: g => {
      const outer = rrShape(HW * 2, HH * 2, 0.28);
      const inner = rrShape(HW * 2 - 0.14, HH * 2 - 0.14, 0.22);
      outer.holes.push(new THREE.Path(inner.getPoints(seg * 4)));
      const geo = new THREE.ExtrudeGeometry(outer, { depth: 0.17, bevelEnabled: false, curveSegments: seg });
      geo.translate(0, 0, -0.085); geo.computeVertexNormals();
      g.add(mesh(geo, M.frame));
      // antenna bands (top/bottom) as thin plastic insets — slightly shallower
      // than the frame so the caps never sit coplanar (z-fighting)
      const a1 = mesh(box(HW * 2, 0.05, 0.15), M.plastic); a1.position.y = HH - 0.2; g.add(a1);
      const a2 = mesh(box(HW * 2, 0.05, 0.15), M.plastic); a2.position.y = -HH + 0.2; g.add(a2);
    }
  });

  /* ---------- 5. CELLULAR / WIFI / BT ANTENNAS ---------- */
  addComponent({
    id: "antennas", name: "Cellular, Wi-Fi & Bluetooth Antennas", cardId: null, index: null,
    home: V(0, -HH + 0.12, -0.01), exp: V(0.0, -HH + 0.12, 0.42), t0: 0.34, t1: 0.5,
    build: g => {
      // bottom antenna flex; the top band is modelled on the frame
      g.add(mesh(plate(HW * 2 - 0.2, 0.16, 0.006, 0.03), M.filmCopper));
    }
  });

  /* ---------- 6. EMI SHIELDS ---------- */
  addComponent({
    id: "shield", name: "Protective Shields & Brackets", cardId: null, index: null,
    home: V(0, 0.62, -0.018), exp: V(0, 0.62, 0.42), t0: 0.30, t1: 0.38,
    build: g => {
      const s1 = mesh(plate(HW * 1.5, 0.9, 0.01, 0.06), M.shield); g.add(s1);
      // bracket screws
      for (const [x, y] of [[-0.42, 0.34], [0.42, 0.34], [-0.42, -0.34], [0.42, -0.34]]) {
        const sc = mesh(cyl(0.026, 0.02, LOD ? 12 : 6), M.screw); sc.rotation.x = Math.PI / 2; sc.position.set(x, y, 0.01); g.add(sc);
      }
    }
  });

  /* ---------- 7. MOTHERBOARD (+ SoC, memory, storage, PMIC) ---------- */
  addComponent({
    id: "motherboard", name: "Main Motherboard", cardId: "motherboard", index: TOUR.indexOf("motherboard"),
    home: V(0, 0.62, -0.034), exp: V(0, 0.62, 0.12), t0: 0.28, t1: 0.37,
    build: g => {
      g.add(mesh(plate(HW * 1.55, 0.92, 0.028, 0.06), M.pcb));
      // low-profile packages so the assembled stack stays clear of the
      // cooling layers and rear glass behind the board
      const chip = (w, h, x, y, mat, d) => { const c = mesh(box(w, h, d || 0.024), mat); c.position.set(x, y, -0.022); g.add(c); };
      chip(0.30, 0.30, -0.18, 0.16, M.soc, 0.03);       // processor package (SoC)
      const soCap = mesh(box(0.18, 0.18, 0.014), M.memory); soCap.position.set(-0.18, 0.16, -0.044); g.add(soCap); // stacked memory (PoP)
      chip(0.22, 0.16, 0.24, 0.20, M.storage);          // storage chip
      chip(0.14, 0.14, 0.26, -0.10, M.pmic);            // power-management chip
      chip(0.12, 0.10, -0.30, -0.18, M.silicon);        // misc IC
      // copper connectors / traces
      for (const [x, y] of [[-0.5, 0.34], [0.5, -0.3], [0, -0.38]]) { const t = mesh(box(0.06, 0.04, 0.02), M.copper); t.position.set(x, y, -0.02); g.add(t); }
    }
  });

  /* ---------- 8. REAR CAMERA SYSTEM (wide / ultra-wide / tele + OIS) ---------- */
  addComponent({
    id: "camera", name: "Main Camera System", cardId: "camera", index: TOUR.indexOf("camera"),
    home: V(-0.34, 1.02, -0.05), exp: V(-0.42, 1.06, -0.22), t0: 0.32, t1: 0.42,
    build: g => {
      const deck = mesh(plate(0.62, 0.62, 0.05, 0.14), M.camDeck); g.add(deck);
      const lens = (x, y, r, label) => {
        const barrel = mesh(cyl(r + 0.02, 0.10, LOD ? 24 : 12), M.lensBarrel); barrel.rotation.x = Math.PI / 2; barrel.position.set(x, y, -0.06); g.add(barrel);
        const ring = mesh(cyl(r + 0.03, 0.02, LOD ? 24 : 12), M.lensRing); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, -0.11); g.add(ring);
        const glass = mesh(cyl(r, 0.03, LOD ? 24 : 12), M.lensGlass); glass.rotation.x = Math.PI / 2; glass.position.set(x, y, -0.12); g.add(glass);
      };
      lens(-0.13, 0.13, 0.115);   // main wide
      lens(0.13, 0.13, 0.09);     // ultra-wide
      lens(0, -0.14, 0.10);       // telephoto
      // OIS block behind main
      const ois = mesh(box(0.16, 0.16, 0.05), M.silicon); ois.position.set(-0.13, 0.13, 0.0); g.add(ois);
    }
  });

  /* ---------- 9. VAPOR CHAMBER + GRAPHITE COOLING ---------- */
  addComponent({
    id: "cooling", name: "Vapor Chamber & Graphite Cooling", cardId: "cooling", index: TOUR.indexOf("cooling"),
    home: V(0, 0.15, -0.062), exp: V(0, 0.15, -0.02), t0: 0.24, t1: 0.31,
    build: g => {
      const vapor = mesh(plate(HW * 1.3, HH * 1.05, 0.008, 0.1), M.vapor); g.add(vapor);
      const graph = mesh(plate(HW * 1.4, HH * 1.1, 0.004, 0.12), M.graphite); graph.position.z = -0.007; g.add(graph);
    }
  });

  /* ---------- 10. DUAL-CELL BATTERY (+ protection board) ---------- */
  addComponent({
    id: "battery", name: "Battery", cardId: "battery", index: TOUR.indexOf("battery"),
    home: V(0, -0.2, -0.03), exp: V(0, -0.2, -0.42), t0: 0.26, t1: 0.34,
    build: g => {
      const cellA = mesh(plate(HW * 1.5, 0.86, 0.055, 0.08), M.battery); cellA.position.y = 0.46; g.add(cellA);
      const cellB = mesh(plate(HW * 1.5, 0.86, 0.055, 0.08), M.battery); cellB.position.y = -0.46; g.add(cellB);
      // orange label band
      const label = mesh(plate(HW * 1.5, 0.24, 0.056, 0.04), M.batteryLabel); label.position.y = 0; g.add(label);
      // protection board + connector
      const bms = mesh(box(0.34, 0.08, 0.03), M.pcb); bms.position.set(0, 0.92, 0.0); g.add(bms);
      const conn = mesh(box(0.1, 0.05, 0.03), M.copper); conn.position.set(0.14, 0.96, 0.01); g.add(conn);
    }
  });

  /* ---------- 11. WIRELESS-CHARGING + NFC COIL ---------- */
  addComponent({
    id: "wireless", name: "Wireless Charging & NFC Coil", cardId: "wireless", index: TOUR.indexOf("wireless"),
    home: V(0, -0.05, -0.065), exp: V(0, -0.05, -1.28), t0: 0.20, t1: 0.28,
    build: g => {
      // slim film coil, adhered flat between battery and rear glass
      const coil = mesh(new THREE.TorusGeometry(0.34, 0.022, LOD ? 14 : 8, LOD ? 48 : 24), M.copper); g.add(coil);
      const inner = mesh(new THREE.TorusGeometry(0.24, 0.02, LOD ? 14 : 8, LOD ? 40 : 20), M.copper); g.add(inner);
      const nfc = mesh(plate(HW * 1.4, HH * 1.1, 0.004, 0.12), M.filmCopper); nfc.position.z = -0.004; g.add(nfc);
    }
  });

  /* ---------- 12. BOTTOM SUB-BOARD: charging port, daughterboard, mics ---------- */
  addComponent({
    id: "chargingport", name: "Charging Port", cardId: "chargingport", index: TOUR.indexOf("chargingport"),
    home: V(0, -1.36, -0.02), exp: V(0, -1.42, -0.75), t0: 0.36, t1: 0.46,
    build: g => {
      const daughter = mesh(plate(HW * 1.5, 0.34, 0.022, 0.05), M.pcb); g.add(daughter);
      // USB-C style port shell
      const shell = mesh(box(0.2, 0.09, 0.12), M.frame); shell.position.set(0, -0.12, 0.02); g.add(shell);
      const hole = mesh(box(0.15, 0.05, 0.13), M.silicon); hole.position.set(0, -0.12, 0.03); g.add(hole);
    }
  });
  addComponent({
    id: "loudspeaker", name: "Bottom Loudspeaker / Buzzer", cardId: "loudspeaker", index: TOUR.indexOf("loudspeaker"),
    home: V(0.34, -1.18, -0.03), exp: V(0.5, -1.2, -0.95), t0: 0.36, t1: 0.5,
    build: g => {
      const body = mesh(box(0.34, 0.22, 0.1), M.plastic); g.add(body);
      const grille = mesh(box(0.28, 0.16, 0.02), M.mesh); grille.position.z = 0.06; g.add(grille);
    }
  });
  addComponent({
    id: "haptic", name: "Haptic / Vibration Motor", cardId: "haptic", index: TOUR.indexOf("haptic"),
    home: V(-0.3, -1.16, -0.03), exp: V(-0.5, -1.2, -0.95), t0: 0.36, t1: 0.5,
    build: g => {
      const body = mesh(box(0.3, 0.18, 0.09), M.frame); g.add(body);
      const coil = mesh(cyl(0.06, 0.05, LOD ? 18 : 9), M.copper); coil.rotation.z = Math.PI / 2; coil.position.z = 0.02; g.add(coil);
    }
  });
  addComponent({
    id: "microphones", name: "Microphones", cardId: "microphones", index: TOUR.indexOf("microphones"),
    home: V(0, -1.47, -0.01), exp: V(-0.15, -1.5, -0.95), t0: 0.36, t1: 0.5,
    build: g => {
      const m1 = mesh(box(0.05, 0.05, 0.04), M.plastic); m1.position.x = -0.2; g.add(m1);
      const m2 = mesh(box(0.05, 0.05, 0.04), M.plastic); m2.position.x = 0.2; g.add(m2);
    }
  });

  /* ---------- 13. SIM / eSIM MODULE ---------- */
  addComponent({
    id: "sim", name: "SIM / eSIM Module", cardId: null, index: null,
    home: V(-0.66, -0.2, 0), exp: V(-1.0, -0.2, 0.42), t0: 0.34, t1: 0.5,
    build: g => {
      const tray = mesh(box(0.06, 0.34, 0.09), M.frame); g.add(tray);
      const chip = mesh(box(0.05, 0.12, 0.02), M.gold); chip.position.z = 0.05; g.add(chip);
    }
  });

  /* ---------- 14. BIOMETRIC SENSOR (under-display) ---------- */
  addComponent({
    id: "biometric", name: "Under-display Biometric Sensor", cardId: null, index: null,
    home: V(0, -0.7, 0.03), exp: V(0.15, -0.7, 1.06), t0: 0.36, t1: 0.5,
    build: g => { const s = mesh(cyl(0.13, 0.02, LOD ? 24 : 10), M.sensorBlue); s.rotation.x = Math.PI / 2; g.add(s); }
  });

  /* ---------- 15. REAR GLASS ---------- */
  addComponent({
    id: "rearGlass", name: "Rear Glass", cardId: null, index: null,
    home: V(0, 0, -0.082), exp: V(0, 0, -1.78), t0: 0.16, t1: 0.24,
    build: g => {
      const back = mesh(plate(HW * 2, HH * 2, 0.02, 0.28), M.rearGlass); g.add(back);
      // camera bump ring on rear glass (top-left)
      const bump = mesh(plate(0.66, 0.66, 0.03, 0.16), M.rearGlass); bump.position.set(-0.34, 1.02, -0.02); g.add(bump);
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
  const P = {
    revealEnd: 0.10,
    explodeStart: 0.10, explodeEnd: 0.50,
    tourStart: 0.52, tourEnd: 0.90,
    overviewStart: 0.90
  };

  let progress = 0;          // 0..1 scroll progress
  let userYaw = 0, userPitch = 0;   // drag offsets
  let idleYaw = 0, spinYaw = 0;     // spinYaw accumulates during the overview
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
    const a = smooth(0, 0.05, p);
    const b = smooth(0.05, 0.12, p);
    let yaw = lerp(0, -1.30, a);
    yaw = lerp(yaw, -0.62, b);
    const pitch = lerp(0, -0.30, smooth(0.03, 0.14, p));

    /* explode scale so the tall stack stays framed */
    const e = smooth(P.explodeStart, P.explodeEnd, p);
    let sc = lerp(1.0, 0.60, e);

    /* idle life before scrolling / slow spin in overview (dt-accumulated so
       entering the overview or grabbing the model never snaps rotation) */
    if (p > P.overviewStart && !dragging) spinYaw += dt * 0.12;
    idleYaw = (p < 0.02 ? Math.sin(time * 0.6) * 0.04 : 0) + spinYaw;

    root.rotation.set(pitch + userPitch, yaw + userYaw + idleYaw, 0);

    /* --- per-component explosion --- */
    for (const c of components) {
      const t = smooth(c.t0, c.t1, p);
      tmpV.copy(c.home).lerp(c.exp, easeIO(t));
      c.group.position.copy(tmpV);
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
        // dim by lerping colour toward graphite + cutting reflections + emissive
        b2.mat.color.copy(b2.color).lerp(DIM_COL, dim * 0.8);
        if (b2.mat.envMapIntensity != null) b2.mat.envMapIntensity = b2.env * (1 - dim * 0.7);
        if (b2.emi) {
          b2.mat.emissive.copy(b2.emi).multiplyScalar(1 - dim * 0.85);
          if (isActive) b2.mat.emissive.lerp(BLUE_EMI, 0.6);
        }
      }
    }

    /* group offset so the active part isn't hidden behind the card;
       on mobile also shrink slightly so more of the model clears the sheet */
    const shift = inTour ? 1 : 0;
    if (mq.matches) {
      root.position.set(0, lerp(0, 0.72, shift), 0);
      sc *= lerp(1, 0.82, shift);
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

  const DIM_COL = new THREE.Color(0x0c0d12);
  const BLUE_EMI = new THREE.Color(COL.blueDeep);

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
      const oy = ((i % 3) - 1) * 16, ox = (i % 2 ? 14 : -14);
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
  function scrollToP(p) {
    const rect = els.scroller.getBoundingClientRect();
    const top = window.scrollY + rect.top;
    const max = els.scroller.offsetHeight - window.innerHeight;
    window.scrollTo({ top: top + p * max, behavior: "smooth" });
  }
  IP.onPick = i => scrollToP(P.tourStart + (i + 0.5) / tourComps.length * (P.tourEnd - P.tourStart));
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
function buildMaterials(THREE, COL, LOD) {
  const std = (o) => new THREE.MeshStandardMaterial(o);
  const phys = (o) => new THREE.MeshPhysicalMaterial(o);
  const c = (x) => new THREE.Color(x);

  // No transmission: it forces three.js into an extra full-scene render pass
  // per frame for marginal visual gain on this dark scene. Plain transparency
  // + clearcoat reads as glass at a fraction of the GPU cost.
  const glass = phys({
    color: c(COL.glassTint), metalness: 0.0, roughness: 0.06,
    transparent: true, opacity: 0.34, envMapIntensity: 1.6, clearcoat: 1, clearcoatRoughness: 0.05
  });
  const rearGlass = phys({
    color: c(0x0a0b10), metalness: 0.2, roughness: 0.12,
    transparent: true, opacity: 0.7, envMapIntensity: 1.5, clearcoat: 1, clearcoatRoughness: 0.08
  });
  const display = std({ color: c(0x04060c), roughness: 0.22, metalness: 0.1, emissive: c(0x0a1a38), emissiveIntensity: 0.8, envMapIntensity: 1.2 });
  const filmFlex = std({ color: c(0x14100c), roughness: 0.6, metalness: 0.2 });
  const filmCopper = std({ color: c(0x7a4a20), roughness: 0.55, metalness: 0.8, envMapIntensity: 0.9 });
  const frame = std({ color: c(COL.aluminium), roughness: 0.28, metalness: 1.0, envMapIntensity: 1.4 });
  const shield = std({ color: c(0xb9bfc8), roughness: 0.35, metalness: 1.0, envMapIntensity: 1.2 });
  const pcb = std({ color: c(COL.pcb), roughness: 0.55, metalness: 0.3 });
  const soc = std({ color: c(0x0c0d12), roughness: 0.35, metalness: 0.6, emissive: c(0x06131f), emissiveIntensity: 0.4 });
  const memory = std({ color: c(0x1a1c22), roughness: 0.4, metalness: 0.5 });
  const storage = std({ color: c(0x101116), roughness: 0.4, metalness: 0.5 });
  const pmic = std({ color: c(0x14151a), roughness: 0.45, metalness: 0.5 });
  const silicon = std({ color: c(COL.silicon), roughness: 0.4, metalness: 0.55 });
  const copper = std({ color: c(COL.copper), roughness: 0.32, metalness: 1.0, envMapIntensity: 1.3 });
  const gold = std({ color: c(0xd9b25a), roughness: 0.35, metalness: 1.0, envMapIntensity: 1.2 });
  const camDeck = std({ color: c(0x0b0c10), roughness: 0.3, metalness: 0.8 });
  const lensBarrel = std({ color: c(0x08090c), roughness: 0.35, metalness: 0.9 });
  const lensRing = std({ color: c(COL.titanium), roughness: 0.25, metalness: 1.0, envMapIntensity: 1.5 });
  const lensGlass = phys({ color: c(0x0b1830), roughness: 0.02, metalness: 0.0, transparent: true, opacity: 0.7, envMapIntensity: 2.0, clearcoat: 1 });
  const vapor = std({ color: c(0x9fa6ae), roughness: 0.3, metalness: 1.0, envMapIntensity: 1.2 });
  const graphite = std({ color: c(0x111318), roughness: 0.7, metalness: 0.2 });
  const battery = std({ color: c(0x191b21), roughness: 0.5, metalness: 0.3 });
  const batteryLabel = std({ color: c(COL.orange), roughness: 0.45, metalness: 0.2, emissive: c(COL.orange), emissiveIntensity: 0.12 });
  const plastic = std({ color: c(0x15161c), roughness: 0.6, metalness: 0.1 });
  const mesh = std({ color: c(0x0b0c10), roughness: 0.8, metalness: 0.1 });
  const screw = std({ color: c(0x9aa0aa), roughness: 0.3, metalness: 1.0 });
  const sensorBlue = std({ color: c(0x0a1730), roughness: 0.2, metalness: 0.4, emissive: c(0x123a7a), emissiveIntensity: 0.5 });

  return { glass, rearGlass, display, filmFlex, filmCopper, frame, shield, pcb, soc, memory, storage, pmic, silicon, copper, gold, camDeck, lensBarrel, lensRing, lensGlass, vapor, graphite, battery, batteryLabel, plastic, mesh, screw, sensorBlue };
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
