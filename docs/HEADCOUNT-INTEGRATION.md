# Headcount workforce integration

Vendored from cbrock84/headcount at 7d3ddf170a85a67565cbbdcda4e9539d32e5a2c4 (MIT).

The four skill bodies and their source references are bundled in lib/v6/workforce/headcount-skills.js; license is adjacent. No runtime download, package installation, new credentials or database migration is required.

Bindings:
- marketing, content, social-media, ads: brand voice and marketing copywriting.
- sales: brand voice and sales enablement.
- developer: code review.

The shared agent-runtime registry injects instructions into primary and delegated workforce prompts and exposes skills through runtime-status. Existing tool permissions remain in force. Saudi context and verified company memory take precedence over generic examples; US source references are not Saudi legal authority. The voice skill helps create a guide; it does not mean a company voice guide has already been approved.

Deploy the platform server update to activate in production. Test with node --test tests/v6-headcount-skills.test.mjs. These tests verify prompt wiring and boundaries, not live model quality. Roll back by removing the import, spread, bindings and context from agent-runtime.js.
