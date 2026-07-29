/* =============================================================================
   INSIDE YOUR SMARTPHONE — real-time 3D exploded view  (ES module)
   -----------------------------------------------------------------------------
   Vanilla Three.js (React-Three-Fiber is only a wrapper around this API) so the
   experience drops into the existing static site with no build step.

   • The supplied textured iPhone 11 GLB is the assembled exterior; original procedural PBR geometry powers the exploded internals.
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
  let THREE, RoomEnvironment, GLTFLoader;
  try {
    THREE = await import("three");
    ({ RoomEnvironment } = await import("three/addons/environments/RoomEnvironment.js"));
    ({ GLTFLoader } = await import("three/addons/loaders/GLTFLoader.js"));  } catch (err) {
    console.warn("[inside-phone] three.js failed to load — showing fallback.", err);
    IP.renderFallback("load-error");
    return;
  }
  try {
    run(THREE, RoomEnvironment, GLTFLoader);
  } catch (err) {
    console.error("[inside-phone] init error — showing fallback.", err);
    IP.renderFallback("init-error");
  }
}

/* ========================================================================= */
function run(THREE, RoomEnvironment, GLTFLoader) {
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
  const reportedCores = Number(navigator.hardwareConcurrency);
  const reportedMemory = Number(navigator.deviceMemory);
  const mobileHighQuality = isMobile &&
    Number.isFinite(reportedCores) && reportedCores >= 6 &&
    Number.isFinite(reportedMemory) && reportedMemory >= 4;
  const LOD = (!isMobile || mobileHighQuality) ? 1 : 0;
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

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: !isMobile || mobileHighQuality, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, isMobile ? 1.5 : 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = !isMobile;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(28, 1, 0.1, 100);
  let cameraBaseZ = 7.6;
  camera.position.set(0, 0, cameraBaseZ); // refined per-aspect in resize()

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

  /* Neutral studio light preserves silver, glass and black material separation.
     The restrained red rim ties the technical scene back to Panglima branding. */
  const key = new THREE.DirectionalLight(0xfffbf5, 3.1);
  key.position.set(-4.5, 6.5, 7); key.castShadow = !isMobile;
  if (key.castShadow) {
    key.shadow.mapSize.set(1024, 1024);
    key.shadow.camera.left = key.shadow.camera.bottom = -4;
    key.shadow.camera.right = key.shadow.camera.top = 4;
    key.shadow.bias = -0.00035;
    key.shadow.normalBias = 0.025;
  }
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xff3145, 1.65); rim.position.set(5, -2.5, -4); scene.add(rim);
  const fill = new THREE.DirectionalLight(0x9fbcff, 0.75); fill.position.set(3, 1.5, 5); scene.add(fill);
  const bounce = new THREE.DirectionalLight(0x536079, 0.32); bounce.position.set(-2, -5, 3); scene.add(bounce);
  scene.add(new THREE.AmbientLight(0x29303c, 0.34));

  /* Restrained edge glow plus a soft contact shadow keep the model grounded. */
  const glowTex = radialTexture(THREE, COL.blue);
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, opacity: 0.20, depthWrite: false, blending: THREE.AdditiveBlending }));
  glow.scale.set(7.2, 7.2, 1); glow.position.set(-0.2, 0.1, -3);
  scene.add(glow);
  const contactTex = radialTexture(THREE, 0x000000);
  const contactShadow = new THREE.Sprite(new THREE.SpriteMaterial({ map: contactTex, color: 0x000000, transparent: true, opacity: 0.42, depthWrite: false }));
  contactShadow.scale.set(3.2, 5.0, 1); contactShadow.position.set(0.18, -0.18, -1.35);
  scene.add(contactShadow);

  /* ---- root groups ---- */
  const root = new THREE.Group();          // holds rotation/scale/position
  scene.add(root);
  const phone = new THREE.Group();         // holds the exploded components
  root.add(phone);

  /* Exact supplied exterior. Its real display group detaches first while the
     real frame stays visible, so the teardown feels like one model opening
     rather than a photoreal asset dissolving into a separate diagram. */
  const referenceShell = new THREE.Group();
  referenceShell.name = "Supplied iPhone 11 exterior";
  referenceShell.visible = false;
  root.add(referenceShell);
  const referenceDisplayMaterials = [];
  const referenceBodyMaterials = [];
  let referenceDisplayNode = null;
  let referenceDisplayPivot = null;
  const referenceDisplayBasePos = new THREE.Vector3();
  const referenceDisplayBaseQuat = new THREE.Quaternion();
  const referenceDetachEuler = new THREE.Euler();
  const referenceDetachQuat = new THREE.Quaternion();
  let referenceReady = false;
  let referenceAbandoned = false;
  let loadingSettled = false;

  function hideLoading() {
    loadingSettled = true;
    if (els.loading) els.loading.classList.add("is-hidden");
  }

  function prepareReferenceMaterial(material, bucket) {
    const mat = material.clone();
    const opaque = !(mat.transparent && mat.opacity < 0.98);
    if (opaque && Number.isFinite(mat.roughness)) {
      const floor = (mat.metalness || 0) > 0.25 ? 0.12 : 0.18;
      mat.roughness = clamp(mat.roughness, floor, 0.88);
    }
    if ("envMapIntensity" in mat) {
      mat.envMapIntensity = Math.max((mat.metalness || 0) > 0.35 ? 1.35 : 1.05, mat.envMapIntensity || 0);
    }
    bucket.push({
      mat,
      opacity: mat.opacity,
      transparent: mat.transparent,
      depthWrite: mat.depthWrite
    });
    return mat;
  }

  function setMaterialAlpha(states, alpha) {
    for (const state of states) {
      const transparent = state.transparent || alpha < 0.999;
      if (state.mat.transparent !== transparent) {
        state.mat.transparent = transparent;
        state.mat.needsUpdate = true;
      }
      state.mat.opacity = state.opacity * alpha;
      state.mat.depthWrite = alpha > 0.98 ? state.depthWrite : false;
    }
  }

  function setReferenceAlpha(bodyAlpha, displayAlpha) {
    if (!referenceReady) return;
    displayAlpha = displayAlpha == null ? bodyAlpha : displayAlpha;
    referenceShell.visible = Math.max(bodyAlpha, displayAlpha) > 0.002;
    if (!referenceShell.visible) return;
    setMaterialAlpha(referenceBodyMaterials, bodyAlpha);
    setMaterialAlpha(referenceDisplayMaterials, displayAlpha);
  }

  function updateReferenceDisplay(t) {
    if (!referenceDisplayPivot) return;
    referenceDisplayPivot.position.copy(referenceDisplayBasePos);
    const invScale = 1 / Math.max(referenceShell.scale.x, 0.0001);
    /* The authored GLB faces -z before the wrapper rotation. The pivot sits
       directly under referenceShell, so this movement is now in scene units
       instead of being crushed by anonymous scales deeper in the GLB. */
    referenceDisplayPivot.position.z -= 0.24 * invScale * t;
    referenceDetachEuler.set(-0.06 * t, 0.10 * t, -0.055 * t);
    referenceDetachQuat.setFromEuler(referenceDetachEuler);
    referenceDisplayPivot.quaternion.copy(referenceDisplayBaseQuat).multiply(referenceDetachQuat);
  }

  const referenceLoader = new GLTFLoader();
  const referenceUrl = new URL("./models/iphone-11-reference.glb?v=20260728-outer-inner-r2", import.meta.url).href;
  referenceLoader.load(referenceUrl, gltf => {
    if (referenceAbandoned) return;
    const model = gltf.scene;
    const bounds = new THREE.Box3().setFromObject(model);
    const size = bounds.getSize(new THREE.Vector3());
    const center = bounds.getCenter(new THREE.Vector3());
    model.position.copy(center).multiplyScalar(-1);

    /* This group is the GLB's complete front assembly: screen, bezel, notch
       and front sensors. The supplied file has anonymous Sketchfab names, so
       this verified node id is intentionally isolated here. */
    referenceDisplayNode = model.getObjectByName("aERJJYZUtXikHla") || null;
    const displayNodes = new Set();
    if (referenceDisplayNode) {
      referenceDisplayNode.traverse(o => displayNodes.add(o));
    }

    model.traverse(o => {
      if (!o.isMesh || !o.material) return;
      o.frustumCulled = true;
      if (!o.geometry.getAttribute("normal")) o.geometry.computeVertexNormals();
      const bucket = displayNodes.has(o) ? referenceDisplayMaterials : referenceBodyMaterials;
      if (Array.isArray(o.material)) o.material = o.material.map(mat => prepareReferenceMaterial(mat, bucket));
      else o.material = prepareReferenceMaterial(o.material, bucket);
      const mats = Array.isArray(o.material) ? o.material : [o.material];
      mats.forEach(mat => {
        for (const key of ["map", "normalMap", "roughnessMap", "metalnessMap", "emissiveMap", "alphaMap", "aoMap"]) {
          if (mat[key]) mat[key].anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        }
      });
      const opaque = mats.every(mat => !(mat.transparent && mat.opacity < 0.98));
      o.castShadow = !isMobile && opaque;
      o.receiveShadow = !isMobile && opaque;
    });

    referenceShell.add(model);
    referenceShell.scale.setScalar(3 / size.y);
    /* The GLB stores its front toward -z; rotate it into this scene's +z front. */
    referenceShell.rotation.y = Math.PI;
    if (referenceDisplayNode) {
      referenceDisplayPivot = new THREE.Group();
      referenceDisplayPivot.name = "iPhone 11 exact display pivot";
      referenceShell.add(referenceDisplayPivot);
      referenceShell.updateMatrixWorld(true);
      referenceDisplayPivot.attach(referenceDisplayNode);
      referenceDisplayBasePos.copy(referenceDisplayPivot.position);
      referenceDisplayBaseQuat.copy(referenceDisplayPivot.quaternion);
    } else {
      console.warn("[inside-phone] exact display node was not found; using a shell crossfade without the display lift.");
    }
    referenceReady = true;
    referenceShell.visible = true;
    phone.visible = true;
    hideLoading();
    requestRender();
  }, event => {
    if (!els.loading || !event.total) return;
    const label = els.loading.querySelector(".lt");
    if (label) label.textContent = "Loading iPhone 11 model · " + Math.round(event.loaded / event.total * 100) + "%";
  }, err => {
    if (referenceAbandoned) return;
    console.warn("[inside-phone] supplied iPhone 11 GLB failed to load; using procedural exterior.", err);
    referenceReady = false;
    phone.visible = true;
    setPhoneAlpha(1);
    hideLoading();
    requestRender();
  });
  /* ======================================================================
     PHONE GEOMETRY  — mechanically layered stack (front +z … back -z)
     iPhone 11 reference proportions: 150.9 x 75.7 x 8.3 mm. Local units: width 1.505 (x ±0.7525), height 3.0 (y ±1.5), with z exaggerated slightly so the rail and individual layers remain legible.
     ==================================================================== */
  const HW = 0.7525, HH = 1.5;
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
    // Clone each mesh's material so dim/highlight/fade is isolated per part.
    const base = [];
    g.traverse(o => {
      if (o.isMesh && o.material && o.material.color) {
        o.material = o.material.clone();
        o.castShadow = !isMobile && !(o.material.transparent && o.material.opacity < 0.98);
        o.receiveShadow = !isMobile && !(o.material.transparent && o.material.opacity < 0.98);
        base.push({
          mesh: o,
          castShadow: o.castShadow,
          receiveShadow: o.receiveShadow,
          mat: o.material,
          color: o.material.color.clone(),
          emi: (o.material.emissive ? o.material.emissive.clone() : null),
          env: o.material.envMapIntensity != null ? o.material.envMapIntensity : 1,
          opacity: o.material.opacity,
          transparent: o.material.transparent,
          depthWrite: o.material.depthWrite
        });
        if (def.cardId) { o.userData.cardId = def.cardId; o.userData.cIndex = def.index; clickable.push(o); }
      }
    });
    const dz = def.exp.z - def.home.z;
    const lift = def.lift ? def.lift.clone() : new THREE.Vector3(0, 0, Math.sign(dz || 1) * Math.min(0.24, Math.abs(dz) * 0.18));
    components.push({
      id: def.id, group: g, cardId: def.cardId, index: def.index, name: def.name,
      home: def.home.clone(), exp: def.exp.clone(), expMobile: (def.expMobile || def.exp).clone(), lift,
      t0: def.t0, t1: def.t1, rotX: def.rotX || 0, spin: def.spin || 0, rotZ: def.rotZ || 0, base
    });
  }
  const clickable = [];

  const proceduralBodyIds = new Set(["rearhousing", "midframe", "camerabump", "exteriordetails"]);

  function setComponentAlpha(component, alpha) {
    for (const state of component.base) {
      const transparent = state.transparent || alpha < 0.999;
      if (state.mat.transparent !== transparent) {
        state.mat.transparent = transparent;
        state.mat.needsUpdate = true;
      }
      state.mat.opacity = state.opacity * alpha;
      state.mat.depthWrite = alpha > 0.98 ? state.depthWrite : false;
      state.mesh.castShadow = alpha > 0.45 && state.castShadow;
      state.mesh.receiveShadow = alpha > 0.45 && state.receiveShadow;
    }
  }

  function setPhoneAlpha(alpha) {
    phone.visible = alpha > 0.002;
    if (!phone.visible) return;
    for (const component of components) setComponentAlpha(component, alpha);
  }

  function setPhoneLayerAlphas(internalAlpha, displayAlpha, bodyAlpha) {
    phone.visible = Math.max(internalAlpha, displayAlpha, bodyAlpha) > 0.002;
    if (!phone.visible) return;
    for (const component of components) {
      const alpha = component.id === "display"
        ? displayAlpha
        : proceduralBodyIds.has(component.id) ? bodyAlpha : internalAlpha;
      setComponentAlpha(component, alpha);
    }
  }

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
  function torus(r, tube, radial, tubular) {
    const k = "t" + [r, tube, radial, tubular].join("_");
    if (!geomCache[k]) geomCache[k] = new THREE.TorusGeometry(r, tube, radial || 8, tubular || (LOD ? 28 : 16));
    return geomCache[k];
  }
  function polyPlate(points, d, holes) {
    const flat = points.flat();
    const key = "poly" + flat.join("_") + "_" + d + "_" + JSON.stringify(holes || []);
    if (!geomCache[key]) {
      const shape = new THREE.Shape();
      points.forEach((p, i) => i ? shape.lineTo(p[0], p[1]) : shape.moveTo(p[0], p[1]));
      shape.closePath();
      for (const hole of (holes || [])) {
        const hp = new THREE.Path(); hp.absarc(hole[0], hole[1], hole[2], 0, Math.PI * 2, true); shape.holes.push(hp);
      }
      const bev = Math.min(0.006, d * 0.28);
      const geo = new THREE.ExtrudeGeometry(shape, {
        depth: Math.max(0.0005, d - bev * 2), curveSegments: seg,
        bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
        bevelOffset: 0, bevelSegments: bevSeg
      });
      geo.translate(0, 0, bev - d / 2);
      geomCache[key] = geo;
    }
    return geomCache[key];
  }
  function framePlate(ow, oh, iw, ih, d, ro, ri) {
    const key = "frame" + [ow, oh, iw, ih, d, ro, ri].join("_");
    if (!geomCache[key]) {
      const outer = rrShape(ow, oh, ro), inner = rrShape(iw, ih, ri);
      outer.holes.push(new THREE.Path(inner.getPoints(seg * 4)));
      const bev = Math.min(0.005, d * 0.28);
      const geo = new THREE.ExtrudeGeometry(outer, {
        depth: Math.max(0.0005, d - bev * 2), curveSegments: seg,
        bevelEnabled: true, bevelThickness: bev, bevelSize: bev,
        bevelOffset: 0, bevelSegments: bevSeg
      });
      geo.translate(0, 0, bev - d / 2);
      geomCache[key] = geo;
    }
    return geomCache[key];
  }

  const V = (x, y, z) => new THREE.Vector3(x, y, z);

  /* =====================================================================
     IPHONE 11 REFERENCE — internal layout
     ---------------------------------------------------------------------
     The outer silhouette follows the supplied iPhone 11 reference: 150.9 mm
     tall, 75.7 mm wide, 8.3 mm deep, a 6.1-inch display with a wide notch,
     and a top-left square camera mesa with two lenses in a vertical stack.
     Internal parts remain an educational reconstruction rather than service
     documentation. Z is exaggerated slightly so the layers remain readable.

     The z bands below are exclusive: no two parts share both an xy footprint
     and a z range, so nothing intersects at rest. The rear mesa is the one
     deliberate exception — it projects past the back face, which is what
     gives the silhouette its shape.
     ===================================================================== */

  /* =====================================================================
     IPHONE 11-SPECIFIC TEARDOWN — polished from the supplied close-ups
     Assemblies share the exact exterior scale and detach in service order.
     ===================================================================== */
  const addScrew = (g, x, y, z = 0, r = .015) => {
    const head = mesh(cyl(r, .010, LOD ? 18 : 12), M.screw);
    head.rotation.x = Math.PI / 2; head.position.set(x, y, z); g.add(head);
    if (LOD) {
      const slot = mesh(box(r * 1.25, .0035, .0025), M.metalDark);
      slot.position.set(x, y, z + .006); g.add(slot);
    }
  };
  const addMountEar = (g, x, y, z = 0, mat = M.shield, r = .037) => {
    const ear = mesh(torus(r, .010, 8, LOD ? 28 : 18), mat);
    ear.position.set(x, y, z); g.add(ear);
  };
  const addPinRow = (g, x, y, z, count, dx = .018, rotation = 0) => {
    const pins = new THREE.Group(); pins.position.set(x, y, z); pins.rotation.z = rotation;
    for (let i = 0; i < count; i++) {
      const pin = mesh(box(.009, .025, .008), M.gold);
      pin.position.x = (i - (count - 1) / 2) * dx; pins.add(pin);
    }
    g.add(pins);
  };
  const addShieldCan = (g, w, h, x, y, z = .04) => {
    const can = mesh(plate(w, h, .025, Math.min(w, h) * .12), M.shield);
    can.position.set(x, y, z); g.add(can);
    const seam = mesh(framePlate(w * .92, h * .90, w * .80, h * .76, .006, Math.min(w, h) * .10, Math.min(w, h) * .07), M.metalDark);
    seam.position.set(x, y, z + .016); g.add(seam);
    if (LOD) {
      const art = new THREE.Mesh(new THREE.PlaneGeometry(w * .74, h * .66), M.shieldArt);
      art.position.set(x, y, z + .0185); g.add(art);
    }
  };
  const addLens = (g, x, y, r, z, ois) => {
    const carrier = mesh(box(r * 1.78, r * 1.78, .074), M.metalDark); carrier.position.set(x, y, z - .030); g.add(carrier);
    if (ois) {
      const cradle = mesh(framePlate(r * 1.68, r * 1.68, r * 1.28, r * 1.28, .018, r * .18, r * .12), M.gold);
      cradle.position.set(x, y, z + .010); g.add(cradle);
    }
    const barrel = mesh(cyl(r * .90, .058, LOD ? 30 : 18), M.lensBarrel); barrel.rotation.x = Math.PI / 2; barrel.position.set(x, y, z + .020); g.add(barrel);
    const ring = mesh(cyl(r, .018, LOD ? 36 : 20), M.lensRing); ring.rotation.x = Math.PI / 2; ring.position.set(x, y, z + .054); g.add(ring);
    const glass = mesh(cyl(r * .70, .012, LOD ? 36 : 20), M.lensGlass); glass.rotation.x = Math.PI / 2; glass.position.set(x, y, z + .066); g.add(glass);
    const inner = mesh(torus(r * .48, r * .055, 8, LOD ? 32 : 18), M.sensorBlue); inner.position.set(x, y, z + .074); g.add(inner);
  };

  /* 1 — bonded Liquid Retina display with stamped rear shield and flex tails */
  addComponent({id:"display",name:"Liquid Retina LCD Assembly",cardId:"display",index:TOUR.indexOf("display"),home:V(0,0,.080),exp:V(.62,1.00,2.38),expMobile:V(.10,.62,2.24),t0:.19,t1:.30,spin:-.14,rotX:-.07,rotZ:-.08,build:g=>{
    g.add(mesh(plate(1.465,2.94,.018,.255),M.glass));
    const adhesive=mesh(framePlate(1.445,2.915,1.375,2.845,.010,.245,.220),M.foam);adhesive.position.z=-.015;g.add(adhesive);
    const lcd=mesh(plate(1.425,2.90,.022,.235),M.display);lcd.position.z=-.028;g.add(lcd);
    const screen=new THREE.Mesh(new THREE.PlaneGeometry(1.305,2.765),M.screen);screen.position.z=.011;g.add(screen);
    const notch=mesh(plate(.70,.115,.006,.052),M.silicon);notch.position.set(0,1.342,.014);g.add(notch);
    const shield=mesh(plate(1.405,2.875,.022,.225),M.shield);shield.position.z=-.052;g.add(shield);
    const graphite=mesh(plate(1.28,2.32,.008,.17),M.graphite);graphite.position.set(0,-.12,-.069);g.add(graphite);
    const topShelf=mesh(polyPlate([[-.58,-.13],[.58,-.13],[.58,.10],[.34,.10],[.29,.17],[-.29,.17],[-.34,.10],[-.58,.10]],.016),M.metalDark);topShelf.position.set(0,1.20,-.075);g.add(topShelf);
    const driver=mesh(plate(.56,.25,.022,.035),M.silicon);driver.position.set(.30,-1.19,-.080);g.add(driver);
    const flexA=mesh(polyPlate([[-.08,.28],[.07,.28],[.07,.03],[.16,.03],[.16,-.28],[-.02,-.28],[-.02,-.02],[-.08,-.02]],.007),M.filmFlex);flexA.position.set(.28,-1.04,-.094);g.add(flexA);
    const flexB=mesh(polyPlate([[-.06,.22],[.06,.22],[.06,.02],[.13,.02],[.13,-.22],[-.03,-.22],[-.03,-.01],[-.06,-.01]],.007),M.filmFlex);flexB.position.set(.48,-1.12,-.096);g.add(flexB);
    addPinRow(g,.36,-1.30,-.089,10,.014);addPinRow(g,.54,-1.31,-.091,8,.014);
    for(const p of [[-.61,1.13],[.61,1.13],[-.61,-1.16],[.61,-1.16]])addScrew(g,p[0],p[1],-.068,.012);
    for(const y of [-.82,-.28,.30,.84]){const clip=mesh(box(.035,.16,.018),M.frame);clip.position.set(-.695,y,-.055);g.add(clip);}
  }});

  /* 2 — earpiece speaker with mounting tabs and grille */
  addComponent({id:"earpiece",name:"Earpiece Speaker",cardId:"earpiece",index:TOUR.indexOf("earpiece"),home:V(0,1.325,.025),exp:V(-.88,1.18,1.82),expMobile:V(-.42,.88,1.72),t0:.21,t1:.31,rotZ:-.16,build:g=>{
    const body=mesh(polyPlate([[-.19,-.10],[.17,-.10],[.22,-.05],[.22,.07],[.14,.11],[-.18,.11],[-.22,.05],[-.22,-.05]],.074),M.plastic);g.add(body);
    const cap=mesh(plate(.28,.13,.016,.025),M.shield);cap.position.z=.045;g.add(cap);
    const face=new THREE.Mesh(new THREE.PlaneGeometry(.21,.040),M.grille);face.position.z=.055;g.add(face);
    addMountEar(g,-.22,.06,.012,M.shield,.025);addMountEar(g,.22,-.05,.012,M.shield,.025);
    const tail=mesh(polyPlate([[-.04,.04],[.12,.04],[.12,-.01],[.22,-.01],[.22,-.07],[-.04,-.07]],.007),M.filmFlex);tail.position.set(.12,-.05,.020);g.add(tail);addPinRow(g,.31,-.09,.025,5,.013);
  }});

  /* 3 — front camera / TrueDepth flex with three optical windows */
  addComponent({id:"facescancam",name:"Front Camera & TrueDepth Flex",cardId:"proximity",index:TOUR.indexOf("proximity"),home:V(.15,1.31,.005),exp:V(.78,.95,1.68),expMobile:V(.40,.70,1.60),t0:.22,t1:.32,rotZ:-.30,build:g=>{
    const flex=mesh(polyPlate([[-.40,-.05],[.24,-.05],[.24,-.14],[.38,-.14],[.38,.13],[.18,.13],[.18,.05],[-.40,.05]],.008),M.filmFlex);g.add(flex);
    addLens(g,-.23,0,.049,.010,false);addLens(g,.01,0,.046,.010,false);
    const dot=mesh(box(.082,.072,.055),M.silicon);dot.position.set(.23,0,.026);g.add(dot);
    const win=mesh(cyl(.026,.012,LOD?22:14),M.sensorBlue);win.rotation.x=Math.PI/2;win.position.set(.23,0,.059);g.add(win);
    addPinRow(g,.31,-.11,.018,7,.012);
  }});

  /* 4 — independent stamped brackets and camera/connector shields */
  addComponent({id:"brackets",name:"Display & Connector Brackets",cardId:null,index:null,home:V(.30,.16,.018),exp:V(-.10,.58,1.46),expMobile:V(0,.48,1.42),t0:.23,t1:.35,rotZ:-.18,build:g=>{
    const parts=[
      {pts:[[-.28,-.08],[.20,-.08],[.20,.02],[.28,.02],[.28,.11],[-.05,.11],[-.05,.17],[-.28,.17]],p:[-.20,.34],m:M.shield},
      {pts:[[-.18,-.06],[.18,-.06],[.18,.06],[.04,.06],[.04,.13],[-.18,.13]],p:[.26,.29],m:M.frame},
      {pts:[[-.10,-.22],[.10,-.22],[.10,.04],[.22,.04],[.22,.16],[-.02,.16],[-.02,.22],[-.10,.22]],p:[.37,-.10],m:M.shield},
      {pts:[[-.24,-.07],[.20,-.07],[.20,.07],[.05,.07],[.05,.15],[-.24,.15]],p:[-.10,-.30],m:M.frame},
      {pts:[[-.14,-.05],[.14,-.05],[.14,.05],[.04,.05],[.04,.13],[-.14,.13]],p:[.35,.27],m:M.metalDark}
    ];
    parts.forEach((d,i)=>{const part=mesh(polyPlate(d.pts,.018),d.m);part.position.set(d.p[0],d.p[1],i*.016);g.add(part);addMountEar(g,d.p[0]+d.pts[0][0],d.p[1]+d.pts[0][1],i*.016+.004,d.m,.025);});
    const cameraShield=mesh(polyPlate([[-.25,-.23],[.19,-.23],[.19,-.05],[.28,-.05],[.28,.20],[.10,.20],[.10,.26],[-.25,.26]],.024,[[.20,.12,.025]]),M.shield);cameraShield.position.set(-.45,-.02,.045);g.add(cameraShield);
  }});

  /* 5 — dual camera carrier, OIS cradle and two long flex tails */
  addComponent({id:"camera",name:"Rear Dual Camera Module",cardId:"camera",index:TOUR.indexOf("camera"),home:V(.44,1.05,-.028),exp:V(.90,.48,1.22),expMobile:V(.42,.38,1.20),t0:.25,t1:.37,rotZ:-1.05,spin:.18,build:g=>{
    const deck=mesh(polyPlate([[-.21,-.28],[.19,-.28],[.24,-.20],[.24,.22],[.18,.28],[-.20,.28],[-.25,.20],[-.25,-.20]],.064),M.camDeck);g.add(deck);
    const deckMark=new THREE.Mesh(new THREE.PlaneGeometry(.34,.44),M.deckArt);deckMark.position.z=.033;g.add(deckMark);
    const foam=mesh(framePlate(.43,.55,.34,.46,.010,.075,.055),M.foam);foam.position.z=.036;g.add(foam);
    addLens(g,.04,.145,.110,-.050,true);addLens(g,.04,-.145,.106,-.050,false);
    const flex1=mesh(polyPlate([[-.07,.24],[.07,.24],[.07,.04],[.21,.04],[.21,-.08],[.32,-.08],[.32,-.19],[.12,-.19],[.12,-.08],[-.07,-.08]],.008),M.filmFlex);flex1.position.set(-.28,.02,-.008);g.add(flex1);
    const flex2=mesh(polyPlate([[-.06,.19],[.06,.19],[.06,.02],[.18,.02],[.18,-.13],[-.02,-.13],[-.02,-.03],[-.06,-.03]],.008),M.filmFlex);flex2.position.set(-.42,-.13,-.010);g.add(flex2);
    addPinRow(g,-.14,-.17,.002,10,.012);addPinRow(g,-.30,-.27,0,10,.012);
    addMountEar(g,-.24,.26,-.018,M.frame,.026);addMountEar(g,.23,-.25,-.018,M.frame,.026);
  }});

  /* 6 — stepped double-decker logic board with shields, chips and sockets */
  addComponent({id:"motherboard",name:"Stacked Logic Board",cardId:"motherboard",index:TOUR.indexOf("motherboard"),home:V(.43,.22,-.01),exp:V(.12,.12,1.01),expMobile:V(.08,.10,1.00),t0:.25,t1:.38,rotZ:-1.08,build:g=>{
    const boardPts=[[-.22,-.62],[.18,-.62],[.18,-.47],[.25,-.47],[.25,.28],[.16,.28],[.16,.55],[.02,.62],[-.28,.62],[-.28,.19],[-.22,.19]];
    const goldBase=mesh(polyPlate(boardPts,.035),M.gold);goldBase.position.z=-.020;g.add(goldBase);
    const innerPts=boardPts.map(p=>[p[0]*.94,p[1]*.975]);const board=mesh(polyPlate(innerPts,.043),M.pcb);g.add(board);
    if(LOD){const art=new THREE.Mesh(new THREE.PlaneGeometry(.36,1.08),M.pcbArt);art.position.set(-.015,-.02,.024);g.add(art);}
    addShieldCan(g,.24,.28,-.06,.39,.045);addShieldCan(g,.25,.24,-.02,.05,.045);addShieldCan(g,.20,.18,-.05,-.28,.045);
    const soc=mesh(box(.16,.16,.026),M.soc);soc.position.set(-.03,.39,.069);g.add(soc);
    if(LOD){const socMark=new THREE.Mesh(new THREE.PlaneGeometry(.145,.145),M.socTop);socMark.position.set(-.03,.39,.083);g.add(socMark);}
    const chipDefs=[[-.13,-.47,.10,.13,M.memory],[.11,-.18,.11,.09,M.storage],[.10,.24,.08,.10,M.pmic]];
    chipDefs.forEach(([x,y,w,h,mat])=>{const chip=mesh(box(w,h,.018),mat);chip.position.set(x,y,.061);g.add(chip);});
    for(const y of [-.54,-.39,.56]){const socket=mesh(box(.19,.045,.022),M.metalDark);socket.position.set(.04,y,.046);g.add(socket);addPinRow(g,.04,y,.060,9,.016);}
    for(const p of [[-.24,-.54],[-.24,.52],[.17,-.43],[.14,.28]]){addMountEar(g,p[0],p[1],.003,M.gold,.022);addScrew(g,p[0],p[1],.012,.010);}
  }});

  /* 7 — independent EMI and graphite cover matching the board contour */
  addComponent({id:"cooling",name:"Graphite & EMI Shield Set",cardId:"cooling",index:TOUR.indexOf("cooling"),home:V(.43,.22,.026),exp:V(-.42,.50,1.30),expMobile:V(-.32,.42,1.27),t0:.26,t1:.39,rotZ:-.78,build:g=>{
    const cover=mesh(polyPlate([[-.25,-.31],[.18,-.31],[.18,-.13],[.28,-.13],[.28,.26],[.10,.26],[.10,.33],[-.25,.33]],.020,[[.20,.19,.023],[-.19,-.23,.020]]),M.shield);g.add(cover);
    const grain=new THREE.Mesh(new THREE.PlaneGeometry(.38,.48),M.shieldArt);grain.position.set(-.02,0,.012);g.add(grain);
    const graphite=mesh(polyPlate([[-.18,-.23],[.14,-.23],[.14,-.06],[.22,-.06],[.22,.20],[-.18,.20]],.006),M.graphite);graphite.position.z=.017;g.add(graphite);
    addMountEar(g,-.24,-.27,.004,M.shield,.025);addMountEar(g,.25,.22,.004,M.shield,.025);
  }});

  /* 8 — stamped SIM reader with six apertures and separate gasketed tray */
  addComponent({id:"simtray",name:"SIM Tray & Reader",cardId:null,index:null,home:V(.57,-.58,-.02),exp:V(-.82,-.02,.90),expMobile:V(-.42,.02,.88),t0:.27,t1:.40,rotZ:.14,build:g=>{
    const reader=mesh(polyPlate([[-.20,-.22],[.18,-.22],[.23,-.16],[.23,.18],[.16,.23],[-.18,.23],[-.23,.17],[-.23,-.16]],.072),M.metalDark);reader.position.x=.19;g.add(reader);
    const lid=mesh(plate(.38,.39,.018,.045),M.shield);lid.position.set(.19,0,.045);g.add(lid);
    for(const y of [-.10,.10])for(const x of [.07,.19,.31]){const slot=mesh(plate(.045,.075,.010,.022),M.foam);slot.position.set(x,y,.057);g.add(slot);}
    addMountEar(g,-.04,-.17,.012,M.shield,.028);addMountEar(g,.42,.17,.012,M.shield,.028);
    const tray=mesh(framePlate(.31,.40,.20,.29,.024,.045,.030),M.housing);tray.position.set(-.31,0,.005);g.add(tray);
    const gasket=mesh(framePlate(.285,.375,.225,.315,.010,.040,.028),M.boot);gasket.position.set(-.31,0,.020);g.add(gasket);
    addMountEar(g,-.31,.23,.007,M.housing,.020);
  }});

  /* 9 — layered Taptic Engine with mount ears, top label and folded flex */
  addComponent({id:"haptic",name:"Taptic Engine",cardId:"haptic",index:TOUR.indexOf("haptic"),home:V(-.40,-1.18,-.025),exp:V(-.82,-.68,.93),expMobile:V(-.40,-.50,.91),t0:.29,t1:.42,rotZ:-.14,build:g=>{
    const base=mesh(polyPlate([[-.34,-.18],[.31,-.18],[.36,-.10],[.36,.12],[.29,.18],[-.31,.18],[-.36,.11],[-.36,-.10]],.096),M.metalDark);g.add(base);
    const rim=mesh(framePlate(.62,.30,.53,.22,.016,.055,.040),M.frame);rim.position.z=.056;g.add(rim);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.50,.20),M.tapticLabel);label.position.z=.066;g.add(label);
    addMountEar(g,-.37,-.12,.018,M.frame,.032);addMountEar(g,.37,.12,.018,M.frame,.032);
    const rail=mesh(box(.42,.045,.038),M.housing);rail.position.set(.02,-.17,.030);g.add(rail);
    const flex=mesh(polyPlate([[-.05,.06],[.18,.06],[.18,.01],[.33,.01],[.33,-.07],[.10,-.07],[.10,-.02],[-.05,-.02]],.008),M.filmFlex);flex.position.set(.32,.02,.010);g.add(flex);addPinRow(g,.62,-.03,.018,8,.012);
  }});

  /* 10 — irregular acoustic chamber, perforated cap and white gasket */
  addComponent({id:"loudspeaker",name:"Bottom Loudspeaker",cardId:"loudspeaker",index:TOUR.indexOf("loudspeaker"),home:V(.46,-1.18,-.02),exp:V(.80,-.68,.90),expMobile:V(.40,-.50,.87),t0:.29,t1:.42,rotZ:.10,build:g=>{
    const bodyPts=[[-.28,-.20],[.20,-.20],[.29,-.10],[.29,.12],[.17,.20],[-.08,.20],[-.08,.14],[-.28,.14]];
    const body=mesh(polyPlate(bodyPts,.110),M.plastic);g.add(body);
    const cap=mesh(polyPlate([[-.23,-.15],[.18,-.15],[.23,-.08],[.23,.10],[.14,.15],[-.23,.15]],.020),M.shield);cap.position.z=.064;g.add(cap);
    for(const y of [-.07,.05])for(const x of [-.15,-.03,.09]){const vent=mesh(plate(.052,.075,.009,.025),M.foam);vent.position.set(x,y,.077);g.add(vent);}
    const gasket=mesh(framePlate(.39,.30,.29,.20,.012,.050,.035),M.gasketWhite);gasket.position.set(.34,.01,.018);g.add(gasket);
    addMountEar(g,-.28,.18,.015,M.frame,.030);addMountEar(g,.28,-.15,.015,M.frame,.030);
    const contacts=mesh(plate(.12,.055,.014,.018),M.gold);contacts.position.set(.19,.17,.066);g.add(contacts);addPinRow(g,.19,.17,.075,4,.020);
  }});

  /* 11 — single-cell foil pouch with seams, BMS cap and folded connector */
  addComponent({id:"battery",name:"3110 mAh Battery",cardId:"battery",index:TOUR.indexOf("battery"),home:V(-.19,-.10,-.04),exp:V(-.14,-.20,.52),expMobile:V(-.08,-.18,.52),t0:.30,t1:.43,rotZ:-.06,build:g=>{
    const seam=mesh(plate(.91,1.99,.090,.070),M.metalDark);seam.position.z=-.010;g.add(seam);
    const pouch=mesh(plate(.87,1.94,.112,.062),M.battery);g.add(pouch);
    const label=new THREE.Mesh(new THREE.PlaneGeometry(.79,1.70),M.battLabel);label.position.z=.057;g.add(label);
    const topCap=mesh(plate(.82,.105,.026,.022),M.plastic);topCap.position.set(0,.94,.042);g.add(topCap);
    const bms=mesh(plate(.34,.082,.024,.018),M.pcb);bms.position.set(.22,.98,.050);g.add(bms);
    const tail=mesh(polyPlate([[-.055,.16],[.055,.16],[.055,.03],[.13,.03],[.13,-.16],[-.02,-.16],[-.02,-.02],[-.055,-.02]],.008),M.filmFlex);tail.position.set(.34,1.05,.052);g.add(tail);addPinRow(g,.46,.91,.060,8,.012);
    for(const x of [-.27,0,.27]){const tab=mesh(polyPlate([[-.06,.08],[.06,.08],[.05,-.08],[-.05,-.08]],.006),M.tab);tab.position.set(x,-.95,-.061);g.add(tab);}
  }});

  /* 12 — routed Lightning/lower flex with metal port and contact blocks */
  addComponent({id:"chargingport",name:"Charging Port & Lower Flex",cardId:"chargingport",index:TOUR.indexOf("chargingport"),home:V(0,-1.38,-.06),exp:V(0,-1.08,.25),expMobile:V(0,-.88,.30),t0:.31,t1:.44,rotZ:-.22,build:g=>{
    const flex=mesh(polyPlate([[-.62,-.06],[-.17,-.06],[-.17,.18],[-.08,.18],[-.08,-.01],[.25,-.01],[.25,.32],[.36,.32],[.36,-.06],[.62,-.06],[.62,.05],[.44,.05],[.44,.47],[.19,.47],[.19,.10],[-.01,.10],[-.01,.34],[-.27,.34],[-.27,.05],[-.62,.05]],.009),M.filmFlex);g.add(flex);
    const portBody=mesh(plate(.25,.085,.072,.025),M.frame);portBody.position.z=.036;g.add(portBody);
    const mouth=mesh(plate(.18,.044,.075,.018),M.foam);mouth.position.set(0,-.005,.040);g.add(mouth);
    addScrew(g,-.43,0,.016,.013);addScrew(g,.43,0,.016,.013);
    for(const p of [[-.50,.16],[.31,.42]]){const socket=mesh(plate(.15,.065,.020,.018),M.metalDark);socket.position.set(p[0],p[1],.020);g.add(socket);addPinRow(g,p[0],p[1],.032,8,.013);}
  }});

  /* 13 — three MEMS microphones with rubber acoustic boots */
  addComponent({id:"microphones",name:"Microphone Array",cardId:"microphones",index:TOUR.indexOf("microphones"),home:V(-.20,-1.42,-.018),exp:V(-.40,-.86,.58),expMobile:V(-.28,-.68,.62),t0:.32,t1:.45,rotZ:-.24,build:g=>{
    const rail=mesh(plate(.28,.09,.008,.025),M.filmFlex);g.add(rail);
    for(const x of [-.085,0,.085]){const mic=mesh(box(.050,.046,.038),M.metalDark);mic.position.x=x;g.add(mic);const boot=mesh(torus(.022,.007,8,16),M.boot);boot.position.set(x,0,.024);g.add(boot);}
    addPinRow(g,.18,0,.015,5,.013);
  }});

  /* 14 — machined silver rear housing with cavities, pads and camera wells */
  addComponent({id:"rearhousing",name:"Rear Housing & Interior Backplate",cardId:null,index:null,home:V(0,0,-.095),exp:V(0,-.02,-.58),expMobile:V(0,-.02,-.54),t0:.34,t1:.48,build:g=>{
    const shell=mesh(plate(1.465,2.94,.055,.255),M.housing);g.add(shell);
    const inset=mesh(plate(1.355,2.79,.020,.21),M.metalDark);inset.position.z=.039;g.add(inset);
    const graphite=mesh(polyPlate([[-.57,-1.20],[.57,-1.20],[.57,.56],[.30,.56],[.30,1.14],[-.18,1.14],[-.18,.78],[-.57,.78]],.009),M.graphite);graphite.position.z=.052;g.add(graphite);
    const coilRecess=mesh(cyl(.48,.012,LOD?42:24),M.foam);coilRecess.rotation.x=Math.PI/2;coilRecess.position.set(0,-.20,.057);g.add(coilRecess);
    for(const y of [1.19,.91]){const well=mesh(torus(.116,.018,10,LOD?34:20),M.foam);well.position.set(.45,y,.065);g.add(well);}
    const cameraShelf=mesh(polyPlate([[.18,.77],[.62,.77],[.62,1.34],[.12,1.34],[.12,1.08],[.18,1.08]],.020),M.plastic);cameraShelf.position.z=.058;g.add(cameraShelf);
    const lowerPocket=mesh(polyPlate([[-.62,-1.34],[.62,-1.34],[.62,-.96],[.28,-.96],[.28,-1.08],[-.12,-1.08],[-.12,-.96],[-.62,-.96]],.018),M.plastic);lowerPocket.position.z=.058;g.add(lowerPocket);
    for(const p of [[-.60,1.18],[-.60,.80],[-.59,-1.08],[.58,-1.12],[.62,.45]])addScrew(g,p[0],p[1],.072,.012);
    for(const p of [[-.53,-.75],[-.53,-.63],[.54,.42],[.54,.54]]){const pad=mesh(box(.055,.035,.012),M.gold);pad.position.set(p[0],p[1],.071);g.add(pad);}
    for(const y of [-.65,-.25,.20,.62]){const foam=mesh(box(.045,.24,.012),M.foam);foam.position.set(-.64,y,.066);g.add(foam);}
  }});

  /* 15 — bonded wireless charging and NFC assembly */
  addComponent({id:"wireless",name:"Wireless Charging & NFC Coil",cardId:"wireless",index:TOUR.indexOf("wireless"),home:V(0,-.10,-.060),exp:V(0,-.08,-.48),expMobile:V(0,-.08,-.45),t0:.34,t1:.48,build:g=>{
    g.add(mesh(plate(.99,1.08,.010,.11),M.graphite));
    const art=new THREE.Mesh(new THREE.PlaneGeometry(.93,.93),M.coilArt);art.position.z=.008;g.add(art);
    const coil=new THREE.Mesh(new THREE.TorusGeometry(.44,.022,10,LOD?60:32),M.copper);coil.position.z=.014;g.add(coil);
    const flex=mesh(polyPlate([[-.045,.26],[.045,.26],[.045,.05],[.12,.05],[.12,-.26],[-.02,-.26],[-.02,-.03],[-.045,-.03]],.007),M.filmFlex);flex.position.set(.35,.58,.014);g.add(flex);addPinRow(g,.45,.36,.022,6,.012);
  }});

  /* 16 — aluminium chassis rail */
  addComponent({id:"midframe",name:"Aluminium Housing Rail",cardId:null,index:null,home:V(0,0,0),exp:V(0,0,-.42),expMobile:V(0,0,-.40),t0:.35,t1:.48,build:g=>{
    const outer=rrShape(1.505,3,.255),inner=rrShape(1.445,2.91,.225);outer.holes.push(new THREE.Path(inner.getPoints(seg*4)));
    const geo=new THREE.ExtrudeGeometry(outer,{depth:.20,curveSegments:seg,bevelEnabled:true,bevelThickness:.006,bevelSize:.006,bevelOffset:0,bevelSegments:bevSeg});geo.translate(0,0,-.10);g.add(mesh(geo,M.housing));
  }});

  /* 17 — rear camera plateau, flash and microphone stay with housing */
  addComponent({id:"camerabump",name:"Rear Camera Plateau",cardId:null,index:null,home:V(.44,1.05,-.125),exp:V(.44,1.05,-.62),expMobile:V(.44,1.05,-.56),t0:.35,t1:.48,build:g=>{
    g.add(mesh(plate(.50,.56,.038,.105),M.rearGlass));
    for(const y of [1.19,.91]){const bezel=mesh(torus(.118,.020,10,LOD?36:22),M.lensRing);bezel.position.set(0,y-1.05,-.031);g.add(bezel);}
    const flash=mesh(cyl(.044,.014,LOD?22:14),M.flash);flash.rotation.x=Math.PI/2;flash.position.set(-.115,.145,-.028);g.add(flash);
    const mic=mesh(cyl(.010,.011,10),M.foam);mic.rotation.x=Math.PI/2;mic.position.set(-.115,-.145,-.028);g.add(mic);
  }});

  /* 18 — buttons, SIM seam, port openings and antenna breaks */
  addComponent({id:"exteriordetails",name:"Exterior Controls",cardId:null,index:null,home:V(0,0,0),exp:V(0,0,-.42),expMobile:V(0,0,-.40),t0:.35,t1:.48,build:g=>{
    const key=(x,y,h,mat=M.housing)=>{const button=mesh(box(.022,h,.09),mat);button.position.set(x,y,0);g.add(button);};
    key(-.758,.89,.115,M.metalDark);key(-.758,.53,.245);key(-.758,.19,.245);key(.758,.47,.385);
    const traySeam=mesh(box(.010,.31,.128),M.foam);traySeam.position.set(.754,-.52,0);g.add(traySeam);
    const port=mesh(plate(.19,.026,.072,.012),M.foam);port.rotation.x=Math.PI/2;port.position.set(0,-1.505,0);g.add(port);
    for(const x of [-.54,-.46,-.38,.32,.40,.48,.56,.64]){const hole=mesh(cyl(.012,.022,10),M.mesh);hole.position.set(x,-1.505,0);g.add(hole);}
    const band=(w,h,x,y)=>{const b=mesh(box(w,h,.20),M.gasketWhite);b.position.set(x,y,0);g.add(b);};
    band(.34,.016,-.30,1.49);band(.34,.016,.30,-1.49);band(.016,.30,.748,.90);band(.016,.30,-.748,-.90);
  }});
  /* ======================================================================
     ANCHORS for connector lines / labels (world space, computed per frame)
     ==================================================================== */
  const byCard = {};
  components.forEach(c => { if (c.cardId) byCard[c.cardId] = c; });
  const tourComps = TOUR.map(id => byCard[id]).filter(Boolean);

  /* ======================================================================
     SCROLL TIMELINE
     ==================================================================== */
  /* The exact GLB opens first, then gives way to the registered service stack. */
  const P = {
    revealEnd: 0.10,
    handoffStart: 0.10, handoffEnd: 0.19,
    displayReleaseEnd: 0.23,
    displayFadeStart: 0.19, displayFadeEnd: 0.23,
    bodyFadeStart: 0.31, bodyFadeEnd: 0.42,
    explodeStart: 0.19, explodeEnd: 0.49,
    tourStart: 0.51, tourEnd: 0.92,
    overviewStart: 0.92
  };

  let progress = 0;          // 0..1 scroll progress
  let userYaw = 0, userPitch = 0;   // drag offsets
  let idleYaw = 0;
  let stageW = 1, stageH = 1;       // cached in resize(); no layout reads per frame
  const tmpV = new THREE.Vector3();
  const tmpV2 = new THREE.Vector3();
  const controlsEl = document.getElementById("ip-controls");

  function computeProgress() {
    const r = els.scroller.getBoundingClientRect();
    const denom = els.scroller.offsetHeight - window.innerHeight;
    if (denom <= 0) return 0;
    return clamp(-r.top / denom, 0, 1);
  }

  function phaseLabel(p) {
    if (p < P.handoffStart) return "Assembled";
    if (p < P.handoffEnd) return "Opening display";
    if (p < P.explodeEnd) return "Disassembling";
    if (p < P.tourStart) return "Exploded view";
    if (p < P.overviewStart) return "Component " + (activeIdx + 1 || 1) + " / " + tourComps.length;
    return "Full teardown";
  }

  let activeIdx = -1;

  function apply(p, time, dt) {
    dt = dt || 0;
    /* --- restrained product pose → top-down service inspection --- */
    const reveal = smooth(0, P.revealEnd, p);
    const open = smooth(P.explodeStart, P.explodeEnd, p);
    let yaw = lerp(-0.28, -0.52, reveal);
    yaw = lerp(yaw, -0.76, open);
    const pitch = lerp(-0.10, -0.40, open);

    /* Keep the object physically consistent; the camera dollies back instead
       of shrinking the phone into a miniature during the explosion. */
    let sc = lerp(1.0, mq.matches ? 0.82 : 0.78, open);
    camera.position.z = cameraBaseZ + open * (mq.matches ? 1.75 : 1.30);
    camera.position.y = lerp(0, -0.08, open);
    camera.lookAt(0, lerp(0, 0.06, open), 0);

    /* Idle motion is deliberately subtle so reflections move but the
       mechanical alignment remains easy to read. */
    const sway = p > P.overviewStart ? Math.sin(time * 0.30) * 0.035 : 0;
    idleYaw = (p < 0.02 ? Math.sin(time * 0.52) * 0.026 : 0) + sway;
    root.rotation.set(pitch + userPitch, yaw + userYaw + idleYaw, 0);

    /* Open the exact GLB display, retain its exact frame, then reveal the
       detailed registered internals underneath. */
    const handoff = smooth(P.handoffStart, P.handoffEnd, p);
    if (referenceReady) {
      const displayLift = easeIO(smooth(P.handoffStart, P.displayReleaseEnd, p));
      updateReferenceDisplay(displayLift);
      setReferenceAlpha(
        1 - smooth(P.bodyFadeStart, P.bodyFadeEnd, p),
        1 - smooth(P.displayFadeStart, P.displayFadeEnd, p)
      );
      setPhoneLayerAlphas(
        handoff,
        smooth(P.displayFadeStart, P.displayFadeEnd, p),
        smooth(P.bodyFadeStart, P.bodyFadeEnd, p)
      );
    } else {
      phone.visible = true;
      setPhoneAlpha(1);
    }

    /* Two-step detach path: lift cleanly off the mounting plane, then travel
       into the exploded layout. Desktop spreads wide like the supplied render;
       mobile uses a narrower vertical composition. */
    for (const c of components) {
      const detachEnd = lerp(c.t0, c.t1, 0.42);
      const liftT = easeIO(smooth(c.t0, detachEnd, p));
      const spreadT = easeIO(smooth(detachEnd, c.t1, p));
      tmpV2.copy(c.home).add(c.lift);
      tmpV.copy(c.home).lerp(tmpV2, liftT);
      tmpV.lerp(mq.matches ? c.expMobile : c.exp, spreadT);
      c.group.position.copy(tmpV);
      const turn = easeIO(smooth(c.t0, c.t1, p));
      c.group.rotation.set(turn * c.rotX, turn * c.spin, turn * c.rotZ);
    }

    glow.material.opacity = lerp(0.20, 0.09, open);
    contactShadow.material.opacity = lerp(0.42, 0.16, open);
    contactShadow.scale.set(lerp(3.2, 4.2, open), lerp(5.0, 3.4, open), 1);
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
    if (els.deviceTag) els.deviceTag.style.opacity = hudFade * (1 - smooth(P.tourStart - 0.02, P.tourStart + 0.02, p));
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
  function canDrag() { return progress >= P.handoffEnd; }

  els.canvasWrap.addEventListener("pointerdown", e => {
    dragDist = 0;
    if (dragging) { endDrag({ pointerId: dragPointer }); return; } // second finger = pinch, not drag
    if (!canDrag()) return;
    if (e.pointerType === "touch" && progress < P.explodeEnd) return; // keep vertical scrolling until fully open
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
    cameraBaseZ = Math.max(distH, distW);
    camera.position.z = cameraBaseZ;
    els.lines.setAttribute("viewBox", "0 0 " + w + " " + h);
    els.lines.setAttribute("width", w); els.lines.setAttribute("height", h);
    requestRender();
  }
  window.addEventListener("resize", resize);
  resize();

  /* ---- reveal: first paint; loader stays until the exact GLB settles ---- */
  progress = computeProgress();
  apply(progress, 0);
  renderer.render(scene, camera);
  /* A slow or blocked model request must not trap visitors behind the loader;
     retain the procedural exterior as a graceful timeout fallback. */
  setTimeout(() => {
    if (loadingSettled) return;
    console.warn("[inside-phone] iPhone 11 GLB timed out; using procedural exterior.");
    referenceAbandoned = true;
    referenceReady = false;
    referenceShell.visible = false;
    phone.visible = true;
    setPhoneAlpha(1);
    hideLoading();
    requestRender();
  }, 12000);
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
  /* Generated textures add readable markings to the screen, battery, board,
     shields, camera carrier, Taptic Engine and wireless coil. */
  const screen = std({ color: c(0xffffff), roughness: 0.35, metalness: 0.0, map: TEX.screen, emissive: c(0xffffff), emissiveMap: TEX.screen, emissiveIntensity: 0.9 });
  const battLabel = std({ color: c(0xffffff), roughness: 0.55, metalness: 0.05, map: TEX.battery });
  const tapticLabel = std({ color: c(0xffffff), roughness: 0.32, metalness: 0.45, map: TEX.taptic, envMapIntensity: 1.1 });
  const pcbArt = std({ color: c(0xffffff), roughness: 0.5, metalness: 0.4, map: TEX.pcb });
  const coilArt = std({ color: c(0xffffff), roughness: 0.4, metalness: 0.85, map: TEX.coil, transparent: true, alphaTest: 0.15, side: THREE.DoubleSide, envMapIntensity: 1.2 });
  const socTop = std({ color: c(0xffffff), roughness: 0.32, metalness: 0.55, map: TEX.soc, envMapIntensity: 1.1 });
  const shieldArt = std({ color: c(0xffffff), roughness: 0.34, metalness: 0.9, map: TEX.shield, envMapIntensity: 1.15 });
  const grille = std({ color: c(0xffffff), roughness: 0.75, metalness: 0.15, map: TEX.grille });
  const deckArt = std({ color: c(0xffffff), roughness: 0.4, metalness: 0.3, map: TEX.deck, transparent: true });
  const tab = std({ color: c(0x2f6fd6), roughness: 0.5, metalness: 0.05 });
  const boot = std({ color: c(0x1a1b1f), roughness: 0.9, metalness: 0.0 });
  const flash = std({ color: c(0xf5efdd), roughness: 0.3, metalness: 0.1, emissive: c(0xfff3d0), emissiveIntensity: 0.5 });
  const filmFlex = std({ color: c(0x17171b), roughness: 0.72, metalness: 0.16, envMapIntensity: 0.75 });
  // Showpiece metals get a clearcoat so the new chamfers read as polished edges.
  const frame = phys({ color: c(0xa9adb4), roughness: 0.19, metalness: 1.0, envMapIntensity: 1.7, clearcoat: 0.8, clearcoatRoughness: 0.10 });
  const housing = phys({ color: c(0xd4d6d9), roughness: 0.27, metalness: 1.0, envMapIntensity: 1.65, clearcoat: 0.55, clearcoatRoughness: 0.16 });
  const metalDark = phys({ color: c(0x4a4e55), roughness: 0.31, metalness: 0.92, envMapIntensity: 1.35, clearcoat: 0.25, clearcoatRoughness: 0.24 });
  const shield = phys({ color: c(0xb9bfc8), roughness: 0.30, metalness: 1.0, envMapIntensity: 1.3, clearcoat: 0.4, clearcoatRoughness: 0.24 });
  const gasketWhite = std({ color: c(0xe8e8e5), roughness: 0.68, metalness: 0.02 });
  const foam = std({ color: c(0x050609), roughness: 0.94, metalness: 0.0 });
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
  const lensGlass = phys({ color: c(0x17113a), roughness: 0.025, metalness: 0.0, transparent: true, opacity: 0.82, envMapIntensity: 2.2, clearcoat: 1, clearcoatRoughness: 0.025, ior: 1.52, thickness: LOD ? 0.035 : 0 });
  const graphite = std({ color: c(0x111318), roughness: 0.7, metalness: 0.2 });
  const battery = std({ color: c(0x191b21), roughness: 0.5, metalness: 0.3 });
  const plastic = std({ color: c(0x15161c), roughness: 0.6, metalness: 0.1 });
  const mesh = std({ color: c(0x0b0c10), roughness: 0.8, metalness: 0.1 });
  const screw = std({ color: c(0x9aa0aa), roughness: 0.3, metalness: 1.0 });
  const sensorBlue = std({ color: c(0x0a1730), roughness: 0.2, metalness: 0.4, emissive: c(0x123a7a), emissiveIntensity: 0.5 });

  return { glass, rearGlass, display, screen, battLabel, tapticLabel, pcbArt, coilArt, socTop, shieldArt, grille, deckArt, tab, boot, flash, filmFlex, frame, housing, metalDark, shield, gasketWhite, foam, pcb, soc, memory, storage, pmic, silicon, copper, gold, camDeck, lensBarrel, lensRing, lensGlass, graphite, battery, plastic, mesh, screw, sensorBlue };
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
  /* Deterministic grain keeps the same board, foil and shield details on every
     load, which avoids visible texture changes between visits. */
  let randomSeed = 0x11a13;
  function rnd() {
    randomSeed = (Math.imul(randomSeed, 1664525) + 1013904223) >>> 0;
    return randomSeed / 4294967296;
  }

  /* Lit LCD-style face: black bezel margin, wallpaper glow, status bar, clock,
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
    const pills = [["Panglima Gadget", "Your repair is ready for pickup"], ["Diagnostics", "iPhone 11 inspection complete"]];
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

  /* Battery pouch label: title, specs, safety row, barcode */
  const battery = make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#191b21"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#22252d"; rrPath(ctx, 26, 30, w - 52, h - 60, 18); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,.88)"; ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.font = "700 30px Archivo, Inter, sans-serif";
    ctx.fillText("iPhone 11 BATTERY", 48, 56);
    ctx.font = "500 20px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.6)";
    /* Single rectangular cell, and deliberately no capacity/energy figure —
       this remains an educational reconstruction, not an official spec sheet. */
    ctx.fillText("3110 mAh  ·  3.83 V", 48, 110);
    ctx.fillText("11.91 Wh  ·  Li-ion polymer", 48, 142);
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
      const bw = 2 + rnd() * 6;
      ctx.fillStyle = "rgba(235,238,244," + (rnd() > 0.4 ? 0.85 : 0) + ")";
      ctx.fillRect(x, h - 150, bw, 74);
      x += bw + 2;
    }
    ctx.font = "400 15px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.5)";
    ctx.fillText("S/N IP11 2019 3110 REF", 48, h - 64);
  });

  /* PCB: solder-mask green with structured routing — bus bundles, via arrays,
     IC footprints with pin rows, gold edge fingers, silkscreen */
  const pcb = make(512, 512, (ctx, w, h) => {
    ctx.fillStyle = "#0d2b25"; ctx.fillRect(0, 0, w, h);
    // parallel bus bundles with 45° bends
    for (let b = 0; b < 5; b++) {
      const y0 = 40 + b * 95, n = 5;
      for (let i = 0; i < n; i++) {
        ctx.strokeStyle = "rgba(202,165,87," + (0.35 + 0.3 * rnd()) + ")";
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
      const cx = 30 + rnd() * (w - 60), cy = 30 + rnd() * (h - 60);
      for (let i = 0; i < 9; i++) {
        ctx.fillStyle = "rgba(202,165,87,.8)";
        ctx.beginPath(); ctx.arc(cx + (i % 3) * 9, cy + ((i / 3) | 0) * 9, 2.4, 0, 7); ctx.fill();
        ctx.fillStyle = "#0d2b25";
        ctx.beginPath(); ctx.arc(cx + (i % 3) * 9, cy + ((i / 3) | 0) * 9, 1.0, 0, 7); ctx.fill();
      }
    }
    // IC footprints with pin rows
    for (let f = 0; f < 4; f++) {
      const fx = 40 + rnd() * (w - 160), fy = 40 + rnd() * (h - 140), fw = 60 + rnd() * 50, fh = 40 + rnd() * 40;
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
    ctx.fillText("IP11-MLB 820-01523 REF", 26, h - 34);
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
    ctx.fillText("A13 SYSTEM", w / 2, 30);
    ctx.font = "600 15px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.55)";
    ctx.fillText("REFERENCE · 7 nm", w / 2, 54);
    ctx.font = "400 11px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.4)";
    ctx.fillText("A2607 2ND26", w / 2, 78);
    // corner polarity dot
    ctx.fillStyle = "rgba(255,255,255,.5)"; ctx.beginPath(); ctx.arc(20, h - 20, 4, 0, 7); ctx.fill();
  });

  /* EMI shield can: brushed tin with laser etch + datamatrix */
  const shield = make(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#b9bfc8"; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 2) {
      ctx.fillStyle = "rgba(255,255,255," + (rnd() * 0.09) + ")"; ctx.fillRect(0, y, w, 1);
      ctx.fillStyle = "rgba(70,76,88," + (rnd() * 0.10) + ")"; ctx.fillRect(0, y + 1, w, 1);
    }
    ctx.textAlign = "left"; ctx.textBaseline = "top";
    ctx.font = "600 15px Inter, sans-serif"; ctx.fillStyle = "rgba(60,66,78,.75)";
    ctx.fillText("IP11-EMI-01", 18, 18);
    ctx.font = "400 12px Inter, sans-serif"; ctx.fillStyle = "rgba(60,66,78,.6)";
    ctx.fillText("SPTE 0.15", 18, 40);
    // datamatrix square
    for (let i = 0; i < 100; i++) {
      if (rnd() > 0.5) continue;
      ctx.fillStyle = "rgba(50,56,68,.8)";
      ctx.fillRect(w - 66 + (i % 10) * 4.4, 18 + ((i / 10) | 0) * 4.4, 3.6, 3.6);
    }
    // test points
    for (const [tx, ty] of [[40, h - 40], [w - 44, h - 36]]) {
      ctx.fillStyle = "rgba(217,178,90,.9)"; ctx.beginPath(); ctx.arc(tx, ty, 7, 0, 7); ctx.fill();
      ctx.fillStyle = "rgba(120,96,40,.9)"; ctx.beginPath(); ctx.arc(tx, ty, 2.6, 0, 7); ctx.fill();
    }
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
    ctx.fillText("DUAL CAMERA MODULE", w / 2, 40);
    ctx.font = "400 12px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.3)";
    ctx.fillText("WIDE · OIS · f/1.8", w / 2, 62);
    ctx.fillText("ULTRA WIDE · 0.5×", w / 2, h - 30);
  });

  /* Taptic Engine top plate: dark anodised label with fine edge sheen. */
  const taptic = make(512, 256, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, "#30343c"); g.addColorStop(.52, "#20242b"); g.addColorStop(1, "#343840");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 3) {
      ctx.fillStyle = "rgba(255,255,255," + (0.015 + rnd() * 0.025) + ")"; ctx.fillRect(0, y, w, 1);
    }
    ctx.strokeStyle = "rgba(255,255,255,.22)"; ctx.lineWidth = 2; ctx.strokeRect(8, 8, w - 16, h - 16);
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = "700 42px Archivo, Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.90)";
    ctx.fillText("TAPTIC ENGINE", w / 2, h / 2 - 8);
    ctx.font = "500 18px Inter, sans-serif"; ctx.fillStyle = "rgba(255,255,255,.45)";
    ctx.fillText("IPHONE 11 REFERENCE ASSEMBLY", w / 2, h / 2 + 38);
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

  return { screen, battery, pcb, soc, shield, grille, deck, taptic, coil };
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
