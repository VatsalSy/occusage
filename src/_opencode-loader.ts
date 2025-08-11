import type { OpenCodeMessage, OpenCodePart, OpenCodeUsageEntry } from './_opencode-types.ts';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import process from 'node:process';
import {
	DEFAULT_OPENCODE_DATA_PATH,
	OPENCODE_DATA_DIR_ENV,
	OPENCODE_PROJECTS_DIR_NAME,
	USER_HOME_DIR,
} from './_consts.ts';
import {
	opencodeMessageSchema,
	opencodePartSchema,
} from './_opencode-types.ts';
import { logger } from './logger.ts';

/**
 * Encode project path for OpenCode storage using URL encoding
 */
function encodeProjectPath(path: string): string {
	// Remove leading slash if present
	const pathWithoutSlash = path.startsWith('/') ? path.slice(1) : path;
	return encodeURIComponent(pathWithoutSlash);
}

/**
 * Decode OpenCode encoded project path to readable format
 * Uses URL decoding with fallback to legacy dash replacement for backward compatibility
 */
function decodeProjectPath(encodedPath: string): string {
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
	
	// Fallback to legacy dash replacement for backward compatibility
	// OpenCode previously encoded paths like "Users-vatsal-projects-myproject"
	// Convert back to "/Users/vatsal/projects/myproject"
	return `/${encodedPath.replace(/-/g, '/')}`;
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
 * Load messages from OpenCode session
 */
function loadMessages(sessionPath: string, sessionId: string): OpenCodeMessage[] {
	const messagesPath = join(sessionPath, 'message', sessionId);

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
 * Load parts (containing token data) from OpenCode session
 */
function loadParts(sessionPath: string, sessionId: string): Map<string, OpenCodePart[]> {
	const partsPath = join(sessionPath, 'part', sessionId);
	const partsByMessage = new Map<string, OpenCodePart[]>();

	if (!existsSync(partsPath)) {
		return partsByMessage;
	}

	try {
		const messageIds = readdirSync(partsPath);

		for (const messageId of messageIds) {
			const messagePartsPath = join(partsPath, messageId);
			if (!existsSync(messagePartsPath)) {
				continue;
			}

			const parts: OpenCodePart[] = [];
			const partFiles = readdirSync(messagePartsPath).filter(f => f.endsWith('.json'));

			for (const file of partFiles) {
				const partPath = join(messagePartsPath, file);
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

			if (parts.length > 0) {
				partsByMessage.set(messageId, parts);
			}
		}
	}
	catch (error) {
		logger.debug('Error reading OpenCode parts:', error);
	}

	return partsByMessage;
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

/**
 * Load OpenCode usage data from a project
 */
function loadProjectData(projectPath: string): OpenCodeUsageEntry[] {
	const entries: OpenCodeUsageEntry[] = [];
	const encodedProjectName = projectPath.split('/').pop() ?? '';
	const decodedProjectPath = decodeProjectPath(encodedProjectName);
	const storagePath = join(projectPath, 'storage', 'session');

	if (!existsSync(storagePath)) {
		return entries;
	}

	// Load session info to get list of sessions
	const infoPath = join(storagePath, 'info');
	if (!existsSync(infoPath)) {
		return entries;
	}

	const sessionFiles = readdirSync(infoPath).filter(f => f.endsWith('.json'));

	for (const sessionFile of sessionFiles) {
		const sessionId = sessionFile.replace('.json', '');

		// Load messages and parts for this session
		const messages = loadMessages(storagePath, sessionId);
		const partsByMessage = loadParts(storagePath, sessionId);

		// Process each message with parts
		for (const message of messages) {
			const parts = partsByMessage.get(message.id);
			if (parts == null || parts.length === 0) {
				continue;
			}

			// Find step-finish parts with token data
			const stepFinishParts = parts.filter(p => p.type === 'step-finish' && p.tokens != null);
			if (stepFinishParts.length === 0) {
				continue;
			}

			// Use the first step-finish part for metadata
			const primaryPart = stepFinishParts[0];
			if (primaryPart == null) {
				continue;
			}

			// Aggregate tokens from all parts
			const tokens = aggregateTokensFromParts(parts);

			// Calculate total cost from all parts
			let totalCost = 0;
			for (const part of stepFinishParts) {
				if (part.cost != null) {
					totalCost += part.cost;
				}
			}

			// Use message timestamp (messages have proper timestamps, parts don't)
			const timestampMs = message.time?.created ?? message.time?.completed ?? 0;
			if (timestampMs === 0) {
				continue;
			}

			// Skip entries without valid model information (non-Claude models or unknown)
			const model = message.modelID ?? primaryPart.modelID ?? message.model;
			if (model == null || model === 'unknown' || !model.includes('claude')) {
				continue;
			}

			// Create usage entry
			const entry: OpenCodeUsageEntry = {
				sessionId,
				projectPath: decodedProjectPath,
				encodedProjectPath: encodedProjectName,
				timestamp: new Date(timestampMs),
				model,
				provider: message.providerID ?? primaryPart.providerID ?? message.provider,
				tokens,
				cost: totalCost > 0 ? totalCost : undefined,
				messageId: message.id,
				type: message.role,
			};

			entries.push(entry);
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
		const projectsPath = join(dir, OPENCODE_PROJECTS_DIR_NAME);
		if (!existsSync(projectsPath)) {
			logger.debug('OpenCode projects directory not found:', projectsPath);
			continue;
		}

		try {
			const projects = readdirSync(projectsPath);
			for (const project of projects) {
				const projectPath = join(projectsPath, project);
				const entries = loadProjectData(projectPath);
				allEntries.push(...entries);
			}
		}
		catch (error) {
			logger.warn('Error reading OpenCode projects:', error);
		}
	}

	if (!suppressLogs) {
		logger.info(`Loaded ${allEntries.length} OpenCode usage entries`);
	}
	return allEntries;
}

// In-source tests
if (import.meta.vitest != null) {
	const { describe, it, expect } = import.meta.vitest;

	describe('Project path encoding/decoding', () => {
		it('should encode and decode paths with dashes correctly', () => {
			const originalPath = '/Users/vatsal/my-project';
			const encoded = encodeProjectPath(originalPath);
			const decoded = decodeProjectPath(encoded);
			expect(decoded).toBe(originalPath);
		});

		it('should encode and decode paths with spaces correctly', () => {
			const originalPath = '/Users/vatsal/my project';
			const encoded = encodeProjectPath(originalPath);
			const decoded = decodeProjectPath(encoded);
			expect(decoded).toBe(originalPath);
		});

		it('should encode and decode paths with special characters correctly', () => {
			const originalPath = '/Users/vatsal/project@2024';
			const encoded = encodeProjectPath(originalPath);
			const decoded = decodeProjectPath(encoded);
			expect(decoded).toBe(originalPath);
		});

		it('should handle paths without leading slash in encoder', () => {
			const pathWithoutSlash = 'Users/vatsal/my-project';
			const pathWithSlash = '/Users/vatsal/my-project';
			const encodedWithout = encodeProjectPath(pathWithoutSlash);
			const encodedWith = encodeProjectPath(pathWithSlash);
			expect(encodedWithout).toBe(encodedWith);
		});

		it('should ensure decoded paths always have leading slash', () => {
			const originalPath = '/Users/vatsal/my-project';
			const encoded = encodeProjectPath(originalPath);
			const decoded = decodeProjectPath(encoded);
			expect(decoded.startsWith('/')).toBe(true);
		});

		it('should fallback to legacy dash replacement for dash-encoded paths', () => {
			// Test with a path that looks like legacy encoding (no % characters)
			const legacyEncoded = 'Users-vatsal-my-project';
			const decoded = decodeProjectPath(legacyEncoded);
			expect(decoded).toBe('/Users/vatsal/my/project');
		});

		it('should handle complex paths with multiple special characters', () => {
			const originalPath = '/Users/vatsal/my-project (2024) #1';
			const encoded = encodeProjectPath(originalPath);
			const decoded = decodeProjectPath(encoded);
			expect(decoded).toBe(originalPath);
		});
	});
}
