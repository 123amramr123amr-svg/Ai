# Architecture: Manus clone

## Stack
- Web: Next.js (App Router) + TypeScript — matches default; Vercel hosting.
- Styling: Tailwind + design tokens from replica/design/tokens.json.
- DB: Postgres (Neon) + Drizzle ORM.
- Auth: Auth.js (email + OAuth providers).
- Payments: Stripe Checkout + Billing.
- Email: Resend.
- Files: Cloudflare R2 (or Supabase Storage).
- Jobs: Vercel Cron + Inngest.
- Mobile: Expo (later).

One database, no microservices.

## Schema
See replica/schema.sql. Tables: users, accounts, sessions, tasks, messages, artifacts, connectors, oauth_tokens, projects, automations, credits, teams, team_members, api_keys.

## API
- POST /api/auth/* (Auth.js)
- GET/POST /api/tasks, GET /api/tasks/:id, POST /api/tasks/:id/messages
- GET/POST /api/artifacts, GET /api/artifacts/:id
- GET/POST /api/connectors, POST /api/connectors/:id/oauth/callback
- GET/POST /api/projects
- GET/POST /api/automations
- POST /api/stripe/webhook, POST /api/stripe/checkout
- GET /api/credits

## Risky parts
1. Task execution engine (agent loop) — core; needs LLM + tool use + sandboxed code execution.
2. OAuth connector security — token storage, refresh, scopes.
3. Billing/credits idempotency — webhook double delivery.

## Build order
1. Vertical slice: sign up -> prompt -> task -> result (ugly).
2. Must-haves: web app builder, preview/publish, connectors, projects, billing.
3. Should-haves: media generators, research, automations.
4. Could-haves: remaining connectors, mobile, team/SSO.
