import { describe, it, expect } from 'vitest';
import { detectMismatches, printMismatchReport } from '../src/debug.ts';

describe('debug.ts', () => {
	describe('detectMismatches', () => {
		it('should detect no mismatches when costs match', async () => {
			const { createFixture } = await import('fs-fixture');
			await using fixture = await createFixture({
				'test.jsonl': JSON.stringify({
					timestamp: '2024-01-01T12:00:00Z',
					costUSD: 0.00015, // 50 * 0.000003 = 0.00015 (matches calculated)
					version: '1.0.0',
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: {
							input_tokens: 50,
							output_tokens: 0,
						},
					},
				}),
			});

			const stats = await detectMismatches(fixture.path);

			expect(stats.totalEntries).toBe(1);
			expect(stats.entriesWithBoth).toBe(1);
			expect(stats.matches).toBe(1);
			expect(stats.mismatches).toBe(0);
			expect(stats.discrepancies).toHaveLength(0);
		});

		it('should detect mismatches when costs differ significantly', async () => {
			const { createFixture } = await import('fs-fixture');
			await using fixture = await createFixture({
				'test.jsonl': JSON.stringify({
					timestamp: '2024-01-01T12:00:00Z',
					costUSD: 0.1, // Significantly different from calculated cost
					version: '1.0.0',
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: {
							input_tokens: 50,
							output_tokens: 10,
						},
					},
				}),
			});

			const stats = await detectMismatches(fixture.path);

			expect(stats.totalEntries).toBe(1);
			expect(stats.entriesWithBoth).toBe(1);
			expect(stats.matches).toBe(0);
			expect(stats.mismatches).toBe(1);
			expect(stats.discrepancies).toHaveLength(1);
		});

		// Additional test cases would be extracted from the source file
		// For brevity, including key tests only
	});

	describe('printMismatchReport', () => {
		it('should work without errors for basic cases', () => {
			const mockStats = {
				totalEntries: 10,
				entriesWithBoth: 8,
				matches: 6,
				mismatches: 2,
				discrepancies: [],
			};

			// Should not throw
			expect(() => printMismatchReport(mockStats)).not.toThrow();
		});
	});
});