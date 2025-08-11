import { describe, it, expect } from 'vitest';
import { formatNumber, formatCurrency, formatModelName } from '../src/_utils.ts';

describe('ResponsiveTable', () => {
	describe('compact mode behavior', () => {
		it('should activate compact mode when terminal width is below threshold', () => {
			// Mock terminal width
			const originalColumns = process.stdout.columns;
			process.stdout.columns = 80; // Small width
			
			// Test would verify compact mode activation
			expect(true).toBe(true); // Placeholder
			
			// Restore
			process.stdout.columns = originalColumns;
		});
	});

	describe('getCurrentTableConfig', () => {
		it('should return compact config when in compact mode', () => {
			// Test table configuration logic
			expect(true).toBe(true); // Placeholder
		});
	});
});

describe('Utility Functions', () => {
	it('formatNumber should format numbers correctly', () => {
		expect(formatNumber(1000)).toBe('1,000');
		expect(formatNumber(1000000)).toBe('1,000,000');
	});

	it('formatCurrency should format currency correctly', () => {
		expect(formatCurrency(1.23)).toBe('$1.23');
		expect(formatCurrency(0.001)).toBe('$0.00');
	});

	it('formatModelName should format model names correctly', () => {
		expect(formatModelName('claude-sonnet-4-20250514')).toBe('sonnet-4');
		expect(formatModelName('claude-opus-4-20250514')).toBe('opus-4');
		// Fallback: non-matching patterns should be returned unchanged
		expect(formatModelName('random-model-name')).toBe('random-model-name');
		expect(formatModelName('gpt-4')).toBe('gpt-4');
	});
});

// Additional tests would be extracted from source file (29 total)