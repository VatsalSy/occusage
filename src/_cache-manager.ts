/**
 * @fileoverview Cache management system for occusage
 *
 * This module provides a comprehensive caching system for both pricing data
 * and usage data to dramatically improve performance by avoiding repeated
 * processing of large JSONL files and API calls.
 *
 * @module cache-manager
 */

import type { ModelPricing } from './_types.ts';
import { readFile, writeFile, mkdir, stat, readdir, rename, unlink, rm } from 'node:fs/promises';
import { existsSync, createReadStream } from 'node:fs';
import path from 'node:path';
import { Result } from '@praha/byethrow';
import { createHash } from 'node:crypto';
import { pipeline } from 'node:stream/promises';
import { xdgCache } from 'xdg-basedir';
import { USER_HOME_DIR } from './_consts.ts';
import { logger } from './logger.ts';

/**
 * Cache version for compatibility checking
 * Increment when cache format changes
 */
const CACHE_VERSION = 1;

/**
 * Default cache directory path
 * Uses XDG_CACHE_HOME if set, otherwise falls back to ~/.cache/occusage
 */
const DEFAULT_CACHE_DIR = xdgCache ? `${xdgCache}/occusage` : `${USER_HOME_DIR}/.cache/occusage`;

/**
 * Cache configuration interface
 */
interface CacheConfig {
	cacheDir: string;
	pricingCacheDays: number;
	maxCacheSize?: number;
	enabled: boolean;
	noCache?: boolean;
}

/**
 * Default cache configuration
 */
const DEFAULT_CONFIG: CacheConfig = {
	cacheDir: process.env.OCCUSAGE_CACHE_DIR ?? DEFAULT_CACHE_DIR,
	pricingCacheDays: (() => {
		if (process.env.OCCUSAGE_PRICING_CACHE_DAYS === undefined) {
			return 7;
		}
		const parsed = Number.parseInt(process.env.OCCUSAGE_PRICING_CACHE_DAYS, 10);
		return Number.isNaN(parsed) || parsed < 0 ? 7 : parsed;
	})(),
	maxCacheSize: (() => {
		if (!process.env.OCCUSAGE_CACHE_MAX_SIZE) {
			return undefined;
		}
		const parsed = Number.parseInt(process.env.OCCUSAGE_CACHE_MAX_SIZE, 10);
		return Number.isNaN(parsed) || parsed < 0 ? undefined : parsed;
	})(),
	enabled: process.env.NODE_ENV !== 'test' && (() => {
		const value = process.env.OCCUSAGE_CACHE_ENABLED?.toLowerCase();
		return !['0', 'false', 'no', 'off'].includes(value || '');
	})(),
};

/**
 * Cache entry metadata
 */
interface CacheEntry<T = unknown> {
	version: number;
	timestamp: number;
	data: T;
	ttl?: number; // TTL in milliseconds
}

/**
 * File metadata for tracking changes
 */
interface FileMetadata {
	path: string;
	size: number;
	mtime: number;
	hash: string;
}

/**
 * Processed files tracking
 */
interface ProcessedFiles {
	version: number;
	timestamp: number;
	files: Record<string, FileMetadata>;
}

/**
 * Cache manager class for handling all caching operations
 * Implements a comprehensive caching system with TTL, versioning, and invalidation
 */
export class CacheManager {
	private readonly config: CacheConfig;

	constructor(config?: Partial<CacheConfig>) {
		this.config = { ...DEFAULT_CONFIG, ...config };
		
		if (!this.config.enabled) {
			logger.debug('Cache is disabled via OCCUSAGE_CACHE_ENABLED=false');
		}
	}

	/**
	 * Initialize cache directory structure
	 */
	async initialize(): Promise<void> {
		if (!this.config.enabled) {
			return;
		}

		await this.ensureCacheDir();
		await this.ensureCacheSubdirs();
	}

	/**
	 * Ensure cache directory exists
	 */
	private async ensureCacheDir(): Promise<void> {
		await mkdir(this.config.cacheDir, { recursive: true });
		logger.debug(`Ensured cache directory exists: ${this.config.cacheDir}`);
	}

	/**
	 * Ensure cache subdirectories exist
	 */
	private async ensureCacheSubdirs(): Promise<void> {
		const subdirs = ['aggregates', 'temp'];
		
		for (const subdir of subdirs) {
			const subdirPath = path.join(this.config.cacheDir, subdir);
			if (!existsSync(subdirPath)) {
				await mkdir(subdirPath, { recursive: true });
				logger.debug(`Created cache subdirectory: ${subdirPath}`);
			}
		}
	}

	/**
	 * Get cache file path with sanitized key
	 */
	private getCacheFilePath(key: string): string {
		const safeKey = this.sanitizeKey(key);
		return path.join(this.config.cacheDir, `${safeKey}.json`);
	}

	/**
	 * Sanitize cache key to prevent path traversal and ensure valid filename
	 */
	private sanitizeKey(key: string): string {
		// Remove path separators and dangerous patterns
		let sanitized = key.replace(/[\/\\]/g, '_').replace(/\.\.+/g, '');
		
		// Remove leading dots
		sanitized = sanitized.replace(/^\.+/, '');
		
		// Keep only safe characters
		sanitized = sanitized.replace(/[^A-Za-z0-9._-]/g, '_');
		
		// Enforce max length and ensure non-empty
		if (sanitized.length === 0 || sanitized.length > 200) {
			return createHash('sha256').update(key).digest('hex');
		}
		
		return sanitized;
	}

	/**
	 * Calculate file hash for change detection using streaming
	 */
	private async calculateFileHash(filePath: string): Promise<string> {
		return Result.unwrap(
			Result.try({
				try: async () => {
					const hash = createHash('sha256');
					const stream = createReadStream(filePath);
					
					await pipeline(stream, hash);
					return hash.digest('hex');
				},
				catch: (error) => new Error(`Failed to calculate hash for ${filePath}`, { cause: error }),
			})
		);
	}

	/**
	 * Get file metadata for tracking changes
	 */
	async getFileMetadata(filePath: string): Promise<FileMetadata> {
		return Result.unwrap(
			Result.try({
				try: async () => {
					const stats = await stat(filePath);
					const hash = await this.calculateFileHash(filePath);
					
					return {
						path: filePath,
						size: stats.size,
						mtime: stats.mtimeMs,
						hash,
					};
				},
				catch: (error) => new Error(`Failed to get metadata for ${filePath}`, { cause: error }),
			})
		);
	}

	/**
	 * Read cache entry if it exists
	 */
	private async readCacheEntryIfExists<T>(key: string): Promise<CacheEntry<T> | null> {
		return Result.unwrap(
			Result.try({
				try: async () => {
					const filePath = this.getCacheFilePath(key);
					const content = await readFile(filePath, 'utf-8');
					return JSON.parse(content) as CacheEntry<T>;
				},
				catch: (error) => {
					if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
						return null;
					}
					logger.debug(`Failed to read cache entry ${key}:`, error);
					return null;
				},
			})
		);
	}

	/**
	 * Check if cache entry exists and is valid
	 */
	async isValid<T>(key: string, ttl?: number): Promise<boolean> {
		if (!this.config.enabled || this.config.noCache) {
			return false;
		}

		const entry = await this.readCacheEntryIfExists<T>(key);
		if (!entry) {
			return false;
		}

		// Check version compatibility
		if (entry.version !== CACHE_VERSION) {
			logger.debug(`Cache entry ${key} has incompatible version ${entry.version}, expected ${CACHE_VERSION}`);
			return false;
		}

		// Check TTL
		const entryTtl = ttl ?? entry.ttl;
		if (entryTtl != null) {
			const age = Date.now() - entry.timestamp;
			if (age > entryTtl) {
				logger.debug(`Cache entry ${key} expired (age: ${Math.round(age / 1000)}s, TTL: ${Math.round(entryTtl / 1000)}s)`);
				return false;
			}
		}

		return true;
	}

	/**
	 * Get data from cache
	 */
	async get<T>(key: string, ttl?: number): Promise<T | null> {
		if (!this.config.enabled || this.config.noCache) {
			return null;
		}

		const entry = await this.readCacheEntryIfExists<T>(key);
		if (!entry) {
			return null;
		}

		// Check version compatibility
		if (entry.version !== CACHE_VERSION) {
			logger.debug(`Cache entry ${key} has incompatible version ${entry.version}, expected ${CACHE_VERSION}`);
			return null;
		}

		// Check TTL
		const entryTtl = ttl ?? entry.ttl;
		if (entryTtl != null) {
			const age = Date.now() - entry.timestamp;
			if (age > entryTtl) {
				logger.debug(`Cache entry ${key} expired (age: ${Math.round(age / 1000)}s, TTL: ${Math.round(entryTtl / 1000)}s)`);
				return null;
			}
		}

		logger.debug(`Cache hit for ${key}`);
		return entry.data;
	}

	/**
	 * Store data in cache with atomic writes
	 */
	async set<T>(key: string, data: T, ttl?: number): Promise<void> {
		if (!this.config.enabled || this.config.noCache) {
			return;
		}

		await this.ensureCacheDir();

		const entry: CacheEntry<T> = {
			version: CACHE_VERSION,
			timestamp: Date.now(),
			data,
			ttl,
		};

		try {
			const filePath = this.getCacheFilePath(key);
			const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
			const json = JSON.stringify(entry, null, 2);
			
			await writeFile(tmpPath, json, 'utf-8');
			await rename(tmpPath, filePath);
			
			logger.debug(`Cached data for ${key}`);
		} catch (error) {
			logger.error(`Failed to cache data for ${key}:`, error);
			throw error;
		}
	}

	/**
	 * Remove cache entry
	 */
	async delete(key: string): Promise<void> {
		if (!this.config.enabled || this.config.noCache) {
			return;
		}

		return Result.unwrap(
			Result.try({
				try: async () => {
					const filePath = this.getCacheFilePath(key);
					await unlink(filePath);
					logger.debug(`Deleted cache entry ${key}`);
				},
				catch: (error) => {
					if (error && (error as NodeJS.ErrnoException).code === 'ENOENT') {
						return;
					}
					logger.debug(`Failed to delete cache entry ${key}:`, error);
				},
			})
		);
	}

	/**
	 * Clear all cache entries
	 */
	async clear(): Promise<void> {
		if (!this.config.enabled || this.config.noCache) {
			return;
		}

		return Result.unwrap(
			Result.try({
				try: async () => {
					await rm(this.config.cacheDir, { recursive: true, force: true });
					logger.info(`Cleared cache directory: ${this.config.cacheDir}`);
				},
				catch: (error) => {
					logger.error(`Failed to clear cache:`, error);
					throw error;
				},
			})
		);
	}

	/**
	 * Get cache statistics
	 */
	async getStats(): Promise<{
		enabled: boolean;
		cacheDir: string;
		totalFiles: number;
		totalSize: number;
		oldestEntry: number | null;
		newestEntry: number | null;
	}> {
		const stats = {
			enabled: this.config.enabled,
			cacheDir: this.config.cacheDir,
			totalFiles: 0,
			totalSize: 0,
			oldestEntry: null as number | null,
			newestEntry: null as number | null,
		};

		if (!this.config.enabled || !existsSync(this.config.cacheDir)) {
			return stats;
		}

		return Result.unwrap(
			Result.try({
				try: async () => {
					// Walk the cacheDir recursively, tallying only `.json` files
					const queue: string[] = [this.config.cacheDir];
					while (queue.length) {
						const dir = queue.pop()!;
						const entries = await readdir(dir, { withFileTypes: true });
						for (const entry of entries) {
							const full = path.join(dir, entry.name);
							if (entry.isDirectory()) {
								queue.push(full);
							} else if (entry.isFile() && full.endsWith('.json')) {
								const fileStat = await stat(full);
								stats.totalFiles++;
								stats.totalSize += fileStat.size;
								if (stats.oldestEntry === null || fileStat.mtimeMs < stats.oldestEntry) {
									stats.oldestEntry = fileStat.mtimeMs;
								}
								if (stats.newestEntry === null || fileStat.mtimeMs > stats.newestEntry) {
									stats.newestEntry = fileStat.mtimeMs;
								}
							}
						}
					}

					return stats;
				},
				catch: (error) => {
					logger.debug(`Failed to get cache stats:`, error);
					return stats;
				},
			})
		);
	}

	/**
	 * Get pricing cache with TTL support
	 */
	async getPricing(): Promise<Map<string, ModelPricing> | null> {
		const ttl = Math.max(0, this.config.pricingCacheDays) * 24 * 60 * 60 * 1000; // Convert days to milliseconds
		const cached = await this.get<Record<string, ModelPricing>>('pricing', ttl);

		if (cached) {
			return new Map(Object.entries(cached));
		}

		return null;
	}

	/**
	 * Set pricing cache
	 */
	async setPricing(pricing: Map<string, ModelPricing>): Promise<void> {
		const ttl = Math.max(0, this.config.pricingCacheDays) * 24 * 60 * 60 * 1000; // Convert days to milliseconds
		const data = Object.fromEntries(pricing);
		await this.set('pricing', data, ttl);
	}

	/**
	 * Get processed files tracking data
	 */
	async getProcessedFiles(): Promise<ProcessedFiles | null> {
		return this.get<ProcessedFiles>('processed-files');
	}

	/**
	 * Set processed files tracking data
	 */
	async setProcessedFiles(processedFiles: ProcessedFiles): Promise<void> {
		await this.set('processed-files', processedFiles);
	}

	/**
	 * Check if file needs processing (new or modified) - optimized fast path
	 */
	async needsProcessing(filePath: string): Promise<boolean> {
		const processedFiles = await this.getProcessedFiles();
		
		if (!processedFiles) {
			return true; // No tracking data, need to process
		}

		const existing = processedFiles.files[filePath];
		if (!existing) {
			return true; // File not tracked, need to process
		}

		// Fast path: check size and mtime first
		try {
			const s = await stat(filePath);
			if (existing.size === s.size && existing.mtime === s.mtimeMs) {
				return false; // File unchanged
			}
			// File stats changed, needs processing
			return true;
		} catch {
			// File doesn't exist or can't be accessed, needs processing
			return true;
		}
	}

	/**
	 * Mark file as processed
	 */
	async markProcessed(filePath: string): Promise<void> {
		const metadata = await this.getFileMetadata(filePath);
		const processedFiles = await this.getProcessedFiles() ?? {
			version: CACHE_VERSION,
			timestamp: Date.now(),
			files: {},
		};

		processedFiles.files[filePath] = metadata;
		processedFiles.timestamp = Date.now();

		await this.setProcessedFiles(processedFiles);
	}

	/**
	 * Get cache configuration
	 */
	getConfig(): CacheConfig {
		return { ...this.config };
	}
}

/**
 * Global cache manager instance - lazy singleton pattern
 */
let globalCacheManagerInstance: CacheManager | null = null;

/**
 * Get the global cache manager instance (lazy initialization)
 * @param config Optional cache configuration
 */
export function getGlobalCacheManager(config?: Partial<CacheConfig>): CacheManager {
	if (!globalCacheManagerInstance) {
		globalCacheManagerInstance = new CacheManager(config);
	}
	return globalCacheManagerInstance;
}

/**
 * Reset global cache manager for testing
 */
export function resetGlobalCacheManager(): void {
	if (process.env.NODE_ENV === 'test') {
		globalCacheManagerInstance = null;
	} else {
		throw new Error('resetGlobalCacheManager can only be called in test environment');
	}
}

/**
 * @deprecated Use getGlobalCacheManager() instead
 */
export const globalCacheManager = getGlobalCacheManager();