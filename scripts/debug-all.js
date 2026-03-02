const { spawn } = require('child_process');
const path = require('path');

console.log('🚀 Starting Invoke Debug Environment...\n');

// Environment variables
const env = {
  ...process.env,
  NODE_ENV: 'development'
};

// Start Invoke Execution Service
console.log('🔧 Starting Invoke Execution Service on port 3001...');
const executionService = spawn('node', ['--inspect=9230', 'server.js'], {
  cwd: path.join(__dirname, '../invoke-execution'),
  stdio: 'inherit',
  env: { ...env, PORT: '3001' }
});

// Start Invoke Gateway Service
console.log('🔀 Starting Invoke Gateway Service on port 3002...');
const gatewayService = spawn('node', ['--inspect=9231', 'server.js'], {
  cwd: path.join(__dirname, '../invoke-gateway'),
  stdio: 'inherit',
  env: {
    ...env,
    PORT: '3002',
    EXECUTION_SERVICE_URL: 'http://localhost:3001'
  }
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
  gatewayService.kill('SIGINT');
  adminPanel.kill('SIGINT');
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n🛑 Shutting down services...');
  executionService.kill('SIGTERM');
  gatewayService.kill('SIGTERM');
  adminPanel.kill('SIGTERM');
  process.exit(0);
});

executionService.on('close', (code) => {
  console.log(`⚠️  Execution service exited with code ${code}`);
});

gatewayService.on('close', (code) => {
  console.log(`⚠️  Gateway service exited with code ${code}`);
});

adminPanel.on('close', (code) => {
  console.log(`⚠️  Admin panel exited with code ${code}`);
});

console.log('\n✅ All services are starting up...');
console.log('📊 Admin Panel: http://localhost:3000 (or next available port)');
console.log('🔧 Execution Service: http://localhost:3001');
console.log('🔀 Gateway Service: http://localhost:3002');
console.log('🐛 Debug ports: Admin (9229), Execution (9230), Gateway (9231)');
console.log('\nPress Ctrl+C to stop all services\n');