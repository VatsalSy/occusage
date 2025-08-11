import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { LiveMonitor } from '../src/_live-monitor.ts';

describe('LiveMonitor', () => {
	let tempDir: string;
	let monitor: LiveMonitor;

	beforeEach(async () => {
		const { createFixture } = await import('fs-fixture');
		const now = new Date();
		const recentTimestamp = new Date(now.getTime() - 60 * 60 * 1000); // 1 hour ago

		const fixture = await createFixture({
			'projects/test-project/session1.jsonl': `${JSON.stringify({
				timestamp: recentTimestamp.toISOString(),
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
			})}\n`,
		});
		tempDir = fixture.path;

		monitor = new LiveMonitor({
			claudePaths: [tempDir],
			sessionDurationHours: 5,
			mode: 'display',
			order: 'desc',
		});
	});

	afterEach(() => {
		monitor[Symbol.dispose]();
	});

	it('should initialize and handle clearing cache', async () => {
		// Test initial state by calling getActiveBlock which should work
		const initialBlock = await monitor.getActiveBlock();
		expect(initialBlock).not.toBeNull();

		// Clear cache and test again
		monitor.clearCache();
		const afterClearBlock = await monitor.getActiveBlock();
		expect(afterClearBlock).not.toBeNull();
	});

	it('should load and process usage data', async () => {
		const activeBlock = await monitor.getActiveBlock();

		expect(activeBlock).not.toBeNull();
		if (activeBlock != null) {
			expect(activeBlock.tokenCounts.inputTokens).toBe(100);
			expect(activeBlock.tokenCounts.outputTokens).toBe(50);
			expect(activeBlock.costUSD).toBe(0.01);
			expect(activeBlock.models).toContain('claude-sonnet-4-20250514');
		}
	});

	it('should handle empty directories', async () => {
		const { createFixture } = await import('fs-fixture');
		const emptyFixture = await createFixture({});

		const emptyMonitor = new LiveMonitor({
			claudePaths: [emptyFixture.path],
			sessionDurationHours: 5,
			mode: 'display',
			order: 'desc',
		});

		const activeBlock = await emptyMonitor.getActiveBlock();
		expect(activeBlock).toBeNull();

		emptyMonitor[Symbol.dispose]();
	});
});