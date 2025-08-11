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
				source: 'claude' as const,
				timestamp: new Date('2024-01-01T10:00:00Z'),
				usage: {
					inputTokens: 100,
					outputTokens: 50,
					cacheCreationInputTokens: 0,
					cacheReadInputTokens: 0
				},
				costUSD: 0.01,
				model: 'claude-sonnet-4-20250514',
				version: '1.0.0'
			}
		];
		
		const result = identifySessionBlocks(mockEntries, 5);
		expect(Array.isArray(result)).toBe(true);
		expect(result.length).toBeGreaterThan(0);
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
		const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
		
		const mockBlock = {
			startTime: oneHourAgo,
			endTime: now,
			entries: [
				{
					source: 'claude' as const,
					timestamp: oneHourAgo,
					usage: {
						inputTokens: 500,
						outputTokens: 250,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0
					},
					costUSD: 0.005,
					model: 'claude-sonnet-4-20250514'
				},
				{
					source: 'claude' as const,
					timestamp: thirtyMinutesAgo,
					usage: {
						inputTokens: 500,
						outputTokens: 250,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0
					},
					costUSD: 0.005,
					model: 'claude-sonnet-4-20250514'
				}
			],
			tokenCounts: { inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
			costUSD: 0.01,
			models: ['claude-sonnet-4-20250514'],
			sources: ['claude' as const],
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