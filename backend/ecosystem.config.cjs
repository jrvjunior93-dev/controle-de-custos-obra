module.exports = {
  apps: [
    {
      name: 'csc-backend',
      cwd: __dirname,
      script: 'dist/index.js',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        PORT: 4000
      }
    }
  ]
};
