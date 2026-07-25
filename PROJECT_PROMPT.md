# Wallet Note VPS Handoff Prompt

This document is the recovery and continuation prompt for the production
Wallet Note project after reinstalling or replacing the local Windows PC.

Copy the prompt below into a new Codex task after Windows setup.

---

## Prompt

I need you to continue development and production management of my existing
Wallet Note application.

### Production Resources

- GitHub source repository:
  `https://github.com/maharshwemobile-lgtm/wallet-note-multitenant`
- Live website: `https://walletnote.maharshwe.online`
- VPS SSH host: `root@165.22.2.177`
- SSH private key: I will provide its new Windows path.
- Production database: PostgreSQL on the VPS
- Process manager: PM2
- PM2 application name: `wallet-note`
- Reverse proxy: Nginx
- Nginx site:
  `/etc/nginx/sites-enabled/walletnote.maharshwe.online`
- Scheduled 3D synchronization:
  `/etc/cron.d/wallet-note-three-d`
- Application architecture: Next.js standalone, PostgreSQL, multi-tenant SaaS

The previous Windows project path no longer exists and must not be assumed.
Clone the GitHub repository into a suitable folder on this new PC and use that
clone as the development source.

### First-Time Recovery on the New PC

1. Confirm that Git, Node.js 20 or newer, npm, and GitHub authentication are
   available.
2. Clone the GitHub repository into a new local folder.
3. Read `PROJECT_PROMPT.md`, `README.md`, `package.json`, the Prisma schema, and
   the current Git status before changing files.
4. Use the SSH key path I provide to connect to the VPS.
5. Discover the current live release and port from PM2 and Nginx. Do not assume
   that an old release directory or port is still current:

   ```powershell
   ssh -i "<NEW_SSH_KEY_PATH>" root@165.22.2.177 "pm2 describe wallet-note"
   ssh -i "<NEW_SSH_KEY_PATH>" root@165.22.2.177 "grep -n proxy_pass /etc/nginx/sites-enabled/walletnote.maharshwe.online"
   ```

6. Check the live health endpoint:

   ```powershell
   Invoke-RestMethod "https://walletnote.maharshwe.online/api/health"
   ```

7. Treat GitHub as the source-code source of truth. The VPS standalone release
   is a production build and must not be used as the normal development source.
8. The current production `.env.production` remains on the VPS. Never display,
   download unnecessarily, commit, or expose its secrets.

### New Feature Request

Implement this request completely:

`[WRITE THE NEW FEATURE OR FIX HERE]`

Do not stop after analysis or a plan. Continue through implementation, testing,
GitHub publishing, candidate deployment, and final live verification.

### Project Safety Rules

1. Preserve the current Wallet Note UI and existing user workflows unless the
   request explicitly requires a redesign.
2. Do not use hardcoded production data. Use the real API and PostgreSQL.
3. Enforce business, tenant, branch, session, and permission boundaries on the
   server.
4. Never allow one registered business to read or modify another business's
   data.
5. Keep desktop and mobile layouts responsive.
6. Maintain English and Myanmar labels for new visible functionality.
7. Preserve unrelated user changes in the local Git working tree.
8. Do not commit API keys, passwords, tokens, SSH keys, database URLs, or
   production environment files.
9. Add audit records for important data and administrative actions.
10. Add clear validation messages and focused automated tests.

### Resources That Must Not Be Modified

This VPS hosts other applications. Do not modify, restart, delete, redeploy, or
reconfigure any unrelated resource, including:

- `app.maharshwe.shop`
- `maharshwe.online/pos`
- PM2 applications other than `wallet-note`
- Nginx sites other than `walletnote.maharshwe.online`
- unrelated databases, repositories, cron files, and `/var/www` directories

### Required Development Checks

1. Inspect the relevant frontend, APIs, services, Prisma models, permissions,
   tenant filtering, and tests.
2. Implement the frontend and backend behavior end to end.
3. Run:

   ```powershell
   npm install
   npm run lint
   npm test
   npm run build
   git diff --check
   ```

4. Resolve relevant failures before publishing.
5. Commit only the intended files with a clear commit message.
6. Push to the GitHub `main` branch.
7. Create a new GitHub release with accurate release notes.

### Required VPS Deployment Procedure

1. Read the current PM2 process and Nginx configuration to discover the live
   release directory and port.
2. Check disk space before uploading. The VPS disk is small, so do not retain
   unnecessary archives or old releases.
3. Build a fresh Next.js standalone package from the GitHub-backed local source.
4. Upload it into a new uniquely named directory under `/var/www`.
5. Copy `.env.production` from the currently running Wallet Note release into
   the candidate release without printing its contents.
6. Start the candidate on an unused localhost port with a temporary PM2 name.
7. Verify the candidate before switching traffic:
   - application health;
   - PostgreSQL connectivity;
   - authentication protection;
   - static assets;
   - the newly implemented UI/API behavior;
   - tenant and permission boundaries.
8. Run `nginx -t` before reloading Nginx.
9. Point only the Wallet Note Nginx site to the verified candidate port.
10. Update only `/etc/cron.d/wallet-note-three-d` if its localhost port changed.
11. Replace the old `wallet-note` PM2 process with the verified candidate and
    run `pm2 save`.
12. Verify the public domain and API health again.
13. Remove the previous Wallet Note release and temporary archive only after the
    new release is confirmed healthy.
14. Resolve and verify the exact absolute old release path before deleting it.
15. Check disk usage after cleanup.

### Progress and Final Report

Give short Myanmar-language progress updates while inspecting, editing, testing,
publishing, candidate testing, and deploying.

At completion, report:

- implemented features;
- tenant and validation protections;
- lint, tests, and production-build results;
- live website link;
- GitHub release link;
- live database and API status;
- any incomplete item or remaining risk.

---

## Before Reinstalling Windows

The live website and PostgreSQL data remain on the VPS and are not removed by a
Windows reinstall. However, access credentials stored only on this PC can be
lost.

Back up these items to an encrypted USB drive or another secure offline
location:

1. `C:\Users\KMA\.ssh\maharshwe_codex_vps`
2. `C:\Users\KMA\.ssh\maharshwe_codex_vps.pub`
3. Any separate VPS, domain registrar, DNS, GitHub, RapidAPI, or email recovery
   credentials that are not already available on another trusted device.

Never upload the private SSH key to GitHub, the public repository, chat, or an
unencrypted cloud folder.

After restoring the private key on the new Windows installation, restrict its
file permissions and provide its new local path when starting a Codex task.

