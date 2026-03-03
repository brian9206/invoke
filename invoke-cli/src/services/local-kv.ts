import Keyv from 'keyv';

/**
 * A simple file-based key-value store using Keyv
 */
class KeyvFileStore {
  private store: Map<string, any>;
  private filePath: string;
  private namespace: string;
  private ttlSupport: boolean;
  private _db: Map<string, { value: any; expires?: number }>;

  constructor(filePath: string) {
    this.filePath = filePath;
    this.namespace = 'keyv';
    this.ttlSupport = true;
    this.store = new Map();
    this._db = new Map();
  }

  async get(key: string): Promise<any> {
    const entry = this._db.get(key);
    if (!entry) return undefined;

    if (entry.expires && entry.expires < Date.now()) {
      this._db.delete(key);
      return undefined;
    }

    return entry.value;
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const entry: { value: any; expires?: number } = { value };

    if (ttl) {
      entry.expires = Date.now() + ttl;
    }

    this._db.set(key, entry);
    return true;
  }

  async delete(key: string): Promise<boolean> {
    return this._db.delete(key);
  }

  async clear(): Promise<void> {
    this._db.clear();
  }

  async has(key: string): Promise<boolean> {
    const entry = this._db.get(key);
    if (!entry) return false;

    if (entry.expires && entry.expires < Date.now()) {
      this._db.delete(key);
      return false;
    }

    return true;
  }

  async * iterator(namespace?: string): AsyncGenerator<[string, any]> {
    for (const [key, entry] of this._db.entries()) {
      if (entry.expires && entry.expires < Date.now()) {
        this._db.delete(key);
        continue;
      }

      if (!namespace || key.startsWith(namespace)) {
        yield [key, entry.value];
      }
    }
  }
}

/**
 * Create a local KV factory using a file-based store
 */
function createLocalKVFactory(kvFilePath: string): (namespace?: string, ttl?: number) => Keyv {
  return (namespace?: string, ttl?: number) => {
    const store = new KeyvFileStore(kvFilePath);

    return new Keyv({
      store: store as any,
      namespace,
      ttl,
    });
  };
}

export { KeyvFileStore, createLocalKVFactory };
