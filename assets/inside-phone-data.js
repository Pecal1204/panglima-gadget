/* =============================================================================
   INSIDE YOUR SMARTPHONE — editable content & configuration
   -----------------------------------------------------------------------------
   This is the ONLY file the shop needs to edit for text, colours, links and the
   WhatsApp number. No build step — just save and re-deploy.

   • Change the WhatsApp number ............ CONFIG.whatsappNumber
   • Change any card wording ............... CARDS[...]
   • Change headings / CTA copy ............ CONFIG.copy
   • Change accent colours ................. CONFIG.colors (also mirrored in CSS
                                             variables at the top of
                                             assets/inside-phone.css)
   ========================================================================== */
(function (root) {
  "use strict";

  var CONFIG = {
    /* The shop WhatsApp number in international format, digits only. */
    whatsappNumber: "60105339970",

    /* Pre-filled WhatsApp messages. {part} is replaced with the component name. */
    messages: {
      diagnosis: "Hi Panglima Gadget, I'd like to book a repair diagnosis for my smartphone.",
      general:   "Hi Panglima Gadget, I'd like to ask about your repair services.",
      part:      "Hi Panglima Gadget, I think my phone's {part} may have a problem. Can you help me check the repair options?"
    },

    /* Optional: a link for the primary "Get a Repair Diagnosis" button. Leave as
       "" to use WhatsApp (messages.diagnosis). Set to e.g. "#top" to scroll to
       the on-page quote widget instead. */
    diagnosisLink: "",

    /* Accent colours for the 3D scene + UI. Keep the graphite base; blue + orange
       are the highlight colours. (Mirror these in inside-phone.css if changed.) */
    colors: {
      graphite:   "#0b0b0e",
      panel:      "#111119",
      blue:       "#3aa0ff",
      blueDeep:   "#1b6ffe",
      orange:     "#ff7a1a",
      copper:     "#c9772f",
      aluminium:  "#c8ccd2",
      titanium:   "#9aa0aa",
      pcb:        "#16413a",
      silicon:    "#14151a",
      glassTint:  "#0e1830"
    },

    /* Section copy (headings, intro, hint, final CTA, trust line). */
    copy: {
      eyebrow:      "Inside Your Smartphone",
      openingTitle: "Every Part Has a Purpose",
      openingDesc:  "Scroll to explore what happens inside your smartphone — and discover the warning signs when an important component begins to fail.",
      scrollHint:   "Scroll to inspect",
      loading:      "Preparing device diagnostics…",
      deviceName:   "Panglima X1",
      deviceTag:    "Reference teardown model",

      finalTitle:   "Not Sure Which Part Is Failing?",
      finalDesc:    "Our technicians can diagnose screen, battery, camera, charging, audio and motherboard problems before recommending the right repair.",
      finalPrimary: "Get a Repair Diagnosis",
      finalSecondary: "Chat on WhatsApp",
      trust:        "Professional diagnostics • Quality replacement parts • Transparent repair advice",

      cardCta:      "Check Repair Options",
      skip:         "Skip 3D exploration",
      reassemble:   "Reassemble Phone",
      viewAll:      "View All Components"
    },

    /* SEO supporting paragraph — written naturally, not keyword-stuffed. */
    seo: "Panglima Gadget provides professional phone repair in Malaysia with honest smartphone diagnostics. From screen replacement and battery replacement to camera repair, charging-port repair, speaker repair and board-level motherboard repair, our technicians identify the real fault before recommending a fix."
  };

  /* ---------------------------------------------------------------------------
     COMPONENT CARDS
     One entry per interactive component. `id` links to the 3D part.
     `warning` (optional) renders a highlighted safety note.
     Keep the language concise and customer-friendly.
     ------------------------------------------------------------------------- */
  var CARDS = {
    display: {
      name: "OLED Display & Touch Digitizer",
      tag: "Screen replacement",
      function: "Displays images and detects your touch input.",
      symptoms: "Cracked glass, coloured lines, black spots, flickering, ghost touch or a completely blank screen.",
      causes: "Impact damage, pressure, water exposure or a damaged display connector.",
      repair: "Screen inspection, connector testing or complete display replacement."
    },
    camera: {
      name: "Main Camera System",
      tag: "Camera repair",
      function: "Captures photos and videos using multiple lenses, sensors and stabilisation hardware.",
      symptoms: "Blurry photos, shaking images, black camera preview, difficulty focusing or cracked lens glass.",
      causes: "Impact damage, dust, moisture or failure of the autofocus and stabilisation mechanism.",
      repair: "Camera cleaning, lens-glass replacement or camera-module replacement."
    },
    battery: {
      name: "Battery",
      tag: "Battery replacement",
      function: "Stores and supplies electrical energy to the entire smartphone.",
      symptoms: "Fast battery drain, unexpected shutdowns, overheating, slow charging or battery swelling.",
      causes: "Battery ageing, heat exposure, damaged charging accessories or excessive charge cycles.",
      repair: "Battery health test followed by safe replacement when required.",
      warning: "A swollen battery should not be pressed, punctured or charged."
    },
    earpiece: {
      name: "Earpiece Speaker",
      tag: "Speaker repair",
      function: "Produces the voice audio heard during normal phone calls.",
      symptoms: "Very low call volume, distorted voices, crackling sound or no audio during calls.",
      causes: "Dust blockage, moisture, damaged mesh or speaker failure.",
      repair: "Professional cleaning, audio testing or earpiece replacement."
    },
    loudspeaker: {
      name: "Bottom Loudspeaker / Buzzer",
      tag: "Speaker repair",
      function: "Produces ringtone, notification, music, video and speakerphone audio.",
      symptoms: "Low volume, buzzing, distorted sound or no external audio.",
      causes: "Dust, liquid exposure, damaged speaker diaphragm or poor connector contact.",
      repair: "Speaker cleaning, contact inspection or buzzer-module replacement."
    },
    proximity: {
      name: "Proximity Sensor",
      tag: "Sensor repair",
      function: "Turns off the screen when the phone is held near your face during a call.",
      symptoms: "The screen remains on during calls, accidental button presses or the display stays black after a call.",
      causes: "Blocked sensor area, incorrect screen installation, damaged flex cable or sensor failure.",
      repair: "Sensor calibration, screen alignment or sensor-flex replacement."
    },
    motherboard: {
      name: "Motherboard",
      tag: "Motherboard repair",
      function: "Connects and controls the processor, memory, storage, cameras, network and power systems.",
      symptoms: "The phone will not turn on, restarts repeatedly, loses signal, overheats or cannot detect important components.",
      causes: "Liquid damage, electrical short circuit, impact damage or failed board-level components.",
      repair: "Detailed diagnostics and microsoldering by a trained board-repair technician."
    },
    chargingport: {
      name: "Charging Port",
      tag: "Charging-port repair",
      function: "Provides wired charging and data communication.",
      symptoms: "Loose cable connection, intermittent charging, slow charging or no computer connection.",
      causes: "Compacted lint, corrosion, bent contacts or a damaged charging board.",
      repair: "Safe cleaning, port testing or charging-port replacement."
    },
    wireless: {
      name: "Wireless Charging & NFC Coil",
      tag: "Charging repair",
      function: "Enables wireless charging and short-range NFC communication.",
      symptoms: "Wireless charging does not work, charging disconnects or contactless features fail.",
      causes: "Damaged coil, misalignment, rear-housing damage or loose internal connection.",
      repair: "Coil inspection, alignment check or module replacement."
    },
    cooling: {
      name: "Cooling System",
      tag: "Thermal service",
      function: "Moves heat away from the processor using a vapor chamber and graphite layers.",
      symptoms: "Excessive heat, performance slowdown, gaming lag or sudden shutdowns.",
      causes: "Poor thermal contact, damaged graphite material, battery problems or abnormal processor load.",
      repair: "Thermal inspection, internal cleaning and replacement of damaged thermal materials."
    },
    haptic: {
      name: "Haptic Motor",
      tag: "Component repair",
      function: "Creates precise vibration feedback for calls, notifications and touch interactions.",
      symptoms: "Weak vibration, rattling noise, irregular vibration or no vibration.",
      causes: "Impact damage, loose mounting or motor failure.",
      repair: "Mounting inspection or haptic-motor replacement."
    },
    microphones: {
      name: "Microphones",
      tag: "Audio repair",
      function: "Capture voice for calls, recordings, videos and noise cancellation.",
      symptoms: "Muffled voice, low recording volume, static sound or callers cannot hear the user.",
      causes: "Blocked microphone opening, moisture, damaged flex cable or audio-circuit failure.",
      repair: "Microphone cleaning, audio diagnostics or component replacement."
    }
  };

  /* Order of the guided component tour (must match card ids above). */
  var TOUR = [
    "display", "camera", "battery", "motherboard", "chargingport",
    "wireless", "cooling", "earpiece", "loudspeaker", "proximity",
    "haptic", "microphones"
  ];

  root.PG_INSIDE_DATA = { config: CONFIG, cards: CARDS, tour: TOUR };
})(window);
