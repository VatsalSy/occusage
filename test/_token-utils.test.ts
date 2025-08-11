import { describe, it, expect } from 'vitest';
import { getTotalTokens } from '../src/_token-utils.ts';
import type { TokenCounts, AggregatedTokenCounts } from '../src/_types.ts';

describe('getTotalTokens', () => {
	it('should sum all token types correctly (raw format)', () => {
		const tokens: TokenCounts = {
			inputTokens: 1000,
			outputTokens: 500,
			cacheCreationInputTokens: 2000,
			cacheReadInputTokens: 300,
		};
		expect(getTotalTokens(tokens)).toBe(3800);
	});

	it('should sum all token types correctly (aggregated format)', () => {
		const tokens: AggregatedTokenCounts = {
			inputTokens: 1000,
			outputTokens: 500,
			cacheCreationTokens: 2000,
			cacheReadTokens: 300,
		};
		expect(getTotalTokens(tokens)).toBe(3800);
	});

	it('should handle zero values (raw format)', () => {
		const tokens: TokenCounts = {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		};
		expect(getTotalTokens(tokens)).toBe(0);
	});

	it('should handle zero values (aggregated format)', () => {
		const tokens: AggregatedTokenCounts = {
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
		};
		expect(getTotalTokens(tokens)).toBe(0);
	});

	it('should handle missing cache tokens (raw format)', () => {
		const tokens: TokenCounts = {
			inputTokens: 1000,
			outputTokens: 500,
			cacheCreationInputTokens: 0,
			cacheReadInputTokens: 0,
		};
		expect(getTotalTokens(tokens)).toBe(1500);
	});

	it('should handle missing cache tokens (aggregated format)', () => {
		const tokens: AggregatedTokenCounts = {
			inputTokens: 1000,
			outputTokens: 500,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
		};
		expect(getTotalTokens(tokens)).toBe(1500);
	});
});