# Recon: Manus (manus.im)

Target: https://manus.im — AI agent platform ("Hands On AI"). Public marketing + help center only; no login.

## Product
General-purpose AI agent that builds apps, creates media, researches the web, automates recurring work, and connects 3rd-party apps. Web app at /app, plus mobile/desktop.

## Screens (public)
- Home (/): prompt box "What can I do for you?" with quick chips (Create slides, Build website, Create games, Video, Design, More). Hero "Less structure, more intelligence."
- Features (/features): categorized feature grid (Build, Create, Research, Automate, Connectors).
- Pricing (/pricing)
- Feature detail pages: /features/webapp, /features/video, /features/video-editor, /features/wide-research, /features/game-dev, /features/figma-to-code, /features/app-publishing, /features/manus-browser-operator, /features/cloud-computer, /features/automations, /features/mail, /features/agent-skills, /features/skills, /features/projects, /features/meta-ads, /features/connectors
- Tool pages: /tools/ai-design, /tools/nano-banana-pro-slides, /tools/ai-image-generator, /tools/ai-music-generator, /tools/mobile-app-builder
- Integrations: /integrations/slack, /connectors/{app}
- Compare: /compare/vs-chatgpt, /compare/lovable, /compare/manus-vs-replit
- Resources: /blog, /docs, /updates, /download, /desktop, /about, /team, /startups, /playbook, /brand, /events, /fellows
- Account/Auth: /app (sign in/up), /terms, /privacy

## Core flows
1. Guest lands on /, types prompt or picks chip -> sign-in/up -> /app task session.
2. Build web app: prompt -> agent plans/builds -> preview -> publish/deploy.
3. Create media: slides/video/design/image/music via dedicated tools.
4. Research: wide research / browser operator / cloud computer.
5. Automate: automations, mail, projects.
6. Connectors: OAuth connect third-party app -> use in tasks.
7. Team plan: /team, SSO, billing.

## Components
Prompt composer with chips, feature cards, connector cards, pricing table, nav (Features/Solutions/Resources/Events/Business/Pricing), footer link groups, language switcher (30+ locales), auth modals.

## Inferred data model
users, sessions/tasks, messages, artifacts (apps, slides, videos, images), connectors (oauth tokens), projects, automations, billing/credits, teams, api keys.

## Feature matrix (high level)
- Must: prompt-driven agent task execution, web app builder, preview/publish, connectors (OAuth), auth, billing/credits, projects, file/artifact storage.
- Should: video/slides/design/image/music generators, wide research, browser operator, cloud computer, automations, mail, agent skills, mobile app builder.
- Could: game dev, figma-to-code, meta ads, 60+ connectors, mobile/desktop apps, team/SSO.

## Out of scope (not features)
Model hosting internals, proprietary model weights, third-party networks.

## Notes
Marketing site is JS-rendered; pricing details not captured statically. Help center (help.manus.im) has billing/account/feature docs. Public pages only.
