const path = require('path');
const fs = require('fs');

// Load .env.production variables for PM2 env block
function loadEnv(filePath) {
  if (!fs.existsSync(filePath)) return {};
  const content = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const val = trimmed.slice(idx + 1).trim().replace(/^["']|["']$/g, '');
    env[key] = val;
  }
  return env;
}

const prodEnv = loadEnv(path.join(__dirname, '.env.production'));

module.exports = {
  apps: [
    {
      name: 'toilet-server',
      script: './apps/server/dist/src/main.js',
      cwd: '/opt/toilet-monitor',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
        ...prodEnv,
      },
      error_file: '/var/log/toilet/error.log',
      out_file: '/var/log/toilet/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
