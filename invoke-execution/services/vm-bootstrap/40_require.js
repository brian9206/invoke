// ============================================================================
// MODULE LOADER - CommonJS module system with built-in module support
// ============================================================================
(function() {
    // Module cache and loading state
    const _moduleCache = new Map(); // key: absolute path, value: module.exports
    const _loadingModules = new Set(); // track modules currently being loaded (circular dependency detection)
    const _builtinModuleCache = {}; // Cache for reconstructed builtin modules
    
    /**
     * Create a module object from flattened globals
     * Convention: globals are named _moduleName_methodName
     * @param {string} moduleName - Name of the module to reconstruct
     * @returns {Object} Reconstructed module object
     */
    function createModuleFromGlobals(moduleName) {
        // Check cache first
        if (_builtinModuleCache[moduleName]) {
            return _builtinModuleCache[moduleName];
        }
        
        const module = {};
        const prefix = `_${moduleName}_`;
        const prefixLen = prefix.length;
        
        // Get all global property names
        const globalKeys = Object.getOwnPropertyNames(globalThis);
        
        // Find all globals matching our module prefix
        for (const key of globalKeys) {
            if (key.startsWith(prefix)) {
                const propertyPath = key.substring(prefixLen);
                const parts = propertyPath.split('_');
                
                // Reconstruct nested object structure
                let current = module;
                for (let i = 0; i < parts.length - 1; i++) {
                    const part = parts[i];
                    if (!current[part]) {
                        current[part] = {};
                    }
                    current = current[part];
                }
                
                // Set the final property
                const finalKey = parts[parts.length - 1];
                const globalValue = globalThis[key];
                
                // Check if it's a constant (not a Reference)
                if (finalKey === 'constants') {
                    current[finalKey] = globalValue;
                } else {
                    // Wrap the ivm.Reference in a function
                    current[finalKey] = function(...args) {
                        return globalValue.applySync(undefined, args);
                    };
                }
            }
        }
        
        // Cache the reconstructed module
        _builtinModuleCache[moduleName] = module;
        return module;
    }
    
    /**
     * Check if a module is a built-in module
     * @param {string} moduleName - Module name to check
     * @returns {boolean} True if built-in module exists
     */
    function isBuiltinModule(moduleName) {
        if (typeof _moduleNames !== 'undefined') {
            return _moduleNames.includes(moduleName);
        }
        // Fallback: check if any globals exist with this prefix
        const prefix = `_${moduleName}_`;
        const globalKeys = Object.getOwnPropertyNames(globalThis);
        return globalKeys.some(key => key.startsWith(prefix));
    }
    
    // Get fs and path modules from globals
    const fs = createModuleFromGlobals('fs');
    const path = createModuleFromGlobals('path');

    /**
     * Resolve module path by trying extensions and index files
     * @param {string} requestedPath - Absolute path to resolve
     * @returns {string} Resolved file path
     * @throws {Error} If module cannot be found
     */
    function resolveModulePath(requestedPath) {
        // Try exact path first
        if (fs.existsSync(requestedPath)) {
            const stat = fs.statSync(requestedPath);
            if (!stat.isDirectory) {
                return requestedPath;
            }
        }
        
        // Try with .js extension
        const jsPath = requestedPath + '.js';
        if (fs.existsSync(jsPath)) {
            return jsPath;
        }
        
        // Try with .json extension
        const jsonPath = requestedPath + '.json';
        if (fs.existsSync(jsonPath)) {
            return jsonPath;
        }
        
        // Try index.js in directory
        const indexJsPath = path.join(requestedPath, 'index.js');
        if (fs.existsSync(indexJsPath)) {
            return indexJsPath;
        }
        
        // Try index.json in directory
        const indexJsonPath = path.join(requestedPath, 'index.json');
        if (fs.existsSync(indexJsonPath)) {
            return indexJsonPath;
        }
        
        throw new Error(`Cannot find module '${requestedPath}'`);
    }
    
    /**
     * Resolve node_modules package by traversing up directory tree
     * @param {string} moduleName - Package name to resolve
     * @param {string} startDir - Directory to start searching from
     * @returns {string} Resolved package entry file path
     * @throws {Error} If package cannot be found
     */
    function resolveNodeModule(moduleName, startDir) {
        const searchPaths = [];
        let currentDir = startDir;
        
        // Traverse up directory tree
        while (true) {
            const nodeModulesPath = path.join(currentDir, 'node_modules', moduleName);
            searchPaths.push(nodeModulesPath);
            
            if (fs.existsSync(nodeModulesPath)) {
                // Check for package.json
                const packageJsonPath = path.join(nodeModulesPath, 'package.json');
                let entryPoint = 'index.js';
                
                if (fs.existsSync(packageJsonPath)) {
                    try {
                        const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
                        
                        // Check for module fields in priority order (following Node.js resolution)
                        if (packageJson.main) {
                            entryPoint = packageJson.main;
                        } else if (packageJson.exports) {
                            // Simple exports handling - use '.' export if exists
                            if (typeof packageJson.exports === 'string') {
                                entryPoint = packageJson.exports;
                            } else if (packageJson.exports['.']) {
                                const dotExport = packageJson.exports['.'];
                                if (typeof dotExport === 'string') {
                                    entryPoint = dotExport;
                                } else if (dotExport.require) {
                                    entryPoint = dotExport.require;
                                } else if (dotExport.default) {
                                    entryPoint = dotExport.default;
                                }
                            }
                        } else if (packageJson.module) {
                            entryPoint = packageJson.module;
                        }
                    } catch (e) {
                        // Invalid package.json, use default
                    }
                }
                
                // Resolve entry point relative to package directory
                const fullEntryPath = path.join(nodeModulesPath, entryPoint);
                return resolveModulePath(fullEntryPath);
            }
            
            // Move up one directory
            const parentDir = path.dirname(currentDir);
            if (parentDir === currentDir) {
                // Reached root, module not found
                break;
            }
            currentDir = parentDir;
        }
        
        // Module not found - create error matching Node.js format
        const error = new Error(`Cannot find module '${moduleName}'`);
        error.code = 'MODULE_NOT_FOUND';
        throw error;
    }
    
    /**
     * Execute a JavaScript module with CommonJS wrapper
     * @param {string} code - Module source code
     * @param {string} filepath - Absolute path to the module file
     * @param {Function} requireFn - Require function for this module's context
     * @returns {*} module.exports
     */
    function executeJSModule(code, filepath, requireFn) {
        // Create module object
        const module = { exports: {} };
        const exports = module.exports;
        
        // Get __filename and __dirname
        const __filename = filepath;
        const __dirname = path.dirname(filepath);
        
        // Cache the module before execution (for circular dependencies)
        _moduleCache.set(filepath, module.exports);
        
        try {
            // Wrap code in CommonJS wrapper with source mapping for stack traces
            const wrapper = `(function(module, exports, require, __filename, __dirname) {\n${code}\n})`;
            const wrapperWithSourceMap = wrapper + `\n//# sourceURL=${filepath}`;
            
            // Evaluate the wrapper to get the factory function
            const factory = eval(wrapperWithSourceMap);
            
            // Execute the factory
            factory(module, exports, requireFn, __filename, __dirname);
            
            // Update cache with final exports
            _moduleCache.set(filepath, module.exports);
            
            return module.exports;
        } catch (error) {
            // Remove from cache on error
            _moduleCache.delete(filepath);
            throw error;
        }
    }
    
    /**
     * Execute a JSON module
     * @param {string} filepath - Absolute path to the JSON file
     * @returns {*} Parsed JSON object
     */
    function executeJSONModule(filepath) {
        // Read and parse JSON
        const content = fs.readFileSync(filepath, 'utf8');
        const parsed = JSON.parse(content);
        
        // Cache the parsed object
        _moduleCache.set(filepath, parsed);
        
        return parsed;
    }
    
    /**
     * Load a module (JS or JSON)
     * @param {string} modulePath - Path to the module (relative or absolute)
     * @param {string} currentDir - Current directory context
     * @returns {*} module.exports
     */
    function loadModule(modulePath, currentDir) {
        // Resolve to absolute path
        const absolutePath = path.resolve(currentDir, modulePath);
        
        // Check cache first
        if (_moduleCache.has(absolutePath)) {
            return _moduleCache.get(absolutePath);
        }
        
        // Detect circular dependency
        if (_loadingModules.has(absolutePath)) {
            // Return empty exports for circular dependency (will be populated later)
            return _moduleCache.get(absolutePath) || {};
        }
        
        // Resolve file path with extensions
        const resolvedPath = resolveModulePath(absolutePath);
        
        // Check cache again with resolved path
        if (_moduleCache.has(resolvedPath)) {
            return _moduleCache.get(resolvedPath);
        }
        
        // Mark as loading
        _loadingModules.add(resolvedPath);
        
        try {
            // Determine file type
            const ext = path.extname(resolvedPath);
            
            if (ext === '.json') {
                // Load JSON module
                const exports = executeJSONModule(resolvedPath);
                _loadingModules.delete(resolvedPath);
                return exports;
            } else {
                // Load JavaScript module
                const code = fs.readFileSync(resolvedPath, 'utf8');
                
                // Create require function for this module's directory
                const moduleDir = path.dirname(resolvedPath);
                const requireFn = createRequire(moduleDir);
                
                const exports = executeJSModule(code, resolvedPath, requireFn);
                _loadingModules.delete(resolvedPath);
                return exports;
            }
        } catch (error) {
            _loadingModules.delete(resolvedPath);
            throw error;
        }
    }
    
    /**
     * Create a require function bound to a specific directory
     * @param {string} currentDir - Directory context for relative requires
     * @returns {Function} Require function
     */
    function createRequire(currentDir) {
        return function require(moduleName) {
            // Strip 'node:' prefix if present (Node.js module protocol)
            const cleanModuleName = moduleName.startsWith('node:') ? moduleName.slice(5) : moduleName;
            
            // Handle built-in modules using flattened globals
            if (isBuiltinModule(cleanModuleName)) {
                return createModuleFromGlobals(cleanModuleName);
            }
            
            // Handle relative requires
            if (cleanModuleName.startsWith('./') || cleanModuleName.startsWith('../')) {
                return loadModule(cleanModuleName, currentDir);
            }
            
            // Handle absolute paths
            if (path.isAbsolute(cleanModuleName)) {
                return loadModule(cleanModuleName, currentDir);
            }
            
            // Handle node_modules packages
            return loadModule(resolveNodeModule(cleanModuleName, currentDir), '/');
        };
    }
    
    // Set global require function (bound to root directory)
    globalThis.require = createRequire('/');
})();
