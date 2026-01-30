import type { OpenCodeMessage, OpenCodePart, OpenCodeSessionInfo, OpenCodeUsageEntry } from './_opencode-types.ts';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import { z } from 'zod';
import {
	CLAUDE_PROJECTS_DIR_NAME,
	DEFAULT_OPENCODE_DATA_PATH,
	OPENCODE_DATA_DIR_ENV,
	OPENCODE_PROJECTS_DIR_NAME,
	OPENCODE_STORAGE_DIR_NAME,
	USER_HOME_DIR,
} from './_consts.ts';
import { isSupportedModel, normalizeModelId } from './_model-utils.ts';
import {
	opencodeMessageSchema,
	opencodePartSchema,
	opencodeProjectSchema,
	opencodeSessionInfoSchema,
} from './_opencode-types.ts';
import { logger } from './logger.ts';

/**
 * Check if a path is a Windows absolute path
 * Matches: C:\path, D:\path, C:/path, \\UNC\path
 */
function isWindowsAbsolutePath(path: string): boolean {
	// Drive letter: C:\ or C:/
	if (/^[A-Za-z]:[\\/]/.test(path)) {
		return true;
	}
	// UNC path: \\server\share
	if (/^\\\\/.test(path)) {
		return true;
	}
	return false;
}

/**
 * Encode project path for OpenCode storage using URL encoding
 */
export function encodeProjectPath(path: string): string {
	// Remove leading slash if present (but preserve Windows paths)
	const pathWithoutSlash = path.startsWith('/') && !isWindowsAbsolutePath(path) ? path.slice(1) : path;
	return encodeURIComponent(pathWithoutSlash);
}

/**
 * Decode OpenCode encoded project path to readable format
 * Uses URL decoding with fallback to legacy dash replacement for backward compatibility
 */
export function decodeProjectPath(encodedPath: string): string {
	// Check if this looks like URL encoding (contains % characters)
	if (encodedPath.includes('%')) {
		try {
			// Try URL decoding first (new encoding method)
			const decodedPath = decodeURIComponent(encodedPath);
			// Skip leading-slash normalization for Windows absolute paths
			if (isWindowsAbsolutePath(decodedPath)) {
				return decodedPath;
			}
			// Ensure leading slash for POSIX paths
			return decodedPath.startsWith('/') ? decodedPath : `/${decodedPath}`;
		} catch {
			// If URL decoding fails, fall through to legacy method
		}
	}

	// Fallback to legacy decoding with safeguards
	// Old OpenCode versions encoded paths by replacing path separators with dashes.
	// This risks corrupting valid dashes (e.g., "my-project"). To reduce risk,
	// only apply when the string appears to be a legacy absolute path without URL encoding:
	// - no "%" present (handled above)
	// - at least 3 dash-separated segments and starts with a known root token
	// - contains tokens like "Users" or "home" likely representing a POSIX path
	const legacyCandidates = encodedPath.split('-');
	const looksLegacy = legacyCandidates.length >= 3
		&& (/^(users|home|var|etc|opt|private|Volumes)$/i).test(legacyCandidates[0] ?? '');
	if (looksLegacy) {
		return `/${encodedPath.replace(/-/g, '/')}`;
	}

	// Default: treat as already-decoded simple project name segment
	// Skip leading-slash normalization for Windows absolute paths
	if (isWindowsAbsolutePath(encodedPath)) {
		return encodedPath;
	}
	return encodedPath.startsWith('/') ? encodedPath : `/${encodedPath}`;
}

/**
 * Get OpenCode data directories from environment or defaults
 */
export function getOpenCodeDirectories(): string[] {
	const envDirs = process.env[OPENCODE_DATA_DIR_ENV];
	if (envDirs != null && envDirs.length > 0) {
		return envDirs
			.split(',')
			.map(dir => dir.trim())
			.filter(dir => dir.length > 0)
			.map(dir => resolve(dir));
	}

	// Default directory
	const defaultPath = join(USER_HOME_DIR, DEFAULT_OPENCODE_DATA_PATH);
	if (existsSync(defaultPath)) {
		return [defaultPath];
	}

	return [];
}

/**
 * Load OpenCode project paths keyed by project ID
 */
function loadProjectMap(storagePath: string): Map<string, string> {
	const projectMap = new Map<string, string>();
	const projectsPath = join(storagePath, OPENCODE_PROJECTS_DIR_NAME);

	if (!existsSync(projectsPath)) {
		return projectMap;
	}

	try {
		const projectFiles = readdirSync(projectsPath).filter(f => f.endsWith('.json'));
		for (const file of projectFiles) {
			const projectPath = join(projectsPath, file);
			try {
				const content = readFileSync(projectPath, 'utf-8');
				const parsed = JSON.parse(content) as unknown;
				const validated = opencodeProjectSchema.parse(parsed);
				const projectRoot = validated.worktree ?? validated.directory;
				if (projectRoot != null && projectRoot !== '') {
					projectMap.set(validated.id, projectRoot);
				}
			}
			catch {
				logger.debug('Failed to parse OpenCode project:', projectPath);
			}
		}
	}
	catch (error) {
		logger.debug('Error reading OpenCode projects:', error);
	}

	return projectMap;
}

/**
 * Load OpenCode session info
 */
function loadSessionInfo(sessionFilePath: string): OpenCodeSessionInfo | null {
	try {
		const content = readFileSync(sessionFilePath, 'utf-8');
		const parsed = JSON.parse(content) as unknown;
		return opencodeSessionInfoSchema.parse(parsed);
	}
	catch {
		logger.debug('Failed to parse OpenCode session:', sessionFilePath);
		return null;
	}
}



/**
 * Load messages from OpenCode session
 */
function loadMessages(storagePath: string, sessionId: string): OpenCodeMessage[] {
	const messagesPath = join(storagePath, 'message', sessionId);

	if (!existsSync(messagesPath)) {
		return [];
	}

	const messages: OpenCodeMessage[] = [];

	try {
		const messageFiles = readdirSync(messagesPath).filter(f => f.endsWith('.json'));

		for (const file of messageFiles) {
			const messagePath = join(messagesPath, file);
			try {
				const content = readFileSync(messagePath, 'utf-8');
				const parsed = JSON.parse(content) as unknown;
				const validated = opencodeMessageSchema.parse(parsed);
				messages.push(validated);
			}
			catch {
				logger.debug('Failed to parse OpenCode message:', messagePath);
			}
		}
	}
	catch (error) {
		logger.debug('Error reading OpenCode messages:', error);
	}

	return messages;
}

/**
 * Load parts (containing token data) from OpenCode message
 */
function loadParts(storagePath: string, messageId: string): OpenCodePart[] {
	const partsPath = join(storagePath, 'part', messageId);
	const parts: OpenCodePart[] = [];

	if (!existsSync(partsPath)) {
		return parts;
	}

	try {
		const partFiles = readdirSync(partsPath).filter(f => f.endsWith('.json'));

		for (const file of partFiles) {
			const partPath = join(partsPath, file);
			try {
				const content = readFileSync(partPath, 'utf-8');
				const parsed = JSON.parse(content) as unknown;
				const validated = opencodePartSchema.parse(parsed);
				parts.push(validated);
			}
			catch {
				logger.debug('Failed to parse OpenCode part:', partPath);
			}
		}
	}
	catch (error) {
		logger.debug('Error reading OpenCode parts:', error);
	}

	return parts;
}

/**
 * Aggregate token data from parts for a message
 */
function aggregateTokensFromParts(parts: OpenCodePart[]): OpenCodeUsageEntry['tokens'] {
	const tokens: OpenCodeUsageEntry['tokens'] = {
		input: 0,
		output: 0,
	};

	let cacheRead = 0;
	let cacheWrite = 0;
	let reasoning = 0;

	for (const part of parts) {
		// Only process step-finish parts which contain token data
		if (part.type !== 'step-finish' || part.tokens == null) {
			continue;
		}

		tokens.input += part.tokens.input ?? 0;
		tokens.output += part.tokens.output ?? 0;
		reasoning += part.tokens.reasoning ?? 0;

		if (part.tokens.cache != null) {
			cacheRead += part.tokens.cache.read ?? 0;
			cacheWrite += part.tokens.cache.write ?? 0;
		}
	}

	if (cacheRead > 0 || cacheWrite > 0) {
		tokens.cache = {
			read: cacheRead,
			write: cacheWrite,
		};
	}

	if (reasoning > 0) {
		tokens.reasoning = reasoning;
	}

	return tokens;
}

function extractTokensFromMessage(message: OpenCodeMessage): OpenCodeUsageEntry['tokens'] | null {
	if (message.tokens == null) {
		return null;
	}

	const tokens: OpenCodeUsageEntry['tokens'] = {
		input: message.tokens.input ?? 0,
		output: message.tokens.output ?? 0,
	};

	const cacheRead = message.tokens.cache?.read ?? 0;
	const cacheWrite = message.tokens.cache?.write ?? 0;
	if (cacheRead > 0 || cacheWrite > 0) {
		tokens.cache = {
			read: cacheRead,
			write: cacheWrite,
		};
	}

	if ((message.tokens.reasoning ?? 0) > 0) {
		tokens.reasoning = message.tokens.reasoning;
	}

	return tokens;
}

/**
 * Load OpenCode usage data from legacy JSONL format (similar to Claude Code)
 * This format is used in older OpenCode installations with projects/ directory
 */
function loadLegacyData(projectsPath: string): OpenCodeUsageEntry[] {
	const entries: OpenCodeUsageEntry[] = [];

	const legacyUsageTokensSchema = z.object({
		input_tokens: z.number(),
		output_tokens: z.number(),
		cache_creation_input_tokens: z.number().optional(),
		cache_read_input_tokens: z.number().optional(),
	});

	const legacyJsonlSchema = z.object({
		timestamp: z.union([z.string(), z.number()]),
		message: z.object({
			model: z.string().optional(),
			usage: legacyUsageTokensSchema.optional(),
			id: z.string().optional(),
			role: z.enum(['user', 'assistant', 'system']).optional(),
		}).optional(),
		model: z.string().optional(),
		usage: legacyUsageTokensSchema.optional(),
		costUSD: z.number().optional(),
		provider: z.string().optional(),
		messageId: z.string().optional(),
		role: z.enum(['user', 'assistant', 'system']).optional(),
	}).refine((data) => data.usage != null || data.message?.usage != null, {
		message: 'Legacy OpenCode JSONL entry is missing usage data',
	});
	
	if (!existsSync(projectsPath)) {
		return entries;
	}
	
	try {
		const projectDirs = readdirSync(projectsPath);
		
		for (const encodedProjectDir of projectDirs) {
			const projectDirPath = join(projectsPath, encodedProjectDir);
			
			// Skip if not a directory
			try {
				const stat = statSync(projectDirPath);
				if (!stat.isDirectory()) {
					continue;
				}
			} catch {
				continue;
			}
			
			// Find JSONL files in this project directory
			const usageFiles = readdirSync(projectDirPath)
				.filter(f => f.endsWith('.jsonl') && f.startsWith('usage_'));
			
			const projectPath = decodeProjectPath(encodedProjectDir);
			
			for (const usageFile of usageFiles) {
				const usageFilePath = join(projectDirPath, usageFile);
				const sessionId = usageFile.replace('.jsonl', '').replace('usage_', '');
				
				try {
					const content = readFileSync(usageFilePath, 'utf-8');
					const lines = content.trim().split('\n').filter(line => line.length > 0);
					
					for (const line of lines) {
						try {
							const parsed = JSON.parse(line) as unknown;
							const validated = legacyJsonlSchema.safeParse(parsed);
							if (!validated.success) {
								logger.debug('Failed to validate legacy OpenCode JSONL line:', validated.error);
								continue;
							}

							// Expected format similar to Claude Code JSONL:
							// { timestamp, message: { model, usage: { input_tokens, output_tokens, ... } }, costUSD?, ... }
							const data = validated.data;
							const timestamp = data.timestamp;
							const usage = data.message?.usage ?? data.usage;
							const model = data.message?.model ?? data.model;
							const costUSD = data.costUSD;
							const messageId = data.message?.id ?? data.messageId;
							const provider = data.provider;
							const type = data.message?.role ?? data.role;
							
							if (usage == null) {
								continue;
							}
							
							const normalizedModel = normalizeModelId(model);
							if (normalizedModel == null || normalizedModel === 'unknown' || !isSupportedModel(normalizedModel, provider)) {
								continue;
							}
							
							const tokens: OpenCodeUsageEntry['tokens'] = {
								input: usage.input_tokens ?? 0,
								output: usage.output_tokens ?? 0,
							};
							
							const cacheWrite = usage.cache_creation_input_tokens ?? 0;
							const cacheRead = usage.cache_read_input_tokens ?? 0;
							if (cacheWrite > 0 || cacheRead > 0) {
								tokens.cache = {
									write: cacheWrite,
									read: cacheRead,
								};
							}
							
							entries.push({
								sessionId,
								projectPath,
								encodedProjectPath: encodedProjectDir,
								timestamp: new Date(timestamp),
								model: model ?? 'unknown',
								provider,
								tokens,
								cost: costUSD,
								messageId: messageId,
								type: type ?? 'assistant',
							});
						} catch (err) {
							logger.debug('Failed to parse legacy OpenCode JSONL line:', err);
						}
					}
				} catch (err) {
					logger.debug('Failed to read legacy OpenCode JSONL file:', usageFilePath, err);
				}
			}
		}
	} catch (error) {
		logger.debug('Error reading legacy OpenCode projects:', error);
	}
	
	return entries;
}

/**
 * Load OpenCode usage data from storage directory
 */
function loadStorageData(storagePath: string): OpenCodeUsageEntry[] {
	const entries: OpenCodeUsageEntry[] = [];
	const projectMap = loadProjectMap(storagePath);
	const sessionsPath = join(storagePath, 'session');

	if (!existsSync(sessionsPath)) {
		return entries;
	}

	let projectIds: string[] = [];
	try {
		projectIds = readdirSync(sessionsPath);
	}
	catch (error) {
		logger.debug('Error reading OpenCode sessions:', error);
		return entries;
	}

	for (const projectId of projectIds) {
		const projectSessionsPath = join(sessionsPath, projectId);
		if (!existsSync(projectSessionsPath)) {
			continue;
		}

		let sessionFiles: string[] = [];
		try {
			sessionFiles = readdirSync(projectSessionsPath).filter(f => f.endsWith('.json'));
		}
		catch (error) {
			logger.debug('Error reading OpenCode session directory:', projectSessionsPath, error);
			continue;
		}

		for (const sessionFile of sessionFiles) {
			const sessionFilePath = join(projectSessionsPath, sessionFile);
			const sessionInfo = loadSessionInfo(sessionFilePath);
			const sessionId = sessionInfo?.id ?? sessionFile.replace('.json', '');
			const projectKey = sessionInfo?.projectID ?? projectId;
			const sessionProjectPath = sessionInfo?.directory ?? projectMap.get(projectKey);

			const messages = loadMessages(storagePath, sessionId);
			for (const message of messages) {
				const parts = loadParts(storagePath, message.id);
				const stepFinishParts = parts.filter(p => p.type === 'step-finish' && p.tokens != null);
				const primaryPart = stepFinishParts[0];

				const tokens = stepFinishParts.length > 0
					? aggregateTokensFromParts(parts)
					: extractTokensFromMessage(message);
				if (tokens == null) {
					continue;
				}

				let totalCost: number | undefined = undefined;
				for (const part of stepFinishParts) {
					if (part.cost != null) {
						if (totalCost == null) totalCost = 0;
						totalCost += part.cost;
					}
				}
				if (totalCost == null && message.cost != null) {
					totalCost = message.cost;
				}

				const timestampMs = message.time?.created ?? message.time?.completed ?? 0;
				if (timestampMs === 0) {
					continue;
				}

				const modelFromMessage = message.model;
				const modelRaw = message.modelID
					?? (modelFromMessage != null && typeof modelFromMessage === 'string' ? modelFromMessage : modelFromMessage != null && typeof modelFromMessage === 'object' ? modelFromMessage.modelID : undefined)
					?? primaryPart?.modelID;
				const provider = message.providerID
					?? (modelFromMessage != null && typeof modelFromMessage === 'object' ? modelFromMessage.providerID : undefined)
					?? primaryPart?.providerID
					?? message.provider;
				const normalizedModel = normalizeModelId(modelRaw);
				if (normalizedModel == null || normalizedModel === 'unknown' || !isSupportedModel(normalizedModel, provider)) {
					continue;
				}

				// Determine project path with fallback handling
				// Prefer explicit paths over project key; use placeholder for missing paths
				const resolvedProjectPath = message.path?.root
					?? message.path?.cwd
					?? sessionProjectPath
					?? projectMap.get(projectId);
				
				// Skip entries without a valid project path
				// (projectKey alone is not a filesystem path - it's an ID like "proj_123")
				if (resolvedProjectPath == null || resolvedProjectPath === '') {
					logger.debug(`Skipping OpenCode entry without valid project path (projectKey: ${projectKey})`);
					continue;
				}
				
				const projectPath = resolvedProjectPath;
				const encodedProjectPath = encodeProjectPath(projectPath);

				entries.push({
					sessionId,
					projectPath,
					encodedProjectPath,
					timestamp: new Date(timestampMs),
					model: modelRaw ?? 'unknown',
					provider,
					tokens,
					cost: totalCost,
					messageId: message.id,
					type: message.role,
				});
			}
		}
	}

	return entries;
}

/**
 * Load all OpenCode usage data
 * Supports both new storage/ layout and legacy projects/ JSONL layout
 */
export function loadOpenCodeData(openCodePath?: string, suppressLogs = false): OpenCodeUsageEntry[] {
	// If a specific path is provided (for testing), use only that
	const directories = openCodePath != null ? [openCodePath] : getOpenCodeDirectories();
	const allEntries: OpenCodeUsageEntry[] = [];

	for (const dir of directories) {
		const storagePath = join(dir, OPENCODE_STORAGE_DIR_NAME);
		const projectRoot = join(dir, OPENCODE_PROJECTS_DIR_NAME);
		const projectsPath = join(dir, CLAUDE_PROJECTS_DIR_NAME);
		
		// Prefer storage layout (new format) if it exists
		if (existsSync(storagePath)) {
			try {
				const entries = loadStorageData(storagePath);
				allEntries.push(...entries);
				if (!suppressLogs && entries.length > 0) {
					logger.debug(`Loaded ${entries.length} OpenCode entries from storage layout: ${storagePath}`);
				}
			}
			catch (error) {
				logger.warn('Error reading OpenCode storage:', error);
			}
		}
		// Also support per-project storage layout: project/<slug>/storage
		if (existsSync(projectRoot)) {
			try {
				const projectDirs = readdirSync(projectRoot).filter((entry) => {
					try {
						return statSync(join(projectRoot, entry)).isDirectory();
					}
					catch {
						return false;
					}
				});
				for (const projectDir of projectDirs) {
					const projectStorage = join(projectRoot, projectDir, OPENCODE_STORAGE_DIR_NAME);
					if (!existsSync(projectStorage)) continue;
					try {
						const entries = loadStorageData(projectStorage);
						allEntries.push(...entries);
						if (!suppressLogs && entries.length > 0) {
							logger.debug(`Loaded ${entries.length} OpenCode entries from project storage layout: ${projectStorage}`);
						}
					}
					catch (error) {
						logger.warn('Error reading OpenCode project storage:', error);
					}
				}
			}
			catch (error) {
				logger.warn('Error scanning OpenCode project storage root:', error);
			}
		}
		// Fallback to legacy projects/ JSONL layout if storage doesn't exist
		else if (existsSync(projectsPath)) {
			try {
				const entries = loadLegacyData(projectsPath);
				allEntries.push(...entries);
				if (!suppressLogs && entries.length > 0) {
					logger.debug(`Loaded ${entries.length} OpenCode entries from legacy layout: ${projectsPath}`);
				}
			}
			catch (error) {
				logger.warn('Error reading OpenCode legacy projects:', error);
			}
		}
		else {
			logger.debug('No OpenCode data found (checked storage and legacy layouts):', dir);
		}
	}

	if (!suppressLogs) {
		logger.info(`Loaded ${allEntries.length} OpenCode usage entries`);
	}
	return allEntries;
}

// In-source tests
