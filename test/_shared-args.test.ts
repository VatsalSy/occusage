import { describe, it, expect } from 'vitest';
import { sharedArgs } from '../src/_shared-args.ts';

describe('_shared-args', () => {
	it('should export sharedArgs object', () => {
		expect(typeof sharedArgs).toBe('object');
		expect(sharedArgs).not.toBeNull();
	});

	it('should have common CLI arguments', () => {
		// Check for some expected shared arguments
		expect(sharedArgs).toHaveProperty('json');
		expect(sharedArgs).toHaveProperty('mode');
		expect(sharedArgs).toHaveProperty('debug');
		expect(sharedArgs).toHaveProperty('offline');
		expect(sharedArgs).toHaveProperty('color');
		expect(sharedArgs).toHaveProperty('noColor');
	});

	it('should have valid argument definitions', () => {
		// Each argument should have a type
		Object.values(sharedArgs).forEach(arg => {
			expect(arg).toHaveProperty('type');
			expect(typeof arg.type).toBe('string');
		});
	});

	it('should have descriptions for arguments', () => {
		// Most arguments should have descriptions
		Object.values(sharedArgs).forEach(arg => {
			if ('description' in arg) {
				expect(typeof arg.description).toBe('string');
				expect(arg.description.length).toBeGreaterThan(0);
			}
		});
	});
});