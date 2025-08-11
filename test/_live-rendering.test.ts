import { describe, it, expect } from 'vitest';
import { formatTokensShort } from '../src/_live-rendering.ts';

describe('formatTokensShort', () => {
	it('should format numbers under 1000 as-is', () => {
		expect(formatTokensShort(999)).toBe('999');
		expect(formatTokensShort(500)).toBe('500');
		expect(formatTokensShort(0)).toBe('0');
	});

	it('should format thousands with k suffix', () => {
		expect(formatTokensShort(1000)).toBe('1.0k');
		expect(formatTokensShort(1500)).toBe('1.5k');
		expect(formatTokensShort(999999)).toBe('1000.0k');
	});

	it('should format large numbers with k suffix', () => {
		expect(formatTokensShort(1000000)).toBe('1000.0k');
		expect(formatTokensShort(1500000)).toBe('1500.0k');
	});
});

// Additional tests for other exported functions could be added here
// Currently only testing formatTokensShort as other functions may require more complex setup