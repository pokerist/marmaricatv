module.exports = {
  apps: [
    {
      name: 'marmarica-tv-server',
      script: 'server/index.js',
      env: {
        NODE_ENV: 'production',
        PORT: 5000,
        SESSION_SECRET: 'Qw73o9Gx#h!sZm42nXvtp8bLaT@E0RuQj'  // Same as in .env
      },
      error_file: './logs/err.log',
      out_file: './logs/out.log',
      log_file: './logs/combined.log',
      time: true,
      max_restarts: 10,
      min_uptime: '10s',
      max_memory_restart: '1G'
    },
    {
      name: 'marmarica-tv-client',
      script: 'node_modules/.bin/react-scripts',
      args: 'start',
      cwd: './client',
      watch: false,
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    }
  ]
};
