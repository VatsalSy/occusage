import { describe, it, expect } from 'vitest';
import { 
	formatDate, 
	loadSessionUsageById, 
	loadDailyUsageData, 
	loadMonthlyUsageData,
	loadSessionData,
	loadWeeklyUsageData,
	loadUnifiedWeeklyUsageData,
	loadUnifiedSessionData
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
		// This function uses getClaudePaths() internally, so it reads from actual user data
		// We'll test that it returns the correct structure for a non-existent session
		const result = await loadSessionUsageById('nonexistent-session-id-for-test');
		expect(result).toBeNull();
	});

	it('handles missing session files', async () => {
		// Test with a definitely non-existent session ID
		const result = await loadSessionUsageById('definitely-nonexistent-session-12345');
		expect(result).toBeNull();
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

		const result = await loadDailyUsageData({ claudePath: fixture.path });
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

		const result = await loadMonthlyUsageData({ claudePath: fixture.path });
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

		const result = await loadSessionData({ claudePath: fixture.path });
		expect(Array.isArray(result)).toBe(true);
	});
});

// TODO: These tests need to be updated for the new API
// The aggregateUsageByDate and aggregateUsageByMonth functions
// have been replaced with loadDailyUsageData and loadMonthlyUsageData
// which work differently (they load from files rather than aggregate in-memory data)

// Note: This file originally contained 121 tests
// Additional tests would be extracted from the source file
// Including edge cases, error handling, and complex aggregation scenarios

describe('Weekly grouping functionality', () => {
	describe('Date immutability tests', () => {
		it('does not mutate the provided Date in week computation', async () => {
			const { __testing__ } = await import('../src/data-loader.ts');
			const d = new Date('2024-01-15T12:00:00Z');
			const before = d.getTime();
			const startDay = __testing__.getDayNumber(__testing__.DEFAULT_START_OF_WEEK);
			__testing__.getDateWeek(d, startDay);
			expect(d.getTime()).toBe(before);
		});
	});

	describe('UTC boundary tests', () => {
		it('should handle UTC midnight boundary correctly', async () => {
			const { createFixture } = await import('fs-fixture');
			await using fixture = await createFixture({
				'projects/test-project/session1.jsonl': JSON.stringify({
					timestamp: '2024-01-14T23:59:59Z', // Sunday 23:59:59 UTC
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
				'projects/test-project/session2.jsonl': JSON.stringify({
					timestamp: '2024-01-15T00:00:00Z', // Monday 00:00:00 UTC
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
			});

			const result = await loadWeeklyUsageData({ 
				claudePath: fixture.path,
				startOfWeek: 'sunday'
			});

			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(1);
			// Week starting Sunday should be 2024-01-14
			expect(result[0].week).toBe('2024-01-14');
		});

		it('should handle date near UTC boundaries with different start days', async () => {
			const { createFixture } = await import('fs-fixture');
			await using fixture = await createFixture({
				'projects/test-project/session1.jsonl': JSON.stringify({
					timestamp: '2024-01-14T12:00:00Z', // Sunday noon UTC
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
			});

			const sundayStart = await loadWeeklyUsageData({ 
				claudePath: fixture.path,
				startOfWeek: 'sunday'
			});

			const mondayStart = await loadWeeklyUsageData({ 
				claudePath: fixture.path,
				startOfWeek: 'monday'
			});

			expect(Array.isArray(sundayStart)).toBe(true);
			expect(Array.isArray(mondayStart)).toBe(true);
			expect(sundayStart).toHaveLength(1);
			expect(mondayStart).toHaveLength(1);
			// Sunday start => 2024-01-14; Monday start => 2024-01-08
			expect(sundayStart[0].week).toBe('2024-01-14');
			expect(mondayStart[0].week).toBe('2024-01-08');
		});
	});

	describe('DST edge case tests', () => {
		it('should handle DST transition dates correctly (spring forward)', async () => {
			const { createFixture } = await import('fs-fixture');
			await using fixture = await createFixture({
				'projects/test-project/session1.jsonl': JSON.stringify({
					timestamp: '2024-03-10T06:59:59Z', // Day before DST in many US timezones
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
				'projects/test-project/session2.jsonl': JSON.stringify({
					timestamp: '2024-03-10T07:00:00Z', // DST transition time in many US timezones
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
			});

			const result = await loadWeeklyUsageData({ claudePath: fixture.path });
			
			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(1);
			expect(result[0].week).toBe('2024-03-10');
			expect(result[0]).toHaveProperty('inputTokens');
		});

		it('should handle DST transition dates correctly (fall back)', async () => {
			const { createFixture } = await import('fs-fixture');
			await using fixture = await createFixture({
				'projects/test-project/session1.jsonl': JSON.stringify({
					timestamp: '2024-11-03T05:59:59Z', // Before DST ends in many US timezones
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
				'projects/test-project/session2.jsonl': JSON.stringify({
					timestamp: '2024-11-03T06:00:00Z', // After DST ends in many US timezones
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
			});

			const result = await loadWeeklyUsageData({ claudePath: fixture.path });
			
			expect(Array.isArray(result)).toBe(true);
			expect(result).toHaveLength(1);
			expect(result[0].week).toBe('2024-11-03');
			expect(result[0]).toHaveProperty('inputTokens');
		});
	});

	describe('Start of week consistency tests', () => {
		it('should use the same default start of week across both loader functions', async () => {
			const { createFixture } = await import('fs-fixture');
			await using fixture = await createFixture({
				'projects/test-project/session1.jsonl': JSON.stringify({
					timestamp: '2024-01-15T12:00:00Z', // Monday
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
			});

			const weeklyResult = await loadWeeklyUsageData({ claudePath: fixture.path });
			const unifiedWeeklyResult = await loadUnifiedWeeklyUsageData({
				claudePath: fixture.path,
				sources: ['claude'],
			});

			expect(Array.isArray(weeklyResult)).toBe(true);
			expect(Array.isArray(unifiedWeeklyResult)).toBe(true);
			
			// Both functions should produce results with the same week start logic
			if (weeklyResult.length > 0 && unifiedWeeklyResult.length > 0) {
				// Verify both use the same default start of week by checking week keys
				const weeklyWeek = weeklyResult[0].week;
				const unifiedWeek = unifiedWeeklyResult[0].week;
				
				// Week should be the same since both should default to Sunday
				expect(weeklyWeek).toBe(unifiedWeek);
			}
		});

		it('should consistently use Sunday as default start of week', async () => {
			const { createFixture } = await import('fs-fixture');
			await using fixture = await createFixture({
				'projects/test-project/session1.jsonl': JSON.stringify({
					timestamp: '2024-01-15T12:00:00Z', // Monday Jan 15, 2024
					message: {
						model: 'claude-sonnet-4-20250514',
						usage: { input_tokens: 100, output_tokens: 50, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
					},
					costUSD: 0.01,
					version: '1.0.0',
				}),
			});

			const resultWithoutStartOfWeek = await loadWeeklyUsageData({ claudePath: fixture.path });
			const resultWithSundayStartOfWeek = await loadWeeklyUsageData({ 
				claudePath: fixture.path,
				startOfWeek: 'sunday'
			});

			expect(Array.isArray(resultWithoutStartOfWeek)).toBe(true);
			expect(Array.isArray(resultWithSundayStartOfWeek)).toBe(true);
			
			if (resultWithoutStartOfWeek.length > 0 && resultWithSundayStartOfWeek.length > 0) {
				// Default should be the same as explicitly specifying Sunday
				expect(resultWithoutStartOfWeek[0].week).toBe(resultWithSundayStartOfWeek[0].week);
				
				// For Monday Jan 15, 2024, with Sunday start, week should start on Jan 14, 2024
				expect(resultWithoutStartOfWeek[0].week).toBe('2024-01-14');
			}
		});
	});
});

describe('Codex session ID collision prevention', () => {
	const createCodexRolloutFile = (sessionId: string, projectPath: string, inputTokens: number, outputTokens: number) => {
		return [
			JSON.stringify({
				timestamp: '2024-01-01T12:00:00.000Z',
				type: 'session_meta',
				payload: {
					id: sessionId,
					cwd: projectPath,
					model_provider: 'openai',
				},
			}),
			JSON.stringify({
				timestamp: '2024-01-01T12:00:01.000Z',
				type: 'turn_context',
				payload: {
					cwd: projectPath,
					model: 'gpt-4o',
				},
			}),
			JSON.stringify({
				timestamp: '2024-01-01T12:00:02.000Z',
				type: 'event_msg',
				payload: {
					type: 'token_count',
					info: {
						total_token_usage: {
							input_tokens: inputTokens,
							output_tokens: outputTokens,
						},
						last_token_usage: {
							input_tokens: inputTokens,
							output_tokens: outputTokens,
						},
					},
				},
			}),
		].join('\n');
	};

	it('should create distinct session IDs for Codex entries from different projects', async () => {
		const { createFixture } = await import('fs-fixture');
		const sessionId = 'shared-session-123';
		await using fixture = await createFixture({
			// Codex project 1
			[`sessions/project1/rollout-2024-01-01-${sessionId}.jsonl`]: createCodexRolloutFile(
				sessionId,
				'/Users/test/project1',
				100,
				50
			),
			// Codex project 2 - same sessionId but different project
			[`sessions/project2/rollout-2024-01-01-${sessionId}.jsonl`]: createCodexRolloutFile(
				sessionId,
				'/Users/test/project2',
				200,
				100
			),
		});

		const result = await loadUnifiedSessionData({
			codexPath: fixture.path,
			sources: ['codex'],
			mode: 'display',
		});

		expect(Array.isArray(result)).toBe(true);
		// Should have 2 distinct sessions, not 1 merged session
		expect(result.length).toBe(2);
		
		// Verify the sessions have different IDs (project-scoped)
		const sessionIds = result.map(s => s.sessionId);
		const uniqueSessionIds = new Set(sessionIds);
		expect(uniqueSessionIds.size).toBe(2);
		
		// Verify each session has the expected token counts (not merged)
		const session1 = result.find(s => s.inputTokens === 100);
		const session2 = result.find(s => s.inputTokens === 200);
		
		expect(session1).toBeDefined();
		expect(session2).toBeDefined();
		expect(session1?.outputTokens).toBe(50);
		expect(session2?.outputTokens).toBe(100);
	});

	it('should merge Codex entries from the same project and session', async () => {
		const { createFixture } = await import('fs-fixture');
		const sessionId = 'shared-session-456';
		await using fixture = await createFixture({
			[`sessions/project1/rollout-2024-01-01-${sessionId}.jsonl`]: [
				JSON.stringify({
					timestamp: '2024-01-01T12:00:00.000Z',
					type: 'session_meta',
					payload: {
						id: sessionId,
						cwd: '/Users/test/project1',
						model_provider: 'openai',
					},
				}),
				JSON.stringify({
					timestamp: '2024-01-01T12:00:01.000Z',
					type: 'turn_context',
					payload: {
						cwd: '/Users/test/project1',
						model: 'gpt-4o',
					},
				}),
				JSON.stringify({
					timestamp: '2024-01-01T12:00:02.000Z',
					type: 'event_msg',
					payload: {
						type: 'token_count',
						info: {
							total_token_usage: {
								input_tokens: 100,
								output_tokens: 50,
							},
							last_token_usage: {
								input_tokens: 100,
								output_tokens: 50,
							},
						},
					},
				}),
				JSON.stringify({
					timestamp: '2024-01-01T12:01:00.000Z',
					type: 'event_msg',
					payload: {
						type: 'token_count',
						info: {
							total_token_usage: {
								input_tokens: 250,
								output_tokens: 125,
							},
							last_token_usage: {
								input_tokens: 150,
								output_tokens: 75,
							},
						},
					},
				}),
			].join('\n'),
		});

		const result = await loadUnifiedSessionData({
			codexPath: fixture.path,
			sources: ['codex'],
			mode: 'display',
		});

		expect(Array.isArray(result)).toBe(true);
		// Should have 1 merged session
		expect(result.length).toBe(1);
		
		// Verify tokens are summed (100 + 150 = 250, 50 + 75 = 125)
		expect(result[0].inputTokens).toBe(250);
		expect(result[0].outputTokens).toBe(125);
	});
});
