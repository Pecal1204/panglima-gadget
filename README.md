# Panglima Gadget — Website

Production website built with static HTML, CSS, and JavaScript. Google customer reviews are displayed with a RevuKit embed, so no paid Google API key or backend function is required.

## Files

- `index.html` — main website markup, styles, and site scripts.
- `privacy.html` — privacy notice, including the third-party review widget disclosure.
- `logo.png` — shop logo (transparent PNG).

## Run locally

Open `index.html` in a browser, or serve the folder:

```text
npx serve .
```

## Deploy

The site can be deployed to Cloudflare Pages or any static web host. There is no build step and no server-side secret to configure.

The live Open/Closed badge runs in the browser. RevuKit loads asynchronously from its CDN inside the homepage reviews section.

## What's editable (top of the `<script>` in `index.html`)

- `WHATSAPP_NUMBER` — the WhatsApp number all links use.
- `HOURS` — weekly opening hours (0 = Sunday … 6 = Saturday) driving the live badge.
- `PRICING` — device tabs and pricing rows.

## Confirm before going live

1. **Business hours** — configured as **Mon–Sat 10:00–22:00, Sunday closed**.
2. **Repair prices** — all `RM…+` figures are estimates and should match current shop pricing.
3. **Full street address** — confirm the visible location information matches the Google Business Profile.

## Images

The gallery, hero, and storefront photos load from Google-hosted URLs (`lh3.googleusercontent.com`). These can change or expire over time. For long-term reliability, download and self-host them in `images/`, then update their URLs in `index.html`.

## Google Reviews widget

The homepage uses RevuKit's `detailed-reviews` widget with business ID `RVK-022D4740` and Google Place ID `ChIJbX8NhxyvzTERER0eR77thnE`. These are public widget identifiers, not secret credentials.

The widget uses RevuKit's supported `data-api-base-url` setting so local previews and production both request `https://cdn.revukit.com`. It depends on RevuKit's service availability, caching, plan limits, and privacy terms. As documented in July 2026, RevuKit's free plan includes a watermark, a 250-view monthly limit, and a 30-day review refresh; check the provider's current plan before production launch.
