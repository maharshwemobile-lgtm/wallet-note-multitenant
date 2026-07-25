# Wallet Note Project Prompt

Use this prompt when continuing development, testing, releasing, and deploying
the Wallet Note project with Codex or another coding agent.

## Project Information

- Local project: `C:\Users\KMA\Documents\New project\wallet-note-deploy`
- GitHub repository: `https://github.com/maharshwemobile-lgtm/wallet-note-multitenant`
- Live website: `https://walletnote.maharshwe.online`
- VPS host: `165.22.2.177`
- SSH key: `C:\Users\KMA\.ssh\maharshwe_codex_vps`
- Database: PostgreSQL
- Process manager: PM2
- Reverse proxy: Nginx
- Application type: Multi-tenant SaaS

## Main Instructions

Work only inside the local project path listed above. Do not use or modify
another project folder, repository, worktree, or website.

Complete the requested feature from source inspection through implementation,
testing, GitHub release, and final VPS deployment. Do not stop after providing
only a plan.

## Engineering Rules

1. Inspect the existing source, database schema, APIs, permissions, tests, and
   UI conventions before editing.
2. Preserve the current UI design. Add new functionality using the existing
   components, layout, colors, and interaction patterns.
3. Do not use hardcoded application data. Use real APIs and PostgreSQL.
4. Keep every business's data isolated by tenant or business ID.
5. Enforce tenant, branch, session, and permission checks on the server. Client
   checks alone are not sufficient.
6. Never expose one user's or business's data to another tenant.
7. Make new interfaces responsive on desktop and mobile.
8. Add appropriate English and Myanmar labels for new user-facing features.
9. Preserve existing user changes and avoid unrelated refactoring.
10. Do not commit API keys, passwords, database URLs, tokens, private keys, or
    production environment files to GitHub.
11. Record important create, update, delete, import, export, settlement, and
    administrative actions in the audit log where appropriate.
12. Return clear validation errors that identify the affected field or row.

## Requested Feature

Implement the following request completely:

`[WRITE THE NEW FEATURE REQUEST HERE]`

Examples:

- Add a new Wallet Note or Mini Mart function.
- Fix an API, saving, login, mobile layout, or validation problem.
- Add CSV template, export, preview, validation, and import functionality.
- Add tenant-safe admin reporting or audit records.

## Required Development Flow

1. Check the Git working tree and preserve unrelated changes.
2. Inspect the relevant frontend, API routes, services, database models,
   permissions, and automated tests.
3. Implement the complete frontend and backend behavior.
4. Add server-side authorization and tenant isolation.
5. Add or update focused automated tests.
6. Run formatting or diff checks, lint, all automated tests, TypeScript checks,
   and the production build.
7. Fix all relevant failures before publishing.
8. Commit only the intended files with a clear commit message.
9. Push the completed commit to the GitHub `main` branch.
10. Create a new GitHub release with clear release notes.

## VPS Deployment Flow

1. Build a fresh Next.js standalone production package.
2. Upload it as a new, uniquely named release directory.
3. Copy the production environment file from the current live release without
   displaying or committing its secrets.
4. Start the new release on an unused candidate port.
5. Verify candidate health, PostgreSQL connectivity, authentication protection,
   static assets, and the new API or feature.
6. Switch Nginx to the candidate only after verification succeeds.
7. Update any Wallet Note cron jobs to the new live port.
8. Rename and save the PM2 process configuration.
9. Verify the public live domain, database health, authentication boundary, and
   new feature again.
10. Remove the previous release and temporary archive only after the new release
    is confirmed healthy.
11. Verify the absolute old release path before deleting it.
12. Check VPS disk usage after cleanup.

Do not modify `app.maharshwe.shop`, `maharshwe.online/pos`, or unrelated PM2,
Nginx, database, repository, or project resources.

## Status Updates

Provide short Myanmar-language progress updates while:

- inspecting the source;
- implementing frontend and API changes;
- running tests and the production build;
- pushing to GitHub;
- testing the VPS candidate;
- completing the live deployment.

## Final Report

At completion, report:

- the features implemented;
- validation and tenant-safety behavior;
- lint, test, and production-build results;
- the live website link;
- the GitHub release link;
- database and API health;
- any incomplete work or remaining risk.

