// Type declarations for the invoke-shared package (stays as JavaScript).
// All consuming TypeScript services get type safety via this file.

declare module 'invoke-shared' {
  // ─── Model stub ──────────────────────────────────────────────────────────────

  interface AnyModel {
    [key: string]: any;
  }

  interface AnyModelStatic {
    findAll(options?: any): Promise<AnyModel[]>;
    findOne(options?: any): Promise<AnyModel | null>;
    findByPk(id: any, options?: any): Promise<AnyModel | null>;
    findOrCreate(options: any): Promise<[AnyModel, boolean]>;
    create(values?: any, options?: any): Promise<AnyModel>;
    bulkCreate(records: any[], options?: any): Promise<AnyModel[]>;
    update(values: any, options: any): Promise<[number, AnyModel[]]>;
    upsert(values: any, options?: any): Promise<[AnyModel, boolean | null]>;
    destroy(options?: any): Promise<number>;
    count(options?: any): Promise<number>;
    sum(field: string, options?: any): Promise<number | null>;
    associate?(models: ServiceModels): void;
  }

  // ─── Models map ──────────────────────────────────────────────────────────────

  interface ServiceModels {
    User: AnyModelStatic;
    Project: AnyModelStatic;
    ProjectMembership: AnyModelStatic;
    FunctionGroup: AnyModelStatic;
    /** NOTE: 'Function' is a reserved JS keyword — always destructure with an alias:
     *  const { Function: FunctionModel } = database.models; */
    Function: AnyModelStatic;
    FunctionVersion: AnyModelStatic;
    ApiKey: AnyModelStatic;
    FunctionEnvironmentVariable: AnyModelStatic;
    GlobalSetting: AnyModelStatic;
    ProjectNetworkPolicy: AnyModelStatic;
    GlobalNetworkPolicy: AnyModelStatic;
    ApiGatewayConfig: AnyModelStatic;
    ApiGatewayRoute: AnyModelStatic;
    ApiGatewayRouteSettings: AnyModelStatic;
    ApiGatewayAuthMethod: AnyModelStatic;
    ApiGatewayRouteAuthMethod: AnyModelStatic;
    RealtimeNamespace: AnyModelStatic;
    RealtimeEventHandler: AnyModelStatic;
    RealtimeNamespaceAuthMethod: AnyModelStatic;
    LoginAttempt: AnyModelStatic;
    RefreshToken: AnyModelStatic;
  }

  // ─── Sequelize-like instance ──────────────────────────────────────────────────

  interface SequelizeLike {
    authenticate(): Promise<void>;
    close(): Promise<void>;
    query(sql: string, options?: any): Promise<any>;
    literal(val: string): any;
    fn(fn: string, ...args: any[]): any;
    col(col: string): any;
    transaction(options?: any): Promise<any>;
    define(modelName: string, attributes: any, options?: any): any;
    getQueryInterface(): any;
    models: Record<string, any>;
  }

  // ─── ServiceDatabase ─────────────────────────────────────────────────────────

  interface ConnectionConfig {
    user: string;
    host: string;
    database: string;
    password: string;
    port: number;
  }

  export interface ServiceDatabase {
    sequelize: SequelizeLike;
    models: ServiceModels;
    getConnectionConfig(): ConnectionConfig;
    close(): Promise<void>;
  }

  // ─── Factory options ──────────────────────────────────────────────────────────

  interface CreateDatabaseOptions {
    pool?: {
      max?: number;
      min?: number;
      acquire?: number;
      idle?: number;
    };
  }

  interface CreateServiceDatabaseOptions {
    poolMax?: number;
  }

  // ─── NotifyListener ───────────────────────────────────────────────────────────

  interface NotifyListenerOptions {
    parsePayload?: (raw: unknown) => unknown;
    getDebounceKey?: (payload: unknown) => string;
    debounceMs?: number;
  }

  interface NotifyListener {
    connect(onNotify: (payload: unknown) => Promise<void> | void): Promise<void>;
    stop(): Promise<void>;
    isConnected(): boolean;
  }

  // ─── S3Service ────────────────────────────────────────────────────────────────

  class S3Service {
    client: unknown;
    bucketName: string;
    initialized: boolean;

    initialize(): Promise<void>;

    listBuckets(): Promise<unknown[]>;
    fPutObject(
      bucket: string,
      key: string,
      filePath: string,
      metadata?: Record<string, string>
    ): Promise<void>;
    fGetObject(bucket: string, key: string, downloadPath: string): Promise<void>;
    getObjectStream(bucket: string, key: string): Promise<NodeJS.ReadableStream>;
    statObject(bucket: string, key: string): Promise<unknown>;
    removeObject(bucket: string, key: string): Promise<void>;
    computeFileHash(filePath: string): Promise<string>;
    uploadPackage(
      functionId: string,
      version: string,
      filePath: string,
      contentType?: string
    ): Promise<{ key: string; hash: string }>;
    downloadPackage(
      functionId: string,
      version: string,
      downloadPath: string
    ): Promise<string>;
    downloadPackageFromPath(packagePath: string, downloadPath: string): Promise<string>;
    deletePackage(functionId: string, version: string): Promise<void>;
    deleteAllPackagesForFunction(functionId: string): Promise<number>;
    listFunctionPackages(functionId: string): Promise<unknown[]>;
  }

  // ─── MigrationManager ────────────────────────────────────────────────────────

  interface MigrationEntry {
    name: string;
    applied: boolean;
  }

  interface MigrationStatus {
    total: number;
    applied: number;
    pending: number;
    migrations: MigrationEntry[];
  }

  class MigrationManager {
    constructor(sequelize: SequelizeLike);
    runMigrations(): Promise<boolean>;
    migrateDown(): Promise<void>;
    getMigrationStatus(): Promise<MigrationStatus>;
  }

  // ─── Exports ──────────────────────────────────────────────────────────────────

  export function createDatabase(opts?: CreateDatabaseOptions): SequelizeLike;
  export function initModels(sequelize: SequelizeLike): ServiceModels;
  export function createServiceDatabase(opts?: CreateServiceDatabaseOptions): ServiceDatabase;
  export function createNotifyListener(
    channel: string,
    opts?: NotifyListenerOptions
  ): NotifyListener;
  export const s3Service: S3Service;
  export { MigrationManager };
}
