import { describe, it, expect, beforeEach } from 'vitest';
import { formatProjectName, parseProjectName, clearAliasCache } from '../src/_project-names.ts';

describe('project name formatting', () => {
	beforeEach(() => {
		clearAliasCache();
	});

	describe('parseProjectName', () => {
		it('handles unknown project names', () => {
			const result = parseProjectName('unknown-project');
			expect(result).toBe('unknown-project');
		});

		it('handles known project patterns', () => {
			const result = parseProjectName('my-awesome-project');
			expect(typeof result).toBe('string');
		});

		it('normalizes Windows and Unix paths', () => {
			expect(parseProjectName('C:\\Users\\john\\Development\\work\\foo-bar')).toBe('work-foo-bar');
			expect(parseProjectName('/Users/john/dev/work/foo-bar')).toBe('work-foo-bar');
		});

		it('shortens UUID-like names', () => {
			const result = parseProjectName('123e4567-e89b-12d3-a456-426614174000');
			expect(result).toMatch(/^[a-f0-9-]+$/i);
			expect(result.length).toBeLessThan(36); // Should be shortened
		});

		it('trims at double dash boundary', () => {
			expect(parseProjectName('project--feature-branch')).toBe('project');
		});
	});

	describe('formatProjectName', () => {
		it('formats project names correctly', () => {
			const result = formatProjectName('test-project');
			expect(typeof result).toBe('string');
			expect(result.length).toBeGreaterThan(0);
		});

		it('handles empty project names', () => {
			const result = formatProjectName('');
			expect(result).toBe('Unknown Project');
		});
	});
});

// Additional tests would be extracted from source file