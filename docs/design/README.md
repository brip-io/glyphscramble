# Delivery map

The parent initiative is split into independently reviewable milestones. Each milestone must keep the public payload contract compatible and add a Changeset when it changes a published package.

1. Font pipeline
2. Unicode mapping engine
3. Request engine
4. Complex-script and performance qualification
5. React and Next
6. Vue and Nuxt
7. Svelte and SvelteKit
8. Astro, Vite, and vanilla/static
9. Demo, benchmarks, and BRIP funnel
10. Public release hardening

Dependency order is font pipeline → Unicode engine → request engine → qualification/adapters → demo/docs → release. The beta scaffold implements the contracts across all ten surfaces; qualification fixtures and public-release approval remain explicit gates rather than implied claims.
