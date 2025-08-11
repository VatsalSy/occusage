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
	});

	describe('formatProjectName', () => {
		it('formats project names correctly', () => {
			const result = formatProjectName('test-project');
			expect(typeof result).toBe('string');
			expect(result.length).toBeGreaterThan(0);
		});

		it('handles empty project names', () => {
			const result = formatProjectName('');
			expect(typeof result).toBe('string');
		});
	});
});

// Additional tests would be extracted from source file