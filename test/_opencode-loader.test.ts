import { describe, it, expect } from 'vitest';
import { decodeProjectPath, encodeProjectPath, loadOpenCodeData } from '../src/_opencode-loader.ts';

describe('Project path encoding/decoding', () => {
	it('should encode and decode paths with dashes correctly', () => {
		const originalPath = '/Users/vatsal/my-project';
		const encoded = encodeProjectPath(originalPath);
		const decoded = decodeProjectPath(encoded);
		expect(decoded).toBe(originalPath);
	});

	it('should encode and decode paths with spaces correctly', () => {
		const originalPath = '/Users/vatsal/my project';
		const encoded = encodeProjectPath(originalPath);
		const decoded = decodeProjectPath(encoded);
		expect(decoded).toBe(originalPath);
	});

	it('should encode and decode paths with special characters correctly', () => {
		const originalPath = '/Users/vatsal/project@2024';
		const encoded = encodeProjectPath(originalPath);
		const decoded = decodeProjectPath(encoded);
		expect(decoded).toBe(originalPath);
	});

	it('should handle paths without leading slash in encoder', () => {
		const pathWithoutSlash = 'Users/vatsal/my-project';
		const pathWithSlash = '/Users/vatsal/my-project';
		const encodedWithout = encodeProjectPath(pathWithoutSlash);
		const encodedWith = encodeProjectPath(pathWithSlash);
		expect(encodedWithout).toBe(encodedWith);
	});

	it('should ensure decoded paths always have leading slash', () => {
		const originalPath = '/Users/vatsal/my-project';
		const encoded = encodeProjectPath(originalPath);
		const decoded = decodeProjectPath(encoded);
		expect(decoded.startsWith('/')).toBe(true);
	});

	it('should fallback to legacy dash replacement for dash-encoded paths', () => {
		// Test with a path that looks like legacy encoding (no % characters)
		const legacyEncoded = 'Users-vatsal-my-project';
		const decoded = decodeProjectPath(legacyEncoded);
		expect(decoded).toBe('/Users/vatsal/my/project');
	});

	it('should handle complex paths with multiple special characters', () => {
		const originalPath = '/Users/vatsal/my-project (2024) #1';
		const encoded = encodeProjectPath(originalPath);
		const decoded = decodeProjectPath(encoded);
		expect(decoded).toBe(originalPath);
	});

	it('should gracefully handle malformed percent-encoding by falling back', () => {
		const malformed = 'invalid%ZZpath';
		const decoded = decodeProjectPath(malformed);
		expect(decoded).toBe('/invalid%ZZpath');
	});

	it('should handle Windows absolute paths with drive letters (URL-encoded)', () => {
		const windowsPath = 'C:\\Users\\vatsal\\project';
		const encoded = encodeProjectPath(windowsPath);
		const decoded = decodeProjectPath(encoded);
		expect(decoded).toBe(windowsPath);
	});

	it('should handle Windows UNC paths', () => {
		const uncPath = '\\\\server\\share\\project';
		const encoded = encodeProjectPath(uncPath);
		const decoded = decodeProjectPath(encoded);
		expect(decoded).toBe(uncPath);
	});

	it('should preserve Windows paths with forward slashes', () => {
		const windowsPath = 'C:/Users/vatsal/project';
		const encoded = encodeProjectPath(windowsPath);
		const decoded = decodeProjectPath(encoded);
		expect(decoded).toBe(windowsPath);
	});
});

describe('OpenCode storage loader', () => {
	it('loads usage entries from storage layout', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'storage/project/proj_123.json': JSON.stringify({
				id: 'proj_123',
				worktree: '/Users/test/project',
			}),
			'storage/session/proj_123/ses_1.json': JSON.stringify({
				id: 'ses_1',
				projectID: 'proj_123',
				directory: '/Users/test/project',
				time: {
					created: 1700000000000,
					updated: 1700000001000,
				},
			}),
			'storage/message/ses_1/msg_1.json': JSON.stringify({
				id: 'msg_1',
				sessionID: 'ses_1',
				role: 'assistant',
				time: {
					created: 1700000000000,
				},
				modelID: 'claude-sonnet-4-20250514',
				providerID: 'anthropic',
			}),
			'storage/part/msg_1/prt_1.json': JSON.stringify({
				id: 'prt_1',
				sessionID: 'ses_1',
				messageID: 'msg_1',
				type: 'step-finish',
				tokens: {
					input: 10,
					output: 5,
				},
				cost: 0.01,
			}),
		});

		const result = loadOpenCodeData(fixture.path, true);
		expect(result).toHaveLength(1);
		expect(result[0]?.projectPath).toBe('/Users/test/project');
		expect(result[0]?.tokens.input).toBe(10);
		expect(result[0]?.tokens.output).toBe(5);
		expect(result[0]?.cost).toBe(0.01);
		expect(result[0]?.sessionId).toBe('ses_1');
		expect(result[0]?.messageId).toBe('msg_1');
		expect(result[0]?.model).toBe('claude-sonnet-4-20250514');
		expect(result[0]?.provider).toBe('anthropic');
		expect(result[0]?.timestamp).toBeInstanceOf(Date);
		expect(result[0]?.type).toBe('assistant');
	});

	it('aggregates tokens from message when parts missing', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'storage/project/proj_123.json': JSON.stringify({
				id: 'proj_123',
				worktree: '/Users/test/project',
			}),
			'storage/session/proj_123/ses_2.json': JSON.stringify({
				id: 'ses_2',
				projectID: 'proj_123',
				directory: '/Users/test/project',
			}),
			'storage/message/ses_2/msg_2.json': JSON.stringify({
				id: 'msg_2',
				sessionID: 'ses_2',
				role: 'assistant',
				time: {
					created: 1700000000000,
				},
				modelID: 'claude-opus-4-20250514',
				tokens: {
					input: 100,
					output: 50,
					cache: {
						read: 200,
						write: 150,
					},
				},
			}),
		});

		const result = loadOpenCodeData(fixture.path, true);
		expect(result).toHaveLength(1);
		expect(result[0]?.tokens.input).toBe(100);
		expect(result[0]?.tokens.output).toBe(50);
		expect(result[0]?.tokens.cache?.read).toBe(200);
		expect(result[0]?.tokens.cache?.write).toBe(150);
	});

	it('loads usage entries from project storage layout', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'project/sample/storage/session/proj_abc/ses_7.json': JSON.stringify({
				id: 'ses_7',
				projectID: 'proj_abc',
				directory: '/Users/test/project',
			}),
			'project/sample/storage/message/ses_7/msg_7.json': JSON.stringify({
				id: 'msg_7',
				sessionID: 'ses_7',
				role: 'assistant',
				time: {
					created: 1700000000000,
				},
				modelID: 'claude-sonnet-4-20250514',
				tokens: {
					input: 12,
					output: 6,
				},
			}),
		});

		const result = loadOpenCodeData(fixture.path, true);
		expect(result).toHaveLength(1);
		expect(result[0]?.projectPath).toBe('/Users/test/project');
		expect(result[0]?.tokens.input).toBe(12);
		expect(result[0]?.tokens.output).toBe(6);
	});

	it('skips entries with missing timestamp', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'storage/project/proj_123.json': JSON.stringify({
				id: 'proj_123',
				worktree: '/Users/test/project',
			}),
			'storage/session/proj_123/ses_3.json': JSON.stringify({
				id: 'ses_3',
				projectID: 'proj_123',
			}),
			'storage/message/ses_3/msg_3.json': JSON.stringify({
				id: 'msg_3',
				sessionID: 'ses_3',
				role: 'assistant',
				// No time.created field
				modelID: 'claude-sonnet-4-20250514',
				tokens: {
					input: 10,
					output: 5,
				},
			}),
		});

		const result = loadOpenCodeData(fixture.path, true);
		expect(result).toHaveLength(0);
	});

	it('loads entries with OpenAI models', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'storage/project/proj_123.json': JSON.stringify({
				id: 'proj_123',
				worktree: '/Users/test/project',
			}),
			'storage/session/proj_123/ses_4.json': JSON.stringify({
				id: 'ses_4',
				projectID: 'proj_123',
			}),
			'storage/message/ses_4/msg_4.json': JSON.stringify({
				id: 'msg_4',
				sessionID: 'ses_4',
				role: 'assistant',
				time: {
					created: 1700000000000,
				},
				modelID: 'gpt-4',
				tokens: {
					input: 10,
					output: 5,
				},
			}),
		});

		const result = loadOpenCodeData(fixture.path, true);
		expect(result).toHaveLength(1);
		expect(result[0]?.model).toBe('gpt-4');
	});

	it('skips entries with null model', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'storage/project/proj_123.json': JSON.stringify({
				id: 'proj_123',
				worktree: '/Users/test/project',
			}),
			'storage/session/proj_123/ses_5.json': JSON.stringify({
				id: 'ses_5',
				projectID: 'proj_123',
			}),
			'storage/message/ses_5/msg_5.json': JSON.stringify({
				id: 'msg_5',
				sessionID: 'ses_5',
				role: 'assistant',
				time: {
					created: 1700000000000,
				},
				model: null,
				tokens: {
					input: 10,
					output: 5,
				},
			}),
		});

		const result = loadOpenCodeData(fixture.path, true);
		expect(result).toHaveLength(0);
	});

	it('skips entries without valid project path', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'storage/session/proj_999/ses_6.json': JSON.stringify({
				id: 'ses_6',
				projectID: 'proj_999',
				// No directory field and no project in map
			}),
			'storage/message/ses_6/msg_6.json': JSON.stringify({
				id: 'msg_6',
				sessionID: 'ses_6',
				role: 'assistant',
				time: {
					created: 1700000000000,
				},
				modelID: 'claude-sonnet-4-20250514',
				tokens: {
					input: 10,
					output: 5,
				},
			}),
		});

		const result = loadOpenCodeData(fixture.path, true);
		expect(result).toHaveLength(0);
	});

	it('loads entries from legacy JSONL layout', async () => {
		const { createFixture } = await import('fs-fixture');
		await using fixture = await createFixture({
			'projects/Users%2Ftest%2Fproject/usage_session1.jsonl': [
				JSON.stringify({
					timestamp: '2024-01-01T00:00:00.000Z',
					message: {
						model: 'claude-sonnet-4-20250514',
						id: 'msg_legacy_1',
						role: 'assistant',
						usage: {
							input_tokens: 100,
							output_tokens: 50,
							cache_creation_input_tokens: 20,
							cache_read_input_tokens: 80,
						},
					},
					costUSD: 0.05,
				}),
			].join('\n'),
		});

		const result = loadOpenCodeData(fixture.path, true);
		expect(result).toHaveLength(1);
		expect(result[0]?.projectPath).toBe('/Users/test/project');
		expect(result[0]?.tokens.input).toBe(100);
		expect(result[0]?.tokens.output).toBe(50);
		expect(result[0]?.tokens.cache?.write).toBe(20);
		expect(result[0]?.tokens.cache?.read).toBe(80);
		expect(result[0]?.cost).toBe(0.05);
		expect(result[0]?.sessionId).toBe('session1');
		expect(result[0]?.messageId).toBe('msg_legacy_1');
	});
});
