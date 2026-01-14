/**
 * Simple LRU Cache with TTL and ETag (modifiedTime) validation support
 * 
 * All cached data is associated with a file and invalidated when the file changes.
 */

interface CacheEntry<T> {
  value: T;
  modifiedTime: string;  // File's modifiedTime for ETag-style validation
  cachedAt: number;
}

interface CacheOptions {
  maxSize: number;
  ttlMs: number;
}

const DEFAULT_OPTIONS: CacheOptions = {
  maxSize: parseInt(process.env.CACHE_MAX_SIZE || '100', 10),
  ttlMs: parseInt(process.env.CACHE_TTL_MS || '300000', 10), // 5 minutes default
};

export class FileCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private options: CacheOptions;

  constructor(options: Partial<CacheOptions> = {}) {
    this.cache = new Map();
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }

  /**
   * Get a value from cache if it exists and is still fresh
   * @param key Cache key
   * @param currentModifiedTime Current file modifiedTime from API
   * @returns Cached value if fresh, undefined otherwise
   */
  getIfFresh(key: string, currentModifiedTime: string): T | undefined {
    const entry = this.cache.get(key);
    
    if (!entry) {
      return undefined;
    }

    // Check if TTL expired
    if (this.isExpired(entry)) {
      this.cache.delete(key);
      return undefined;
    }

    // Check if file has been modified
    if (entry.modifiedTime !== currentModifiedTime) {
      this.cache.delete(key);
      return undefined;
    }

    // Move to end (most recently used)
    this.cache.delete(key);
    this.cache.set(key, entry);
    
    return entry.value;
  }

  /**
   * Set a value in cache
   * @param key Cache key
   * @param value Value to cache
   * @param modifiedTime File's modifiedTime for freshness validation
   */
  set(key: string, value: T, modifiedTime: string): void {
    // Evict oldest if at capacity
    if (this.cache.size >= this.options.maxSize) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey) {
        this.cache.delete(oldestKey);
      }
    }

    this.cache.set(key, {
      value,
      modifiedTime,
      cachedAt: Date.now(),
    });
  }

  /**
   * Check if entry is expired based on TTL
   */
  private isExpired(entry: CacheEntry<T>): boolean {
    return Date.now() - entry.cachedAt > this.options.ttlMs;
  }

  /**
   * Invalidate all entries for a specific file
   */
  invalidateFile(fileId: string): void {
    const keysToDelete: string[] = [];
    for (const key of this.cache.keys()) {
      if (key.startsWith(`${fileId}:`)) {
        keysToDelete.push(key);
      }
    }
    for (const key of keysToDelete) {
      this.cache.delete(key);
    }
  }

  /**
   * Clear all entries
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * Get cache statistics
   */
  stats(): { size: number; maxSize: number; ttlMs: number } {
    return {
      size: this.cache.size,
      maxSize: this.options.maxSize,
      ttlMs: this.options.ttlMs,
    };
  }
}

// Singleton cache instance for all file-related data
export const cache = new FileCache<string>({
  maxSize: 100,
  ttlMs: 5 * 60 * 1000, // 5 minutes
});

/**
 * Cache key for file content
 * Format: fileId:content
 */
export function contentKey(fileId: string): string {
  return `${fileId}:content`;
}

/**
 * Cache key for heading resolution
 * Format: fileId:heading:headingId
 */
export function headingKey(fileId: string, headingId: string): string {
  return `${fileId}:heading:${headingId}`;
}
