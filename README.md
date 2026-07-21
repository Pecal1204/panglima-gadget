# Panglima Gadget — Website

Production recreation of the design handoff. A single static page — no backend, no build step.

## Files
- `index.html` — the whole site (HTML + CSS + vanilla JS, self-contained).
- `logo.png` — shop logo (transparent PNG).

## Run locally
Just open `index.html` in a browser, or serve the folder:
```
npx serve .
```

## Deploy
It's a static site — drag the folder into any static host:
- **Netlify / Vercel / Cloudflare Pages** — drop the folder, done.
- **GitHub Pages** — commit these files, enable Pages on the branch.

No server is required. The live Open/Closed badge runs entirely in the browser.

## What's editable (top of the `<script>` in `index.html`)
- `WHATSAPP_NUMBER` — the WhatsApp number all links use.
- `HOURS` — weekly opening hours (0 = Sunday … 6 = Saturday) driving the live badge.
- `PRICING` — device tabs + the pricing cards read from the same object, so prices stay in sync.

## ⚠️ Confirm before going live (placeholders in the current build)
1. **Business hours** — currently assumed **Mon–Sat 10:00–21:00, Sun 10:00–18:00**. Verify against the Google Business Profile and update `HOURS`.
2. **Repair prices** — all `RM…+` figures are estimates. Replace with real rates in `PRICING`.
3. **Full street address** — only the area (Telok Panglima Garang) is shown. Add the full address if you want it public.

## Images
The gallery, hero, and storefront photos load from Google-hosted URLs (`lh3.googleusercontent.com`).
These can change or expire over time — for reliability, download them and self-host in an
`images/` folder, then swap the URLs in `index.html` (the `GALLERY` array plus the hero and
storefront `<img src>`).
```
```
