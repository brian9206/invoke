import axios, { AxiosRequestConfig } from 'axios';
import FormData from 'form-data';
import fs from 'fs';
import { getApiKey, getBaseUrl } from './config';

/**
 * Make an authenticated API request
 */
async function request(
  method: string,
  endpoint: string,
  data?: any,
  options: AxiosRequestConfig = {}
): Promise<any> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const config: AxiosRequestConfig = {
    method,
    url: `${baseUrl}${endpoint}`,
    headers: {
      'Content-Type': 'application/json',
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
      ...(options.headers || {}),
    },
    ...options,
    ...(data ? { data } : {}),
  };

  const response = await axios(config);
  return response.data;
}

/**
 * Download a file from the API
 */
async function downloadFile(endpoint: string, outputPath: string): Promise<void> {
  const apiKey = getApiKey();
  const baseUrl = getBaseUrl();

  const response = await axios({
    method: 'GET',
    url: `${baseUrl}${endpoint}`,
    headers: {
      ...(apiKey ? { 'X-API-Key': apiKey } : {}),
    },
    responseType: 'stream',
  });

  const writer = fs.createWriteStream(outputPath);
  response.data.pipe(writer);

  return new Promise((resolve, reject) => {
    writer.on('finish', resolve);
    writer.on('error', reject);
  });
}

/**
 * GET request
 */
async function get(endpoint: string, params?: Record<string, any>): Promise<any> {
  return request('GET', endpoint, undefined, { params });
}

/**
 * POST request, optionally with multipart form data
 */
async function post(
  endpoint: string,
  data?: any,
  formDataFields?: Array<{ field: string; value: any; filename?: string }>
): Promise<any> {
  if (formDataFields) {
    const form = new FormData();

    for (const item of formDataFields) {
      if (item.filename) {
        form.append(item.field, item.value, { filename: item.filename });
      } else {
        form.append(item.field, item.value);
      }
    }

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object') {
          form.append(key, JSON.stringify(value));
        } else {
          form.append(key, String(value));
        }
      }
    }

    return request('POST', endpoint, undefined, {
      data: form,
      headers: form.getHeaders(),
    });
  }

  return request('POST', endpoint, data);
}

/**
 * PUT request, optionally with multipart form data
 */
async function put(
  endpoint: string,
  data?: any,
  formDataFields?: Array<{ field: string; value: any; filename?: string }>
): Promise<any> {
  if (formDataFields) {
    const form = new FormData();

    for (const item of formDataFields) {
      if (item.filename) {
        form.append(item.field, item.value, { filename: item.filename });
      } else {
        form.append(item.field, item.value);
      }
    }

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object') {
          form.append(key, JSON.stringify(value));
        } else {
          form.append(key, String(value));
        }
      }
    }

    return request('PUT', endpoint, undefined, {
      data: form,
      headers: form.getHeaders(),
    });
  }

  return request('PUT', endpoint, data);
}

/**
 * PATCH request, optionally with multipart form data
 */
async function patch(
  endpoint: string,
  data?: any,
  formDataFields?: Array<{ field: string; value: any; filename?: string }>
): Promise<any> {
  if (formDataFields) {
    const form = new FormData();

    for (const item of formDataFields) {
      if (item.filename) {
        form.append(item.field, item.value, { filename: item.filename });
      } else {
        form.append(item.field, item.value);
      }
    }

    if (data) {
      for (const [key, value] of Object.entries(data)) {
        if (typeof value === 'object') {
          form.append(key, JSON.stringify(value));
        } else {
          form.append(key, String(value));
        }
      }
    }

    return request('PATCH', endpoint, undefined, {
      data: form,
      headers: form.getHeaders(),
    });
  }

  return request('PATCH', endpoint, data);
}

/**
 * DELETE request
 */
async function del(endpoint: string): Promise<any> {
  return request('DELETE', endpoint);
}

export { request, downloadFile, get, post, put, patch, del as delete };
