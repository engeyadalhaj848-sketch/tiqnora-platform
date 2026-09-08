# Tiqnora AI — first website version

A fast, dependency-free bilingual (Arabic RTL / English LTR) portfolio and technology-solutions site for Eyad Abdullah.

## Included

- Three switchable visual themes: Midnight, Pearl, and Desert.
- Arabic/English toggle with saved visitor preference.
- Responsive layout for mobile, tablet, and desktop.
- Services, editable project placeholders, approach, and contact sections.
- SEO basics: canonical URL, language alternates, robots, sitemap, and factual Person JSON-LD.
- No fabricated metrics, testimonials, phone numbers, addresses, or project results.

## Edit content

The visible bilingual content is centralized in `script.js` under `translations.ar` and `translations.en`. Update those values to change copy without changing the layout. Theme tokens are at the top of `styles.css` under `html[data-theme]`.

## Contact configuration

The first version uses the verified email address `eng.eyadalhaj848@gmail.com`, LinkedIn, and GitHub. WhatsApp and a server-side form are intentionally not displayed until a real number/provider is configured. The form opens a prefilled email draft and does not pretend to send or store data.

## Run locally

Open `index.html` directly, or serve the folder with any static web server. No package installation is required.

## Deploy

The project is dependency-free. Vercel runs `npm run build`, which copies the site into `dist/` for static delivery. The included `vercel.json` adds basic security headers. Add `tiqnora.com` in Vercel's Domains settings, then set the DNS records Vercel provides at the domain registrar.
