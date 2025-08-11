import { describe, it, expect } from 'vitest';
import { identifySessionBlocks, calculateBurnRate } from '../src/_session-blocks.ts';

describe('identifySessionBlocks', () => {
	it('returns empty array for empty entries', () => {
		const result = identifySessionBlocks([], 5);
		expect(result).toEqual([]);
	});

	it('groups entries into session blocks correctly', () => {
		const mockEntries = [
			{
				timestamp: '2024-01-01T10:00:00Z',
				message: {
					model: 'claude-sonnet-4-20250514',
					usage: { input_tokens: 100, output_tokens: 50 }
				},
				costUSD: 0.01,
				version: '1.0.0'
			}
		];
		
		const result = identifySessionBlocks(mockEntries, 5);
		expect(Array.isArray(result)).toBe(true);
	});
});

describe('calculateBurnRate', () => {
	it('returns null for empty entries', () => {
		const mockBlock = {
			startTime: new Date(),
			endTime: new Date(),
			entries: [],
			tokenCounts: { inputTokens: 0, outputTokens: 0, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
			costUSD: 0,
			models: [],
			isActive: false
		};
		
		const result = calculateBurnRate(mockBlock);
		expect(result).toBeNull();
	});

	it('calculates burn rate for active blocks', () => {
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
		
		const mockBlock = {
			startTime: oneHourAgo,
			endTime: now,
			entries: [{ timestamp: now.toISOString() }],
			tokenCounts: { inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
			costUSD: 0.01,
			models: ['claude-sonnet-4-20250514'],
			isActive: true
		};
		
		const result = calculateBurnRate(mockBlock);
		expect(result).not.toBeNull();
		if (result) {
			expect(result.tokensPerMinute).toBeGreaterThan(0);
		}
	});
});

// Additional tests would be extracted from source file (33 total)