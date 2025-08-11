import { describe, it, expect } from 'vitest';
import { PricingFetcher } from '../src/pricing-fetcher.ts';
import { Result } from '@praha/byethrow';

describe('pricing-fetcher', () => {
	describe('pricingFetcher class', () => {
		it('should support using statement for automatic cleanup', async () => {
			await using fetcher = new PricingFetcher();
			expect(fetcher).toBeInstanceOf(PricingFetcher);
		});

		it('should calculate costs directly with model name', async () => {
			await using fetcher = new PricingFetcher(true); // Use offline mode for tests
			const result = await fetcher.calculateCostFromTokens({
				input_tokens: 1000,
				output_tokens: 500,
				cache_creation_input_tokens: 0,
				cache_read_input_tokens: 0,
			}, 'claude-sonnet-4-20250514');
			const cost = Result.unwrap(result);
			expect(typeof cost).toBe('number');
			expect(cost).toBeGreaterThanOrEqual(0);
		});
	});

	describe('fetchModelPricing', () => {
		it('should fetch and parse pricing data from LiteLLM', async () => {
			// This test may fail due to network issues - that's expected
			await using fetcher = new PricingFetcher(true); // Use offline mode for tests
			const result = await fetcher.fetchModelPricing();
			const pricing = Result.unwrap(result);
			expect(pricing).toBeInstanceOf(Map);
			expect(pricing.size).toBeGreaterThan(0);
		});
	});

	// Additional tests would be extracted from source file
});

// Note: Many pricing-fetcher tests require network access and may fail in CI