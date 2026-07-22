# TBLOG

TBLOG is a Nuxt 3 full-stack blog deployed as a Cloudflare Worker with Workers Assets, D1,
Drizzle, Vue 3, TypeScript, and pnpm.

The application includes database-backed articles, Markdown editing, administrator management,
moderated comments, RSS, sitemap, SEO, optional search, analytics, and media/cache integrations.

## Local Development

Install dependencies and start the Nuxt development server:

```powershell
pnpm install
pnpm dev
```

Run the checks:

```powershell
pnpm typecheck
pnpm test
pnpm build
```

## Cloudflare Deployment

Production deployment uses `npx wrangler deploy`. The Worker configuration provisions the installation
D1 binding and registers Cron Triggers. Configure `SESSION_SECRET`, run the migrations, and complete
administrator setup separately.
