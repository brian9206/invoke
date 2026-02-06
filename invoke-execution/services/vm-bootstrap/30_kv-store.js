(function() {
    // Create KV store global object with Keyv-compatible API
    globalThis.kv = {
        /**
         * Get a value by key
         * @param {string} key - The key
         * @returns {Promise<*>} The value, or undefined if not found
         */
        get: function(key) {
            return _kvGet.applySync(undefined, [key], { result: { promise: true } })
                .then(function(jsonStr) {
                    if (jsonStr === undefined || jsonStr === null) return undefined;
                    return JSON.parse(jsonStr);
                });
        },
        
        /**
         * Set a key-value pair
         * @param {string} key - The key
         * @param {*} value - The value (will be JSON serialized)
         * @param {number} [ttl] - Optional TTL in milliseconds
         * @returns {Promise<boolean>} True if successful
         */
        set: function(key, value, ttl) {
            // Serialize value to JSON string for safe transfer
            const jsonStr = JSON.stringify(value);
            return _kvSet.applySync(undefined, [key, jsonStr, ttl], { result: { promise: true } });
        },
        
        /**
         * Delete a key
         * @param {string} key - The key
         * @returns {Promise<boolean>} True if key existed
         */
        delete: function(key) {
            return _kvDelete.applySync(undefined, [key], { result: { promise: true } });
        },
        
        /**
         * Clear all keys in this project's namespace
         * @returns {Promise<void>}
         */
        clear: function() {
            return _kvClear.applySync(undefined, [], { result: { promise: true } });
        },
        
        /**
         * Check if a key exists
         * @param {string} key - The key
         * @returns {Promise<boolean>} True if key exists
         */
        has: function(key) {
            return _kvHas.applySync(undefined, [key], { result: { promise: true } });
        }
    };
})();
