#!/usr/bin/env node

const { spawn } = require('child_process');
const path = require('path');

console.log('\n=== Starting Backend in Billing Test Mode ===\n');
console.log('Billing will run every 1 minute for testing');
console.log('Press Ctrl+C to stop\n');

// Set environment variables for test mode
const env = {
  ...process.env,
  BILLING_TEST_MODE: 'true',
  NODE_ENV: 'development'
};

// Start the backend with test mode
const backend = spawn('npm', ['run', 'start'], {
  cwd: path.join(__dirname, '..'),
  env: env,
  stdio: 'inherit'
});

backend.on('error', (error) => {
  console.error('Failed to start backend:', error);
});

backend.on('close', (code) => {
  console.log(`Backend process exited with code ${code}`);
});

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\nStopping backend...');
  backend.kill('SIGINT');
  process.exit(0);
});