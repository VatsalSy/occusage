import type { CodexUsageEntry } from './_codex-types.ts';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join, resolve, basename } from 'node:path';
import process from 'node:process';
import { glob } from 'tinyglobby';
import {
	CODEX_ARCHIVED_SESSIONS_DIR_NAME,
	CODEX_HOME_ENV,
	CODEX_SESSIONS_DIR_NAME,
	DEFAULT_CODEX_HOME_PATH,
	USER_HOME_DIR,
} from './_consts.ts';
import { codexUsageEntrySchema } from './_codex-types.ts';
import { isSupportedModel, normalizeModelId } from './_model-utils.ts';
import { logger } from './logger.ts';

function getCodexHomes(): string[] {
	const envHome = (process.env[CODEX_HOME_ENV] ?? '').trim();
	if (envHome !== '') {
		return [resolve(envHome)];
	}
	const defaultHome = join(USER_HOME_DIR, DEFAULT_CODEX_HOME_PATH);
	if (existsSync(defaultHome)) {
		return [defaultHome];
	}
	return [];
}

function deriveSessionIdFromFilename(filePath: string): string {
	const fileBase = basename(filePath, '.jsonl');
	const match = fileBase.match(/rollout-[0-9T\-:]+-([0-9a-fA-F-]{36})/);
	return match?.[1] ?? fileBase;
}

type RolloutLine = {
	timestamp?: string;
	type?: string;
	payload?: unknown;
};

type TokenUsage = {
	input_tokens?: number;
	cached_input_tokens?: number;
	output_tokens?: number;
	reasoning_output_tokens?: number;
	total_tokens?: number;
};

function parseTokenUsage(raw: unknown): TokenUsage | null {
	if (raw == null || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	return {
		input_tokens: typeof obj.input_tokens === 'number' ? obj.input_tokens : undefined,
		cached_input_tokens: typeof obj.cached_input_tokens === 'number' ? obj.cached_input_tokens : undefined,
		output_tokens: typeof obj.output_tokens === 'number' ? obj.output_tokens : undefined,
		reasoning_output_tokens: typeof obj.reasoning_output_tokens === 'number' ? obj.reasoning_output_tokens : undefined,
		total_tokens: typeof obj.total_tokens === 'number' ? obj.total_tokens : undefined,
	};
}

function computeTokenDelta(current: TokenUsage, previous: TokenUsage | null): TokenUsage {
	const prev = previous ?? {};
	return {
		input_tokens: (current.input_tokens ?? 0) - (prev.input_tokens ?? 0),
		cached_input_tokens: (current.cached_input_tokens ?? 0) - (prev.cached_input_tokens ?? 0),
		output_tokens: (current.output_tokens ?? 0) - (prev.output_tokens ?? 0),
		reasoning_output_tokens: (current.reasoning_output_tokens ?? 0) - (prev.reasoning_output_tokens ?? 0),
		total_tokens: (current.total_tokens ?? 0) - (prev.total_tokens ?? 0),
	};
}

function hasNegativeDelta(delta: TokenUsage): boolean {
	return (delta.input_tokens ?? 0) < 0
		|| (delta.cached_input_tokens ?? 0) < 0
		|| (delta.output_tokens ?? 0) < 0
		|| (delta.reasoning_output_tokens ?? 0) < 0;
}

function hasAnyTokenDelta(delta: TokenUsage): boolean {
	return (delta.input_tokens ?? 0) > 0
		|| (delta.cached_input_tokens ?? 0) > 0
		|| (delta.output_tokens ?? 0) > 0
		|| (delta.reasoning_output_tokens ?? 0) > 0;
}

function parseRolloutLine(raw: unknown): RolloutLine | null {
	if (raw == null || typeof raw !== 'object') return null;
	const obj = raw as Record<string, unknown>;
	return {
		timestamp: typeof obj.timestamp === 'string' ? obj.timestamp : undefined,
		type: typeof obj.type === 'string' ? obj.type : undefined,
		payload: obj.payload,
	};
}

async function parseCodexFile(filePath: string): Promise<CodexUsageEntry[]> {
	const entries: CodexUsageEntry[] = [];
	let sessionId: string | undefined;
	let sessionCwd: string | undefined;
	let modelProvider: string | undefined;
	let currentModel: string | undefined;
	let currentCwd: string | undefined;
	let lastTotalUsage: TokenUsage | null = null;

	const fallbackSessionId = deriveSessionIdFromFilename(filePath);

	const content = await readFile(filePath, 'utf-8');
	const lines = content.split('\n').filter(line => line.trim().length > 0);

	for (const line of lines) {
		let parsed: unknown;
		try {
			parsed = JSON.parse(line) as unknown;
		} catch {
			continue;
		}

		const rolloutLine = parseRolloutLine(parsed);
		if (rolloutLine == null) continue;

		const lineType = rolloutLine.type;
		const payload = rolloutLine.payload;
		if (lineType == null) continue;

		if (lineType === 'session_meta' && payload != null && typeof payload === 'object') {
			const meta = payload as Record<string, unknown>;
			if (typeof meta.id === 'string') {
				sessionId = meta.id;
			}
			if (typeof meta.cwd === 'string') {
				sessionCwd = meta.cwd;
			}
			if (typeof meta.model_provider === 'string') {
				modelProvider = meta.model_provider;
			}
			continue;
		}

		if (lineType === 'turn_context' && payload != null && typeof payload === 'object') {
			const ctx = payload as Record<string, unknown>;
			if (typeof ctx.model === 'string') {
				currentModel = ctx.model;
			}
			if (typeof ctx.cwd === 'string') {
				currentCwd = ctx.cwd;
			}
			continue;
		}

		if (lineType === 'event_msg' && payload != null && typeof payload === 'object') {
			const event = payload as Record<string, unknown>;
			const eventType = typeof event.type === 'string' ? event.type : undefined;

			if (eventType === 'session_configured') {
				if (typeof event.model === 'string') {
					currentModel = event.model;
				}
				if (typeof event.cwd === 'string') {
					currentCwd = event.cwd;
				}
				if (typeof event.model_provider_id === 'string') {
					modelProvider = event.model_provider_id;
				}
				continue;
			}

			if (eventType === 'token_count') {
				const info = event.info as Record<string, unknown> | undefined;
				const totalUsage = parseTokenUsage(info?.total_token_usage);
				const lastUsage = parseTokenUsage(info?.last_token_usage);
				if (totalUsage == null && lastUsage == null) {
					continue;
				}

				const rawModel = currentModel;
				const normalized = normalizeModelId(rawModel ?? undefined);
				if (!isSupportedModel(normalized, modelProvider)) {
					continue;
				}

				const timestamp = rolloutLine.timestamp;
				if (timestamp == null || Number.isNaN(Date.parse(timestamp))) {
					continue;
				}

				let usage: TokenUsage | null = null;
				if (totalUsage != null) {
					const delta = computeTokenDelta(totalUsage, lastTotalUsage);
					lastTotalUsage = totalUsage;
					if (hasNegativeDelta(delta)) {
						usage = lastUsage;
					}
					else if (hasAnyTokenDelta(delta)) {
						usage = delta;
					}
					else {
						// Duplicate token_count event with no delta; skip to avoid double counting
						continue;
					}
				}

				if (usage == null) {
					usage = lastUsage;
				}

				if (usage == null) {
					continue;
				}

				const inputTokens = usage.input_tokens ?? 0;
				const cachedInputTokens = usage.cached_input_tokens ?? 0;
				const reasoningTokens = usage.reasoning_output_tokens ?? 0;
				const outputTokens = usage.output_tokens ?? 0;

				const projectPath = currentCwd ?? sessionCwd ?? 'unknown';

				const candidate = {
					sessionId: sessionId ?? fallbackSessionId,
					projectPath,
					timestamp: new Date(timestamp),
					model: rawModel ?? 'unknown',
					provider: modelProvider,
					tokens: {
						input: inputTokens,
						output: outputTokens,
						...(cachedInputTokens > 0 ? { cache: { read: cachedInputTokens } } : {}),
						...(reasoningTokens > 0 ? { reasoning: reasoningTokens } : {}),
					},
				};

				const validated = codexUsageEntrySchema.safeParse(candidate);
				if (!validated.success) {
					logger.debug('Skipping invalid Codex entry:', validated.error.message);
					continue;
				}

				entries.push(validated.data);
			}
		}
	}

	return entries;
}

/**
 * Load Codex usage data from CODEX_HOME rollout JSONL files.
 */
export async function loadCodexData(codexHome?: string, suppressLogs = false): Promise<CodexUsageEntry[]> {
	const homes = codexHome != null ? [resolve(codexHome)] : getCodexHomes();
	const allEntries: CodexUsageEntry[] = [];

	for (const home of homes) {
		const sessionsDir = join(home, CODEX_SESSIONS_DIR_NAME);
		const archivedDir = join(home, CODEX_ARCHIVED_SESSIONS_DIR_NAME);

		for (const dir of [sessionsDir, archivedDir]) {
			if (!existsSync(dir)) {
				continue;
			}

			const files = await glob(['**/rollout-*.jsonl'], {
				cwd: dir,
				absolute: true,
			}).catch(() => []);

		const parsePromises = files.map(async (file) => {
			try {
				return await parseCodexFile(file);
			} catch (error) {
				if (!suppressLogs) {
					logger.debug('Failed to parse Codex rollout file:', file, error);
				}
				return [];
			}
		});

		const results = await Promise.all(parsePromises);
		allEntries.push(...results.flat());
		}
	}

	if (!suppressLogs) {
		logger.info(`Loaded ${allEntries.length} Codex usage entries`);
	}
	return allEntries;
}
