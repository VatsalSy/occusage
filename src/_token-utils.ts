/**
 * @fileoverview Token calculation utilities
 *
 * This module provides shared utilities for calculating token totals
 * across different token types. Used throughout the application to
 * ensure consistent token counting logic.
 */

/**
 * Token counts structure for raw usage data (uses InputTokens suffix)
 */
export type TokenCounts = {
	inputTokens: number;
	outputTokens: number;
	cacheCreationInputTokens: number;
	cacheReadInputTokens: number;
};

/**
 * Token counts structure for aggregated data (uses shorter names)
 */
export type AggregatedTokenCounts = {
	inputTokens: number;
	outputTokens: number;
	cacheCreationTokens: number;
	cacheReadTokens: number;
};

/**
 * Union type that supports both token count formats
 */
export type AnyTokenCounts = TokenCounts | AggregatedTokenCounts;

/**
 * Calculates the total number of tokens across all token types
 * Supports both raw usage data format and aggregated data format
 * @param tokenCounts - Object containing counts for each token type
 * @returns Total number of tokens
 */
export function getTotalTokens(tokenCounts: AnyTokenCounts): number {
	// Support both property naming conventions, defaulting to 0 for undefined fields
	const cacheCreation = 'cacheCreationInputTokens' in tokenCounts
		? (tokenCounts.cacheCreationInputTokens ?? 0)
		: ((tokenCounts as any).cacheCreationTokens ?? 0);

	const cacheRead = 'cacheReadInputTokens' in tokenCounts
		? (tokenCounts.cacheReadInputTokens ?? 0)
		: ((tokenCounts as any).cacheReadTokens ?? 0);

	return (
		(tokenCounts.inputTokens ?? 0)
		+ (tokenCounts.outputTokens ?? 0)
		+ cacheCreation
		+ cacheRead
	);
}

// In-source testing

