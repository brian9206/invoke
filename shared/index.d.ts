import type { Sequelize } from 'sequelize'

export interface DatabaseConnectionConfig {
  user: string
  host: string
  database: string
  password: string
  port: number
}

export type ModelMap = Record<string, any>

export interface ServiceDatabase {
  sequelize: Sequelize
  models: ModelMap
  getConnectionConfig(): DatabaseConnectionConfig
  close(): Promise<void>
}

export interface CreateDatabaseOptions {
  pool?: {
    max?: number
    min?: number
    acquire?: number
    idle?: number
  }
}

export interface CreateServiceDatabaseOptions {
  poolMax?: number
}

export interface NotifyListener<TPayload = unknown> {
  connect(onNotify: (payload: TPayload) => void | Promise<void>): Promise<void>
  stop(): Promise<void>
  isConnected(): boolean
}

export interface NotifyListenerOptions<TPayload = unknown> {
  parsePayload?: (raw: unknown) => TPayload
  getDebounceKey?: (payload: TPayload) => string
  debounceMs?: number
}

export interface MigrationSummary {
  total: number
  applied: number
  pending: number
  migrations: Array<{ name: string; applied: boolean }>
}

export class MigrationManager {
  constructor(sequelize: Sequelize, options?: { migrationsPath?: string })
  runMigrations(): Promise<boolean>
  migrateDown(): Promise<void>
  getMigrationStatus(): Promise<MigrationSummary>
}

export interface S3PackageInfo {
  bucket: string
  objectName: string
  size: number
  hash: string
  url: string
}

export interface S3DownloadInfo {
  hash: string
  size: number
}

export interface S3Service {
  initialize(): Promise<void>
  listBuckets(): Promise<Array<{ Name: string; CreationDate: Date }>>
  fPutObject(bucket: string, key: string, filePath: string, metadata?: Record<string, string>): Promise<void>
  fGetObject(bucket: string, key: string, downloadPath: string): Promise<void>
  getObjectStream(bucket: string, key: string): Promise<NodeJS.ReadableStream>
  statObject(bucket: string, key: string): Promise<unknown>
  removeObject(bucket: string, key: string): Promise<void>
  computeFileHash(filePath: string): Promise<string>
  uploadPackage(
    functionId: string,
    version: string | number,
    filePath: string,
    contentType?: string
  ): Promise<S3PackageInfo>
  downloadPackage(functionId: string, version: string | number, downloadPath: string): Promise<S3DownloadInfo>
  downloadPackageFromPath(packagePath: string, downloadPath: string): Promise<S3DownloadInfo>
  deleteArtifact(artifactPath: string): Promise<void>
  deleteAllPackagesForFunction(functionId: string): Promise<number>
  listFunctionArtifacts(
    functionId: string
  ): Promise<Array<{ version: string; name: string; size: number; lastModified: Date; etag: string }>>
  deleteAllArtifactsForFunction(functionId: string): Promise<number>
  uploadArtifact(
    functionId: string,
    version: string | number,
    filePath: string
  ): Promise<{ objectName: string; size: number; hash: string }>
  downloadArtifact(artifactPath: string, downloadPath: string): Promise<S3DownloadInfo>
  listFunctionPackages(
    functionId: string
  ): Promise<Array<{ version: string; name: string; size: number; lastModified: Date; etag: string }>>
  deletePackage(functionId: string, version: string | number): Promise<void>
}

export function createDatabase(options?: CreateDatabaseOptions): Sequelize
export function initModels(sequelize: Sequelize): ModelMap
export function createServiceDatabase(options?: CreateServiceDatabaseOptions): ServiceDatabase
export function createNotifyListener<TPayload = unknown>(
  channel: string,
  options?: NotifyListenerOptions<TPayload>
): NotifyListener<TPayload>

export const s3Service: S3Service
