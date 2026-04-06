# Inspectra — Claude Code Guidelines

## Git Workflow

1. **Develop on the assigned feature branch** (e.g. `claude/enable-shared-drive-browsing-nNO52`).
2. **Commit** with clear, descriptive messages.
3. **Push the feature branch** to `origin`.
4. **Immediately merge into `main`** and push `main`:
   ```bash
   git checkout main
   git pull origin main
   git merge --no-ff <feature-branch> -m "<commit message>"
   git push origin main
   ```
5. Every session ends with `main` reflecting all completed work — no changes stay only on a feature branch.

## Stack

- **Frontend**: React 19 + Vite, TypeScript, Tailwind CSS v4, shadcn/ui, tRPC client
- **Backend**: Express + tRPC server, Drizzle ORM (MySQL/PlanetScale), S3/R2 storage
- **PDF**: PDFKit (server-side, async pre-fetch pattern for images)
- **Auth**: Google OAuth via `jose`
- **Deploy**: Railway (auto-deploys on `main` push)

## Database Migrations

Migrations live in `drizzle/migrations/`. After merging schema changes, run the SQL manually on Railway (PlanetScale does not support `ALTER TABLE` in transactions).

## Key Conventions

- tRPC procedures: `protectedProcedure`, `officeProcedure`, `technicianProcedure`, `adminOrOfficeProcedure`
- Finalized jobs (`finalizedAt != null`) are immutable — all mutations must check this first
- PDF generators must pre-fetch all async resources (images, signatures) **before** entering the synchronous `new Promise` PDFKit callback
