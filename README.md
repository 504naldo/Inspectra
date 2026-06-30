# Inspectra

Inspectra is a multi-tenant fire protection operating system: customer/site
records, scheduling, technician mobile workflows, device inspections, deficiency
tracking, branded PDF reports, repair quotes, work orders, invoicing, payroll,
and analytics for fire protection companies.

The public marketing website lives in a separate repository
(`504naldo/inspectra-website`); this repo is the secure application only.

## Documentation

See **[`docs/README.md`](./docs/README.md)**. Key entry points:
[Production Readiness register](./docs/PRODUCTION_READINESS.md) ·
[Deployment runbook](./docs/runbooks/DEPLOYMENT.md) ·
[Core workflow validation](./docs/CORE_WORKFLOW_VALIDATION.md) ·
[Customer report privacy](./docs/CUSTOMER_REPORT_PRIVACY.md) ·
[Trust claims policy](./docs/TRUST_CLAIMS.md).

## Stack

- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui, tRPC client
- **Backend**: Express + tRPC server, Drizzle ORM (MySQL/PlanetScale), S3/R2 storage
- **PDF**: PDFKit (server-side)
- **Auth**: Google OAuth via `jose`
- **Deploy**: Railway (auto-deploys on `main` push)

## Getting Started (GitHub Codespaces / Dev Container)

This repo includes a `.devcontainer/devcontainer.json` so it can be opened
directly in GitHub Codespaces or VS Code Dev Containers with Node 20 and
pnpm preconfigured.

1. **Open in Codespaces** — from the GitHub repo page, click **Code → Codespaces
   → Create codespace on this branch** (or open the folder in VS Code with the
   Dev Containers extension). The container builds automatically and runs
   `postCreateCommand`, which installs dependencies with pnpm and copies
   `.env.example` to `.env` if `.env` doesn't already exist.

2. **Install dependencies** (only needed if you're not using the dev container,
   or dependencies change later):
   ```bash
   corepack enable
   corepack prepare pnpm@10.4.1 --activate
   pnpm install --frozen-lockfile
   ```

3. **Add environment variables** — edit `.env` (created from `.env.example`)
   and fill in real values for the features you need. At minimum, set
   `DATABASE_URL` and `JWT_SECRET` to enable data features and auth. Every
   other section in `.env.example` is optional and the related feature
   degrades gracefully (or is disabled) when its variables are empty. **Never
   commit `.env`.**

4. **Run database migrations manually** — migrations live in
   `drizzle/migrations/`. PlanetScale/MySQL does not support `ALTER TABLE`
   inside a transaction, so apply new migration SQL manually against your
   database (e.g. via the Railway/PlanetScale console or a MySQL client)
   rather than running an automated push against a production database.
   `pnpm db:push` (drizzle-kit generate + migrate) is available for local/dev
   databases only.

5. **Run seed / backfill scripts safely** — scripts under `scripts/` (e.g.
   `pnpm seed:nfpa-templates`, `pnpm master-data:validate`) are for populating
   or reconciling data. Most have a `:dry` variant (e.g.
   `pnpm seed:nfpa-templates:dry`) — always run the dry-run first and review
   the output before running the mutating version against real data.

6. **Start the dev server**:
   ```bash
   pnpm dev
   ```
   This starts the Express/tRPC API and Vite dev server together
   (`server/_core/index.ts` via `tsx watch`).

7. **Open the forwarded ports** — Codespaces/VS Code will prompt to open port
   `5173` (Vite dev server, the app UI) automatically. Port `5000` (API server)
   is also forwarded for direct API access if needed.

8. **Run checks before committing**:
   ```bash
   pnpm check   # tsc --noEmit (type check)
   pnpm test    # vitest run
   pnpm build   # vite build + esbuild server bundle
   ```

9. **Rebuild the container** if `.devcontainer/devcontainer.json` or
   dependencies change significantly: in VS Code/Codespaces, run
   **Dev Containers: Rebuild Container** (or **Codespaces: Rebuild Container**)
   from the command palette to pick up the changes cleanly.

10. **Troubleshooting**:
    - *App starts but data features are disabled* — `DATABASE_URL` is unset or
      unreachable; the app intentionally starts without a database, but most
      pages will show empty states.
    - *Auth/login doesn't work* — set `JWT_SECRET` and the `GOOGLE_CLIENT_ID` /
      `GOOGLE_CLIENT_SECRET` pair from the Google Cloud Console.
    - *AI assistant features are missing* — `OPENAI_API_KEY` is optional; AI
      features degrade gracefully without it.
    - *Port already in use* — stop any other process bound to `5000`/`5173`,
      or change `forwardPorts` in `.devcontainer/devcontainer.json`.
    - *`pnpm install` fails on a postinstall/build step* — ensure Corepack is
      enabled (`corepack enable`) and you're using pnpm `10.4.1` as pinned in
      `package.json`.

## Database Migrations

Migrations live in `drizzle/migrations/`. After merging schema changes, run
the SQL manually on Railway/PlanetScale (PlanetScale does not support
`ALTER TABLE` in transactions).
