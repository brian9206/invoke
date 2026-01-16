const express = require('express')
const router = express.Router()
const database = require('../services/database')
const cache = require('../services/cache')
const path = require('path')
const fs = require('fs-extra')
const { VM } = require('vm2')

// Utility function to calculate next execution time based on cron expression
function calculateNextExecution(cronExpression) {
  try {
    const parts = cronExpression.trim().split(' ')
    if (parts.length !== 5) return null

    const [minute, hour, day, month, weekday] = parts
    const now = new Date()
    const next = new Date(now)
    
    // Reset seconds and milliseconds
    next.setSeconds(0, 0)
    
    // Handle minute patterns
    if (minute === '*') {
      // Every minute - next minute
      next.setMinutes(next.getMinutes() + 1)
    } else if (minute.startsWith('*/')) {
      // Every N minutes
      const interval = parseInt(minute.slice(2))
      const nextMinute = Math.ceil(now.getMinutes() / interval) * interval
      next.setMinutes(nextMinute)
      if (nextMinute <= now.getMinutes()) {
        next.setHours(next.getHours() + 1)
        next.setMinutes(0)
      }
    } else if (!isNaN(parseInt(minute))) {
      // Specific minute
      const targetMinute = parseInt(minute)
      next.setMinutes(targetMinute)
      if (targetMinute <= now.getMinutes()) {
        next.setHours(next.getHours() + 1)
      }
    }
    
    // Handle hour patterns (simplified)
    if (hour !== '*' && !isNaN(parseInt(hour))) {
      const targetHour = parseInt(hour)
      next.setHours(targetHour)
      if (targetHour < now.getHours() || (targetHour === now.getHours() && next.getMinutes() <= now.getMinutes())) {
        next.setDate(next.getDate() + 1)
      }
    }
    
    return next
  } catch (error) {
    console.error('Error calculating next execution:', error)
    return null
  }
}

/**
 * Get function package with caching (for scheduled execution)
 */
async function getFunctionPackage(functionId) {
  try {
    // Get function metadata from database first
    const functionData = await fetchFunctionMetadata(functionId)
    
    // Check cache with hash verification
    const cacheResult = await cache.checkCache(functionId, functionData.package_hash, functionData.version)
    
    if (cacheResult.cached && cacheResult.valid) {
      await cache.updateAccessStats(functionId)
      return {
        tempDir: cacheResult.extractedPath,
        indexPath: path.join(cacheResult.extractedPath, 'index.js'),
        fromCache: true
      }
    }
    
    console.log(`Downloading package for scheduled function ${functionId}`)
    
    // Download and cache package
    const extractedPath = await cache.cachePackageFromPath(functionId, functionData.version, functionData.package_hash, functionData.file_size || 0, functionData.package_path)
    
    return {
      tempDir: extractedPath,
      indexPath: path.join(extractedPath, 'index.js'),
      fromCache: false
    }
    
  } catch (error) {
    console.error('Error getting function package for scheduled execution:', error.message)
    throw new Error(`Failed to get function: ${error.message}`)
  }
}

/**
 * Fetch function metadata from database
 */
async function fetchFunctionMetadata(functionId) {
  const query = `
    SELECT 
      f.id, 
      f.name, 
      f.is_active,
      f.created_at, 
      f.updated_at,
      fv.version,
      fv.package_path,
      fv.package_hash,
      fv.file_size
    FROM functions f
    LEFT JOIN function_versions fv ON f.active_version_id = fv.id
    WHERE f.id = $1 AND f.is_active = true
  `
  
  const result = await database.query(query, [functionId])
  
  if (result.rows.length === 0) {
    throw new Error('Function not found or inactive')
  }
  
  return result.rows[0]
}

/**
 * Execute function in secure VM environment
 */
async function executeFunction(indexPath, context) {
  try {
    // Read the function code
    const functionCode = await fs.readFile(indexPath, 'utf8')
    
    // Get the package directory for local requires
    const packageDir = path.dirname(indexPath)

    // Create VM with limited access
    const vm = new VM({
      timeout: 30000, // 30 second timeout
      sandbox: {
        console: context.console,
        Buffer,
        process: {
          env: process.env
        },
        setTimeout,
        clearTimeout,
        setInterval,
        clearInterval,
        module: { exports: {} },
        exports: {},
        __filename: indexPath,
        __dirname: packageDir
      }
    })

    // Wrap the function code to handle different export patterns
    const wrappedCode = `
      (function() {
        ${functionCode}
        
        // Handle different export patterns
        let exportedFunction;
        if (typeof module !== 'undefined' && module.exports) {
          exportedFunction = module.exports;
        } else if (typeof exports !== 'undefined') {
          exportedFunction = exports.handler || exports.default || exports;
        }
        
        if (typeof exportedFunction === 'function') {
          return exportedFunction;
        } else {
          throw new Error('Function must export a function');
        }
      })();
    `

    // Execute the code and get the function
    const userFunction = vm.run(wrappedCode)

    // Execute the user function
    const result = await executeUserFunction(userFunction, context)
    
    return result

  } catch (error) {
    return {
      error: error.message,
      statusCode: 500
    }
  }
}

/**
 * Execute user function with proper context
 */
async function executeUserFunction(userFunction, context) {
  return new Promise(async (resolve) => {
    try {
      // Set timeout for execution
      const timeout = setTimeout(() => {
        resolve({
          error: 'Function execution timeout (30s)',
          statusCode: 504
        })
      }, 30000)

      const result = await userFunction(context.req, context.res)
      
      clearTimeout(timeout)
      resolve({
        data: result,
        statusCode: context.res.statusCode || 200,
        headers: context.res.headers || {}
      })
      
    } catch (error) {
      resolve({
        error: error.message,
        statusCode: 500
      })
    }
  })
}

/**
 * Create a mock request object compatible with Express.js
 */
function createRequestObject(method, body, query, headers, params, originalReq) {
  const url = originalReq.url || '/';
  const protocol = originalReq.protocol || 'http';
  const hostname = originalReq.hostname || 'localhost';
  
  const request = {
    method,
    url,
    originalUrl: url,
    path: url.split('?')[0],
    protocol,
    hostname,
    secure: protocol === 'https',
    ip: originalReq.ip || originalReq.connection?.remoteAddress || '127.0.0.1',
    ips: originalReq.ips || [],
    body,
    query,
    params,
    headers,
    cookies: {}, // Simplified cookies object
    
    // Express.js methods
    get(headerName) {
      return this.headers[headerName.toLowerCase()];
    },
    
    header(headerName) {
      return this.get(headerName);
    },
    
    is(type) {
      const contentType = this.get('content-type') || '';
      return contentType.includes(type);
    },
    
    accepts(types) {
      const acceptHeader = this.get('accept') || '*/*';
      if (typeof types === 'string') {
        return acceptHeader.includes(types) ? types : false;
      }
      if (Array.isArray(types)) {
        for (const type of types) {
          if (acceptHeader.includes(type)) return type;
        }
        return false;
      }
      return acceptHeader;
    },
    
    acceptsCharsets(charsets) {
      const acceptCharsetHeader = this.get('accept-charset') || '*';
      if (typeof charsets === 'string') {
        return acceptCharsetHeader.includes(charsets) ? charsets : false;
      }
      return acceptCharsetHeader;
    },
    
    acceptsEncodings(encodings) {
      const acceptEncodingHeader = this.get('accept-encoding') || '*';
      if (typeof encodings === 'string') {
        return acceptEncodingHeader.includes(encodings) ? encodings : false;
      }
      return acceptEncodingHeader;
    },
    
    acceptsLanguages(languages) {
      const acceptLanguageHeader = this.get('accept-language') || '*';
      if (typeof languages === 'string') {
        return acceptLanguageHeader.includes(languages) ? languages : false;
      }
      return acceptLanguageHeader;
    }
  };
  
  return request;
}

/**
 * Create a mock response object compatible with Express.js
 */
function createResponseObject() {
  const response = {
    statusCode: 200,
    headers: {},
    data: undefined,
    locals: {}, // Express.js locals object
    
    status(code) {
      this.statusCode = code;
      return this;
    },
    
    json(data) {
      this.data = data;
      this.headers['content-type'] = 'application/json';
      return this;
    },
    
    send(data) {
      this.data = data;
      // Set appropriate content-type if not already set
      if (!this.headers['content-type']) {
        if (typeof data === 'string') {
          this.headers['content-type'] = 'text/plain';
        } else if (typeof data === 'object') {
          this.headers['content-type'] = 'application/json';
        } else {
          this.headers['content-type'] = 'text/plain';
        }
      }
      return this;
    },
    
    sendStatus(statusCode) {
      this.statusCode = statusCode;
      this.data = getStatusText(statusCode);
      this.headers['content-type'] = 'text/plain';
      return this;
    },
    
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    
    // Express.js aliases and additional methods
    set(name, value) {
      return this.setHeader(name, value);
    },
    
    header(name, value) {
      return this.setHeader(name, value);
    },
    
    get(name) {
      return this.headers[name.toLowerCase()];
    },
    
    type(type) {
      const mimeType = type.includes('/') ? type : getMimeType(type);
      return this.setHeader('content-type', mimeType);
    },
    
    cookie(name, value, options = {}) {
      // Simplified cookie setting (serialize cookie string)
      let cookie = `${name}=${value}`;
      if (options.maxAge) cookie += `; Max-Age=${options.maxAge}`;
      if (options.domain) cookie += `; Domain=${options.domain}`;
      if (options.path) cookie += `; Path=${options.path}`;
      if (options.secure) cookie += '; Secure';
      if (options.httpOnly) cookie += '; HttpOnly';
      if (options.sameSite) cookie += `; SameSite=${options.sameSite}`;
      
      const existingCookies = this.get('set-cookie') || [];
      const cookies = Array.isArray(existingCookies) ? existingCookies : [existingCookies];
      cookies.push(cookie);
      this.setHeader('set-cookie', cookies);
      return this;
    },
    
    clearCookie(name, options = {}) {
      return this.cookie(name, '', { ...options, expires: new Date(1), maxAge: 0 });
    },
    
    redirect(statusOrUrl, url) {
      if (typeof statusOrUrl === 'string') {
        this.statusCode = 302;
        this.setHeader('location', statusOrUrl);
      } else {
        this.statusCode = statusOrUrl || 302;
        this.setHeader('location', url);
      }
      this.data = `Redirecting to ${url || statusOrUrl}`;
      return this;
    },
    
    location(url) {
      return this.setHeader('location', url);
    },
    
    vary(field) {
      const existing = this.get('vary');
      if (existing) {
        const fields = existing.split(', ');
        if (!fields.includes(field)) {
          fields.push(field);
          this.setHeader('vary', fields.join(', '));
        }
      } else {
        this.setHeader('vary', field);
      }
      return this;
    },
    
    append(field, value) {
      const existing = this.get(field);
      if (existing) {
        const values = Array.isArray(existing) ? existing : [existing];
        values.push(value);
        this.setHeader(field, values);
      } else {
        this.setHeader(field, value);
      }
      return this;
    },
    
    attachment(filename) {
      if (filename) {
        this.setHeader('content-disposition', `attachment; filename="${filename}"`);
        this.type(getFileExtension(filename));
      } else {
        this.setHeader('content-disposition', 'attachment');
      }
      return this;
    },
    
    end(data) {
      if (data !== undefined) {
        this.data = data;
      }
      return this;
    }
  };
  
  return response;
}

/**
 * Helper function to get HTTP status text
 */
function getStatusText(statusCode) {
  const statusTexts = {
    200: 'OK', 201: 'Created', 204: 'No Content',
    400: 'Bad Request', 401: 'Unauthorized', 403: 'Forbidden', 404: 'Not Found',
    500: 'Internal Server Error', 502: 'Bad Gateway', 503: 'Service Unavailable'
  };
  return statusTexts[statusCode] || 'Unknown Status';
}

/**
 * Helper function to get MIME type from extension
 */
function getMimeType(extension) {
  const mimeTypes = {
    'html': 'text/html',
    'json': 'application/json',
    'xml': 'application/xml',
    'txt': 'text/plain',
    'css': 'text/css',
    'js': 'application/javascript',
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'svg': 'image/svg+xml'
  };
  return mimeTypes[extension] || 'application/octet-stream';
}

/**
 * Helper function to get file extension
 */
function getFileExtension(filename) {
  return filename.split('.').pop().toLowerCase();
}

// Execute a scheduled function
async function executeScheduledFunction(functionData) {
  const startTime = Date.now()
  let consoleOutput = []
  
  try {
    console.log(`Executing scheduled function: ${functionData.name} (ID: ${functionData.id})`)

    // Get function package
    const { indexPath, fromCache } = await getFunctionPackage(functionData.id)
    
    // Create console proxy to capture logs
    const consoleProxy = {
      log: (...args) => {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
        consoleOutput.push({ level: 'log', message, timestamp: new Date().toISOString() })
      },
      error: (...args) => {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
        consoleOutput.push({ level: 'error', message, timestamp: new Date().toISOString() })
      },
      warn: (...args) => {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
        consoleOutput.push({ level: 'warn', message, timestamp: new Date().toISOString() })
      },
      info: (...args) => {
        const message = args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')
        consoleOutput.push({ level: 'info', message, timestamp: new Date().toISOString() })
      }
    }

    // Create execution context similar to regular execution
    const context = {
      req: createRequestObject('POST', {}, {}, { 'x-scheduled-execution': 'true' }, {}, { 
        url: '/scheduled',
        protocol: 'http',
        hostname: 'localhost',
        ip: '127.0.0.1',
        ips: []
      }),
      res: createResponseObject(),
      console: consoleProxy
    }

    // Execute the function
    const result = await executeFunction(indexPath, context)
    
    const executionTime = Date.now() - startTime
    const statusCode = result.statusCode || 200

    // Get the response data from either the function return value or res.json/res.send calls
    const responseData = context.res.data || result.data || result.error || {}

    // Log execution to database
    const logQuery = `
      INSERT INTO execution_logs (
        function_id, status_code, execution_time_ms, 
        request_method, request_url, executed_at, response_body, console_logs
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
    `
    
    await database.query(logQuery, [
      functionData.id,
      statusCode,
      executionTime,
      'SCHEDULED',
      '/scheduled',
      new Date(),
      JSON.stringify(responseData),
      JSON.stringify(consoleOutput)
    ])

    // Update function execution stats
    await database.query(`
      UPDATE functions 
      SET execution_count = execution_count + 1,
          last_executed = $2,
          last_scheduled_execution = $2
      WHERE id = $1
    `, [functionData.id, new Date()])

    console.log(`Scheduled function ${functionData.name} executed successfully in ${executionTime}ms with status ${statusCode}`)
    
    return {
      function_id: functionData.id,
      status_code: statusCode,
      execution_time_ms: executionTime,
      request_method: 'SCHEDULED',
      request_url: '/scheduled',
      executed_at: new Date(),
      success: statusCode >= 200 && statusCode < 400
    }
    
  } catch (error) {
    const executionTime = Date.now() - startTime
    console.error(`Error executing scheduled function ${functionData.name}:`, error)
    
    // Log error to database
    try {
      const logQuery = `
        INSERT INTO execution_logs (
          function_id, status_code, execution_time_ms, 
          request_method, request_url, executed_at, error_message, console_logs, response_body
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
      `
      
      await database.query(logQuery, [
        functionData.id,
        500,
        executionTime,
        'SCHEDULED',
        '/scheduled',
        new Date(),
        error.message,
        JSON.stringify(consoleOutput.concat([{ level: 'error', message: error.message, timestamp: new Date().toISOString() }])),
        JSON.stringify({ error: error.message })
      ])
    } catch (logError) {
      console.error('Error logging execution error:', logError)
    }
    
    throw error
  }
}

// Endpoint to trigger pending scheduled functions
router.post('/trigger-scheduled', async (req, res) => {
  try {
    await database.connect()
    
    console.log('Checking for scheduled functions to execute...')
    
    // Get all functions that are scheduled and due for execution
    const now = new Date()
    const result = await database.query(`
      SELECT id, name, schedule_cron, next_execution, is_active
      FROM functions 
      WHERE schedule_enabled = true 
        AND is_active = true
        AND next_execution <= $1
      ORDER BY next_execution ASC
    `, [now])
    
    const functionsToExecute = result.rows
    console.log(`Found ${functionsToExecute.length} functions to execute`)
    
    const executionResults = []
    
    for (const func of functionsToExecute) {
      try {
        // Execute the function
        const executionResult = await executeScheduledFunction(func)
        executionResults.push({
          function_id: func.id,
          function_name: func.name,
          success: true,
          execution_time_ms: executionResult.execution_time_ms
        })
        
        // Calculate and update next execution time
        const nextExecution = calculateNextExecution(func.schedule_cron)
        if (nextExecution) {
          await database.query(`
            UPDATE functions 
            SET next_execution = $2
            WHERE id = $1
          `, [func.id, nextExecution])
          
          console.log(`Updated next execution for ${func.name}: ${nextExecution.toISOString()}`)
        } else {
          console.error(`Failed to calculate next execution for function ${func.id}`)
          // Disable scheduling if we can't calculate next execution
          await database.query(`
            UPDATE functions 
            SET schedule_enabled = false
            WHERE id = $1
          `, [func.id])
        }
        
      } catch (error) {
        console.error(`Failed to execute scheduled function ${func.name}:`, error)
        executionResults.push({
          function_id: func.id,
          function_name: func.name,
          success: false,
          error: error.message
        })
      }
    }
    
    res.json({
      success: true,
      message: `Processed ${functionsToExecute.length} scheduled functions`,
      executed: executionResults.filter(r => r.success).length,
      failed: executionResults.filter(r => !r.success).length
    })
    
  } catch (error) {
    console.error('Error in trigger-scheduled endpoint:', error)
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: error.message
    })
  }
})

module.exports = router