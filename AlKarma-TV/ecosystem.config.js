module.exports = {
  apps: [
    {
      name: 'alkarma-tv-server',
      script: 'server/index.js',
      watch: ['server'],
      env: {
        NODE_ENV: 'development',
      },
      env_production: {
        NODE_ENV: 'production',
      }
    },
    {
      name: 'alkarma-tv-client',
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
