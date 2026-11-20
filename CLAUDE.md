# ROADNET Distribution Dashboard — Project Context

## What this is
A Next.js web dashboard that connects to the ROADNET API (Harash Ceramics / חרש קרמיקה) and displays distribution planning data: routes, KPIs per route, stop details, and export reports.

Built by Yuvi (יובי לוני) with Claude Code. Production version: v4.x.

## Tech stack
- **Framework**: Next.js 14 (App Router), TypeScript
- **Styling**: Tailwind CSS
- **Languages**: Hebrew (default), English, Spanish — full i18n via `src/i18n/`
- **External integrations**: ROADNET API, Airtable (address verification)

## How to run
```bash
npm install
npm run dev        # → http://localhost:3000
```

Requires `.env.local` with:
```
NEXT_PUBLIC_API_BASE_URL=https://apex-prod-eu-integration.eu.roadnet.com/integration
```

ROADNET username/password are no longer stored in env vars — they're entered on the login screen each session and sent straight through to the ROADNET login API.

Chat panel ("שאל את Claude", `src/components/ChatPanel.tsx` → `/api/chat`): needs `ANTHROPIC_API_KEY` in `.env.local` (restart `npm run dev` after adding it). It runs the ROADNET extension's own tools server from the sibling repo (`../roadnet-plugin/plugins/roadnet/server/dist/index.js`, or `ROADNET_MCP_SERVER`), one process per logged-in session, passing only that session's ROADNET token (`RNA_API_TOKEN`). The extension's graphical views show inside the chat (`src/components/ChatViewFrame.tsx`): each runs in a sandboxed iframe (no site origin, no network, images only from the map tile servers) and talks to the page over the MCP Apps protocol (`AppBridge` from `@modelcontextprotocol/ext-apps`). Server side: `/api/chat/view` (view page), `/api/chat/tool` (tool calls a view makes itself: only view tools and view-only tools), `/api/chat/file` (report files the tools saved in the session's own temp folder, served sandboxed). AI level (`src/lib/aiMode.ts`): `ROADNET_AI_MODE` = `full` (default) | `low` | `off` is the most AI this installation may use; an unknown value counts as `off`. Each user can pick that level or lower in the chat panel (kept in localStorage `roadnet-ai-mode`). `low`: Claude (`ROADNET_CHAT_LOW_MODEL`, default `claude-haiku-5-5`) reads only the question and opens views; the tools server runs with `RNA_AI_MODE=low`, so tool results carry only a view id and the views fetch the data themselves; same-day repeat questions are answered from saved intents with no AI call. `off`: no AI call at all (`/api/chat` returns 403 `ai_off`); views open from the 📊 menu (`ChatViewsMenu.tsx`). In both, "generate insights" (`/api/insights`) uses the local rule-based insights instead of Claude. View tool results are saved for 3 minutes (30 for past dates; a view's refresh skips this). Optional: `ROADNET_CHAT_MODEL` (default `claude-opus-5-5`), `ROADNET_CHAT_PRIVACY_MODE`, `ROADNET_CHAT_HIDE_DRIVER_NAMES`.

## UI design system
Clean, Priority-like UI in Rasner brand colors (navy #043D5C / #072E4B, cyan #00A0E3, green #98B935, font Heebo).
- Tokens: CSS variables in `src/app/globals.css` (light + `[data-theme="dark"]`); Tailwind maps them (`tailwind.config.ts`: `bg-surface`, `text-ink`, `border-line`, `bg-primary`, `text-accent`, `bg-success-soft` ...). Never hard-code colors in components; earlier variable names (`--bg-card`, `--color-blue` ...) are aliases kept for older screens and the chat views.
- Building blocks: `src/components/ui/` (Button/IconButton, Card/CardHeader, Badge, Stat, Meter/MeterCell, Alert/EmptyState/Skeleton, Menu, Drawer). Layout: `src/components/layout/` (AppShell, TopBar, ModuleNav, DateNavigator, PageHeader, PreferenceMenus, BrandMark).
- Screens: `src/features/` (auth: LoginScreen + useSession; plan: PlanScreen, RoutesTable, RouteDrawer, AttentionCard, PlanKpis, exports; addresses: AddressReview). Plan vs actual, driver map and heat map are in `src/components/`.
- Text: new UI strings live in `src/i18n/messages.ts` (typed: Hebrew is the source, en/es must have every key) via `useT()`; older screens still use `t(key, language)` from `translations.ts`.
- Themes: light (default), dark, system (`ThemeContext`, saved in localStorage `theme`). "Hide names" (presentation mode, default on) blurs elements with class `sensitive`. RTL/LTR: use logical classes (`ms-`, `pe-`, `start-`, `text-start`).
- The working date and the screen (`#plan`, `#actual`, `#map`, `#heat`, `#addresses`) are owned by AppShell.

## Key files
```
src/
  app/
    api/           # API routes (proxy to ROADNET, Airtable)
    page.tsx       # Session gate: LoginScreen or AppShell
    layout.tsx     # Heebo font, theme/direction boot script
  components/      # ui/ building blocks, layout/ shell, chat, older screens
  features/        # auth, plan, addresses screens
  context/         # Language and theme contexts
  i18n/            # messages.ts (new UI), translations.ts (older screens)
  lib/
    kpiCalculator.ts    # Core KPI logic — total time, utilization %, insights
    roadnetClient.ts    # ROADNET API client with bearer token auth
    rateLimiter.ts
    sanitize.ts
  types/           # TypeScript types
.claude/
  settings.local.json  # Claude Code allowed commands (Bash, PowerShell, etc.)
  launch.json          # Dev server config (npm run dev → port 3000)
presentation.html      # Standalone HTML presentation for client demos
```

## Authentication flow
- Login → POST to ROADNET API → bearer token stored in httpOnly cookie (`roadnet_token`)
- Token auto-refreshes on expiry
- All API routes validate cookie before proxying to ROADNET

## Current features (v4.x)
- Daily plan: KPI tiles, sortable/searchable routes table, route details drawer, "needs attention" lists, insights (AI or local rules)
- Automatic insights per route (from `kpiCalculator.ts`)
- Routes / stops / orders Excel exports
- Plan vs actual, driver report map, customer heat map
- Address review (Airtable) as its own screen
- Chat with Claude (docked panel) with the extension's views and AI levels
- Multilingual UI (he/en/es), light/dark/system themes

## Working conventions
- The project is in: `C:\Users\yuval\OneDrive - Aman Computers\Claude\Code\routes-report`
- Git is initialized — commit after each meaningful change
- Airtable API credentials are in `.env.local` (not committed to git); ROADNET credentials are entered at login and never stored
- Hebrew is the primary language; RTL layout throughout
- Run `npm run dev` to test locally before committing

## Notes for Claude Code
- `.claude/settings.local.json` already has pre-approved Bash/PowerShell commands — no need to ask for permission on standard operations
- The ROADNET API requires a real session token from login — use `curl` with cookie for local testing
- Airtable integration uses a separate API key stored in env vars
- If the dev server is already running on port 3000, kill it first: `pkill -9 -f node` or `fuser -k 3000/tcp`
