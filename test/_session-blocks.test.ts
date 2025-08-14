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

	it('calculates burn rate for active blocks using elapsed time since block start', () => {
		const now = new Date();
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
		const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);
		
		const mockBlock = {
			id: 'test-block',
			startTime: oneHourAgo, // Block started 1 hour ago
			endTime: new Date(now.getTime() + 4 * 60 * 60 * 1000), // 5 hour block
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
					timestamp: thirtyMinutesAgo, // All activity compressed into 30 minutes
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
			// Burn rate should be based on 60 minutes elapsed (since block start), not 30 minutes (between entries)
			// Expected: 1500 tokens / 60 minutes = 25 tokens/minute
			expect(result.tokensPerMinute).toBeCloseTo(25, 1);
			// tokensPerMinuteForIndicator uses only input + output tokens (1000 + 500 = 1500 tokens / 60 minutes = 25)
			expect(result.tokensPerMinuteForIndicator).toBeCloseTo(25, 1);
		}
	});

	it('calculates burn rate for completed blocks using time between entries', () => {
		const now = new Date();
		const twoHoursAgo = new Date(now.getTime() - 2 * 60 * 60 * 1000);
		const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
		
		const mockBlock = {
			id: 'test-block-completed',
			startTime: twoHoursAgo,
			endTime: oneHourAgo,
			actualEndTime: oneHourAgo,
			entries: [
				{
					source: 'claude' as const,
					timestamp: twoHoursAgo,
					usage: {
						inputTokens: 600,
						outputTokens: 300,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0
					},
					costUSD: 0.006,
					model: 'claude-sonnet-4-20250514'
				},
				{
					source: 'claude' as const,
					timestamp: oneHourAgo,
					usage: {
						inputTokens: 400,
						outputTokens: 200,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0
					},
					costUSD: 0.004,
					model: 'claude-sonnet-4-20250514'
				}
			],
			tokenCounts: { inputTokens: 1000, outputTokens: 500, cacheCreationInputTokens: 0, cacheReadInputTokens: 0 },
			costUSD: 0.01,
			models: ['claude-sonnet-4-20250514'],
			sources: ['claude' as const],
			isActive: false
		};
		
		const result = calculateBurnRate(mockBlock);
		expect(result).not.toBeNull();
		if (result) {
			// For completed blocks, should use time between entries (60 minutes)
			// Expected: 1500 tokens / 60 minutes = 25 tokens/minute
			expect(result.tokensPerMinute).toBeCloseTo(25, 1);
		}
	});

	it('enforces minimum duration to prevent extreme burn rates', () => {
		const now = new Date();
		const fiveSecondsAgo = new Date(now.getTime() - 5 * 1000); // Very short burst
		
		const mockBlock = {
			id: 'test-block-burst',
			startTime: fiveSecondsAgo,
			endTime: new Date(now.getTime() + 5 * 60 * 60 * 1000),
			entries: [
				{
					source: 'claude' as const,
					timestamp: fiveSecondsAgo,
					usage: {
						inputTokens: 1000,
						outputTokens: 500,
						cacheCreationInputTokens: 0,
						cacheReadInputTokens: 0
					},
					costUSD: 0.01,
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
			// Should use minimum 1 minute duration to prevent extreme rates
			// Expected: 1500 tokens / 1 minute = 1500 tokens/minute (not 18,000+)
			expect(result.tokensPerMinute).toBeCloseTo(1500, 1);
			expect(result.tokensPerMinute).toBeLessThan(2000); // Sanity check
		}
	});
});

// Additional tests would be extracted from source file (33 total)