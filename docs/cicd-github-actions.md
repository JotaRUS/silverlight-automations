# CI/CD with GitHub Actions (Main -> VM)

This deployment path automatically updates the VM whenever commits are pushed to `main`.

## What is included

- GitHub Actions workflow: `.github/workflows/deploy-main.yml`
- Trigger: push to `main` (and manual run via `workflow_dispatch`)
- Deployment method: SSH into VM and run build/restart commands

## 1) Required GitHub repository secrets

Add these in GitHub -> Settings -> Secrets and variables -> Actions -> Repository secrets:

- `DEPLOY_HOST` - VM public IP or hostname
- `DEPLOY_USER` - SSH username on the VM
- `DEPLOY_SSH_KEY` - private SSH key content used by Actions (PEM/OpenSSH, multiline)
- `DEPLOY_PATH` - absolute path to the repo on the VM (for example `/home/<user>/<repo-folder>`)

The workflow uses SSH port `22` by default. If you need a non-default port, edit the workflow and add a fixed `port:` value.

## 2) One-time VM prerequisites

On the VM, ensure:

- Repo is already cloned at `DEPLOY_PATH`
- `.env` is present and correct
- Docker + Docker Compose are installed
- PM2 is installed globally
- App has been successfully started at least once

## 3) What the workflow does on each push to `main`

1. SSH to VM
2. `git fetch` + `git checkout main` + `git pull --ff-only`
3. Ensure `postgres` and `redis` are running (`docker compose up -d`)
4. Backend:
   - `npm ci`
   - `npx prisma migrate deploy`
   - `npm run build`
5. Frontend:
   - `npm ci --legacy-peer-deps`
   - `npm run build`
6. PM2:
   - restart existing `api`, `worker`, `scheduler`, `frontend` (or start if missing)
   - `pm2 save`

## 4) Operational notes

- The workflow is serialized with `concurrency` to avoid overlapping deploys.
- Deployment stops immediately on command failure (`set -euo pipefail` and `script_stop: true`).
- Use manual run in Actions tab (`workflow_dispatch`) to re-run a deploy without pushing.

## 5) Rollback approach (simple)

On the VM:

```bash
cd <DEPLOY_PATH>
git log --oneline -n 10
git checkout <previous-commit-sha>
npm ci
npx prisma migrate deploy
npm run build
cd frontend && npm ci --legacy-peer-deps && npm run build && cd ..
pm2 restart api worker scheduler frontend
pm2 save
```

Then fix forward with a new commit to `main` when ready.
