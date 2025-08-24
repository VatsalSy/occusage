/**
 * @fileoverview Data loading utilities for Claude Code usage analysis
 *
 * This module provides functions for loading and parsing Claude Code usage data
 * from JSONL files stored in Claude data directories. It handles data aggregation
 * for daily, monthly, and session-based reporting.
 *
 * @module data-loader
 */

import type { IntRange, TupleToUnion } from 'type-fest';
import type { WEEK_DAYS } from './_consts.ts';
import type { OpenCodeUsageEntry } from './_opencode-types.ts';
import type { LoadedUsageEntry, SessionBlock } from './_session-blocks.ts';
import type {
	ActivityDate,
	Bucket,
	CostMode,
	ModelName,
	SortOrder,
	Version,
	WeeklyDate,
} from './_types.ts';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { toArray } from '@antfu/utils';
// Helper function to mark unreachable code
function unreachable(_value: never): never {
	throw new Error('Unreachable code reached');
}
import { Result } from '@praha/byethrow';
import { groupBy, uniq } from 'es-toolkit'; // TODO: after node20 is deprecated, switch to native Object.groupBy
import { sort } from 'fast-sort';
import { createFixture } from 'fs-fixture';
import { isDirectorySync } from 'path-type';
import { glob } from 'tinyglobby';
import { z } from 'zod';
import { CLAUDE_CONFIG_DIR_ENV, CLAUDE_PROJECTS_DIR_NAME, DEFAULT_CLAUDE_CODE_PATH, DEFAULT_CLAUDE_CONFIG_PATH, USAGE_DATA_GLOB_PATTERN, USER_HOME_DIR } from './_consts.ts';
import { loadOpenCodeData } from './_opencode-loader.ts';
import {
	identifySessionBlocks,
} from './_session-blocks.ts';
import {
	activityDateSchema,
	createBucket,
	createDailyDate,
	createISOTimestamp,
	createMessageId,
	createModelName,
	createMonthlyDate,
	createProjectPath,
	createRequestId,
	createSessionId,
	createVersion,
	createWeeklyDate,
	dailyDateSchema,
	isoTimestampSchema,
	messageIdSchema,
	modelNameSchema,
	monthlyDateSchema,
	projectPathSchema,
	requestIdSchema,
	sessionIdSchema,
	versionSchema,
	weeklyDateSchema,
} from './_types.ts';
import { logger } from './logger.ts';
import {
	PricingFetcher,
} from './pricing-fetcher.ts';

/**
 * Common entry format for both Claude and OpenCode data
 */
type UnifiedUsageEntry = {
	source: 'claude' | 'opencode';
	timestamp: string;
	projectPath: string;
	sessionId: string;
	model: string;
	usage: {
		input_tokens: number;
		output_tokens: number;
		cache_creation_input_tokens: number;
		cache_read_input_tokens: number;
	};
	costUSD?: number;
	version?: string;
};

/**
 * Loads unified usage data from both Claude and OpenCode sources
 */

async function _loadUnifiedUsageData(
	options?: LoadOptions,
): Promise<UnifiedUsageEntry[]> {
	const sources = options?.sources ?? ['claude', 'opencode'];
	const allEntries: UnifiedUsageEntry[] = [];

	// Load Claude data if included
	if (sources.includes('claude')) {
		const claudePaths = toArray(options?.claudePath ?? getClaudePaths());
		const allFiles = await globUsageFiles(claudePaths);
		const fileList = allFiles.map(f => f.file);

		if (fileList.length > 0) {
			// Filter by project if specified
			const projectFilteredFiles = filterByProject(
				fileList,
				filePath => extractProjectFromPath(filePath),
				options?.project,
			);

			// Sort files by timestamp
			const sortedFiles = await sortFilesByTimestamp(projectFilteredFiles);

			// Track processed message+request combinations for deduplication
			const processedHashes = new Set<string>();

			for (const file of sortedFiles) {
				const content = await readFile(file, 'utf-8');
				const lines = content
					.trim()
					.split('\n')
					.filter(line => line.length > 0);

				const projectPath = extractProjectFromPath(file);
				const sessionId = path.basename(file, '.jsonl');

            let parseErrorCount = 0;
            for (const [lineIndex, line] of lines.entries()) {
					try {
						const parsed = JSON.parse(line) as unknown;
						// eslint-disable-next-line ts/no-use-before-define
						const result = usageDataSchema.safeParse(parsed);
						if (!result.success) {
							continue;
						}
						const data = result.data;

						// Check for duplicate
						const uniqueHash = createUniqueHash(data);
						if (isDuplicateEntry(uniqueHash, processedHashes)) {
							continue;
						}
						markAsProcessed(uniqueHash, processedHashes);

						// Skip entries with synthetic model or unknown model
						const model = data.message.model ?? 'unknown';
						if (model === '<synthetic>' || model === 'unknown') {
							continue;
						}

						allEntries.push({
							source: 'claude',
							timestamp: data.timestamp,
							projectPath,
							sessionId,
							model,
							usage: {
								input_tokens: data.message.usage.input_tokens,
								output_tokens: data.message.usage.output_tokens,
								cache_creation_input_tokens: data.message.usage.cache_creation_input_tokens ?? 0,
								cache_read_input_tokens: data.message.usage.cache_read_input_tokens ?? 0,
							},
							costUSD: data.costUSD,
							version: data.version,
						});
              }
              catch (error) {
                // Log parse error with context but keep skipping invalid lines
                parseErrorCount += 1;
                if (parseErrorCount <= 3) {
                  const message = error instanceof Error ? error.message : String(error);
                  const snippet = line.length > 200 ? `${line.slice(0, 200)}…` : line;
                  logger.warn(
                    `Failed to parse JSON in unified loader (file: ${file}, lineIndex: ${lineIndex}): ${message}. Raw line: ${snippet}`,
                  );
                }
                else if (parseErrorCount === 4) {
                  logger.info(
                    `Multiple JSON parse errors encountered in file ${file}. Further errors will be suppressed for this file to avoid log flooding.`,
                  );
                }
                // Skip invalid JSON lines
              }
				}
			}
		}
	}

	// Load OpenCode data if included
	if (sources.includes('opencode')) {
		const openCodeEntries = loadOpenCodeData(options?.openCodePath);

		for (const entry of openCodeEntries) {
			// Filter by project if specified
			if (options?.project != null && !entry.projectPath.includes(options.project)) {
				continue;
			}

			allEntries.push({
				source: 'opencode',
				timestamp: entry.timestamp.toISOString(),
				projectPath: entry.projectPath,
				sessionId: entry.sessionId,
				model: entry.model,
				usage: {
					input_tokens: entry.tokens.input,
					output_tokens: entry.tokens.output,
					cache_creation_input_tokens: entry.tokens.cache?.write ?? 0,
					cache_read_input_tokens: entry.tokens.cache?.read ?? 0,
				},
				costUSD: entry.cost,
			});
		}
	}

	return allEntries;
}

/**
 * Get Claude data directories to search for usage data
 * When CLAUDE_CONFIG_DIR is set: uses only those paths
 * When not set: uses default paths (~/.config/claude and ~/.claude)
 * @returns Array of valid Claude data directory paths
 */
export function getClaudePaths(): string[] {
	const paths = [];
	const normalizedPaths = new Set<string>();

	// Check environment variable first (supports comma-separated paths)
	const envPaths = (process.env[CLAUDE_CONFIG_DIR_ENV] ?? '').trim();
	if (envPaths !== '') {
		const envPathList = envPaths.split(',').map(p => p.trim()).filter(p => p !== '');
		for (const envPath of envPathList) {
			const normalizedPath = path.resolve(envPath);
			if (isDirectorySync(normalizedPath)) {
				const projectsPath = path.join(normalizedPath, CLAUDE_PROJECTS_DIR_NAME);
				if (isDirectorySync(projectsPath)) {
					// Avoid duplicates using normalized paths
					if (!normalizedPaths.has(normalizedPath)) {
						normalizedPaths.add(normalizedPath);
						paths.push(normalizedPath);
					}
				}
			}
		}
		// If environment variable is set, return only those paths (or error if none valid)
		if (paths.length > 0) {
			return paths;
		}
		// If environment variable is set but no valid paths found, throw error
		throw new Error(
			`No valid Claude data directories found in CLAUDE_CONFIG_DIR. Please ensure the following exists:
- ${envPaths}/${CLAUDE_PROJECTS_DIR_NAME}`.trim(),
		);
	}

	// Only check default paths if no environment variable is set
	const defaultPaths = [
		DEFAULT_CLAUDE_CONFIG_PATH, // New default: XDG config directory
		path.join(USER_HOME_DIR, DEFAULT_CLAUDE_CODE_PATH), // Old default: ~/.claude
	];

	for (const defaultPath of defaultPaths) {
		const normalizedPath = path.resolve(defaultPath);
		if (isDirectorySync(normalizedPath)) {
			const projectsPath = path.join(normalizedPath, CLAUDE_PROJECTS_DIR_NAME);
			if (isDirectorySync(projectsPath)) {
				// Avoid duplicates using normalized paths
				if (!normalizedPaths.has(normalizedPath)) {
					normalizedPaths.add(normalizedPath);
					paths.push(normalizedPath);
				}
			}
		}
	}

	if (paths.length === 0) {
		throw new Error(
			`No valid Claude data directories found. Please ensure at least one of the following exists:
- ${path.join(DEFAULT_CLAUDE_CONFIG_PATH, CLAUDE_PROJECTS_DIR_NAME)}
- ${path.join(USER_HOME_DIR, DEFAULT_CLAUDE_CODE_PATH, CLAUDE_PROJECTS_DIR_NAME)}
- Or set ${CLAUDE_CONFIG_DIR_ENV} environment variable to valid directory path(s) containing a '${CLAUDE_PROJECTS_DIR_NAME}' subdirectory`.trim(),
		);
	}

	return paths;
}

/**
 * Extract project name from Claude JSONL file path
 * @param jsonlPath - Absolute path to JSONL file
 * @returns Project name extracted from path, or "unknown" if malformed
 */
export function extractProjectFromPath(jsonlPath: string): string {
	// Normalize path separators for cross-platform compatibility
	const normalizedPath = jsonlPath.replace(/[/\\]/g, path.sep);
	const segments = normalizedPath.split(path.sep);
	const projectsIndex = segments.findIndex(segment => segment === CLAUDE_PROJECTS_DIR_NAME);

	if (projectsIndex === -1 || projectsIndex + 1 >= segments.length) {
		return 'unknown';
	}

	const projectName = segments[projectsIndex + 1];
	return projectName != null && projectName.trim() !== '' ? projectName : 'unknown';
}

/**
 * Zod schema for validating Claude usage data from JSONL files
 */
export const usageDataSchema = z.object({
	cwd: z.string().optional(), // Claude Code version, optional for compatibility
	sessionId: sessionIdSchema.optional(), // Session ID for deduplication
	timestamp: isoTimestampSchema,
	version: versionSchema.optional(), // Claude Code version
	message: z.object({
		usage: z.object({
			input_tokens: z.number(),
			output_tokens: z.number(),
			cache_creation_input_tokens: z.number().optional(),
			cache_read_input_tokens: z.number().optional(),
		}),
		model: modelNameSchema.optional(), // Model is inside message object
		id: messageIdSchema.optional(), // Message ID for deduplication
		content: z.array(z.object({
			text: z.string().optional(),
		})).optional(),
	}),
	costUSD: z.number().optional(), // Made optional for new schema
	requestId: requestIdSchema.optional(), // Request ID for deduplication
	isApiErrorMessage: z.boolean().optional(),
});

/**
 * Type definition for Claude usage data entries from JSONL files
 */
export type UsageData = z.infer<typeof usageDataSchema>;

/**
 * Zod schema for model-specific usage breakdown data
 */
export const modelBreakdownSchema = z.object({
	modelName: modelNameSchema,
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheCreationTokens: z.number(),
	cacheReadTokens: z.number(),
	cost: z.number(),
});

/**
 * Type definition for model-specific usage breakdown
 */
export type ModelBreakdown = z.infer<typeof modelBreakdownSchema>;

/**
 * Zod schema for source-specific usage breakdown data
 */
export const sourceBreakdownSchema = z.object({
	source: z.enum(['claude', 'opencode']),
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheCreationTokens: z.number(),
	cacheReadTokens: z.number(),
	totalCost: z.number(),
});

/**
 * Type definition for source-specific usage breakdown
 */
export type SourceBreakdown = z.infer<typeof sourceBreakdownSchema>;

/**
 * Zod schema for daily usage aggregation data
 */
export const dailyUsageSchema = z.object({
	date: dailyDateSchema, // YYYY-MM-DD format
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheCreationTokens: z.number(),
	cacheReadTokens: z.number(),
	totalCost: z.number(),
	modelsUsed: z.array(modelNameSchema),
	modelBreakdowns: z.array(modelBreakdownSchema),
	sourceBreakdowns: z.array(sourceBreakdownSchema),
	project: z.string().optional(), // Project name when groupByProject is enabled
});

/**
 * Type definition for daily usage aggregation
 */
export type DailyUsage = z.infer<typeof dailyUsageSchema>;

/**
 * Zod schema for session-based usage aggregation data
 */
export const sessionUsageSchema = z.object({
	sessionId: sessionIdSchema,
	projectPath: projectPathSchema,
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheCreationTokens: z.number(),
	cacheReadTokens: z.number(),
	totalCost: z.number(),
	lastActivity: activityDateSchema,
	versions: z.array(versionSchema), // List of unique versions used in this session
	modelsUsed: z.array(modelNameSchema),
	modelBreakdowns: z.array(modelBreakdownSchema),
	sourceBreakdowns: z.array(sourceBreakdownSchema),
});

/**
 * Type definition for session-based usage aggregation
 */
export type SessionUsage = z.infer<typeof sessionUsageSchema>;

/**
 * Zod schema for project-based usage aggregation data
 */
export const projectUsageSchema = z.object({
	projectName: z.string(),
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheCreationTokens: z.number(),
	cacheReadTokens: z.number(),
	totalCost: z.number(),
	lastActivity: activityDateSchema,
	versions: z.array(versionSchema), // List of unique versions used in this project
	modelsUsed: z.array(modelNameSchema),
	modelBreakdowns: z.array(modelBreakdownSchema),
	sourceBreakdowns: z.array(sourceBreakdownSchema),
});

/**
 * Type definition for project-based usage aggregation
 */
export type ProjectUsage = z.infer<typeof projectUsageSchema>;

/**
 * Zod schema for monthly usage aggregation data
 */
export const monthlyUsageSchema = z.object({
	month: monthlyDateSchema, // YYYY-MM format
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheCreationTokens: z.number(),
	cacheReadTokens: z.number(),
	totalCost: z.number(),
	modelsUsed: z.array(modelNameSchema),
	modelBreakdowns: z.array(modelBreakdownSchema),
	sourceBreakdowns: z.array(sourceBreakdownSchema),
	project: z.string().optional(), // Project name when groupByProject is enabled
});

/**
 * Type definition for monthly usage aggregation
 */
export type MonthlyUsage = z.infer<typeof monthlyUsageSchema>;

/**
 * Zod schema for weekly usage aggregation data
 */
export const weeklyUsageSchema = z.object({
	week: weeklyDateSchema, // YYYY-MM-DD format
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheCreationTokens: z.number(),
	cacheReadTokens: z.number(),
	totalCost: z.number(),
	modelsUsed: z.array(modelNameSchema),
	modelBreakdowns: z.array(modelBreakdownSchema),
	sourceBreakdowns: z.array(sourceBreakdownSchema),
	project: z.string().optional(), // Project name when groupByProject is enabled
});

/**
 * Type definition for weekly usage aggregation
 */
export type WeeklyUsage = z.infer<typeof weeklyUsageSchema>;

/**
 * Zod schema for bucket usage aggregation data
 */
export const bucketUsageSchema = z.object({
	bucket: z.union([weeklyDateSchema, monthlyDateSchema]), // WeeklyDate or MonthlyDate
	inputTokens: z.number(),
	outputTokens: z.number(),
	cacheCreationTokens: z.number(),
	cacheReadTokens: z.number(),
	totalCost: z.number(),
	modelsUsed: z.array(modelNameSchema),
	modelBreakdowns: z.array(modelBreakdownSchema),
	sourceBreakdowns: z.array(sourceBreakdownSchema),
	project: z.string().optional(), // Project name when groupByProject is enabled
});

/**
 * Type definition for bucket usage aggregation
 */
export type BucketUsage = z.infer<typeof bucketUsageSchema>;

/**
 * Internal type for aggregating token statistics and costs
 */
type TokenStats = {
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
	cost: number;
};

/**
 * Aggregates token counts and costs by model name
 */
function aggregateByModel<T>(
	entries: T[],
	getModel: (entry: T) => string | undefined,
	getUsage: (entry: T) => UsageData['message']['usage'],
	getCost: (entry: T) => number,
): Map<string, TokenStats> {
	const modelAggregates = new Map<string, TokenStats>();
	const defaultStats: TokenStats = {
		inputTokens: 0,
		outputTokens: 0,
		cacheCreationTokens: 0,
		cacheReadTokens: 0,
		cost: 0,
	};

	for (const entry of entries) {
		const modelName = getModel(entry) ?? 'unknown';
		// Skip synthetic model
		if (modelName === '<synthetic>') {
			continue;
		}

		const usage = getUsage(entry);
		const cost = getCost(entry);

		const existing = modelAggregates.get(modelName) ?? defaultStats;

		modelAggregates.set(modelName, {
			inputTokens: existing.inputTokens + (usage.input_tokens ?? 0),
			outputTokens: existing.outputTokens + (usage.output_tokens ?? 0),
			cacheCreationTokens: existing.cacheCreationTokens + (usage.cache_creation_input_tokens ?? 0),
			cacheReadTokens: existing.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
			cost: existing.cost + cost,
		});
	}

	return modelAggregates;
}

/**
 * Aggregates model breakdowns from multiple sources
 */
function aggregateModelBreakdowns(
	breakdowns: ModelBreakdown[],
): Map<string, TokenStats> {
	const modelAggregates = new Map<string, TokenStats>();
	const defaultStats: TokenStats = {
		inputTokens: 0,
		outputTokens: 0,
		cacheCreationTokens: 0,
		cacheReadTokens: 0,
		cost: 0,
	};

	for (const breakdown of breakdowns) {
		// Skip synthetic model
		if (breakdown.modelName === '<synthetic>') {
			continue;
		}

		const existing = modelAggregates.get(breakdown.modelName) ?? defaultStats;

		modelAggregates.set(breakdown.modelName, {
			inputTokens: existing.inputTokens + breakdown.inputTokens,
			outputTokens: existing.outputTokens + breakdown.outputTokens,
			cacheCreationTokens: existing.cacheCreationTokens + breakdown.cacheCreationTokens,
			cacheReadTokens: existing.cacheReadTokens + breakdown.cacheReadTokens,
			cost: existing.cost + breakdown.cost,
		});
	}

	return modelAggregates;
}

/**
 * Converts model aggregates to sorted model breakdowns
 */
function createModelBreakdowns(
	modelAggregates: Map<string, TokenStats>,
): ModelBreakdown[] {
	return Array.from(modelAggregates.entries())
		.map(([modelName, stats]) => ({
			modelName: modelName as ModelName,
			...stats,
		}))
		.sort((a, b) => b.cost - a.cost); // Sort by cost descending
}

/**
 * Calculates total token counts and costs from entries
 */
function calculateTotals<T>(
	entries: T[],
	getUsage: (entry: T) => UsageData['message']['usage'],
	getCost: (entry: T) => number,
): TokenStats & { totalCost: number } {
	return entries.reduce(
		(acc, entry) => {
			const usage = getUsage(entry);
			const cost = getCost(entry);

			return {
				inputTokens: acc.inputTokens + (usage.input_tokens ?? 0),
				outputTokens: acc.outputTokens + (usage.output_tokens ?? 0),
				cacheCreationTokens: acc.cacheCreationTokens + (usage.cache_creation_input_tokens ?? 0),
				cacheReadTokens: acc.cacheReadTokens + (usage.cache_read_input_tokens ?? 0),
				cost: acc.cost + cost,
				totalCost: acc.totalCost + cost,
			};
		},
		{
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			cost: 0,
			totalCost: 0,
		},
	);
}

/**
 * Filters items by date range
 */
function filterByDateRange<T>(
	items: T[],
	getDate: (item: T) => string,
	since?: string,
	until?: string,
): T[] {
	if (since == null && until == null) {
		return items;
	}

	return items.filter((item) => {
		const dateStr = getDate(item).substring(0, 10).replace(/-/g, ''); // Convert to YYYYMMDD
		if (since != null && dateStr < since) {
			return false;
		}
		if (until != null && dateStr > until) {
			return false;
		}
		return true;
	});
}

/**
 * Filters items by project name
 */
function filterByProject<T>(
	items: T[],
	getProject: (item: T) => string | undefined,
	projectFilter?: string,
): T[] {
	if (projectFilter == null) {
		return items;
	}

	return items.filter((item) => {
		const projectName = getProject(item);
		return projectName === projectFilter;
	});
}

/**
 * Checks if an entry is a duplicate based on hash
 */
function isDuplicateEntry(
	uniqueHash: string | null,
	processedHashes: Set<string>,
): boolean {
	if (uniqueHash == null) {
		return false;
	}
	return processedHashes.has(uniqueHash);
}

/**
 * Marks an entry as processed
 */
function markAsProcessed(
	uniqueHash: string | null,
	processedHashes: Set<string>,
): void {
	if (uniqueHash != null) {
		processedHashes.add(uniqueHash);
	}
}

/**
 * Extracts unique models from entries, excluding synthetic model
 */
function extractUniqueModels<T>(
	entries: T[],
	getModel: (entry: T) => string | undefined,
): string[] {
	return uniq(entries.map(getModel).filter((m): m is string => m != null && m !== '<synthetic>'));
}

/**
 * Creates a date formatter with the specified timezone and locale
 * @param timezone - Timezone to use (e.g., 'UTC', 'America/New_York')
 * @param locale - Locale to use for formatting (e.g., 'en-US', 'ja-JP')
 * @returns Intl.DateTimeFormat instance
 */
function createDateFormatter(timezone: string | undefined, locale: string): Intl.DateTimeFormat {
	return new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		timeZone: timezone,
	});
}

/**
 * Creates a date parts formatter with the specified timezone and locale
 * @param timezone - Timezone to use
 * @param locale - Locale to use for formatting
 * @returns Intl.DateTimeFormat instance
 */
function createDatePartsFormatter(timezone: string | undefined, locale: string): Intl.DateTimeFormat {
	return new Intl.DateTimeFormat(locale, {
		year: 'numeric',
		month: '2-digit',
		day: '2-digit',
		timeZone: timezone,
	});
}

/**
 * Formats a date string to YYYY-MM-DD format
 * @param dateStr - Input date string
 * @param timezone - Optional timezone to use for formatting
 * @param locale - Optional locale to use for formatting (defaults to 'en-CA' for YYYY-MM-DD format)
 * @returns Formatted date string in YYYY-MM-DD format
 */
export function formatDate(dateStr: string, timezone?: string, locale?: string): string {
	const date = new Date(dateStr);
	// Use en-CA as default for consistent YYYY-MM-DD format
	const formatter = createDateFormatter(timezone, locale ?? 'en-CA');
	return formatter.format(date);
}

/**
 * Formats a date string to compact format with year on first line and month-day on second
 * @param dateStr - Input date string
 * @param timezone - Timezone to use for formatting (pass undefined to use system timezone)
 * @param locale - Locale to use for formatting
 * @returns Formatted date string with newline separator (YYYY\nMM-DD)
 */
export function formatDateCompact(dateStr: string, timezone: string | undefined, locale: string): string {
	const date = new Date(dateStr);
	const formatter = createDatePartsFormatter(timezone, locale);
	const parts = formatter.formatToParts(date);
	const year = parts.find(p => p.type === 'year')?.value ?? '';
	const month = parts.find(p => p.type === 'month')?.value ?? '';
	const day = parts.find(p => p.type === 'day')?.value ?? '';
	return `${year}\n${month}-${day}`;
}

/**
 * Generic function to sort items by date based on sort order
 * @param items - Array of items to sort
 * @param getDate - Function to extract date/timestamp from item
 * @param order - Sort order (asc or desc)
 * @returns Sorted array
 */
function sortByDate<T>(
	items: T[],
	getDate: (item: T) => string | Date,
	order: SortOrder = 'desc',
): T[] {
	const sorted = sort(items);
	switch (order) {
		case 'desc':
			return sorted.desc(item => new Date(getDate(item)).getTime());
		case 'asc':
			return sorted.asc(item => new Date(getDate(item)).getTime());
		default:
			unreachable(order);
	}
}

/**
 * Create a unique identifier for deduplication using message ID and request ID
 */
export function createUniqueHash(data: UsageData): string | null {
	const messageId = data.message.id;
	const requestId = data.requestId;

	if (messageId == null || requestId == null) {
		return null;
	}

	// Create a hash using simple concatenation
	return `${messageId}:${requestId}`;
}

/**
 * Extract the earliest timestamp from a JSONL file
 * Scans through the file until it finds a valid timestamp
 */
export async function getEarliestTimestamp(filePath: string): Promise<Date | null> {
	try {
		const content = await readFile(filePath, 'utf-8');
		const lines = content.trim().split('\n');

		let earliestDate: Date | null = null;

		for (const line of lines) {
			if (line.trim() === '') {
				continue;
			}

			try {
				const json = JSON.parse(line) as Record<string, unknown>;
				if (json.timestamp != null && typeof json.timestamp === 'string') {
					const date = new Date(json.timestamp);
					if (!Number.isNaN(date.getTime())) {
						if (earliestDate == null || date < earliestDate) {
							earliestDate = date;
						}
					}
				}
			}
			catch {
				// Skip invalid JSON lines
				continue;
			}
		}

		return earliestDate;
	}
	catch (error) {
		// Log file access errors for diagnostics, but continue processing
		// This ensures files without timestamps or with access issues are sorted to the end
		logger.debug(`Failed to get earliest timestamp for ${filePath}:`, error);
		return null;
	}
}

/**
 * Sort files by their earliest timestamp
 * Files without valid timestamps are placed at the end
 */
export async function sortFilesByTimestamp(files: string[]): Promise<string[]> {
	const filesWithTimestamps = await Promise.all(
		files.map(async file => ({
			file,
			timestamp: await getEarliestTimestamp(file),
		})),
	);

	return filesWithTimestamps
		.sort((a, b) => {
			// Files without timestamps go to the end
			if (a.timestamp == null && b.timestamp == null) {
				return 0;
			}
			if (a.timestamp == null) {
				return 1;
			}
			if (b.timestamp == null) {
				return -1;
			}
			// Sort by timestamp (oldest first)
			return a.timestamp.getTime() - b.timestamp.getTime();
		})
		.map(item => item.file);
}

/**
 * Generic function to calculate cost based on mode
 * @param costUSD - The stored cost value (may be null or undefined)
 * @param tokens - Token usage object
 * @param model - Model name
 * @param mode - Cost calculation mode
 * @param fetcher - Pricing fetcher instance
 * @returns Calculated cost in USD
 */
async function calculateCostGeneric(
	costUSD: number | null | undefined,
	tokens: {
		input_tokens: number;
		output_tokens: number;
		cache_creation_input_tokens?: number;
		cache_read_input_tokens?: number;
	},
	model: string | undefined,
	mode: CostMode,
	fetcher: PricingFetcher,
): Promise<number> {
	if (mode === 'display') {
		// Always use costUSD for display mode, even if null
		return costUSD ?? 0;
	}

	if (mode === 'calculate') {
		// Always calculate from tokens for calculate mode
		if (model != null) {
			return Result.unwrap(fetcher.calculateCostFromTokens(tokens, model), 0);
		}
		return 0;
	}

	if (mode === 'auto') {
		// Auto mode: use costUSD if available and non-zero, otherwise calculate
		// Treat both null and 0 as triggers for calculation
		if (costUSD != null && costUSD > 0) {
			return costUSD;
		}
		if (model != null) {
			return Result.unwrap(fetcher.calculateCostFromTokens(tokens, model), 0);
		}
		return 0;
	}

	unreachable(mode);
}

/**
 * Calculates cost for a single usage data entry based on the specified cost calculation mode
 * @param data - Usage data entry
 * @param mode - Cost calculation mode (auto, calculate, or display)
 * @param fetcher - Pricing fetcher instance for calculating costs from tokens
 * @returns Calculated cost in USD
 */
export async function calculateCostForEntry(
	data: UsageData,
	mode: CostMode,
	fetcher: PricingFetcher,
): Promise<number> {
	const tokens = {
		input_tokens: data.message.usage.input_tokens,
		output_tokens: data.message.usage.output_tokens,
		cache_creation_input_tokens: data.message.usage.cache_creation_input_tokens,
		cache_read_input_tokens: data.message.usage.cache_read_input_tokens,
	};
	return calculateCostGeneric(
		data.costUSD,
		tokens,
		data.message.model,
		mode,
		fetcher,
	);
}

/**
 * Calculate cost for a LoadedUsageEntry based on the cost mode
 * @param entry - The loaded usage entry
 * @param mode - Cost calculation mode
 * @param fetcher - Pricing fetcher instance
 * @returns Calculated cost in USD
 */
async function calculateCostForLoadedEntry(
	entry: LoadedUsageEntry,
	mode: CostMode,
	fetcher: PricingFetcher,
): Promise<number> {
	const tokens = {
		input_tokens: entry.usage.inputTokens,
		output_tokens: entry.usage.outputTokens,
		cache_creation_input_tokens: entry.usage.cacheCreationInputTokens,
		cache_read_input_tokens: entry.usage.cacheReadInputTokens,
	};
	return calculateCostGeneric(
		entry.costUSD,
		tokens,
		entry.model,
		mode,
		fetcher,
	);
}

/**
 * Calculate cost for unified usage entry (Claude or OpenCode)
 * @param entry - Unified usage entry
 * @param mode - Cost calculation mode
 * @param fetcher - Pricing fetcher instance
 * @returns Calculated cost in USD
 */
async function calculateCostForUnifiedEntry(
	entry: UnifiedUsageEntry,
	mode: CostMode,
	fetcher: PricingFetcher,
): Promise<number> {
	return calculateCostGeneric(
		entry.costUSD,
		entry.usage,
		entry.model,
		mode,
		fetcher,
	);
}

/**
 * Calculate cost for OpenCode usage entry
 * @param entry - OpenCode usage entry
 * @param mode - Cost calculation mode
 * @param fetcher - Pricing fetcher instance
 * @returns Calculated cost in USD
 */
async function calculateCostForOpenCodeEntry(
	entry: OpenCodeUsageEntry,
	mode: CostMode,
	fetcher: PricingFetcher,
): Promise<number> {
	const tokens = {
		input_tokens: entry.tokens.input,
		output_tokens: entry.tokens.output,
		cache_creation_input_tokens: entry.tokens.cache?.write ?? 0,
		cache_read_input_tokens: entry.tokens.cache?.read ?? 0,
	};
	return calculateCostGeneric(
		entry.cost,
		tokens,
		entry.model,
		mode,
		fetcher,
	);
}

/**
 * Get Claude Code usage limit expiration date
 * @param data - Usage data entry
 * @returns Usage limit expiration date
 */
export function getUsageLimitResetTime(data: UsageData): Date | null {
	let resetTime: Date | null = null;

	if (data.isApiErrorMessage === true) {
		const timestampMatch = data.message?.content?.find(
			c => c.text != null && c.text.includes('Claude AI usage limit reached'),
		)?.text?.match(/\|(\d+)/) ?? null;

		if (timestampMatch?.[1] != null) {
			const resetTimestamp = Number.parseInt(timestampMatch[1]);
			resetTime = resetTimestamp > 0 ? new Date(resetTimestamp * 1000) : null;
		}
	}

	return resetTime;
}

/**
 * Result of glob operation with base directory information
 */
export type GlobResult = {
	file: string;
	baseDir: string;
};

/**
 * Glob files from multiple Claude paths in parallel
 * @param claudePaths - Array of Claude base paths
 * @returns Array of file paths with their base directories
 */
export async function globUsageFiles(claudePaths: string[]): Promise<GlobResult[]> {
	const filePromises = claudePaths.map(async (claudePath) => {
		const claudeDir = path.join(claudePath, CLAUDE_PROJECTS_DIR_NAME);
		const files = await glob([USAGE_DATA_GLOB_PATTERN], {
			cwd: claudeDir,
			absolute: true,
		}).catch(() => []); // Gracefully handle errors for individual paths

		// Map each file to include its base directory
		return files.map(file => ({ file, baseDir: claudeDir }));
	});
	return (await Promise.all(filePromises)).flat();
}

/**
 * Date range filter for limiting usage data by date
 */
export type DateFilter = {
	since?: string; // YYYYMMDD format
	until?: string; // YYYYMMDD format
};

type WeekDay = TupleToUnion<typeof WEEK_DAYS>;
type DayOfWeek = IntRange<0, typeof WEEK_DAYS['length']>; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday

// Default start of week for consistent weekly grouping across all functions
const DEFAULT_START_OF_WEEK: WeekDay = 'sunday';

/**
 * Configuration options for loading usage data
 */
export type LoadOptions = {
	claudePath?: string; // Custom path to Claude data directory
	openCodePath?: string; // Custom path to OpenCode data directory (for testing)
	mode?: CostMode; // Cost calculation mode
	order?: SortOrder; // Sort order for dates
	offline?: boolean; // Use offline mode for pricing
	sessionDurationHours?: number; // Session block duration in hours
	groupByProject?: boolean; // Group data by project instead of aggregating
	project?: string; // Filter to specific project name
	startOfWeek?: WeekDay; // Start of week for weekly aggregation
	startOfMonth?: number; // Start of month for monthly aggregation (1-31, defaults to 1)
	timezone?: string; // Timezone for date grouping (e.g., 'UTC', 'America/New_York'). Defaults to system timezone
	locale?: string; // Locale for date/time formatting (e.g., 'en-US', 'ja-JP'). Defaults to 'en-US'
	sources?: Array<'claude' | 'opencode'>; // Filter by data sources (defaults to both)
} & DateFilter;

/**
 * Loads and aggregates Claude usage data by day
 * Processes all JSONL files in the Claude projects directory and groups usage by date
 * @param options - Optional configuration for loading and filtering data
 * @returns Array of daily usage summaries sorted by date
 */
export async function loadDailyUsageData(
	options?: LoadOptions,
): Promise<DailyUsage[]> {
	// Get all Claude paths or use the specific one from options
	const claudePaths = toArray(options?.claudePath ?? getClaudePaths());

	// Collect files from all paths in parallel
	const allFiles = await globUsageFiles(claudePaths);
	const fileList = allFiles.map(f => f.file);

	if (fileList.length === 0) {
		return [];
	}

	// Filter by project if specified
	const projectFilteredFiles = filterByProject(
		fileList,
		filePath => extractProjectFromPath(filePath),
		options?.project,
	);

	// Sort files by timestamp to ensure chronological processing
	const sortedFiles = await sortFilesByTimestamp(projectFilteredFiles);

	// Fetch pricing data for cost calculation only when needed
	const mode = options?.mode ?? 'auto';

	// Use PricingFetcher with using statement for automatic cleanup
	using fetcher = mode === 'display' ? null : new PricingFetcher(options?.offline);

	// Track processed message+request combinations for deduplication
	const processedHashes = new Set<string>();

	// Collect all valid data entries first
	const allEntries: { data: UsageData; date: string; cost: number; model: string | undefined; project: string }[] = [];

	for (const file of sortedFiles) {
		const content = await readFile(file, 'utf-8');
		const lines = content
			.trim()
			.split('\n')
			.filter(line => line.length > 0);

		for (const line of lines) {
			try {
				const parsed = JSON.parse(line) as unknown;
				const result = usageDataSchema.safeParse(parsed);
				if (!result.success) {
					continue;
				}
				const data = result.data;

				// Check for duplicate message + request ID combination
				const uniqueHash = createUniqueHash(data);
				if (isDuplicateEntry(uniqueHash, processedHashes)) {
					// Skip duplicate message
					continue;
				}

				// Mark this combination as processed
				markAsProcessed(uniqueHash, processedHashes);

				// Always use en-CA for date grouping to ensure YYYY-MM-DD format
				const date = formatDate(data.timestamp, options?.timezone, 'en-CA');
				// If fetcher is available, calculate cost based on mode and tokens
				// If fetcher is null, use pre-calculated costUSD or default to 0
				const cost = fetcher != null
					? await calculateCostForEntry(data, mode, fetcher)
					: data.costUSD ?? 0;

				// Extract project name from file path
				const project = extractProjectFromPath(file);

				allEntries.push({ data, date, cost, model: data.message.model, project });
			}
			catch {
				// Skip invalid JSON lines
			}
		}
	}

	// Group by date, optionally including project
	// Automatically enable project grouping when project filter is specified
	const needsProjectGrouping = options?.groupByProject === true || options?.project != null;
	const groupingKey = needsProjectGrouping
		? (entry: typeof allEntries[0]) => `${entry.date}\x00${entry.project}`
		: (entry: typeof allEntries[0]) => entry.date;

	const groupedData = groupBy(allEntries, groupingKey);

	// Aggregate each group
	const results = Object.entries(groupedData)
		.map(([groupKey, entries]) => {
			if (entries == null) {
				return undefined;
			}

			// Extract date and project from groupKey (format: "date" or "date\x00project")
			const parts = groupKey.split('\x00');
			const date = parts[0] ?? groupKey;
			const project = parts.length > 1 ? parts[1] : undefined;

			// Aggregate by model first
			const modelAggregates = aggregateByModel(
				entries,
				entry => entry.model,
				entry => entry.data.message.usage,
				entry => entry.cost,
			);

			// Create model breakdowns
			const modelBreakdowns = createModelBreakdowns(modelAggregates);

			// Calculate totals
			const totals = calculateTotals(
				entries,
				entry => entry.data.message.usage,
				entry => entry.cost,
			);

			const modelsUsed = extractUniqueModels(entries, e => e.model);

			// Since this is Claude-only data, create a single source breakdown
			const sourceBreakdowns: SourceBreakdown[] = [{
				source: 'claude',
				inputTokens: totals.inputTokens,
				outputTokens: totals.outputTokens,
				cacheCreationTokens: totals.cacheCreationTokens,
				cacheReadTokens: totals.cacheReadTokens,
				totalCost: totals.totalCost,
			}];

			return {
				date: createDailyDate(date),
				...totals,
				modelsUsed: modelsUsed as ModelName[],
				modelBreakdowns,
				sourceBreakdowns,
				...(project != null && { project }),
			};
		})
		.filter(item => item != null);

	// Filter by date range if specified
	const dateFiltered = filterByDateRange(results, item => item.date, options?.since, options?.until);

	// Filter by project if specified
	const finalFiltered = filterByProject(dateFiltered, item => item.project, options?.project);

	// Sort by date based on order option (default to descending)
	return sortByDate(finalFiltered, item => item.date, options?.order);
}

/**
 * Loads and aggregates Claude usage data by session
 * Groups usage data by project path and session ID based on file structure
 * @param options - Optional configuration for loading and filtering data
 * @returns Array of session usage summaries sorted by last activity
 */
export async function loadSessionData(
	options?: LoadOptions,
): Promise<SessionUsage[]> {
	// Get all Claude paths or use the specific one from options
	const claudePaths = toArray(options?.claudePath ?? getClaudePaths());

	// Collect files from all paths with their base directories in parallel
	const filesWithBase = await globUsageFiles(claudePaths);

	if (filesWithBase.length === 0) {
		return [];
	}

	// Filter by project if specified
	const projectFilteredWithBase = filterByProject(
		filesWithBase,
		item => extractProjectFromPath(item.file),
		options?.project,
	);

	// Sort files by timestamp to ensure chronological processing
	// Create a map for O(1) lookup instead of O(N) find operations
	const fileToBaseMap = new Map(projectFilteredWithBase.map(f => [f.file, f.baseDir]));
	const sortedFilesWithBase = await sortFilesByTimestamp(
		projectFilteredWithBase.map(f => f.file),
	).then(sortedFiles =>
		sortedFiles.map(file => ({
			file,
			baseDir: fileToBaseMap.get(file) ?? '',
		})),
	);

	// Fetch pricing data for cost calculation only when needed
	const mode = options?.mode ?? 'auto';

	// Use PricingFetcher with using statement for automatic cleanup
	using fetcher = mode === 'display' ? null : new PricingFetcher(options?.offline);

	// Track processed message+request combinations for deduplication
	const processedHashes = new Set<string>();

	// Collect all valid data entries with session info first
	const allEntries: Array<{
		data: UsageData;
		sessionKey: string;
		sessionId: string;
		projectPath: string;
		cost: number;
		timestamp: string;
		model: string | undefined;
	}> = [];

	for (const { file, baseDir } of sortedFilesWithBase) {
		// Extract session info from file path using its specific base directory
		const relativePath = path.relative(baseDir, file);
		const parts = relativePath.split(path.sep);

		// Session ID is the directory name containing the JSONL file
		const sessionId = parts[parts.length - 2] ?? 'unknown';
		// Project path is everything before the session ID
		const joinedPath = parts.slice(0, -2).join(path.sep);
		const projectPath = joinedPath.length > 0 ? joinedPath : 'Unknown Project';

		const content = await readFile(file, 'utf-8');
		const lines = content
			.trim()
			.split('\n')
			.filter(line => line.length > 0);

		for (const line of lines) {
			try {
				const parsed = JSON.parse(line) as unknown;
				const result = usageDataSchema.safeParse(parsed);
				if (!result.success) {
					continue;
				}
				const data = result.data;

				// Check for duplicate message + request ID combination
				const uniqueHash = createUniqueHash(data);
				if (isDuplicateEntry(uniqueHash, processedHashes)) {
				// Skip duplicate message
					continue;
				}

				// Mark this combination as processed
				markAsProcessed(uniqueHash, processedHashes);

				const sessionKey = `${projectPath}/${sessionId}`;
				const cost = fetcher != null
					? await calculateCostForEntry(data, mode, fetcher)
					: data.costUSD ?? 0;

				allEntries.push({
					data,
					sessionKey,
					sessionId,
					projectPath,
					cost,
					timestamp: data.timestamp,
					model: data.message.model,
				});
			}
			catch {
				// Skip invalid JSON lines
			}
		}
	}

	// Group by session using Object.groupBy
	const groupedBySessions = groupBy(
		allEntries,
		entry => entry.sessionKey,
	);

	// Aggregate each session group
	const results = Object.entries(groupedBySessions)
		.map(([_, entries]) => {
			if (entries == null) {
				return undefined;
			}

			// Find the latest timestamp for lastActivity
			const latestEntry = entries.reduce((latest, current) =>
				current.timestamp > latest.timestamp ? current : latest,
			);

			// Collect all unique versions
			const versions: string[] = [];
			for (const entry of entries) {
				if (entry.data.version != null) {
					versions.push(entry.data.version);
				}
			}

			// Aggregate by model
			const modelAggregates = aggregateByModel(
				entries,
				entry => entry.model,
				entry => entry.data.message.usage,
				entry => entry.cost,
			);

			// Create model breakdowns
			const modelBreakdowns = createModelBreakdowns(modelAggregates);

			// Calculate totals
			const totals = calculateTotals(
				entries,
				entry => entry.data.message.usage,
				entry => entry.cost,
			);

			const modelsUsed = extractUniqueModels(entries, e => e.model);

			// Since this is Claude-only data, create a single source breakdown
			const sourceBreakdowns: SourceBreakdown[] = [{
				source: 'claude',
				inputTokens: totals.inputTokens,
				outputTokens: totals.outputTokens,
				cacheCreationTokens: totals.cacheCreationTokens,
				cacheReadTokens: totals.cacheReadTokens,
				totalCost: totals.totalCost,
			}];

			return {
				sessionId: createSessionId(latestEntry.sessionId),
				projectPath: createProjectPath(latestEntry.projectPath),
				...totals,
				// Always use en-CA for date storage to ensure YYYY-MM-DD format
				lastActivity: formatDate(latestEntry.timestamp, options?.timezone, 'en-CA') as ActivityDate,
				versions: uniq(versions).sort() as Version[],
				modelsUsed: modelsUsed as ModelName[],
				modelBreakdowns,
				sourceBreakdowns,
			};
		})
		.filter(item => item != null);

	// Filter by date range if specified
	const dateFiltered = filterByDateRange(results, item => item.lastActivity, options?.since, options?.until);

	// Filter by project if specified
	const sessionFiltered = filterByProject(dateFiltered, item => item.projectPath, options?.project);

	return sortByDate(sessionFiltered, item => item.lastActivity, options?.order);
}

/**
 * Unified session usage data loader that supports both Claude Code and OpenCode
 * Groups usage data by session/project identifier across both sources
 * @param options - Optional configuration for loading and filtering data
 * @returns Array of session usage summaries with source breakdowns sorted by last activity
 */
export async function loadUnifiedSessionData(
	options?: LoadOptions,
): Promise<SessionUsage[]> {
	// Load unified usage data from both sources
	const allEntries = await _loadUnifiedUsageData(options);

	if (allEntries.length === 0) {
		return [];
	}

	// Initialize pricing fetcher for cost calculation
	const mode = options?.mode ?? 'auto';
	using fetcher = mode === 'display' ? null : new PricingFetcher(options?.offline);

	// Filter by date range if specified
	const dateFiltered = filterByDateRange(
		allEntries,
		item => item.timestamp,
		options?.since,
		options?.until,
	);

	// Group by session identifier (for OpenCode, combine project + session)
	const sessionMap = new Map<string, {
		entries: UnifiedUsageEntry[];
		latestTimestamp: string;
		projectPath: string;
	}>();

	for (const entry of dateFiltered) {
		// Create unified session identifier
		const unifiedSessionId = entry.source === 'opencode'
			? `${entry.projectPath.split('/').pop()}-${entry.sessionId}` // Use last part of project path + session
			: entry.sessionId; // Claude uses sessionId directly

		const existing = sessionMap.get(unifiedSessionId);
		if (existing == null) {
			sessionMap.set(unifiedSessionId, {
				entries: [entry],
				latestTimestamp: entry.timestamp,
				projectPath: entry.projectPath,
			});
		}
		else {
			existing.entries.push(entry);
			if (entry.timestamp > existing.latestTimestamp) {
				existing.latestTimestamp = entry.timestamp;
			}
		}
	}

	// Convert to SessionUsage format
	const results: SessionUsage[] = [];

	for (const [sessionId, sessionData] of sessionMap.entries()) {
		const { entries, latestTimestamp, projectPath } = sessionData;

		// Calculate totals
		let inputTokens = 0;
		let outputTokens = 0;
		let cacheCreationTokens = 0;
		let cacheReadTokens = 0;
		let totalCost = 0;

		const modelsUsed = new Set<string>();
		const versions = new Set<string>();
		const modelBreakdowns = new Map<string, ModelBreakdown>();
		const sourceBreakdowns = new Map<'claude' | 'opencode', SourceBreakdown>();

		// Process each entry
		for (const entry of entries) {
			const usage = entry.usage;
			inputTokens += usage.input_tokens;
			outputTokens += usage.output_tokens;
			cacheCreationTokens += usage.cache_creation_input_tokens;
			cacheReadTokens += usage.cache_read_input_tokens;

			// Calculate cost using the pricing fetcher (handles null costUSD for OpenCode)
			const entryCost = fetcher != null
				? await calculateCostForUnifiedEntry(entry, mode, fetcher)
				: entry.costUSD ?? 0;
			totalCost += entryCost;

			modelsUsed.add(entry.model);
			versions.add(entry.version ?? '1.0.0');

			// Update model breakdown
			const existing = modelBreakdowns.get(entry.model);
			if (existing == null) {
				modelBreakdowns.set(entry.model, {
					modelName: entry.model as ModelName,
					inputTokens: usage.input_tokens,
					outputTokens: usage.output_tokens,
					cacheCreationTokens: usage.cache_creation_input_tokens,
					cacheReadTokens: usage.cache_read_input_tokens,
					cost: entryCost,
				});
			}
			else {
				existing.inputTokens += usage.input_tokens;
				existing.outputTokens += usage.output_tokens;
				existing.cacheCreationTokens += usage.cache_creation_input_tokens;
				existing.cacheReadTokens += usage.cache_read_input_tokens;
				existing.cost += entryCost;
			}

			// Update source breakdown
			const sourceExisting = sourceBreakdowns.get(entry.source);
			if (sourceExisting == null) {
				sourceBreakdowns.set(entry.source, {
					source: entry.source,
					inputTokens: usage.input_tokens,
					outputTokens: usage.output_tokens,
					cacheCreationTokens: usage.cache_creation_input_tokens,
					cacheReadTokens: usage.cache_read_input_tokens,
					totalCost: entryCost,
				});
			}
			else {
				sourceExisting.inputTokens += usage.input_tokens;
				sourceExisting.outputTokens += usage.output_tokens;
				sourceExisting.cacheCreationTokens += usage.cache_creation_input_tokens;
				sourceExisting.cacheReadTokens += usage.cache_read_input_tokens;
				sourceExisting.totalCost += entryCost;
			}
		}

		results.push({
			sessionId: createSessionId(sessionId),
			projectPath: createProjectPath(projectPath),
			inputTokens,
			outputTokens,
			cacheCreationTokens,
			cacheReadTokens,
			totalCost,
			lastActivity: formatDate(latestTimestamp, options?.timezone, 'en-CA') as ActivityDate,
			versions: Array.from(versions).sort() as Version[],
			modelsUsed: Array.from(modelsUsed) as ModelName[],
			modelBreakdowns: Array.from(modelBreakdowns.values()),
			sourceBreakdowns: Array.from(sourceBreakdowns.values()),
		});
	}

	// Sort by last activity
	return sortByDate(results, item => item.lastActivity, options?.order);
}

/**
 * Loads and aggregates Claude usage data by month
 * Uses daily usage data as the source and groups by month
 * @param options - Optional configuration for loading and filtering data
 * @returns Array of monthly usage summaries sorted by month
 */
export async function loadMonthlyUsageData(
	options?: LoadOptions,
): Promise<MonthlyUsage[]> {
	return loadBucketUsageData((data: DailyUsage) => createMonthlyDate(data.date.substring(0, 7)), options)
		.then(usages => usages.map<MonthlyUsage>(({ bucket, ...rest }) => ({
			month: createMonthlyDate(bucket.toString()),
			...rest,
		})));
}

/**
 * @param date - The date to get the week for
 * @param startDay - The day to start the week on (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * @returns The date of the first day of the week for the given date
 */
function getDateWeek(date: Date, startDay: DayOfWeek): WeeklyDate {
	const d = new Date(date);
	const day = d.getUTCDay();
	const shift = (day - startDay + 7) % 7;
	d.setUTCDate(d.getUTCDate() - shift);

	return createWeeklyDate(d.toISOString().substring(0, 10));
}

/**
 * Convert day name to number (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 */
function getDayNumber(day: WeekDay): DayOfWeek {
	const dayMap = {
		sunday: 0,
		monday: 1,
		tuesday: 2,
		wednesday: 3,
		thursday: 4,
		friday: 5,
		saturday: 6,
	} as const satisfies Record<WeekDay, DayOfWeek>;
	return dayMap[day];
}

export async function loadWeeklyUsageData(
	options?: LoadOptions,
): Promise<WeeklyUsage[]> {
	const startDay = options?.startOfWeek != null ? getDayNumber(options.startOfWeek) : getDayNumber(DEFAULT_START_OF_WEEK);

	return loadBucketUsageData((data: DailyUsage) => getDateWeek(new Date(data.date), startDay), options)
		.then(usages => usages.map<WeeklyUsage>(({ bucket, ...rest }) => ({
			week: createWeeklyDate(bucket.toString()),
			...rest,
		})));
}

/**
 * Load usage data for a specific session by sessionId
 * Searches for a JSONL file named {sessionId}.jsonl in all Claude project directories
 * @param sessionId - The session ID to load data for (matches the JSONL filename)
 * @param options - Options for loading data
 * @param options.mode - Cost calculation mode (auto, calculate, display)
 * @param options.offline - Whether to use offline pricing data
 * @returns Usage data for the specific session or null if not found
 */
export async function loadSessionUsageById(
	sessionId: string,
	options?: { mode?: CostMode; offline?: boolean },
): Promise<{ totalCost: number; entries: UsageData[] } | null> {
	const claudePaths = getClaudePaths();

	// Find the JSONL file for this session ID
	const patterns = claudePaths.map(p => path.join(p, 'projects', '**', `${sessionId}.jsonl`));
	const jsonlFiles = await glob(patterns);

	if (jsonlFiles.length === 0) {
		return null;
	}

	const file = jsonlFiles[0];
	if (file == null) {
		return null;
	}
	const content = await readFile(file, 'utf-8');
	const lines = content.trim().split('\n').filter(line => line.length > 0);

	const mode = options?.mode ?? 'auto';
	using fetcher = mode === 'display' ? null : new PricingFetcher(options?.offline);

	const entries: UsageData[] = [];
	let totalCost = 0;

	for (const line of lines) {
		try {
			const parsed = JSON.parse(line) as unknown;
			const result = usageDataSchema.safeParse(parsed);
			if (!result.success) {
				continue;
			}
			const data = result.data;

			const cost = fetcher != null
				? await calculateCostForEntry(data, mode, fetcher)
				: data.costUSD ?? 0;

			totalCost += cost;
			entries.push(data);
		}
		catch {
			// Skip invalid JSON lines
		}
	}

	return { totalCost, entries };
}

export async function loadBucketUsageData(
	groupingFn: (data: DailyUsage) => Bucket,
	options?: LoadOptions,
): Promise<BucketUsage[]> {
	const dailyData = await loadDailyUsageData(options);

	// Group daily data by week, optionally including project
	// Automatically enable project grouping when project filter is specified
	const needsProjectGrouping
    = options?.groupByProject === true || options?.project != null;

	const groupingKey = needsProjectGrouping
		? (data: DailyUsage) =>
				`${groupingFn(data)}\x00${data.project ?? 'unknown'}`
		: (data: DailyUsage) => `${groupingFn(data)}`;

	const grouped = groupBy(dailyData, groupingKey);

	const buckets: BucketUsage[] = [];
	for (const [groupKey, dailyEntries] of Object.entries(grouped)) {
		if (dailyEntries == null) {
			continue;
		}

		const parts = groupKey.split('\x00');
		const bucket = createBucket(parts[0] ?? groupKey);
		const project = parts.length > 1 ? parts[1] : undefined;

		// Aggregate model breakdowns across all days
		const allBreakdowns = dailyEntries.flatMap(
			daily => daily.modelBreakdowns,
		);
		const modelAggregates = aggregateModelBreakdowns(allBreakdowns);

		// Create model breakdowns
		const modelBreakdowns = createModelBreakdowns(modelAggregates);

		// Aggregate source breakdowns across all days
		const sourceBreakdownsMap = new Map<'claude' | 'opencode', SourceBreakdown>();
		for (const daily of dailyEntries) {
			for (const sourceBreakdown of daily.sourceBreakdowns) {
				const existing = sourceBreakdownsMap.get(sourceBreakdown.source);
				if (existing) {
					existing.inputTokens += sourceBreakdown.inputTokens;
					existing.outputTokens += sourceBreakdown.outputTokens;
					existing.cacheCreationTokens += sourceBreakdown.cacheCreationTokens;
					existing.cacheReadTokens += sourceBreakdown.cacheReadTokens;
					existing.totalCost += sourceBreakdown.totalCost;
				} else {
					sourceBreakdownsMap.set(sourceBreakdown.source, {
						source: sourceBreakdown.source,
						inputTokens: sourceBreakdown.inputTokens,
						outputTokens: sourceBreakdown.outputTokens,
						cacheCreationTokens: sourceBreakdown.cacheCreationTokens,
						cacheReadTokens: sourceBreakdown.cacheReadTokens,
						totalCost: sourceBreakdown.totalCost,
					});
				}
			}
		}
		const sourceBreakdowns = Array.from(sourceBreakdownsMap.values());

		// Collect unique models
		const models: string[] = [];
		for (const data of dailyEntries) {
			for (const model of data.modelsUsed) {
				// Skip synthetic model
				if (model !== '<synthetic>') {
					models.push(model);
				}
			}
		}

		// Calculate totals from daily entries
		let totalInputTokens = 0;
		let totalOutputTokens = 0;
		let totalCacheCreationTokens = 0;
		let totalCacheReadTokens = 0;
		let totalCost = 0;

		for (const daily of dailyEntries) {
			totalInputTokens += daily.inputTokens;
			totalOutputTokens += daily.outputTokens;
			totalCacheCreationTokens += daily.cacheCreationTokens;
			totalCacheReadTokens += daily.cacheReadTokens;
			totalCost += daily.totalCost;
		}
		const bucketUsage: BucketUsage = {
			bucket,
			inputTokens: totalInputTokens,
			outputTokens: totalOutputTokens,
			cacheCreationTokens: totalCacheCreationTokens,
			cacheReadTokens: totalCacheReadTokens,
			totalCost,
			modelsUsed: uniq(models) as ModelName[],
			modelBreakdowns,
			sourceBreakdowns,
			...(project != null && { project }),
		};

		buckets.push(bucketUsage);
	}

	return sortByDate(buckets, item => item.bucket, options?.order);
}

/**
 * Loads usage data and organizes it into session blocks (typically 5-hour billing periods)
 * Processes all usage data and groups it into time-based blocks for billing analysis
 * @param options - Optional configuration including session duration and filtering
 * @returns Array of session blocks with usage and cost information
 */
export async function loadSessionBlockData(
	options?: LoadOptions,
): Promise<SessionBlock[]> {
	// Determine which sources to load (default to both)
	const sources = options?.sources ?? ['claude', 'opencode'];
	const allEntries: LoadedUsageEntry[] = [];

	// Create a single PricingFetcher instance for both sources to avoid duplicate fetches
	const mode = options?.mode ?? 'auto';
	using sharedFetcher = mode === 'display' ? null : new PricingFetcher(options?.offline);

	// Load Claude data if included
	if (sources.includes('claude')) {
		// Get all Claude paths or use the specific one from options
		const claudePaths = toArray(options?.claudePath ?? getClaudePaths());

		// Collect files from all paths
		const allFiles: string[] = [];
		for (const claudePath of claudePaths) {
			const claudeDir = path.join(claudePath, CLAUDE_PROJECTS_DIR_NAME);
			const files = await glob([USAGE_DATA_GLOB_PATTERN], {
				cwd: claudeDir,
				absolute: true,
			});
			allFiles.push(...files);
		}

		if (allFiles.length > 0) {
			// Filter by project if specified
			const blocksFilteredFiles = filterByProject(
				allFiles,
				filePath => extractProjectFromPath(filePath),
				options?.project,
			);

			// Sort files by timestamp to ensure chronological processing
			const sortedFiles = await sortFilesByTimestamp(blocksFilteredFiles);

			// Track processed message+request combinations for deduplication
			const processedHashes = new Set<string>();

			for (const file of sortedFiles) {
				const content = await readFile(file, 'utf-8');
				const lines = content
					.trim()
					.split('\n')
					.filter(line => line.length > 0);

				for (const line of lines) {
					try {
						const parsed = JSON.parse(line) as unknown;

						const result = usageDataSchema.safeParse(parsed);
						if (!result.success) {
							continue;
						}
						const data = result.data;

						// Check for duplicate message + request ID combination
						const uniqueHash = createUniqueHash(data);
						if (isDuplicateEntry(uniqueHash, processedHashes)) {
							// Skip duplicate message
							continue;
						}

						// Mark this combination as processed
						markAsProcessed(uniqueHash, processedHashes);

						const cost = sharedFetcher != null
							? await calculateCostForEntry(data, mode, sharedFetcher)
							: data.costUSD ?? 0;

						// Skip entries with synthetic model or unknown model
						const model = data.message.model ?? 'unknown';
						if (model === '<synthetic>' || model === 'unknown') {
							continue;
						}

						// Get Claude Code usage limit expiration date
						const usageLimitResetTime = getUsageLimitResetTime(data);

						allEntries.push({
							source: 'claude',
							timestamp: new Date(data.timestamp),
							usage: {
								inputTokens: data.message.usage.input_tokens,
								outputTokens: data.message.usage.output_tokens,
								cacheCreationInputTokens: data.message.usage.cache_creation_input_tokens ?? 0,
								cacheReadInputTokens: data.message.usage.cache_read_input_tokens ?? 0,
							},
							costUSD: cost,
							model,
							version: data.version,
							usageLimitResetTime: usageLimitResetTime ?? undefined,
							project: extractProjectFromPath(file),
						});
					}
					catch (error) {
						// Skip invalid JSON lines but log for debugging purposes
						logger.debug(`Skipping invalid JSON line in 5-hour blocks: ${error instanceof Error ? error.message : String(error)}`);
					}
				}
			}
		}
	}

	// Load OpenCode data if included
	if (sources.includes('opencode')) {
		try {
			const openCodeEntries = loadOpenCodeData(options?.openCodePath);

			// Convert OpenCode entries to LoadedUsageEntry format
			for (const entry of openCodeEntries) {
				// Filter by project if specified
				if (options?.project != null && !entry.projectPath.includes(options.project)) {
					continue;
				}

				// Calculate cost for OpenCode entries when costUSD is null or 0
				let calculatedCost = entry.cost ?? null;
				if ((calculatedCost == null || calculatedCost === 0) && sharedFetcher != null) {
					calculatedCost = await calculateCostForOpenCodeEntry(entry, mode, sharedFetcher);
				}

				allEntries.push({
					source: 'opencode',
					timestamp: entry.timestamp,
					usage: {
						inputTokens: entry.tokens.input,
						outputTokens: entry.tokens.output,
						cacheCreationInputTokens: entry.tokens.cache?.write ?? 0,
						cacheReadInputTokens: entry.tokens.cache?.read ?? 0,
					},
					costUSD: calculatedCost,
					model: entry.model,
					project: extractProjectName(entry.projectPath),
				});
			}
		}
		catch (error) {
			// Differentiate between missing directory and other errors
			const errorMessage = error instanceof Error ? error.message : String(error);
			const errorCode = (error as any)?.code;
			
			if (errorCode === 'ENOENT' || errorMessage.includes('no such file or directory')) {
				// Missing OpenCode directory is expected and not an error
				logger.debug(`OpenCode directory not found at ${options?.openCodePath ?? 'default location'} - skipping OpenCode data`);
			} else {
				// Other errors are unexpected and should be logged with more detail
				logger.error('Failed to load OpenCode data:', {
					error: errorMessage,
					stack: error instanceof Error ? error.stack : undefined,
					openCodePath: options?.openCodePath ?? 'default location',
				});
				// Consider rethrowing for critical errors if needed
				// throw error;
			}
		}
	}

	// Return empty if no entries from any source
	if (allEntries.length === 0) {
		return [];
	}

	// Identify session blocks
	const blocks = identifySessionBlocks(allEntries, options?.sessionDurationHours);



	// Filter by date range if specified
	const dateFiltered = (options?.since != null && options.since !== '') || (options?.until != null && options.until !== '')
		? blocks.filter((block) => {
				// Check if any entries in the block fall within the date range
				return block.entries.some((entry) => {
					const entryDateStr = formatDate(entry.timestamp.toISOString(), options?.timezone, 'en-CA').replace(/-/g, '');

					if (options.since != null && options.since !== '' && entryDateStr < options.since) {
						return false;
					}
					if (options.until != null && options.until !== '' && entryDateStr > options.until) {
						return false;
					}
					return true;
				});
			})
		: blocks;

	// Sort by start time based on order option
	return sortByDate(dateFiltered, block => block.startTime, options?.order);
}

/**
 * Unified daily usage data loader that supports both Claude Code and OpenCode
 * Uses loadSessionBlockData internally and aggregates into daily summaries
 */
export async function loadUnifiedDailyUsageData(
	options?: LoadOptions,
): Promise<DailyUsage[]> {
	// Load session blocks from both sources
	const blocks = await loadSessionBlockData(options);



	if (blocks.length === 0) {
		return [];
	}

	// Initialize pricing fetcher for cost calculation
	const mode = options?.mode ?? 'auto';
	using fetcher = mode === 'display' ? null : new PricingFetcher(options?.offline);

	// Group entries by date
	const dailyMap = new Map<string, {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		totalCost: number;
		modelsUsed: Set<string>;
		modelBreakdowns: Map<string, ModelBreakdown>;
		sourceBreakdowns: Map<'claude' | 'opencode', SourceBreakdown>;
		project?: string;
	}>();

	for (const block of blocks) {
		for (const entry of block.entries) {
			// Use timezone from options for date formatting
			const dateKey = formatDate(entry.timestamp.toISOString(), options?.timezone, options?.locale);

			if (!dailyMap.has(dateKey)) {
				dailyMap.set(dateKey, {
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalCost: 0,
					modelsUsed: new Set(),
					modelBreakdowns: new Map(),
					sourceBreakdowns: new Map(),
					project: options?.groupByProject === true ? extractProjectFromEntry(entry) : undefined,
				});
			}

			const daily = dailyMap.get(dateKey)!;
			daily.inputTokens += entry.usage.inputTokens;
			daily.outputTokens += entry.usage.outputTokens;
			daily.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			daily.cacheReadTokens += entry.usage.cacheReadInputTokens;

			// Calculate cost using the pricing fetcher (handles null costUSD for OpenCode)
			const entryCost = fetcher != null
				? await calculateCostForLoadedEntry(entry, mode, fetcher)
				: entry.costUSD ?? 0;
			daily.totalCost += entryCost;
			daily.modelsUsed.add(entry.model);

			// Track model breakdown
			if (!daily.modelBreakdowns.has(entry.model)) {
				daily.modelBreakdowns.set(entry.model, {
					modelName: createModelName(entry.model),
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					cost: 0,
				});
			}
			const breakdown = daily.modelBreakdowns.get(entry.model)!;
			breakdown.inputTokens += entry.usage.inputTokens;
			breakdown.outputTokens += entry.usage.outputTokens;
			breakdown.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			breakdown.cacheReadTokens += entry.usage.cacheReadInputTokens;
			breakdown.cost += entryCost;

			// Track source breakdown
			if (!daily.sourceBreakdowns.has(entry.source)) {
				daily.sourceBreakdowns.set(entry.source, {
					source: entry.source,
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalCost: 0,
				});
			}
			const sourceBreakdown = daily.sourceBreakdowns.get(entry.source)!;
			sourceBreakdown.inputTokens += entry.usage.inputTokens;
			sourceBreakdown.outputTokens += entry.usage.outputTokens;
			sourceBreakdown.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			sourceBreakdown.cacheReadTokens += entry.usage.cacheReadInputTokens;
			sourceBreakdown.totalCost += entryCost;
		}
	}

	// Convert to DailyUsage array
	const result: DailyUsage[] = Array.from(dailyMap.entries()).map(([date, data]) => ({
		date: createDailyDate(date),
		inputTokens: data.inputTokens,
		outputTokens: data.outputTokens,
		cacheCreationTokens: data.cacheCreationTokens,
		cacheReadTokens: data.cacheReadTokens,
		totalCost: data.totalCost,
		modelsUsed: Array.from(data.modelsUsed).sort().map(createModelName),
		modelBreakdowns: Array.from(data.modelBreakdowns.values()),
		sourceBreakdowns: Array.from(data.sourceBreakdowns.values()),
		project: data.project,
	}));



	// Filter by date range if specified
	const dateFiltered = filterByDateRange(result, item => item.date, options?.since, options?.until);

	// Filter by project if specified
	const finalFiltered = filterByProject(dateFiltered, item => item.project, options?.project);

	// Sort by date
	return finalFiltered.sort((a, b) => {
		const order = options?.order ?? 'asc';
		const comparison = a.date.localeCompare(b.date);
		return order === 'desc' ? -comparison : comparison;
	});
}

/**
 * Unified monthly usage data loader that supports both Claude Code and OpenCode
 * Uses loadSessionBlockData internally and aggregates into monthly summaries
 */
export async function loadUnifiedMonthlyUsageData(
	options?: LoadOptions,
): Promise<MonthlyUsage[]> {
	// Load session blocks from both sources
	const blocks = await loadSessionBlockData(options);

	if (blocks.length === 0) {
		return [];
	}

	// Group entries by month
	const monthlyMap = new Map<string, {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		totalCost: number;
		modelsUsed: Set<string>;
		modelBreakdowns: Map<string, ModelBreakdown>;
		sourceBreakdowns: Map<'claude' | 'opencode', SourceBreakdown>;
	}>();

	// Helper function to get custom month key based on start day
	const getCustomMonthKey = (timestamp: string): string => {
		const date = new Date(timestamp);
		const startDay = options?.startOfMonth ?? 1;

		// If we're before the start day, this entry belongs to the previous month's cycle
		if (date.getDate() < startDay) {
			const prevMonth = new Date(date.getFullYear(), date.getMonth() - 1, startDay);
			return formatDate(prevMonth.toISOString(), options?.timezone, options?.locale).substring(0, 7);
		}
		else {
			// This entry belongs to the current month's cycle
			const currentMonth = new Date(date.getFullYear(), date.getMonth(), startDay);
			return formatDate(currentMonth.toISOString(), options?.timezone, options?.locale).substring(0, 7);
		}
	};

	for (const block of blocks) {
		for (const entry of block.entries) {
			// Use custom month grouping based on start day
			const monthKey = getCustomMonthKey(entry.timestamp.toISOString());

			if (!monthlyMap.has(monthKey)) {
				monthlyMap.set(monthKey, {
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalCost: 0,
					modelsUsed: new Set(),
					modelBreakdowns: new Map(),
					sourceBreakdowns: new Map(),
				});
			}

			const monthly = monthlyMap.get(monthKey)!;
			monthly.inputTokens += entry.usage.inputTokens;
			monthly.outputTokens += entry.usage.outputTokens;
			monthly.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			monthly.cacheReadTokens += entry.usage.cacheReadInputTokens;
			monthly.totalCost += entry.costUSD ?? 0;
			monthly.modelsUsed.add(entry.model);

			// Track model breakdown
			if (!monthly.modelBreakdowns.has(entry.model)) {
				monthly.modelBreakdowns.set(entry.model, {
					modelName: createModelName(entry.model),
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					cost: 0,
				});
			}
			const breakdown = monthly.modelBreakdowns.get(entry.model)!;
			breakdown.inputTokens += entry.usage.inputTokens;
			breakdown.outputTokens += entry.usage.outputTokens;
			breakdown.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			breakdown.cacheReadTokens += entry.usage.cacheReadInputTokens;
			breakdown.cost += entry.costUSD ?? 0;

			// Track source breakdown
			if (!monthly.sourceBreakdowns.has(entry.source)) {
				monthly.sourceBreakdowns.set(entry.source, {
					source: entry.source,
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalCost: 0,
				});
			}
			const sourceBreakdown = monthly.sourceBreakdowns.get(entry.source)!;
			sourceBreakdown.inputTokens += entry.usage.inputTokens;
			sourceBreakdown.outputTokens += entry.usage.outputTokens;
			sourceBreakdown.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			sourceBreakdown.cacheReadTokens += entry.usage.cacheReadInputTokens;
			sourceBreakdown.totalCost += entry.costUSD ?? 0;
		}
	}

	// Convert to MonthlyUsage array
	const result: MonthlyUsage[] = Array.from(monthlyMap.entries()).map(([month, data]) => ({
		month: createMonthlyDate(month),
		inputTokens: data.inputTokens,
		outputTokens: data.outputTokens,
		cacheCreationTokens: data.cacheCreationTokens,
		cacheReadTokens: data.cacheReadTokens,
		totalCost: data.totalCost,
		modelsUsed: Array.from(data.modelsUsed).sort().map(createModelName),
		modelBreakdowns: Array.from(data.modelBreakdowns.values()),
		sourceBreakdowns: Array.from(data.sourceBreakdowns.values()),
	}));

	// Sort by month
	return result.sort((a, b) => {
		const order = options?.order ?? 'asc';
		const comparison = a.month.localeCompare(b.month);
		return order === 'desc' ? -comparison : comparison;
	});
}

/**
 * Unified weekly usage data loader that supports both Claude Code and OpenCode
 * Uses loadSessionBlockData internally and aggregates into weekly summaries
 */
export async function loadUnifiedWeeklyUsageData(
	options?: LoadOptions,
): Promise<WeeklyUsage[]> {
	// Load session blocks from both sources
	const blocks = await loadSessionBlockData(options);

	if (blocks.length === 0) {
		return [];
	}

	// Calculate start day for weekly grouping once
	const startDay = getDayNumber(options?.startOfWeek ?? DEFAULT_START_OF_WEEK);

	// Group entries by week
	const weeklyMap = new Map<WeeklyDate, {
		inputTokens: number;
		outputTokens: number;
		cacheCreationTokens: number;
		cacheReadTokens: number;
		totalCost: number;
		modelsUsed: Set<string>;
		modelBreakdowns: Map<string, ModelBreakdown>;
		sourceBreakdowns: Map<'claude' | 'opencode', SourceBreakdown>;
	}>();

	for (const block of blocks) {
		for (const entry of block.entries) {
			// Format as week start date for weekly grouping
			const weekKey = getDateWeek(entry.timestamp, startDay);

			if (!weeklyMap.has(weekKey)) {
				weeklyMap.set(weekKey, {
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalCost: 0,
					modelsUsed: new Set(),
					modelBreakdowns: new Map(),
					sourceBreakdowns: new Map(),
				});
			}

			const weekly = weeklyMap.get(weekKey)!;
			weekly.inputTokens += entry.usage.inputTokens;
			weekly.outputTokens += entry.usage.outputTokens;
			weekly.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			weekly.cacheReadTokens += entry.usage.cacheReadInputTokens;
			weekly.totalCost += entry.costUSD ?? 0;
			weekly.modelsUsed.add(entry.model);

			// Track model breakdown
			if (!weekly.modelBreakdowns.has(entry.model)) {
				weekly.modelBreakdowns.set(entry.model, {
					modelName: createModelName(entry.model),
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					cost: 0,
				});
			}
			const breakdown = weekly.modelBreakdowns.get(entry.model)!;
			breakdown.inputTokens += entry.usage.inputTokens;
			breakdown.outputTokens += entry.usage.outputTokens;
			breakdown.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			breakdown.cacheReadTokens += entry.usage.cacheReadInputTokens;
			breakdown.cost += entry.costUSD ?? 0;

			// Track source breakdown
			if (!weekly.sourceBreakdowns.has(entry.source)) {
				weekly.sourceBreakdowns.set(entry.source, {
					source: entry.source,
					inputTokens: 0,
					outputTokens: 0,
					cacheCreationTokens: 0,
					cacheReadTokens: 0,
					totalCost: 0,
				});
			}
			const sourceBreakdown = weekly.sourceBreakdowns.get(entry.source)!;
			sourceBreakdown.inputTokens += entry.usage.inputTokens;
			sourceBreakdown.outputTokens += entry.usage.outputTokens;
			sourceBreakdown.cacheCreationTokens += entry.usage.cacheCreationInputTokens;
			sourceBreakdown.cacheReadTokens += entry.usage.cacheReadInputTokens;
			sourceBreakdown.totalCost += entry.costUSD ?? 0;
		}
	}

	// Convert to WeeklyUsage array
	const result: WeeklyUsage[] = Array.from(weeklyMap.entries()).map(([week, data]) => ({
		week,
		inputTokens: data.inputTokens,
		outputTokens: data.outputTokens,
		cacheCreationTokens: data.cacheCreationTokens,
		cacheReadTokens: data.cacheReadTokens,
		totalCost: data.totalCost,
		modelsUsed: Array.from(data.modelsUsed).sort().map(createModelName),
		modelBreakdowns: Array.from(data.modelBreakdowns.values()),
		sourceBreakdowns: Array.from(data.sourceBreakdowns.values()),
	}));

	// Sort by week
	return result.sort((a, b) => {
		const order = options?.order ?? 'asc';
		const comparison = a.week.localeCompare(b.week);
		return order === 'desc' ? -comparison : comparison;
	});
}

/**
 * Helper function to extract project name from a LoadedUsageEntry
 */
function extractProjectFromEntry(entry: LoadedUsageEntry): string {
	// Use the project field if it's already populated
	if (entry.project != null) {
		return entry.project;
	}
	
	// Fallback to a default value based on source
	if (entry.source === 'opencode') {
		return 'opencode-unknown';
	}
	return 'claude-unknown';
}

/**
 * Helper function to extract project name from folder path
 * For Claude: -Users-vatsal-Library-CloudStorage-Dropbox-Apps-localApps-occusage -> localApps-occusage
 * For OpenCode: /Users/vatsal/jarvis -> vatsal-jarvis, /global -> global
 */
function extractProjectName(folderPath: string): string {
	// Check if this is an OpenCode full path (starts with /)
	if (folderPath.startsWith('/')) {
		// For OpenCode full paths like /Users/vatsal/jarvis or /global
		if (folderPath === '/global') {
			return 'global';
		}
		// Get the last two segments of the path
		const parts = folderPath.split('/').filter(p => p.length > 0);
		if (parts.length >= 2) {
			// Take the last two parts and join with dash (e.g., vatsal-jarvis)
			return parts.slice(-2).join('-');
		}
		else if (parts.length === 1 && parts[0] != null) {
			// If only one part, return it as is
			return parts[0];
		}
		return 'unknown';
	}

	// For Claude format (starts with dash)
	const cleanPath = folderPath.startsWith('-') ? folderPath.slice(1) : folderPath;

	// Split by dashes and get the last two parts
	const parts = cleanPath.split('-');

	// If we have at least 2 parts, join the last two
	// This handles cases like localApps-occusage
	if (parts.length >= 2) {
		return parts.slice(-2).join('-');
	}

	// Fallback to the last part if less than 2 parts
	return parts[parts.length - 1] ?? 'unknown';
}

/**
 * Loads and aggregates usage data grouped by project
 */
export async function loadUnifiedProjectData(
	options?: LoadOptions,
): Promise<ProjectUsage[]> {
	// Load unified usage data from both sources
	const allEntries = await _loadUnifiedUsageData(options);

	if (allEntries.length === 0) {
		return [];
	}

	// Initialize pricing fetcher for cost calculation
	const mode = options?.mode ?? 'auto';
	using fetcher = mode === 'display' ? null : new PricingFetcher(options?.offline);

	// Filter by date range if specified
	const dateFiltered = filterByDateRange(
		allEntries,
		item => item.timestamp,
		options?.since,
		options?.until,
	);

	// Group by project name
	const projectMap = new Map<string, {
		entries: UnifiedUsageEntry[];
		latestTimestamp: string;
	}>();

	for (const entry of dateFiltered) {
		// Extract project name from the project path
		const projectName = extractProjectName(entry.projectPath);

		const existing = projectMap.get(projectName);
		if (existing == null) {
			projectMap.set(projectName, {
				entries: [entry],
				latestTimestamp: entry.timestamp,
			});
		}
		else {
			existing.entries.push(entry);
			if (entry.timestamp > existing.latestTimestamp) {
				existing.latestTimestamp = entry.timestamp;
			}
		}
	}

	// Convert to ProjectUsage format
	const results: ProjectUsage[] = [];

	for (const [projectName, projectData] of projectMap.entries()) {
		const { entries, latestTimestamp } = projectData;

		// Calculate totals
		let inputTokens = 0;
		let outputTokens = 0;
		let cacheCreationTokens = 0;
		let cacheReadTokens = 0;
		let totalCost = 0;

		const modelsUsed = new Set<string>();
		const versions = new Set<string>();
		const modelBreakdowns = new Map<string, ModelBreakdown>();
		const sourceBreakdowns = new Map<'claude' | 'opencode', SourceBreakdown>();

		// Process each entry
		for (const entry of entries) {
			const usage = entry.usage;
			inputTokens += usage.input_tokens;
			outputTokens += usage.output_tokens;
			cacheCreationTokens += usage.cache_creation_input_tokens;
			cacheReadTokens += usage.cache_read_input_tokens;

			// Calculate cost using the pricing fetcher (handles null costUSD for OpenCode)
			const entryCost = fetcher != null
				? await calculateCostForUnifiedEntry(entry, mode, fetcher)
				: entry.costUSD ?? 0;
			totalCost += entryCost;

			modelsUsed.add(entry.model);
			versions.add(entry.version ?? '1.0.0');

			// Update model breakdown
			const existing = modelBreakdowns.get(entry.model);
			if (existing == null) {
				modelBreakdowns.set(entry.model, {
					modelName: entry.model as ModelName,
					inputTokens: usage.input_tokens,
					outputTokens: usage.output_tokens,
					cacheCreationTokens: usage.cache_creation_input_tokens,
					cacheReadTokens: usage.cache_read_input_tokens,
					cost: entryCost,
				});
			}
			else {
				existing.inputTokens += usage.input_tokens;
				existing.outputTokens += usage.output_tokens;
				existing.cacheCreationTokens += usage.cache_creation_input_tokens;
				existing.cacheReadTokens += usage.cache_read_input_tokens;
				existing.cost += entryCost;
			}

			// Update source breakdown
			const sourceExisting = sourceBreakdowns.get(entry.source);
			if (sourceExisting == null) {
				sourceBreakdowns.set(entry.source, {
					source: entry.source,
					inputTokens: usage.input_tokens,
					outputTokens: usage.output_tokens,
					cacheCreationTokens: usage.cache_creation_input_tokens,
					cacheReadTokens: usage.cache_read_input_tokens,
					totalCost: entryCost,
				});
			}
			else {
				sourceExisting.inputTokens += usage.input_tokens;
				sourceExisting.outputTokens += usage.output_tokens;
				sourceExisting.cacheCreationTokens += usage.cache_creation_input_tokens;
				sourceExisting.cacheReadTokens += usage.cache_read_input_tokens;
				sourceExisting.totalCost += entryCost;
			}
		}

		// Format last activity date
		const lastActivity = formatDate(latestTimestamp, options?.timezone, options?.locale) as ActivityDate;

		results.push({
			projectName,
			inputTokens,
			outputTokens,
			cacheCreationTokens,
			cacheReadTokens,
			totalCost,
			lastActivity,
			versions: Array.from(versions) as Version[],
			modelsUsed: Array.from(modelsUsed) as ModelName[],
			modelBreakdowns: Array.from(modelBreakdowns.values()),
			sourceBreakdowns: Array.from(sourceBreakdowns.values()),
		});
	}

	// Sort results
	const sortOrder = options?.order ?? 'desc';
	return sort(results)[sortOrder === 'asc' ? 'asc' : 'desc'](item => item.lastActivity);
}

// Test-only surface for white-box verification
export const __testing__ = {
	getDateWeek,
	getDayNumber,
	DEFAULT_START_OF_WEEK,
};

