import { describe, it, expect } from 'vitest';
import { formatTokensShort, getRateIndicator, formatBurnRate } from '../src/_live-rendering.ts';

describe('formatTokensShort', () => {
	it('should format numbers under 1000 as-is', () => {
		expect(formatTokensShort(999)).toBe('999');
		expect(formatTokensShort(500)).toBe('500');
		expect(formatTokensShort(0)).toBe('0');
	});

	it('should format thousands with K suffix', () => {
		expect(formatTokensShort(1000)).toBe('1.0K');
		expect(formatTokensShort(1500)).toBe('1.5K');
		expect(formatTokensShort(999999)).toBe('1000.0K');
	});

	it('should format millions with M suffix', () => {
		expect(formatTokensShort(1000000)).toBe('1.0M');
		expect(formatTokensShort(1500000)).toBe('1.5M');
	});
});

describe('getRateIndicator', () => {
	it('returns empty string for null burn rate', () => {
		expect(getRateIndicator(null)).toBe('');
	});

	it('returns appropriate indicators for different rates', () => {
		expect(getRateIndicator({ tokensPerMinute: 100, costPerMinute: 0.01 })).toContain('🔥');
		expect(getRateIndicator({ tokensPerMinute: 10, costPerMinute: 0.001 })).toContain('📈');
	});
});

// Additional tests would be extracted from source file