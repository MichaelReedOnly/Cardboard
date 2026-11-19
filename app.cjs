const path = require('node:path');
const {loadEnvFile} = require('node:process');

loadEnvFile(path.join(__dirname, '.env'));

import('./server.js').catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
