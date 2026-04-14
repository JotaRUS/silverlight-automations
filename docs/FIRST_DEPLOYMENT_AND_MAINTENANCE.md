# First Deployment and Maintenance Guide

## 0) Recommended VM and OS

For this stack (API + worker + scheduler + frontend + PostgreSQL + Redis), use:

- OS image: **official Ubuntu 24.04 LTS (Canonical)**
- Machine type (minimum): **2 vCPU / 4 GB RAM**
- Recommended for smoother operation: **2 vCPU / 8 GB RAM**
- Disk: **30-50 GB SSD**
- Network: external IPv4 enabled (later converted to static)

Notes:

- Avoid very small machines for all-in-one deployments.
- Avoid relying on ephemeral external IP addresses.

## 1) Connect to the VM

From your local machine:

```bash
gcloud auth login
gcloud compute ssh <vm-instance-name> --zone=<zone> --project=<project-id>
```

If the resource is "not found", verify the exact instance name:

```bash
gcloud compute instances list --project=<project-id>
```

## 2) Base server preparation

On the VM:

```bash
sudo apt update && sudo apt upgrade -y
sudo apt install -y docker.io docker-compose-v2 git nginx certbot python3-certbot-nginx
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo usermod -aG docker $USER
newgrp docker
```

## 3) Clone and configure the application

```bash
git clone <repo-url>
cd <repo-folder>
cp .env.example .env
```

Edit `.env` and set real values (minimum):

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `PROVIDER_ENCRYPTION_SECRET`

**How to edit `.env` on Ubuntu (SSH or local terminal)**

From the project folder (where `.env` lives), use an editor in the terminal:

- **nano** (simplest): `nano .env` — move with arrow keys; edit the lines you need. **Save:** `Ctrl+O`, then `Enter` to confirm the filename. **Exit:** `Ctrl+X`. If it asks to save unsaved changes, press `Y` then `Enter`.
- **vim** (if you prefer): `vim .env` — press `i` to insert, edit, then `Esc`, type `:wq`, `Enter` to save and quit (`:q!` quits without saving).

Generate secure secrets:

```bash
openssl rand -hex 32
```

If the API logs `JWT_SECRET` / `PROVIDER_ENCRYPTION_SECRET` “must contain at least 32 character(s)” but `.env` looks correct, something in the environment may be **overriding** the file (empty or short `JWT_SECRET` from an old shell export or systemd). The app loads `.env` with **override** so values in `.env` win; also check: `env | grep -E '^JWT_|^PROVIDER_'` before starting PM2, and use `pm2 restart all --update-env` after editing `.env`.

## 4) Start Postgres and Redis

```bash
docker compose up -d postgres redis
```

If Postgres fails with "address already in use" on `5432`, find what is bound:

```bash
sudo ss -tlnp | grep 5432
```

Then stop/remove the conflicting process or service, and retry.

## 5) Install dependencies and run migrations

Backend root:

```bash
npm install
npx prisma migrate deploy
```

Frontend:

```bash
cd frontend
npm install --legacy-peer-deps
cd ..
```

Why `--legacy-peer-deps` may be required:

- Some environments resolve `eslint`/`eslint-config-next` peer versions differently.

## 6) Seed the first admin user

The first admin user is defined in `prisma/seed.ts`, but it is **not auto-run** by default.

Load env vars and run seed:

```bash
cd <repo-folder>
export $(grep -v '^#' .env | xargs) && npx tsx prisma/seed.ts
```

If you get "Environment variable not found: DATABASE_URL", it means `.env` was not loaded into the shell.

## 7) Run processes with PM2

Install PM2 (global install usually needs sudo):

```bash
sudo npm install -g pm2
```

Build backend and frontend (production):

```bash
npm run build
cd frontend
npm run build
cd ..
```

Start everything with one **ecosystem file** (recommended: correct `cwd` per app so `.env` and `dist/` paths resolve; avoids half the “everything errored” cases from wrong working directory):

```bash
cd <repo-folder>
pm2 start ecosystem.config.cjs
```

Or start processes manually (must run `api` / `worker` / `scheduler` from the **repo root**, not from `frontend/`):

```bash
npm run build
pm2 start dist/app/server.js --name api
pm2 start dist/workers/server.js --name worker
pm2 start dist/scheduler/server.js --name scheduler
cd frontend && npm run build && cd ..
pm2 start npm --name frontend -- run start
```

**About `pm2 start all`:** it only **restarts whatever is already saved** in PM2’s dump (`pm2 save`). It does **not** fix crash loops. If apps flip to `errored` seconds after looking `online`, the cause is usually **the process exiting** (bad env, DB/Redis down, validation errors) or the **Linux OOM killer** on small-RAM hosts when Docker + several Node processes run together—not a PM2 “sync” issue.

When things look stuck:

```bash
pm2 logs api --lines 80 --nostream
pm2 logs worker --lines 80 --nostream
sudo dmesg -T | tail -80
free -h
```

If `dmesg` shows “Out of memory” / “Killed process”, add **swap** or reduce concurrent services / container memory limits.

After editing `.env`, reload env into PM2: `pm2 restart all --update-env` (or delete and `pm2 start ecosystem.config.cjs` again).

Persist PM2 across reboots:

```bash
pm2 save
pm2 startup
```

Run the extra `sudo` command printed by `pm2 startup`.

## 8) Validate application health

```bash
pm2 status
curl http://localhost:3000/api/v1/auth/csrf
curl -I http://localhost:3001
```

Expected:

- PM2 processes are `online`
- API responds (401 is acceptable on auth endpoints without cookie)
- Frontend returns HTTP response

## 9) Create local SSH tunnels for remote debugging

Run from your **local machine** (not from inside the VM shell):

```bash
gcloud compute ssh <vm-instance-name> \
  --zone=<zone> \
  --project=<project-id> \
  -- -L 3000:localhost:3000 -L 3001:localhost:3001 -L 5432:localhost:5432 -L 6379:localhost:6379
```

Then open locally:

- `http://localhost:3001`

## 10) Reserve and attach a static public IP (critical)

Ephemeral IPs can change after restart/maintenance and break DNS/certificates.

Reserve:

```bash
gcloud compute addresses create <static-ip-name> \
  --project=<project-id> \
  --region=<region>
```

Get the IP value:

```bash
gcloud compute addresses describe <static-ip-name> \
  --project=<project-id> \
  --region=<region> \
  --format="get(address)"
```

Attach to VM:

```bash
gcloud compute instances delete-access-config <vm-instance-name> \
  --project=<project-id> \
  --zone=<zone> \
  --access-config-name=external-nat

gcloud compute instances add-access-config <vm-instance-name> \
  --project=<project-id> \
  --zone=<zone> \
  --access-config-name=external-nat \
  --address=<static-ip-value>
```

Important:

- Access config name is commonly `external-nat` (lowercase).
- `--address` expects the **IP value**, not the address resource name.

## 11) DNS setup for your subdomain

Create DNS record:

- Type: `A`
- Host: `<subdomain>`
- Value: `<static-ip-value>`

Wait for DNS propagation and verify:

```bash
dig <subdomain> +short
```

## 12) Open ports 80/443 in GCP

Create ingress rule:

```bash
gcloud compute firewall-rules create allow-http-https \
  --project=<project-id> \
  --direction=INGRESS \
  --action=ALLOW \
  --rules=tcp:80,tcp:443 \
  --source-ranges=0.0.0.0/0 \
  --target-tags=http-server,https-server
```

Attach tags to VM:

```bash
gcloud compute instances add-tags <vm-instance-name> \
  --zone=<zone> \
  --project=<project-id> \
  --tags=http-server,https-server
```

## 13) Configure Nginx reverse proxy

Create site config:

```bash
sudo nano /etc/nginx/sites-available/<app-name>
```

Use proxy rules:

- `/` -> `http://localhost:3001`
- `/api/` -> `http://localhost:3000`

Enable and validate:

```bash
sudo ln -s /etc/nginx/sites-available/<app-name> /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

If `nginx -t` fails with `server_names_hash_bucket_size`, set in `/etc/nginx/nginx.conf` inside `http { ... }`:

```nginx
server_names_hash_bucket_size 128;
```

Then retest and reload.

## 14) Issue SSL certificate

```bash
sudo certbot --nginx -d <subdomain>
```

If certbot fails with timeout:

1. Verify DNS points to current static IP.
2. Verify firewall allows `tcp:80` and `tcp:443`.
3. Verify Nginx is running and listening on port 80:
   ```bash
   sudo systemctl status nginx
   sudo ss -tlnp | grep :80
   ```
4. Retry certbot after propagation.

## 15) Operational hardening and stability

### Prevent SSH disconnects

On local machine (`~/.ssh/config`):

```ssh
Host *
  ServerAliveInterval 60
  ServerAliveCountMax 3
```

### Reduce OOM risk

Create swap (example 2 GB):

```bash
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

### Ensure auto-restart on reboot

```bash
pm2 save
pm2 startup
```

## 16) Troubleshooting quick references

### Login page loops/reloads continuously

- Use the latest frontend code where auth 401 handling does not hard-refresh repeatedly.
- Restart services:
  ```bash
  pm2 restart api frontend
  ```

### `429 Too Many Requests` on login

- Usually caused by repeated auth calls during a bad client loop.
- Restart API and confirm latest auth handling code is deployed:
  ```bash
  pm2 restart api
  ```

### Frontend shows network errors intermittently

- Check tunnel/session stability and process health:
  ```bash
  pm2 status
  pm2 logs api --lines 100
  free -h
  ```

## 17) Updating the system after new git commits

Use this runbook on the VM whenever you deploy updates:

```bash
cd <repo-folder>
git fetch --all
git pull
npm install
npx prisma migrate deploy
npm run build

cd frontend
npm install --legacy-peer-deps
npm run build
cd ..

pm2 restart api worker scheduler frontend
pm2 status
```

Recommended post-update checks:

```bash
curl -I http://localhost:3001
curl http://localhost:3000/api/v1/auth/csrf
```

If process startup behavior changed, persist PM2 again:

```bash
pm2 save
```

## 18) Optional maintenance cadence

- Weekly:
  - `sudo apt update && sudo apt upgrade -y`
  - check `pm2 status`
  - verify SSL renew timer:
    ```bash
    systemctl list-timers | grep certbot
    ```
- Monthly:
  - test backup/restore paths for database
  - review disk usage:
    ```bash
    df -h
    ```

