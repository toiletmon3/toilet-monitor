module.exports = {
  apps: [
    {
      name: 'toilet-server',
      script: './apps/server/dist/main.js',
      cwd: '/opt/toilet-monitor',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: 3001,
      },
      env_file: '/opt/toilet-monitor/.env.production',
      error_file: '/var/log/toilet/error.log',
      out_file: '/var/log/toilet/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
