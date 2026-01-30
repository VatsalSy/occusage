import { describe, expect, it } from 'vitest';
import { loadCodexData } from '../src/_codex-loader.ts';

describe('Codex rollout loader', () => {
	it('loads token usage entries from rollout JSONL', async () => {
		const { createFixture } = await import('fs-fixture');
		const sessionId = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
		const rolloutPath = `sessions/2026/01/27/rollout-2026-01-27T12-34-56-${sessionId}.jsonl`;
		const lines = [
			JSON.stringify({
				timestamp: '2026-01-27T12:34:56.000Z',
				type: 'session_meta',
				payload: {
					id: sessionId,
					timestamp: '2026-01-27T12:34:56Z',
					cwd: '/Users/test/project',
					originator: 'cli',
					cli_version: '0.0.0',
					source: 'cli',
					model_provider: 'openai',
				},
			}),
			JSON.stringify({
				timestamp: '2026-01-27T12:35:00.000Z',
				type: 'turn_context',
				payload: {
					cwd: '/Users/test/project',
					approval_policy: 'on-request',
					sandbox_policy: { type: 'read-only' },
					model: 'gpt-4o',
					summary: 'auto',
				},
			}),
			JSON.stringify({
				timestamp: '2026-01-27T12:35:05.000Z',
				type: 'event_msg',
				payload: {
					type: 'token_count',
					info: {
						total_token_usage: {
							input_tokens: 100,
							cached_input_tokens: 20,
							output_tokens: 50,
							reasoning_output_tokens: 10,
							total_tokens: 180,
						},
						last_token_usage: {
							input_tokens: 100,
							cached_input_tokens: 20,
							output_tokens: 50,
							reasoning_output_tokens: 10,
							total_tokens: 180,
						},
						model_context_window: 8192,
					},
				},
			}),
			JSON.stringify({
				timestamp: '2026-01-27T12:35:06.000Z',
				type: 'event_msg',
				payload: {
					type: 'token_count',
					info: {
						total_token_usage: {
							input_tokens: 100,
							cached_input_tokens: 20,
							output_tokens: 50,
							reasoning_output_tokens: 10,
							total_tokens: 180,
						},
						last_token_usage: {
							input_tokens: 100,
							cached_input_tokens: 20,
							output_tokens: 50,
							reasoning_output_tokens: 10,
							total_tokens: 180,
						},
						model_context_window: 8192,
					},
				},
			}),
			JSON.stringify({
				timestamp: '2026-01-27T12:36:00.000Z',
				type: 'event_msg',
				payload: {
					type: 'token_count',
					info: {
						total_token_usage: {
							input_tokens: 150,
							cached_input_tokens: 30,
							output_tokens: 70,
							reasoning_output_tokens: 20,
							total_tokens: 270,
						},
						last_token_usage: {
							input_tokens: 50,
							cached_input_tokens: 10,
							output_tokens: 20,
							reasoning_output_tokens: 10,
							total_tokens: 90,
						},
						model_context_window: 8192,
					},
				},
			}),
		].join('\n');

		await using fixture = await createFixture({
			[rolloutPath]: lines,
		});

		const result = await loadCodexData(fixture.path, true);
		expect(result).toHaveLength(2);
		expect(result[0]?.sessionId).toBe(sessionId);
		expect(result[0]?.projectPath).toBe('/Users/test/project');
		expect(result[0]?.model).toBe('gpt-4o');
		expect(result[0]?.tokens.input).toBe(100);
		expect(result[0]?.tokens.output).toBe(50);
		expect(result[0]?.tokens.cache?.read).toBe(20);
		expect(result[0]?.tokens.reasoning).toBe(10);
		expect(result[1]?.tokens.input).toBe(50);
		expect(result[1]?.tokens.output).toBe(20);
		expect(result[1]?.tokens.cache?.read).toBe(10);
		expect(result[1]?.tokens.reasoning).toBe(10);
	});
});
