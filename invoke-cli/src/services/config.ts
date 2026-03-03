import fs from 'fs';
import path from 'path';
import os from 'os';

const CONFIG_DIR = path.join(os.homedir(), '.invoke');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

/**
 * Ensure config directory exists
 */
function ensureConfigDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

/**
 * Load configuration from file or environment variables
 * @returns Configuration object
 */
function loadConfig(): Record<string, string> {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      const content = fs.readFileSync(CONFIG_FILE, 'utf8');
      return JSON.parse(content);
    }
  } catch (error: any) {
    console.error('Error loading config file:', error.message);
  }
  return {};
}

/**
 * Save configuration to file
 * @param config - Configuration object to save
 */
function saveConfig(config: Record<string, string>): void {
  try {
    ensureConfigDir();
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
  } catch (error: any) {
    throw new Error(`Failed to save config: ${error.message}`);
  }
}

/**
 * Get API key from environment variable or config file
 * @returns API key or null
 */
function getApiKey(): string | null {
  // Environment variable takes precedence
  if (process.env.INVOKE_API_KEY) {
    return process.env.INVOKE_API_KEY;
  }

  const config = loadConfig();
  return config.apiKey || null;
}

/**
 * Get base URL from environment variable or config file
 * @returns Base URL (defaults to localhost:3000)
 */
function getBaseUrl(): string {
  // Environment variable takes precedence
  if (process.env.INVOKE_BASE_URL) {
    return process.env.INVOKE_BASE_URL;
  }

  const config = loadConfig();
  return config.baseUrl || 'http://localhost:3000';
}

/**
 * Get execution service URL
 * @returns Execution service URL (defaults to localhost:3001)
 */
function getExecutionUrl(): string {
  if (process.env.INVOKE_EXECUTION_SERVICE_URL) {
    return process.env.INVOKE_EXECUTION_SERVICE_URL;
  }

  if (process.env.EXECUTION_SERVICE_URL) {
    return process.env.EXECUTION_SERVICE_URL;
  }

  const config = loadConfig();
  return config.executionUrl || 'http://localhost:3001';
}

/**
 * Clear all configuration
 */
function clearConfig(): void {
  try {
    if (fs.existsSync(CONFIG_FILE)) {
      fs.unlinkSync(CONFIG_FILE);
    }
  } catch (error: any) {
    throw new Error(`Failed to clear config: ${error.message}`);
  }
}

export { loadConfig, saveConfig, getApiKey, getBaseUrl, getExecutionUrl, clearConfig, CONFIG_FILE };
