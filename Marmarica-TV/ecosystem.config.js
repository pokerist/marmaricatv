module.exports = {
  apps: [{
    name: 'marmarica-tv',
    script: 'server/index.js',
    env_production: {
      NODE_ENV: 'production',
      PORT: 80
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env_file: 'server/.env.production',
    error_file: 'logs/error.log',
    out_file: 'logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true
  }]
};
