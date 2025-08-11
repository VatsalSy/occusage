import { describe, it, expect } from 'vitest';
import { encodeProjectPath, decodeProjectPath } from '../src/_opencode-loader.ts';

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