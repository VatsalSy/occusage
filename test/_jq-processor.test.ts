import { describe, it, expect } from 'vitest';
import { processWithJq } from '../src/_jq-processor.ts';
import { Result } from '@praha/byethrow';

describe('processWithJq', () => {
	it('should process JSON with simple filter', async () => {
		const data = { name: 'test', value: 42 };
		const result = await processWithJq(data, '.name');
		const unwrapped = Result.unwrap(result);
		expect(unwrapped).toBe('"test"');
	});

	it('should process JSON with complex filter', async () => {
		const data = {
			items: [
				{ id: 1, name: 'apple' },
				{ id: 2, name: 'banana' },
			],
		};
		const result = await processWithJq(data, '.items | map(.name)');
		const unwrapped = Result.unwrap(result);
		const parsed = JSON.parse(unwrapped) as string[];
		expect(parsed).toEqual(['apple', 'banana']);
	});

	it('should handle raw output', async () => {
		const data = { message: 'hello world' };
		const result = await processWithJq(data, '.message | @text');
		const unwrapped = Result.unwrap(result);
		expect(unwrapped).toBe('"hello world"');
	});

	it('should return error for invalid jq syntax', async () => {
		const data = { test: 'value' };
		const result = await processWithJq(data, 'invalid syntax {');
		const error = Result.unwrapError(result);
		expect(error.message).toContain('jq processing failed');
	});

	it('should handle complex jq operations', async () => {
		const data = {
			users: [
				{ name: 'Alice', age: 30 },
				{ name: 'Bob', age: 25 },
				{ name: 'Charlie', age: 35 },
			],
		};
		const result = await processWithJq(data, '.users | sort_by(.age) | .[0].name');
		const unwrapped = Result.unwrap(result);
		expect(unwrapped).toBe('"Bob"');
	});

	it('should handle numeric output', async () => {
		const data = { values: [1, 2, 3, 4, 5] };
		const result = await processWithJq(data, '.values | add');
		const unwrapped = Result.unwrap(result);
		expect(unwrapped).toBe('15');
	});
});