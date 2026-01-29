import type { OpenCodeMessage, OpenCodePart, OpenCodeSessionInfo, OpenCodeUsageEntry } from './_opencode-types.ts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import {
	DEFAULT_OPENCODE_DATA_PATH,
	OPENCODE_DATA_DIR_ENV,
	OPENCODE_PROJECTS_DIR_NAME,
	OPENCODE_STORAGE_DIR_NAME,
	USER_HOME_DIR,
} from './_consts.ts';
import {
	opencodeMessageSchema,
	opencodePartSchema,
	opencodeProjectSchema,
	opencodeSessionInfoSchema,
} from './_opencode-types.ts';
import { logger } from './logger.ts';

/**
 * Normalize model identifier strings to a comparable canonical form
 * - lowercases
 * - strips provider prefixes like "anthropic:", "openrouter:", etc.
 * - trims whitespace
 * - prefixes known alias families (sonnet/opus/haiku) with "claude-" for detection
 */
function normalizeModelId(modelId?: string): string | null {
    if (modelId == null) return null;
    let s = modelId.trim().toLowerCase();
    if (s === '') return null;
    s = s.replace(/^(anthropic:|openrouter:|bedrock:|vertex:)/, '');
    // If starts with family alias, prefix claude-
    if (/^(sonnet|opus|haiku)(-|$)/.test(s) && !s.startsWith('claude-')) {
        s = `claude-${s}`;
    }
    return s;
}

/**
 * Encode project path for OpenCode storage using URL encoding
 */
export function encodeProjectPath(path: string): string {
	// Remove leading slash if present
	const pathWithoutSlash = path.startsWith('/') ? path.slice(1) : path;
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
			// Ensure leading slash
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
					?? (typeof modelFromMessage === 'string' ? modelFromMessage : modelFromMessage?.modelID)
					?? primaryPart?.modelID;
				const normalizedModel = normalizeModelId(modelRaw);
				if (normalizedModel == null || normalizedModel === 'unknown' || !normalizedModel.includes('claude')) {
					continue;
				}

				const provider = message.providerID
					?? (typeof modelFromMessage === 'object' ? modelFromMessage.providerID : undefined)
					?? primaryPart?.providerID
					?? message.provider;

				const projectPath = message.path?.root
					?? message.path?.cwd
					?? sessionProjectPath
					?? projectMap.get(projectId)
					?? projectKey;

				entries.push({
					sessionId,
					projectPath,
					encodedProjectPath: projectKey,
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
 */
export function loadOpenCodeData(openCodePath?: string, suppressLogs = false): OpenCodeUsageEntry[] {
	// If a specific path is provided (for testing), use only that
	const directories = openCodePath != null ? [openCodePath] : getOpenCodeDirectories();
	const allEntries: OpenCodeUsageEntry[] = [];

	for (const dir of directories) {
		const storagePath = join(dir, OPENCODE_STORAGE_DIR_NAME);
		if (!existsSync(storagePath)) {
			logger.debug('OpenCode storage directory not found:', storagePath);
			continue;
		}

		try {
			const entries = loadStorageData(storagePath);
			allEntries.push(...entries);
		}
		catch (error) {
			logger.warn('Error reading OpenCode storage:', error);
		}
	}

	if (!suppressLogs) {
		logger.info(`Loaded ${allEntries.length} OpenCode usage entries`);
	}
	return allEntries;
}

// In-source tests
