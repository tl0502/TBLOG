export interface CacheDeleteOptions {
  /** Rotate the complete cache generation when stale public data must stop being addressable immediately. */
  forceGeneration?: boolean
}

export interface CacheProvider {
  get<T>(key: string): Promise<T | null>
  set<T>(key: string, value: T, ttlSeconds?: number): Promise<void>
  delete(keys: string[], options?: CacheDeleteOptions): Promise<void>
}
