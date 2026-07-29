# "Inside Your Smartphone" — 3D exploded-view section

A scroll-driven 3D teardown embedded in `index.html` between **Services** and
**Process**. The assembled chapter renders the exact supplied 4.5 MB iPhone 11 GLB. Its real
display assembly opens first while the exact frame remains visible, then a
high-detail iPhone 11 component reconstruction takes over in the same registered
space. It is aligned to the supplied teardown references, intended for repair
education, and is not official Apple service data.

Model provenance: **“Iphone 11” by atomle** ([Sketchfab source](https://sketchfab.com/3d-models/iphone-11-558b8e99bbd4483b9bb2182d8dc72de2)),
licensed [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/).
## Files

| File | Purpose |
|---|---|
| `assets/inside-phone-data.js` | **The only file you need to edit.** All text, WhatsApp number, message templates, colours. |
| `assets/inside-phone-fallback.js` | Builds every card/label/picker from the data file; renders the accessible non-WebGL fallback. |
| `assets/inside-phone.js` | The real-time 3D experience (ES module, Three.js 0.160 pinned via importmap). |
| `assets/models/iphone-11-reference.glb` | Exact supplied textured exterior shown during the assembled chapter (4.5 MB, CC BY 4.0). |
| `assets/inside-phone.css` | All styles, scoped under `#inside-phone` — cannot leak into the rest of the site. |
| `index.html` | Section markup (`<section id="inside-phone">`), its stylesheet link, and the ordered fallback/import-map/module/watchdog script stack. |

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
  `0–10%` exact exterior reveal → `10–23%` display opening and visual handoff →
  `19–49%` staged teardown → `51–92%` guided tour of 12 repairable systems →
  `92–100%` full overview.
- **Interaction**: drag to rotate (desktop any time after opening; touch only
  once fully exploded so page scrolling is never hijacked), hover highlight,
  click/tap a part → jumps to its card, side picker list (desktop), *Reassemble*
  and *All Components* buttons.
- **States**: loader ("Loading iPhone 11 model…"), errors, reduced motion,
  unavailable WebGL, and old browsers use the accessible fallback. Mobile
  devices using Data Saver, a 2G-class connection, at most 2 GB reported
  memory, or at most 2 reported CPU cores also use the fallback. The static
  teardown contains the same 12 component cards and CTAs.
- **Performance**: Three.js and the 4.5 MB exterior GLB begin loading only when
  the section is within 1200 px of the viewport. Rendering pauses off-screen,
  pixel ratio is capped, and capable phones retain the interactive experience
  with mobile-specific antialiasing and geometry detail.
## Outer-to-inner iPhone 11 polish (2026-07-28)

The chapter no longer dissolves the supplied phone into an unrelated generic
interior. The real GLB display group lifts first; the real frame stays in place
until the reconstructed assembly is mechanically registered underneath it. Its
18 component assemblies then follow the supplied references from front to back:

1. bonded Liquid Retina LCD, touch layer, glass, rear shield and display flexes;
2. earpiece speaker, front camera/TrueDepth flex and service brackets;
3. vertical wide/ultra-wide rear camera module and its shared flex;
4. one long stacked logic board with EMI shields and graphite thermal film;
5. SIM tray/reader, Taptic Engine, bottom loudspeaker and 3110 mAh battery;
6. full-width Lightning/lower flex and three-microphone array;
7. rear interior plate, wireless/NFC coil, aluminium rail, camera plateau,
   buttons, SIM seam, port openings and antenna breaks.

Parts remain mechanically registered while assembled. During teardown they
first lift away from their mounting plane, then travel into separate desktop and
mobile exploded layouts. Small lateral offsets keep brackets and flex cables
readable. The stamped display back, graphite films, flex tails, stepped logic
board, BMS, foil seams, dual-camera barrels, OIS cradle, SIM apertures, Taptic
label, speaker vents, coil, fasteners, housing wells and metal shielding are
individually modelled with differentiated glass, metal, gasket, foam, PCB and
flex materials.

The supplied exploded JPG was used only as a visual reference and is not
bundled with the deployed site. The geometry is original code-native artwork;
it does not claim manufacturer tolerances or replace a service manual.

## Performance and validation

The exterior GLB is preserved byte-for-byte and receives only scene-level
material, light and visibility treatment at runtime. Procedural parts use
chamfered geometry and deterministic generated canvas materials, so there are no
additional teardown image downloads. The heavy Three.js imports and exterior
GLB stay deferred until the section is near the viewport. Higher-capability
mobile devices retain antialiasing and fuller detail; constrained devices use
reduced geometry and pixel ratio. Data Saver, 2G-class, and explicitly
low-capability mobile devices receive the accessible static teardown instead.
Desktop adds real-time shadows while every layout retains a lightweight contact
shadow. All 12 guided-tour card IDs are checked against one matching 3D assembly.
## Browser notes
- Chrome/Edge (Blink): native importmap, tested above.
- Firefox 108+/Safari 16.4+: native importmap support; older versions use the
  `es-module-shims` polyfill that is loaded before the importmap.
- No-JS or ancient browsers: section shows heading + final CTA (content cards
  need JS; all key services info also exists elsewhere on the page).
- iOS Safari: `100svh` stage avoids address-bar jump; touch rotation only
  engages on horizontal moves after full explosion, so page scroll is preserved.

## Removing or moving the section

Delete the `<section id="inside-phone">` block, the matching stylesheet link,
and every script block under the `INSIDE YOUR SMARTPHONE — scripts` comment
after the main site IIFE. Nothing else in the site references these files.
