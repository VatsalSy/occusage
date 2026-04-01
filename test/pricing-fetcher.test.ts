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
		it('should load and parse bundled pricing data', async () => {
			await using fetcher = new PricingFetcher(true); // Use offline mode for tests
			const result = await fetcher.fetchModelPricing();
			const pricing = Result.unwrap(result);
			expect(pricing).toBeInstanceOf(Map);
			expect(pricing.size).toBeGreaterThan(0);
			expect(pricing.get('gpt-5')).toEqual({
				input_cost_per_token: 0.00000125,
				output_cost_per_token: 0.00001,
				cache_read_input_token_cost: 0.000000125,
			});
		});

		it('should remap dated model snapshots to bundled pricing entries', async () => {
			await using fetcher = new PricingFetcher(true);
			const result = await fetcher.getModelPricing('openai/gpt-5-2025-08-07');
			expect(Result.unwrap(result)).toEqual({
				input_cost_per_token: 0.00000125,
				output_cost_per_token: 0.00001,
				cache_read_input_token_cost: 0.000000125,
			});
		});

		it('should calculate costs for newer Codex model IDs', async () => {
			await using fetcher = new PricingFetcher(true);
			const result = await fetcher.calculateCostFromTokens({
				input_tokens: 1000,
				output_tokens: 500,
			}, 'gpt-5.1-codex-mini');
			const cost = Result.unwrap(result);
			expect(cost).toBeCloseTo(0.00125);
		});

		it('should prefer the most specific bundled match for codex snapshot aliases', async () => {
			await using fetcher = new PricingFetcher(true);
			const result = await fetcher.getModelPricing('gpt-5.1-codex-mini-2026-01-01');
			expect(Result.unwrap(result)).toEqual({
				input_cost_per_token: 0.00000025,
				output_cost_per_token: 0.000002,
				cache_read_input_token_cost: 0.000000025,
			});
		});
	});

	// Note: These pricing-fetcher tests run in offline mode using bundled pricing data.
});
