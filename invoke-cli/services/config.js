const fs = require('fs');
const path = require('path');
const os = require('os');

const CONFIG_DIR = path.join(os.homedir(), '.invoke');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir() {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration from file or environment variables
 * @returns {object} Configuration object
 */
function loadConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error) {
    console.error('Error loading config file:', error.message);
  }
  return {};
}

/**
 * Save configuration to file
 * @param {object} config - Configuration object to save
 */
function saveConfig(config) {
  try {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (error) {
    throw new Error(`Failed to save config: ${error.message}`);
  }
}

/**
 * Get API key from environment variable or config file
 * @returns {string|null} API key
 */
function getApiKey() {
  // Environment variable takes precedence
  if (process.env.INVOKE_API_KEY) {
    return process.env.INVOKE_API_KEY;
  }
  
  const config = loadConfig();
  return config.apiKey || null;
}

/**
 * Get base URL from environment variable or config file
 * @returns {string} Base URL (defaults to localhost:3000)
 */
function getBaseUrl() {
  // Environment variable takes precedence
  if (process.env.INVOKE_BASE_URL) {
    return process.env.INVOKE_BASE_URL;
  }

  if (process.env.EXECUTION_SERVICE_URL) {
    return process.env.EXECUTION_SERVICE_URL;
  }
  
  const config = loadConfig();
  return config.baseUrl || 'http://localhost:3000';
}

/**
 * Get execution service URL
 * @returns {string} Execution service URL (defaults to localhost:3001)
 */
function getExecutionUrl() {
  if (process.env.INVOKE_EXECUTION_URL) {
    return process.env.INVOKE_EXECUTION_URL;
  }
  
  const config = loadConfig();
  return config.executionUrl || 'http://localhost:3001';
}

/**
 * Clear all configuration
 */
function clearConfig() {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  } catch (error) {
    throw new Error(`Failed to clear config: ${error.message}`);
  }
}

module.exports = {
  loadConfig,
  saveConfig,
  getApiKey,
  getBaseUrl,
  getExecutionUrl,
  clearConfig,
  CONFIG_FILE
};
