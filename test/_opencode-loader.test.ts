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
	});
});
