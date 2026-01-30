/**
 * @fileoverview Model normalization and classification utilities
 */

const PROVIDER_PREFIXES = new Set([
	'anthropic',
	'openai',
	'openrouter',
	'bedrock',
	'vertex',
	'azure',
	'google',
	'google-ai-studio',
	'mistral',
	'cohere',
]);

/**
 * Normalize model identifier strings to a comparable canonical form.
 * - lowercases
 * - strips provider prefixes like "openai/", "openai:", "openrouter/", etc.
 * - trims whitespace
 * - prefixes known Claude alias families (sonnet/opus/haiku) with "claude-"
 */
export function normalizeModelId(modelId?: string): string | null {
	if (modelId == null) return null;
	let s = modelId.trim().toLowerCase();
	if (s === '') return null;

	// Remove provider prefixes repeatedly (e.g., openrouter/openai/gpt-4o)
	let changed = true;
	while (changed) {
		changed = false;
		const match = s.match(/^([a-z0-9_-]+)[/:](.+)$/);
		if (match?.[1] != null && match[2] != null && PROVIDER_PREFIXES.has(match[1])) {
			s = match[2];
			changed = true;
		}
	}

	// If starts with Claude family alias, prefix claude-
	if (/^(sonnet|opus|haiku)(-|$)/.test(s) && !s.startsWith('claude-')) {
		s = `claude-${s}`;
	}

	return s;
}

export function isClaudeModel(normalizedModel: string | null): boolean {
	if (normalizedModel == null) return false;
	return normalizedModel.includes('claude');
}

export function isOpenAIModel(normalizedModel: string | null, providerId?: string | null): boolean {
	if (normalizedModel == null) return false;
	const provider = providerId?.toLowerCase();
	if (provider != null && provider.includes('openai')) {
		return true;
	}
	// Allow OpenAI families: gpt-*, o1/o3/o4..., codex-* (and codex in name)
	if (/^(gpt|o\d)(-|$)/.test(normalizedModel)) {
		return true;
	}
	if (normalizedModel.includes('codex')) {
		return true;
	}
	return false;
}

export function isSupportedModel(normalizedModel: string | null, providerId?: string | null): boolean {
	return isClaudeModel(normalizedModel) || isOpenAIModel(normalizedModel, providerId);
}
