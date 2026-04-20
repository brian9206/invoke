import { KvClient } from "invoke-worker/src/kv";
import fs from "fs";

class LocalInMemoryKvClient extends KvClient {
  protected store: Record<string, unknown> = {};

  constructor() {
    super({} as any); // We won't use the socket-based communication in this local implementation
  }

  async get(key: string): Promise<unknown> {
    if (!this.store[key]) return this.store[key];
  
    try {
      return JSON.parse(this.store[key] as string);
    } catch {
      return this.store[key];
    }
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    this.store[key] = value;
    return true;
  }

  async delete(key: string): Promise<boolean> {
    delete this.store[key];
    return true;
  }

  async clear(): Promise<void> {
    this.store = {};
  }

  async has(key: string): Promise<boolean> {
    return key in this.store;
  }
}

class LocalFileKvClient extends LocalInMemoryKvClient {
  private filePath: string;

  constructor(filePath: string) {
    super();
    this.filePath = filePath;
    this.loadFromFile();
  }

  private loadFromFile() {
    try {
      const data = fs.readFileSync(this.filePath, 'utf-8');
      if (data) {
        this.store = JSON.parse(data);
      }
    } catch {
      this.store = {};
    }
  }

  private saveToFile() {
    fs.writeFileSync(this.filePath, JSON.stringify(this.store, null, 2), 'utf-8');
  }

  async set(key: string, value: unknown, ttl?: number): Promise<boolean> {
    const result = await super.set(key, value, ttl);
    this.saveToFile();
    return result;
  }

  async delete(key: string): Promise<boolean> {
    const result = await super.delete(key);
    this.saveToFile();
    return result;
  }

  async clear(): Promise<void> {
    await super.clear();
    this.saveToFile();
  }
}

export function createLocalKVClient(filePath?: string): () => KvClient {
  if (filePath) {
    return () => new LocalFileKvClient(filePath);
  } else {
    return () => new LocalInMemoryKvClient();
  }
}
