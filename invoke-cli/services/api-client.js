const axios = require('axios');
const fs = require('fs');
const { getApiKey, getBaseUrl } = require('./config');

/**
 * Make an authenticated API request
 * @param {string} method - HTTP method (GET, POST, PUT, DELETE, PATCH)
 * @param {string} path - API path (e.g., '/api/functions')
 * @param {object} options - Additional options (body, query params, etc.)
 * @returns {Promise} - Response data
 */
async function request(method, path, options = {}) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('No API key configured. Run "invoke config:set --api-key <your-key>" first.');
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  const headers = {
    'x-api-key': apiKey,
    ...options.headers
  };

  // Add Content-Type for JSON requests
  if (options.body && typeof options.body === 'object' && !options.formData) {
    headers['Content-Type'] = 'application/json';
  }

  const config = {
    method,
    url,
    headers,
    params: options.params,
    data: options.body,
    timeout: options.timeout || 30000, // 30 second default timeout
  };

  // Handle form data (file uploads)
  if (options.formData) {
    config.data = options.formData;
    // axios will set Content-Type automatically for FormData
  }

  try {
    const response = await axios(config);
    return response.data;
  } catch (error) {
    if (error.response) {
      // Server responded with error
      const status = error.response.status;
      const message = error.response.data?.message || error.response.statusText;
      
      if (status === 401) {
        throw new Error('Authentication failed. Your API key may be invalid or revoked.');
      } else if (status === 403) {
        throw new Error(`Access denied: ${message}`);
      } else if (status === 404) {
        throw new Error(`Not found: ${message}`);
      } else {
        throw new Error(`API error (${status}): ${message}`);
      }
    } else if (error.request) {
      // Request made but no response
      throw new Error(`No response from server. Is the server running at ${baseUrl}?`);
    } else {
      // Error setting up request
      throw new Error(`Request error: ${error.message}`);
    }
  }
}

/**
 * Download a file from the API
 * @param {string} path - API path
 * @param {string} outputPath - Local path to save file
 */
async function downloadFile(path, outputPath) {
  const apiKey = getApiKey();
  
  if (!apiKey) {
    throw new Error('No API key configured. Run "invoke config:set --api-key <your-key>" first.');
  }

  const baseUrl = getBaseUrl();
  const url = `${baseUrl}${path}`;

  try {
    const response = await axios({
      method: 'GET',
      url,
      headers: {
        'x-api-key': apiKey
      },
      responseType: 'stream',
      timeout: 120000 // 2 minute timeout for downloads
    });

    const writer = fs.createWriteStream(outputPath);
    response.data.pipe(writer);

    return new Promise((resolve, reject) => {
      writer.on('finish', resolve);
      writer.on('error', reject);
    });
  } catch (error) {
    if (error.response) {
      const message = error.response.data?.message || error.response.statusText;
      throw new Error(`Download failed: ${message}`);
    } else {
      throw new Error(`Download error: ${error.message}`);
    }
  }
}

/**
 * Convenience methods for different HTTP verbs
 * For POST/PUT/PATCH: if second parameter doesn't have 'body', 'params', or 'headers', treat it as the body
 */
const get = (path, options = {}) => request('GET', path, options);

const post = (path, dataOrOptions = {}, extraOptions = {}) => {
  // Check if it's FormData
  const FormData = require('form-data');
  if (dataOrOptions instanceof FormData) {
    return request('POST', path, { formData: dataOrOptions, ...extraOptions });
  }
  
  // If dataOrOptions has options properties, treat as options
  if (dataOrOptions && (dataOrOptions.body !== undefined || 
      dataOrOptions.params !== undefined || 
      dataOrOptions.headers !== undefined ||
      dataOrOptions.formData !== undefined)) {
    return request('POST', path, dataOrOptions);
  }
  // Otherwise treat as body data
  return request('POST', path, { body: dataOrOptions, ...extraOptions });
};

const put = (path, dataOrOptions = {}, extraOptions = {}) => {
  // Check if it's FormData
  const FormData = require('form-data');
  if (dataOrOptions instanceof FormData) {
    return request('PUT', path, { formData: dataOrOptions, ...extraOptions });
  }
  
  // If dataOrOptions has options properties, treat as options
  if (dataOrOptions && (dataOrOptions.body !== undefined || 
      dataOrOptions.params !== undefined || 
      dataOrOptions.headers !== undefined ||
      dataOrOptions.formData !== undefined)) {
    return request('PUT', path, dataOrOptions);
  }
  // Otherwise treat as body data
  return request('PUT', path, { body: dataOrOptions, ...extraOptions });
};

const patch = (path, dataOrOptions = {}, extraOptions = {}) => {
  // Check if it's FormData
  const FormData = require('form-data');
  if (dataOrOptions instanceof FormData) {
    return request('PATCH', path, { formData: dataOrOptions, ...extraOptions });
  }
  
  // If dataOrOptions has options properties, treat as options
  if (dataOrOptions && (dataOrOptions.body !== undefined || 
      dataOrOptions.params !== undefined || 
      dataOrOptions.headers !== undefined ||
      dataOrOptions.formData !== undefined)) {
    return request('PATCH', path, dataOrOptions);
  }
  // Otherwise treat as body data
  return request('PATCH', path, { body: dataOrOptions, ...extraOptions });
};

const del = (path, options = {}) => request('DELETE', path, options);

module.exports = {
  request,
  downloadFile,
  get,
  post,
  put,
  patch,
  delete: del
};
