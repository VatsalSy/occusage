/**
 * @fileoverview Live monitoring implementation for Claude usage data
 *
 * This module provides efficient incremental data loading for the live monitoring feature
 * in the blocks command. It tracks file modifications and only reads changed data,
 * maintaining a cache of processed entries to minimize file I/O during live updates.
 *
 * Used exclusively by blocks-live.ts for the --live flag functionality.
 */

import type { LoadedUsageEntry, SessionBlock } from './_session-blocks.ts';
import type { CostMode, SortOrder } from './_types.ts';
import { readFile, stat } from 'node:fs/promises';
import { Result } from '@praha/byethrow';
import { loadOpenCodeData } from './_opencode-loader.ts';
import { identifySessionBlocks } from './_session-blocks.ts';
import {
	calculateCostForEntry,
	createUniqueHash,
	getUsageLimitResetTime,
	globUsageFiles,
	sortFilesByTimestamp,
	usageDataSchema,
} from './data-loader.ts';
import { PricingFetcher } from './pricing-fetcher.ts';
import { logger } from './logger.ts';

/**
 * Configuration for live monitoring
 */
export type LiveMonitorConfig = {
	claudePaths: string[];
	sessionDurationHours: number;
	mode: CostMode;
	order: SortOrder;
};

/**
 * Manages live monitoring of Claude usage with efficient data reloading
 */
export class LiveMonitor implements Disposable {
	private config: LiveMonitorConfig;
	private fetcher: PricingFetcher | null = null;
	private lastFileTimestamps = new Map<string, number>();
	private processedHashes = new Set<string>();
	private allEntries: LoadedUsageEntry[] = [];
	private lastOpenCodeLoadTime = 0;
	private openCodeHashes = new Set<string>();
	private cachedActiveBlock: SessionBlock | null = null;

	constructor(config: LiveMonitorConfig) {
		this.config = config;
		// Initialize pricing fetcher once if needed
		if (config.mode !== 'display') {
			this.fetcher = new PricingFetcher();
		}
	}

	/**
	 * Implements Disposable interface
	 */
	[Symbol.dispose](): void {
		this.fetcher?.[Symbol.dispose]();
	}

	/**
	 * Gets the current active session block with minimal file reading
	 * Only reads new or modified files since last check
	 */
	async getActiveBlock(): Promise<SessionBlock | null> {
		const results = await globUsageFiles(this.config.claudePaths);
		const allFiles = results.map(r => r.file);

		if (allFiles.length === 0) {
			return null;
		}

		// Check for new or modified files using file modification time
		const filesToRead: string[] = [];
		// Stage mtimes; commit after successful read
		const stagedMtimes = new Map<string, number>();
		const statResults = await Promise.allSettled(
			allFiles.map(async file => {
				try {
					const fileStats = await stat(file);
					return { file, mtimeMs: fileStats.mtimeMs } as const;
				} catch (err) {
					throw { file, err };
				}
			}),
		);

		for (const res of statResults) {
			if (res.status === "rejected") {
				// Skip files that can't be stat'd (permissions, deleted, etc.)
				const rejection = res.reason as { file?: string; err?: unknown } | unknown;
				
				// Extract file and error from the rejection
				const file = typeof rejection === "object" && rejection !== null && "file" in rejection 
					? (rejection as { file?: string }).file ?? "unknown"
					: "unknown";
				
				const err = typeof rejection === "object" && rejection !== null && "err" in rejection
					? (rejection as { err?: unknown }).err
					: rejection;
				
				logger.debug("stat failed; skipping file", { file, err });
				continue;
			}

			const { file, mtimeMs: currentMtime } = res.value;
			const lastMtime = this.lastFileTimestamps.get(file);
			if (lastMtime == null || currentMtime > lastMtime) {
				filesToRead.push(file);
				stagedMtimes.set(file, currentMtime);
			}
		}

		// Read only new/modified files
		if (filesToRead.length > 0) {
			const sortedFiles = await sortFilesByTimestamp(filesToRead);

			for (const file of sortedFiles) {
				const readTry = Result.try({
					try: async () => await readFile(file, 'utf-8'),
					catch: (err) => err,
				});

				const readResult = await readTry();
				if (Result.isFailure(readResult)) {
					logger.debug('read failed; skipping file', { file, err: readResult.error });
					continue;
				}
				const content = readResult.value;

				const lines = content
					.trim()
					.split('\n')
					.filter(line => line.length > 0);

				for (const line of lines) {
					const parseTry = Result.try({
						try: () => JSON.parse(line) as unknown,
						catch: (err) => err,
					});
					
					const parseResult = parseTry();
					if (Result.isFailure(parseResult)) {
						logger.debug('JSON parse failed; skipping line', { file, err: parseResult.error });
						continue;
					}
					
					const parsed = parseResult.value;
					const result = usageDataSchema.safeParse(parsed);
					if (!result.success) {
						continue;
					}
					const data = result.data;

					// Check for duplicates
					const uniqueHash = createUniqueHash(data);
					if (uniqueHash != null && this.processedHashes.has(uniqueHash)) {
						continue;
					}
					if (uniqueHash != null) {
						this.processedHashes.add(uniqueHash);
					}

					// Calculate cost if needed
					const costUSD: number = await (this.config.mode === 'display'
						? Promise.resolve(data.costUSD ?? 0)
						: calculateCostForEntry(
								data,
								this.config.mode,
								this.fetcher!,
							));

					const usageLimitResetTime = getUsageLimitResetTime(data);

					// Skip entries with synthetic model or unknown model
					const model = data.message.model ?? 'unknown';
					if (model === '<synthetic>' || model === 'unknown') {
						continue;
					}

					// Add entry
					this.allEntries.push({
						source: 'claude',
						timestamp: new Date(data.timestamp),
						usage: {
							inputTokens: data.message.usage.input_tokens ?? 0,
							outputTokens: data.message.usage.output_tokens ?? 0,
							cacheCreationInputTokens: data.message.usage.cache_creation_input_tokens ?? 0,
							cacheReadInputTokens: data.message.usage.cache_read_input_tokens ?? 0,
						},
						costUSD,
						model,
						version: data.version,
						usageLimitResetTime: usageLimitResetTime ?? undefined,
					});
				}

				// Commit staged mtime only after a successful read
				const stagedMtime = stagedMtimes.get(file);
				if (stagedMtime != null) {
					this.lastFileTimestamps.set(file, stagedMtime);
				}
			}
		}

		// Load OpenCode data periodically (every 5 seconds to balance responsiveness and performance)
		const now = Date.now();
		if (now - this.lastOpenCodeLoadTime > 5000) {
			try {
				const openCodeEntries = loadOpenCodeData(undefined, true); // Suppress logs during live monitoring

				// Track new OpenCode entries using hashes to prevent duplicates
				for (const entry of openCodeEntries) {
					// Create a unique hash for this OpenCode entry
					const entryHash = `opencode-${entry.timestamp.toISOString()}-${entry.model}-${entry.tokens.input}-${entry.tokens.output}`;

					// Skip if we've already processed this entry
					if (this.openCodeHashes.has(entryHash)) {
						continue;
					}

					this.openCodeHashes.add(entryHash);

					// Calculate cost for OpenCode entries when cost is missing
					let costUSD = entry.cost ?? 0;
					if ((entry.cost == null || entry.cost === 0) && this.config.mode !== 'display' && this.fetcher != null) {
						// Calculate from tokens when cost is missing (typical for OpenCode entries)
						const tokens = {
							input_tokens: entry.tokens.input,
							output_tokens: entry.tokens.output,
							cache_creation_input_tokens: entry.tokens.cache?.write ?? 0,
							cache_read_input_tokens: entry.tokens.cache?.read ?? 0,
						};
						costUSD = await Result.unwrap(this.fetcher.calculateCostFromTokens(tokens, entry.model), 0);
					}

					// Convert to LoadedUsageEntry format and add
					this.allEntries.push({
						source: 'opencode',
						timestamp: entry.timestamp,
						usage: {
							inputTokens: entry.tokens.input,
							outputTokens: entry.tokens.output,
							cacheCreationInputTokens: entry.tokens.cache?.write ?? 0,
							cacheReadInputTokens: entry.tokens.cache?.read ?? 0,
						},
						costUSD,
						model: entry.model,
						version: undefined,
						usageLimitResetTime: undefined,
					});
				}

				this.lastOpenCodeLoadTime = now;
			}
			catch (err) {
				// Capture OpenCode loading errors at debug level to aid diagnostics without surfacing to users
				logger.debug('OpenCode load error', err);
			}
		}

		// Generate blocks and find active one
		const blocks = identifySessionBlocks(
			this.allEntries,
			this.config.sessionDurationHours,
		);

		// Sort blocks
		const sortedBlocks = this.config.order === 'asc'
			? blocks
			: blocks.reverse();

		// Find active block
		const activeBlock = sortedBlocks.find(block => block.isActive) ?? null;

		// Use caching to prevent flickering during data updates
		if (activeBlock != null) {
			// Update cache with new valid block
			this.cachedActiveBlock = activeBlock;
			return activeBlock;
		}

		// If no active block found but we have a cached one, check if it's still valid
		if (this.cachedActiveBlock != null && this.cachedActiveBlock.actualEndTime != null) {
			const now = new Date();
			const sessionDurationMs = this.config.sessionDurationHours * 60 * 60 * 1000;
			const timeSinceLastEntry = now.getTime() - this.cachedActiveBlock.actualEndTime.getTime();

			// If the cached block is still within the session duration, keep using it
			// This prevents flickering during OpenCode data refreshes
			if (timeSinceLastEntry < sessionDurationMs && now < this.cachedActiveBlock.endTime) {
				return this.cachedActiveBlock;
			}

			// Cached block is no longer valid
			this.cachedActiveBlock = null;
		}

		return null;
	}

	/**
	 * Clears file timestamp cache to allow re-checking for updates
	 * Note: Does NOT clear processed entries to maintain consistency
	 */
	clearCache(): void {
		// Only clear file timestamps to allow checking for new lines in files
		// Do NOT clear processedHashes or allEntries to maintain data consistency
		this.lastFileTimestamps.clear();
		// Also don't clear cachedActiveBlock to prevent flickering
	}
}


