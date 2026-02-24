'use strict';

const fs = require('fs');
const path = require('path');
const KeyvModule = require('keyv');
const Keyv = KeyvModule.default || KeyvModule;

/**
 * Minimal file-backed Keyv storage adapter (pure JS, no native deps).
 * Persists all keys as a flat JSON object to a single file.
 * The file is created automatically if it does not exist.
 *
 * Implements the Map-like interface that Keyv expects from a custom store:
 * get, set, delete, clear, has, [Symbol.iterator]
 */
class KeyvFileStore {
    constructor(filePath) {
        this.filePath = filePath;
        this._data = null; // lazy-loaded
    }

    _load() {
        if (this._data !== null) return;
        if (fs.existsSync(this.filePath)) {
            try {
                this._data = JSON.parse(fs.readFileSync(this.filePath, 'utf8'));
            } catch {
                this._data = {};
            }
        } else {
            this._data = {};
        }
    }

    _save() {
        fs.mkdirSync(path.dirname(this.filePath), { recursive: true });
        fs.writeFileSync(this.filePath, JSON.stringify(this._data, null, 2), 'utf8');
    }

    async get(key) {
        this._load();
        return this._data[key];
    }

    async set(key, value, ttl) {
        this._load();
        this._data[key] = value;
        this._save();
    }

    async delete(key) {
        this._load();
        const existed = key in this._data;
        if (existed) {
            delete this._data[key];
            this._save();
        }
        return existed;
    }

    async clear() {
        this._data = {};
        this._save();
    }

    async has(key) {
        this._load();
        return key in this._data;
    }

    // Keyv iterates with this to support getMany / other ops in some adapters
    [Symbol.iterator]() {
        this._load();
        return Object.entries(this._data)[Symbol.iterator]();
    }
}

/**
 * Create a KV store factory for local CLI execution.
 *
 * @param {string|null|undefined} kvFilePath
 *   - falsy  → pure in-memory Keyv (no persistence, resets on each run)
 *   - string → JSON file-backed Keyv (auto-created if missing, persists across runs)
 *
 * @returns {function(string): import('keyv').default}
 *   Factory matching ExecutionEngine's kvStoreFactory option signature.
 */
function createLocalKVFactory(kvFilePath) {
    if (kvFilePath) {
        const absolutePath = path.resolve(kvFilePath);

        return (projectId) => {
            const store = new KeyvFileStore(absolutePath);
            const keyv = new Keyv({ store, namespace: projectId });
            keyv.on('error', (err) => console.error('[KV]', err.message));
            return keyv;
        };
    }

    // In-memory: each invocation starts fresh
    return (projectId) => {
        const keyv = new Keyv({ namespace: projectId });
        keyv.on('error', (err) => console.error('[KV]', err.message));
        return keyv;
    };
}

module.exports = { createLocalKVFactory };

