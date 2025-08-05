#!/usr/bin/env node

/**
 * Platform-aware Electron launcher
 * 
 * This script automatically detects the platform and environment to determine
 * whether the --no-sandbox flag is needed for Electron.
 * 
 * - macOS/Windows: No sandbox flags (avoids macOS SetApplicationIsDaemon error)
 * - Linux/Docker/CI: Uses --no-sandbox flag (required for container environments)
 */

const { spawn } = require('child_process');
const os = require('os');
const fs = require('fs');
const path = require('path');

// Check if Electron is installed
function checkElectronInstallation() {
  const electronPath = path.join(__dirname, 'node_modules', 'electron');
  return fs.existsSync(electronPath);
}

// Determine if we need --no-sandbox flag
function needsNoSandbox() {
  const platform = os.platform();
  
  // Check for Docker/CI environment
  const isDocker = process.env.DOCKER || 
                   process.env.CI || 
                   process.env.GITHUB_ACTIONS ||
                   fs.existsSync('/.dockerenv');
  
  // Linux environments often need --no-sandbox in containers/CI
  // macOS and Windows generally don't need it for desktop apps
  return platform === 'linux' || isDocker;
}

// Check if dependencies are installed
if (!checkElectronInstallation()) {
  console.error('❌ Electron is not installed. Please run the following command first:');
  console.error('');
  console.error('   npm install');
  console.error('');
  console.error('This will install all required dependencies including Electron.');
  process.exit(1);
}

// Build electron command
const electronArgs = ['.'];
if (needsNoSandbox()) {
  electronArgs.push('--no-sandbox');
}

// For development mode, we might want additional flags
if (process.env.NODE_ENV === 'development') {
  // Add any development-specific flags here if needed
}

console.log(`Starting Electron${needsNoSandbox() ? ' with --no-sandbox' : ''} on ${os.platform()}...`);

// Start Electron
const electron = spawn('npx', ['electron', ...electronArgs], {
  stdio: 'inherit',
  shell: true
});

electron.on('close', (code) => {
  process.exit(code);
});

electron.on('error', (err) => {
  console.error('❌ Failed to start Electron:', err.message);
  
  if (err.code === 'ENOENT') {
    console.error('');
    console.error('This usually means Electron is not properly installed.');
    console.error('Please try running:');
    console.error('');
    console.error('   npm install');
    console.error('');
    console.error('If the issue persists, try:');
    console.error('');
    console.error('   rm -rf node_modules package-lock.json');
    console.error('   npm install');
  }
  
  process.exit(1);
});