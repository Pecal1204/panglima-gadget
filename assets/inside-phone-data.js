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
      /* Shown under the section heading. The X1 is our own illustrative model:
         it follows the layout common to 2019-era flagships so the guide applies
         broadly, but it is not a diagram of any particular manufacturer's phone
         and no real model is implied. */
      deviceNote:   "The Panglima X1 is an illustrative model built for this guide. Layouts vary between manufacturers and models — bring your device in and we will check the actual hardware.",

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
      name: "OLED Display Panel",
      tag: "Screen replacement",
      spec: "One sealed screen unit: the glass, the touch layer and the picture layer are bonded into a single part.",
      function: "Shows everything you look at and picks up every tap, swipe and long press.",
      symptoms: "Cracked or shattered glass, black or white patches, coloured lines down the screen, flickering, areas that no longer respond to touch, the screen tapping or typing by itself, or a screen that stays completely dark while the phone still rings and vibrates.",
      causes: "Drops and knocks, pressure while the phone is in a pocket or bag, liquid seeping under the panel, or a connector that has worked loose after an earlier repair.",
      repair: "The glass, the touch layer and the picture layer are bonded into one sealed part, so the screen is replaced as a complete unit rather than layer by layer, along with the adhesive seal around its edge."
    },
    camera: {
      name: "Rear Dual Camera Module",
      tag: "Camera repair",
      spec: "Two rear cameras on one shared bracket — a steadied main camera and a wide-view camera.",
      function: "Takes your photos and videos: one camera for everyday shots and a second that fits much more of the scene into the frame.",
      symptoms: "Blurry or hazy photos, a rattle you can hear when the phone moves, focus that hunts back and forth, a black preview from one of the two cameras, or spots and flare in every shot.",
      causes: "Drops that knock the steadying mechanism out of alignment — this is usually what the rattle is — scratched or cracked lens covers, dust and moisture inside the barrels, or a ribbon cable that has slipped out of its socket.",
      repair: "Cleaning and lens-cover replacement where the trouble is on the outside of the glass; otherwise the pair is replaced as one unit, since both cameras share a bracket and cannot be separated."
    },
    battery: {
      name: "Battery",
      tag: "Battery replacement",
      spec: "A single rechargeable pouch cell, about 4 mm thick, held down by adhesive strips.",
      function: "Stores and supplies the energy that runs the whole phone between charges.",
      symptoms: "Charge dropping far faster than it used to, shutdowns while the meter still shows power left, warmth when the phone is doing nothing, slow charging, or a screen or back panel that has begun to lift.",
      causes: "Normal ageing across hundreds of charge cycles, long spells in heat such as a parked car, poor-quality chargers and cables, or a knock that has damaged the cell.",
      repair: "We check the battery's health first. If it needs replacing, the loudspeaker and the vibration motor are lifted clear so the adhesive strips underneath the cell can be released and the old battery removed.",
      warning: "A swollen or puffed-up battery must not be pressed, punctured or charged. Bring the phone in as it is and keep it away from heat."
    },
    motherboard: {
      name: "Motherboard",
      tag: "Motherboard repair",
      spec: "The phone's main board, built as two thin boards stacked face to face.",
      function: "The main circuit board. It carries the processor and the storage, and every other part of the phone plugs into it.",
      symptoms: "The phone stays completely dead even after an hour on a known-working charger, restarts by itself, drops signal, runs hot while sitting idle, or suddenly stops detecting the screen, a camera or the SIM card. If the phone revives on a charger, the battery is the more likely culprit.",
      causes: "Liquid getting inside, a short circuit after a knock or a poor-quality charger, a cracked solder joint beneath the processor, or a socket damaged during a previous repair.",
      repair: "Fault tracing down to individual components and microsoldering — repair under a microscope — by a board-repair technician. The two stacked boards are only separated when the fault sits on the hidden inner face."
    },
    chargingport: {
      name: "Charging Port Assembly",
      tag: "Charging-port repair",
      spec: "One wide ribbon cable that runs the full width of the phone's bottom edge.",
      function: "Carries power in when you plug a cable in, moves files to and from a computer, and holds the microphone you speak into on calls.",
      symptoms: "The cable feels loose or needs holding at an angle, charging starts and stops overnight, charging has become slow, or a computer no longer recognises the phone.",
      causes: "Lint compacted into the connector by months of plugging in, corrosion after moisture, bent or worn contacts, or a cable that has been pulled sideways.",
      repair: "We clear the connector and run a charge test first, because a port packed with lint often behaves exactly like a failed one. If the assembly itself has failed it is replaced as one complete ribbon, with the colour-matched seal ring carried across to the new part."
    },
    wireless: {
      name: "Wireless Charging Coil",
      tag: "Charging repair",
      spec: "A flat coil of wire bonded inside the back of the phone, with a magnetic shield behind it.",
      function: "Lets the phone charge by sitting on a pad, with no cable plugged in.",
      symptoms: "The phone will not charge on a pad at all, charging keeps starting and stopping, it only works in one exact position, or it grows noticeably warm while sitting on the charger.",
      causes: "A cracked or bent back panel, a coil bonded back badly after a previous repair, a lead pinched during reassembly, or a thick case or metal card sitting between the phone and the pad.",
      repair: "Alignment and charge testing against a pad we know is good, then inspection of the coil and its connection. The coil is bonded inside the back of the phone and its lead is soldered rather than plugged in, so this is board-level work or a replacement of the whole back housing, not a quick swap."
    },
    cooling: {
      name: "Graphite Thermal Layer",
      tag: "Overheating diagnosis",
      spec: "Several very thin graphite films with no moving parts — no fan, no pump and no liquid.",
      function: "Spreads heat away from the processor and into the metal frame and the back of the phone, so warmth is shed over a wide surface instead of building up in one spot.",
      symptoms: "The phone becomes uncomfortably warm during video calls, navigation or gaming, then slows down, dims the screen or shuts itself off to cool.",
      causes: "Graphite films torn or left out of position after an earlier repair, a battery that has aged to the point where it warms up under normal use, a damaged charger or cable, or an app quietly keeping the processor busy in the background.",
      repair: "We watch the phone's temperature while it runs demanding apps and clean the inside. There are no separate cooling parts to swap on this design, so lasting overheating is traced back to the battery, the main board or software instead."
    },
    earpiece: {
      name: "Earpiece Speaker",
      tag: "Speaker repair",
      spec: "A single small speaker sitting behind the slot at the top of the screen.",
      function: "Produces the voice you hear when the phone is held to your ear, and also serves as the upper channel of the stereo pair.",
      symptoms: "Callers sound faint, muffled or crackly, you keep the volume at maximum just to follow a conversation, or music loses one side of its stereo balance.",
      causes: "Dust and lint packed into the slot, sweat or rain, a torn protective mesh, or a speaker that has simply worn out with age.",
      repair: "Cleaning of the slot and mesh, then a call-audio test. If the speaker itself has failed, the screen has to be opened first, because the speaker is attached to the back of it."
    },
    loudspeaker: {
      name: "Bottom Loudspeaker",
      tag: "Speaker repair",
      spec: "A sealed plastic sound box, the bulkiest single part in the bottom of the phone.",
      function: "Handles ringtones, alerts, music, video and speakerphone audio, venting through the grille beside the charging connector.",
      symptoms: "Ringtones so quiet you miss calls, buzzing or rattling at high volume, distorted music, or no sound at all from the bottom of the phone.",
      causes: "Dust and pocket lint in the grille, water that has soaked into the enclosure, a damaged diaphragm, or a connector that has lost proper contact.",
      repair: "Grille cleaning and audio testing first, then replacement of the sealed sound box and its seal if the speaker itself has failed."
    },
    proximity: {
      name: "Front Sensor Cluster",
      tag: "Sensor repair",
      spec: "Three small sensors and a microphone on one ribbon cable, fixed to the back of the screen.",
      function: "Switches the display off when you hold the phone to your ear, adjusts brightness to the light around you, and lights your face for the 3D face scan.",
      symptoms: "The screen stays lit against your cheek so you mute or end calls by accident, brightness stops adapting to daylight and darkness, or face unlock no longer recognises you.",
      causes: "The cluster rides on the back of the screen, so a drop, a cracked panel or a rushed screen swap can disturb it; dust in the openings, moisture and a pinched ribbon cable do the same.",
      repair: "Careful transfer of the original sensor strip onto the replacement screen, re-seating its screws, then testing each sensor in turn. One thing worth knowing before you book: on phones built this way the 3D face-scanning parts are matched to the main board at the factory, so face unlock may not work with a replacement strip. We check this and explain it before any part is changed."
    },
    haptic: {
      name: "Linear Vibration Motor",
      tag: "Component repair",
      spec: "A small sealed block, roughly the size of a postage stamp and only a few millimetres thick, lying flat beside the battery.",
      function: "Produces the short, precise taps you feel for calls, notifications, the keyboard and on-screen controls.",
      symptoms: "Vibration that has gone weak or silent, a loose rattle you hear while walking, or a buzz that drags on longer than the alert itself.",
      causes: "A hard drop that shifts the motor in its pocket, mounting screws that have worked loose, water getting inside, or a motor that has simply worn out after years of use.",
      repair: "Checking the three mounting screws and the bracketed connector, then replacing the sealed motor if it still does not respond correctly on test."
    },
    microphones: {
      name: "Microphone Array",
      tag: "Audio repair",
      spec: "Three microphone openings: one on the bottom edge, one at the top of the screen and one beside the rear cameras.",
      function: "Picks up your voice on calls, records sound alongside video, and gives the phone enough information to cancel background noise.",
      symptoms: "People say you sound distant or muffled, voice notes come out quiet or hissy, or calls sound hollow and cut in and out when you speak.",
      causes: "Lint compacted into a pinhole, moisture after rain or a spill, a damaged ribbon cable at the bottom of the phone, or a fault in the audio circuit.",
      repair: "Clearing the port openings, testing each microphone separately to find which one is affected, then replacing the ribbon cable that carries it if that is where the fault sits."
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
