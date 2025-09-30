import { describe, it, expect, vi } from 'vitest';
import { PricingFetcher } from '../src/pricing-fetcher.ts';
import { Result } from '@praha/byethrow';
import { CacheManager } from '../src/_cache-manager.ts';

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

		it('should accept noCache parameter in constructor', async () => {
			await using fetcher = new PricingFetcher(false, false, true);
			expect(fetcher).toBeInstanceOf(PricingFetcher);
		});

		it('should work with noCache enabled in offline mode', async () => {
			// Spy on cache methods to verify they're not called
			const getPricingSpy = vi.spyOn(CacheManager.prototype, 'getPricing');
			const setPricingSpy = vi.spyOn(CacheManager.prototype, 'setPricing');

			try {
				await using fetcher = new PricingFetcher(true, false, true); // offline + noCache
				const result = await fetcher.fetchModelPricing();
				const pricing = Result.unwrap(result);
				expect(pricing).toBeInstanceOf(Map);
				expect(pricing.size).toBeGreaterThan(0);

				// Verify cache methods were not called when noCache=true
				expect(getPricingSpy).not.toHaveBeenCalled();
				expect(setPricingSpy).not.toHaveBeenCalled();
			} finally {
				getPricingSpy.mockRestore();
				setPricingSpy.mockRestore();
			}
		});

		it('should respect precedence: offline overrides forceRefresh and noCache', async () => {
			// Test that offline mode works even with conflicting flags
			// Spy on cache methods to verify they're not called
			const getPricingSpy = vi.spyOn(CacheManager.prototype, 'getPricing');
			const setPricingSpy = vi.spyOn(CacheManager.prototype, 'setPricing');

			try {
				await using fetcher = new PricingFetcher(true, true, true); // all flags true
				const result = await fetcher.fetchModelPricing();
				const pricing = Result.unwrap(result);
				expect(pricing).toBeInstanceOf(Map);
				expect(pricing.size).toBeGreaterThan(0);

				// Verify cache methods were not called when noCache=true
				expect(getPricingSpy).not.toHaveBeenCalled();
				expect(setPricingSpy).not.toHaveBeenCalled();
			} finally {
				getPricingSpy.mockRestore();
				setPricingSpy.mockRestore();
			}
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