/**
 * Frontend utility functions for Invoke Admin
 */

let cachedFunctionBaseUrl: string | null = null
let fetchPromise: Promise<string> | null = null
let refreshPromise: Promise<boolean> | null = null

/**
 * Attempt to refresh the access token using the refresh token cookie.
 * Returns true if refresh succeeded, false otherwise.
 * Deduplicates concurrent refresh calls.
 */
async function tryRefreshToken(): Promise<boolean> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    try {
      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      })
      return response.ok
    } catch {
      return false
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

/**
 * Make an authenticated API request.
 * Cookies are sent automatically. On 401, attempts a token refresh and retries once.
 */
export async function authenticatedFetch(url: string, options: RequestInit = {}): Promise<Response> {
  // Don't set Content-Type for FormData - let browser set it with boundary
  const isFormData = options.body instanceof FormData

  const headers = {
    ...(isFormData ? {} : { 'Content-Type': 'application/json' }),
    ...options.headers
  }

  const doFetch = () =>
    fetch(url, {
      ...options,
      headers,
      credentials: 'include'
    })

  const response = await doFetch()

  // On 401, try refreshing the access token and retry once
  if (response.status === 401) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      return doFetch()
    }
  }

  return response
}

/**
 * Get the function base URL from global settings (with caching)
 * @returns {Promise<string>} Function base URL
 */
export async function getFunctionBaseUrl(): Promise<string> {
  // Return cached value if available
  if (cachedFunctionBaseUrl) {
    return cachedFunctionBaseUrl
  }

  // Return existing promise if one is in progress
  if (fetchPromise) {
    return fetchPromise
  }

  // Create new fetch promise
  fetchPromise = (async () => {
    try {
      const response = await authenticatedFetch('/api/admin/global-settings')
      const data = await response.json()

      if (data.success && data.data.function_base_url) {
        cachedFunctionBaseUrl = data.data.function_base_url.value.replace(/\/+$/, '')
        return cachedFunctionBaseUrl!
      }

      // Fallback to default if not found
      cachedFunctionBaseUrl = 'https://localhost:3001/invoke'
      return cachedFunctionBaseUrl!
    } catch (error) {
      console.error('Failed to get function base URL:', error)
      // Fallback to default on error
      cachedFunctionBaseUrl = 'https://localhost:3001/invoke'
      return cachedFunctionBaseUrl!
    } finally {
      fetchPromise = null
    }
  })()

  return fetchPromise
}

/**
 * Generate a complete function URL
 * @param {string} functionId - Function ID
 * @returns {Promise<string>} Complete function URL
 */
export async function getFunctionUrl(functionId: string): Promise<string> {
  const baseUrl = await getFunctionBaseUrl()
  return `${baseUrl}/${functionId}`
}

/**
 * Clear the cached function base URL (useful when settings are updated)
 */
export function clearFunctionBaseUrlCache(): void {
  cachedFunctionBaseUrl = null
  fetchPromise = null
}
