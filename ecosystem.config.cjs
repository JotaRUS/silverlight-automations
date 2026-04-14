/**
 * PM2 application definitions. Always run from the repository root so `cwd` matches `.env` and `dist/`.
 *
 * Prereqs: `npm run build` at repo root; `cd frontend && npm run build` for the Next.js app.
 *
 * Usage:
 *   pm2 delete all   # optional: clear a broken saved list
 *   pm2 start ecosystem.config.cjs
 *   pm2 save
 */
const path = require('path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'api',
      cwd: root,
      script: 'dist/app/server.js',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'worker',
      cwd: root,
      script: 'dist/workers/server.js',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'scheduler',
      cwd: root,
      script: 'dist/scheduler/server.js',
      instances: 1,
      exec_mode: 'fork'
    },
    {
      name: 'frontend',
      cwd: path.join(root, 'frontend'),
      script: 'npm',
      args: 'run start',
      instances: 1,
      exec_mode: 'fork'
    }
  ]
};
