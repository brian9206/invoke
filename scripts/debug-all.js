const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Invoke Debug Environment...\n');

// Environment variables
const env = {
  ...process.env,
  NODE_ENV: 'development',
  DB_HOST: 'localhost',
  DB_PORT: '5432',
  DB_NAME: 'invoke_db',
  DB_USER: 'postgres',
  DB_PASSWORD: 'invoke_password_123',
  MINIO_ENDPOINT: 'localhost',
  MINIO_PORT: '9000',
  MINIO_ACCESS_KEY: 'invoke-minio',
  MINIO_SECRET_KEY: 'invoke-minio-password-123',
  MINIO_BUCKET: 'invoke-functions'
};

// Start Invoke Execution Service
console.log('🔧 Starting Invoke Execution Service on port 3001...');
const executionService = spawn('node', ['--inspect=9230', 'server.js'], {
  cwd: path.join(__dirname, '../invoke-execution'),
  stdio: 'inherit',
  env: { ...env, PORT: '3001' }
});

// Start Invoke Admin Panel
console.log('🌐 Starting Invoke Admin Panel...');
const adminPanel = spawn('npm', ['run', 'dev'], {
  cwd: path.join(__dirname, '../invoke-admin'),
  stdio: 'inherit',
  env
});

// Handle process termination
process.on('SIGINT', () => {
  console.log('\n🛑 Shutting down services...');
  executionService.kill('SIGINT');
  adminPanel.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down services...');
  executionService.kill('SIGTERM');
  adminPanel.kill('SIGTERM');
  process.exit(0);
});

executionService.on('close', (code) => {
  console.log(`⚠️  Execution service exited with code ${code}`);
});

adminPanel.on('close', (code) => {
  console.log(`⚠️  Admin panel exited with code ${code}`);
});

console.log('\n✅ Both services are starting up...');
console.log('📊 Admin Panel: http://localhost:3000 (or next available port)');
console.log('🔧 Execution Service: http://localhost:3001');
console.log('🐛 Debug ports: Admin (9229), Execution (9230)');
console.log('\nPress Ctrl+C to stop all services\n');