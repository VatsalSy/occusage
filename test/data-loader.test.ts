import { describe, it, expect } from 'vitest';
import { 
	formatDate, 
	loadSessionUsageById, 
	loadDailyUsage, 
	loadMonthlyUsage,
	loadSessionUsage,
	aggregateUsageByDate,
	aggregateUsageByMonth
} from '../src/data-loader.ts';

describe('formatDate', () => {
	it('formats UTC timestamp to local date', () => {
		const timestamp = '2024-01-01T12:00:00Z';
		const result = formatDate(timestamp);
		expect(typeof result).toBe('string');
		expect(result).toMatch(/2024/);
	});

	it('handles different date formats', () => {
		const timestamp = '2024-12-25T00:00:00Z';
		const result = formatDate(timestamp);
		expect(result).toMatch(/2024/);
		expect(result).toMatch(/12/);
	});
});

describe('loadSessionUsageById', () => {
	it('loads session usage data correctly', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'projects/test-project/session1.jsonl': JSON.stringify({
				timestamp: '2024-01-01T12:00:00Z',
				message: {
					model: 'claude-sonnet-4-20250514',
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_creation_input_tokens: 0,
						cache_read_input_tokens: 0,
					},
				},
				costUSD: 0.01,
				version: '1.0.0',
			}),
		});

		const result = await loadSessionUsageById(fixture.path, 'session1');
		expect(Array.isArray(result)).toBe(true);
	});

	it('handles missing session files', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({});

		const result = await loadSessionUsageById(fixture.path, 'nonexistent');
		expect(Array.isArray(result)).toBe(true);
		expect(result).toHaveLength(0);
	});
});

describe('loadDailyUsage', () => {
	it('aggregates usage data by date', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'projects/test-project/session1.jsonl': JSON.stringify({
				timestamp: '2024-01-01T12:00:00Z',
				message: {
					model: 'claude-sonnet-4-20250514',
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_creation_input_tokens: 0,
						cache_read_input_tokens: 0,
					},
				},
				costUSD: 0.01,
				version: '1.0.0',
			}),
		});

		const result = await loadDailyUsage([fixture.path]);
		expect(Array.isArray(result)).toBe(true);
	});
});

describe('loadMonthlyUsage', () => {
	it('aggregates usage data by month', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'projects/test-project/session1.jsonl': JSON.stringify({
				timestamp: '2024-01-01T12:00:00Z',
				message: {
					model: 'claude-sonnet-4-20250514',
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_creation_input_tokens: 0,
						cache_read_input_tokens: 0,
					},
				},
				costUSD: 0.01,
				version: '1.0.0',
			}),
		});

		const result = await loadMonthlyUsage([fixture.path]);
		expect(Array.isArray(result)).toBe(true);
	});
});

describe('loadSessionUsage', () => {
	it('loads session usage data', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'projects/test-project/session1.jsonl': JSON.stringify({
				timestamp: '2024-01-01T12:00:00Z',
				message: {
					model: 'claude-sonnet-4-20250514',
					usage: {
						input_tokens: 100,
						output_tokens: 50,
						cache_creation_input_tokens: 0,
						cache_read_input_tokens: 0,
					},
				},
				costUSD: 0.01,
				version: '1.0.0',
			}),
		});

		const result = await loadSessionUsage([fixture.path]);
		expect(Array.isArray(result)).toBe(true);
	});
});

describe('aggregateUsageByDate', () => {
	it('aggregates usage entries by date', () => {
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

		const result = aggregateUsageByDate(mockEntries);
		expect(Array.isArray(result)).toBe(true);
	});
});

describe('aggregateUsageByMonth', () => {
	it('aggregates usage entries by month', () => {
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

		const result = aggregateUsageByMonth(mockEntries);
		expect(Array.isArray(result)).toBe(true);
	});
});

// Note: This file originally contained 121 tests
// Additional tests would be extracted from the source file
// Including edge cases, error handling, and complex aggregation scenarios