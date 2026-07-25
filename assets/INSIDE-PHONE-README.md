# "Inside Your Smartphone" — 3D exploded-view section

A scroll-driven 3D teardown of the fictional **Panglima X1** flagship, embedded
in `index.html` between **Services** and **Process**. Original, brand-neutral
industrial design — no manufacturer's product or internal layout is copied.

## Files

| File | Purpose |
|---|---|
| `assets/inside-phone-data.js` | **The only file you need to edit.** All text, WhatsApp number, message templates, colours. |
| `assets/inside-phone-fallback.js` | Builds every card/label/picker from the data file; renders the accessible non-WebGL fallback. |
| `assets/inside-phone.js` | The real-time 3D experience (ES module, Three.js 0.160 pinned via importmap). |
| `assets/inside-phone.css` | All styles, scoped under `#inside-phone` — cannot leak into the rest of the site. |
| `index.html` | Section markup (`<section id="inside-phone">`), one `<link>` in the head, five `<script>` tags before `</body>`. |

No build step. Edit → save → deploy (Cloudflare Pages), same as the rest of the site.

## How to change things

All in `assets/inside-phone-data.js`:

- **WhatsApp number** — `CONFIG.whatsappNumber` (digits only, international format).
  The section builds its own links from this; it does not reuse the site's
  `WHATSAPP_NUMBER` so the section stays portable. Keep both in sync.
- **Pre-filled messages** — `CONFIG.messages` (`{part}` is replaced by the component name).
- **Any card text** — `CARDS.<id>` (name, tag, function, symptoms, causes, repair, optional `warning`).
- **Tour order** — the `TOUR` array.
- **Headings / CTA / trust line / loading text** — `CONFIG.copy`.
- **Accent colours** — `CONFIG.colors` for the 3D materials, and mirror the same
  values in the CSS variables at the top of `assets/inside-phone.css`
  (`--ip-blue`, `--ip-orange`, …).
- **Primary CTA target** — `CONFIG.diagnosisLink` ("" = WhatsApp diagnosis message).

## Behaviour

- **Scroll timeline** (fully reversible — scrolling up reassembles):
  `0–10%` reveal rotation → `10–50%` staged explosion (rear glass → coil →
  battery/board/cameras → display forward → sensors/speakers/frame) →
  `52–90%` guided tour of 12 components (card + animated diagnostic line, others
  dimmed) → `90–100%` full exploded overview with labels and slow spin.
- **Interaction**: drag to rotate (desktop any time after opening; touch only
  once fully exploded so page scrolling is never hijacked), hover highlight,
  click/tap a part → jumps to its card, side picker list (desktop), *Reassemble
  Phone* and *View All Components* buttons.
- **States**: elegant loader ("Preparing device diagnostics…"), error → fallback,
  `prefers-reduced-motion` → fallback, no WebGL → fallback, no ES modules →
  fallback. The fallback is a static exploded schematic + all 12 cards with the
  same symptoms/causes/repair content and CTAs. The 3D canvas is `aria-hidden`;
  all information is always available as text.
- **Performance**: rendering pauses when the section is off-screen or the tab is
  hidden; renders only on scroll/drag/idle-animation frames; pixel ratio capped
  (1.5 mobile / 2 desktop); antialias off + lower-poly curves on mobile
  (LOD 0); materials are lightweight standard/physical PBR with a generated
  environment map (no texture downloads, no GLB — the entire experience is
  ~9 KB of JS + the three.js CDN module, cached across the web).

## Realism pass (2026-07-24)

The model uses generated canvas textures (zero downloads): a lit AMOLED lock
screen (clock, status bar, signal/battery glyphs, notification pills,
lockscreen shortcuts, dock, black bezel), printed rear-glass wordmark with a
generic regulatory pictogram row, battery pouch label (specs, safety
pictograms, barcode), structured PCB routing (bus bundles, via arrays, IC
footprints with pin rows, gold edge fingers, silkscreen), a laser-marked SoC
die, brushed/etched EMI shield cans with datamatrix + test points, a stamped
vapor-chamber with serpentine channels and spot welds, speaker grille dot
matrices, camera-deck microtext, and a copper coil spiral on its ferrite pad.

Physical detail: display flex ribbon + board-to-board connector, two EMI
shield cans with five screws, capacitor rows and gold connectors on the board,
battery pull tabs + foil seams + BMS flex that reaches the board, stepped
secondary vapor chamber, charging-port gasket + fixing screws + interconnect
flex, speaker contact springs, haptic flex tail, MEMS mic rubber boots, SIM
weather seal + eject pinhole, selfie/biometric trim rings, separate volume
buttons, mmWave window. Interior layout follows a real flagship: board
upper-right beside the camera, dual-cell battery mid, sub-board at the bottom.
During explosion, layers fan out on a diagonal cascade, and the rear glass +
camera deck turn face-up like parts on a repair bench — all reversible.

## Measured results (2026-07-24, dev preview)

- Desktop 1280×800 Chrome: **~61 FPS** while continuously scrubbing the timeline.
- After the full detail pass (textures + ~60 extra meshes): **~53 FPS** in the
  always-animating overview at 800px/DPR 1.5 in a VM — real hardware runs higher.
- Mobile-width 375–683px (DPR 1.5): smooth scrub. The component card opens as a
  name-only "peek" strip (~13% of the screen) with an expand arrow; tapping it
  grows the sheet to ~44% with Function / Common problems / "More details" and
  the "Check Repair Options" button pinned at the sheet bottom. Each new
  component resets to the peek strip so the 3D scene stays dominant.
- Fallback path: 12 cards, safety warning, CTAs — verified by forcing
  `PG_INSIDE.renderFallback()`.
- Controls verified: Reassemble → p=0, View All → p=0.95, picker → correct card.

Browser notes:
- Chrome/Edge (Blink): native importmap, tested above.
- Firefox 108+/Safari 16.4+: native importmap support; older versions use the
  `es-module-shims` polyfill that is loaded before the importmap.
- No-JS or ancient browsers: section shows heading + final CTA (content cards
  need JS; all key services info also exists elsewhere on the page).
- iOS Safari: `100svh` stage avoids address-bar jump; touch rotation only
  engages on horizontal moves after full explosion, so page scroll is preserved.

## Removing or moving the section

Delete the `<section id="inside-phone">` block, the `<link rel="stylesheet"
href="assets/inside-phone.css">` line, and the five script tags after the main
site IIFE (`inside-phone-data.js` … the `nomodule` line). Nothing else in the
site references these files.
