/**
 * @fileoverview Model pricing data fetcher for cost calculations
 *
 * This module provides a PricingFetcher class that retrieves and caches
 * model pricing information from LiteLLM's pricing database for accurate
 * cost calculations based on token usage.
 *
 * @module pricing-fetcher
 */

import type { ModelPricing } from './_types.ts';
import { Result } from '@praha/byethrow';
import { LITELLM_PRICING_URL } from './_consts.ts';
import { prefetchClaudePricing } from './_macro.ts' with { type: 'macro' };
import { modelPricingSchema } from './_types.ts';
import { logger } from './logger.ts';
import { getGlobalCacheManager } from './_cache-manager.ts';

/**
 * Fetches and caches model pricing information from LiteLLM
 * Implements Disposable pattern for automatic resource cleanup
 */
export class PricingFetcher implements Disposable {
	private cachedPricing: Map<string, ModelPricing> | null = null;
	private cacheTimestamp: number | null = null;
	private readonly cacheTTL: number;
	private readonly offline: boolean;
	private readonly forceRefresh: boolean;
	private readonly noCache: boolean;

	/**
	 * Creates a new PricingFetcher instance
	 * @param offline - Whether to use pre-fetched pricing data instead of fetching from API
	 * @param forceRefresh - Whether to bypass cache and force refresh pricing data
	 * @param noCache - Whether to disable all caching for this instance
	 */
	constructor(offline = false, forceRefresh = false, noCache = false) {
		this.offline = offline;
		this.forceRefresh = forceRefresh;
		this.noCache = noCache;
		// Calculate TTL from environment or use default (7 days)
		const pricingCacheDays = (() => {
			if (process.env.OCCUSAGE_PRICING_CACHE_DAYS === undefined) {
				return 7;
			}
			const parsed = Number.parseInt(process.env.OCCUSAGE_PRICING_CACHE_DAYS, 10);
			return Number.isNaN(parsed) || parsed < 0 ? 7 : parsed;
		})();
		this.cacheTTL = Math.max(0, pricingCacheDays) * 24 * 60 * 60 * 1000;
	}

	/**
	 * Implements Disposable interface for automatic cleanup
	 */
	[Symbol.dispose](): void {
		this.clearCache();
	}

	/**
	 * Clears the cached pricing data
	 */
	clearCache(): void {
		this.cachedPricing = null;
		this.cacheTimestamp = null;
	}

	/**
	 * Loads offline pricing data from pre-fetched cache
	 * @returns Map of model names to pricing information
	 */
	private loadOfflinePricing = Result.try({
		try: async () => {
			const pricing = new Map(Object.entries(await prefetchClaudePricing()));
			this.cachedPricing = pricing;
			this.cacheTimestamp = Date.now();
			return pricing;
		},
		catch: error => new Error('Failed to load offline pricing data', { cause: error }),
	});

	/**
	 * Handles fallback to offline pricing when network fetch fails
	 * @param originalError - The original error from the network fetch
	 * @returns Map of model names to pricing information
	 * @throws Error if both network fetch and fallback fail
	 */
	private async handleFallbackToCachedPricing(originalError: unknown): Result.ResultAsync<Map<string, ModelPricing>, Error> {
		logger.warn('Failed to fetch model pricing from LiteLLM, falling back to cached pricing data');
		logger.debug('Fetch error details:', originalError);
		return Result.pipe(
			this.loadOfflinePricing(),
			Result.inspect((pricing) => {
				logger.info(`Using cached pricing data for ${pricing.size} models`);
			}),
			Result.inspectError((error) => {
				logger.error('Failed to load cached pricing data as fallback:', error);
				logger.error('Original fetch error:', originalError);
			}),
		);
	}

	/**
	 * Ensures pricing data is loaded, either from cache or by fetching
	 * Uses persistent cache with TTL, automatically falls back to offline mode if needed
	 * @returns Map of model names to pricing information
	 */
	private async ensurePricingLoaded(): Result.ResultAsync<Map<string, ModelPricing>, Error> {
		// Initialize cache manager without passing noCache (singleton pattern)
		const cacheManager = getGlobalCacheManager();
		await cacheManager.initialize();

		return Result.pipe(
			// Check in-memory cache with TTL validation
			(() => {
				if (this.cachedPricing != null && this.cacheTimestamp != null) {
					const age = Date.now() - this.cacheTimestamp;
					if (age <= this.cacheTTL) {
						return Result.succeed(this.cachedPricing);
					}
					logger.debug(`In-memory cache expired (age: ${Math.round(age / 1000)}s, TTL: ${Math.round(this.cacheTTL / 1000)}s)`);
				}
				return Result.fail(new Error('Memory cache not available or expired'));
			})(),
			Result.orElse(async () => {
				// Check persistent cache first (unless force refresh, offline mode, or noCache)
				if (!this.offline && !this.forceRefresh && !this.noCache) {
					const cachedPricing = await cacheManager.getPricing();
					if (cachedPricing) {
						this.cachedPricing = cachedPricing;
						this.cacheTimestamp = Date.now();
						logger.debug(`Using cached pricing data for ${cachedPricing.size} models`);
						return Result.succeed(cachedPricing);
					}
				}

				// If we're in offline mode, return pre-fetched data
				if (this.offline) {
					return this.loadOfflinePricing();
				}

				// Fetch fresh data from API
				logger.info('Fetching latest model pricing from LiteLLM...');
				return Result.pipe(
					Result.try({
						try: fetch(LITELLM_PRICING_URL),
						catch: error => new Error('Failed to fetch model pricing from LiteLLM', { cause: error }),
					}),
					Result.andThrough((response) => {
						if (!response.ok) {
							return Result.fail(new Error(`Failed to fetch pricing data: ${response.statusText}`));
						}
						return Result.succeed();
					}),
					Result.andThen(async response => Result.try({
						try: response.json() as Promise<Record<string, unknown>>,
						catch: error => new Error('Failed to parse pricing data', { cause: error }),
					})),
					Result.map((data) => {
						const pricing = new Map<string, ModelPricing>();
						for (const [modelName, modelData] of Object.entries(data)) {
							if (typeof modelData === 'object' && modelData !== null) {
								const parsed = modelPricingSchema.safeParse(modelData);
								if (parsed.success) {
									pricing.set(modelName, parsed.data);
								}
								// Skip models that don't match our schema
							}
						}
						return pricing;
					}),
					Result.andThen(async (pricing) => {
						this.cachedPricing = pricing;
						this.cacheTimestamp = Date.now();
						// Store in persistent cache (unless noCache is enabled)
						if (!this.noCache) {
							try {
								await cacheManager.setPricing(pricing);
								logger.info(`Loaded and cached pricing for ${pricing.size} models`);
							} catch (error) {
								logger.error('Failed to write pricing to persistent cache:', error);
								return Result.fail(new Error('Failed to cache pricing data', { cause: error }));
							}
						} else {
							logger.info(`Loaded pricing for ${pricing.size} models (cache disabled)`);
						}
						return Result.succeed(pricing);
					}),
					Result.orElse(async error => this.handleFallbackToCachedPricing(error)),
				);
			}),
		);
	}

	/**
	 * Fetches all available model pricing data
	 * @returns Map of model names to pricing information
	 */
	async fetchModelPricing(): Result.ResultAsync<Map<string, ModelPricing>, Error> {
		return this.ensurePricingLoaded();
	}

	/**
	 * Gets pricing information for a specific model with fallback matching
	 * Tries exact match first, then provider prefixes, then partial matches
	 * @param modelName - Name of the model to get pricing for
	 * @returns Model pricing information or null if not found
	 */
	async getModelPricing(modelName: string): Result.ResultAsync<ModelPricing | null, Error> {
		return Result.pipe(
			this.ensurePricingLoaded(),
			Result.map((pricing) => {
				// Direct match
				const directMatch = pricing.get(modelName);
				if (directMatch != null) {
					return directMatch;
				}

				// Try with provider prefix variations
				const variations = [
					modelName,
					`anthropic/${modelName}`,
					`claude-3-5-${modelName}`,
					`claude-3-${modelName}`,
					`claude-${modelName}`,
				];

				for (const variant of variations) {
					const match = pricing.get(variant);
					if (match != null) {
						return match;
					}
				}

				// Try to find partial matches (e.g., "gpt-4" might match "gpt-4-0125-preview")
				const lowerModel = modelName.toLowerCase();
				for (const [key, value] of pricing) {
					if (
						key.toLowerCase().includes(lowerModel)
						|| lowerModel.includes(key.toLowerCase())
					) {
						return value;
					}
				}

				return null;
			}),
		);
	}

	/**
	 * Calculates the cost for given token usage and model
	 * @param tokens - Token usage breakdown
	 * @param tokens.input_tokens - Number of input tokens
	 * @param tokens.output_tokens - Number of output tokens
	 * @param tokens.cache_creation_input_tokens - Number of cache creation tokens
	 * @param tokens.cache_read_input_tokens - Number of cache read tokens
	 * @param modelName - Name of the model used
	 * @returns Total cost in USD
	 */
	async calculateCostFromTokens(
		tokens: {
			input_tokens: number;
			output_tokens: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		},
		modelName: string,
	): Result.ResultAsync<number, Error> {
		return Result.pipe(
			this.getModelPricing(modelName),
			Result.map(pricing => pricing == null ? 0 : this.calculateCostFromPricing(tokens, pricing)),
		);
	}

	/**
	 * Calculates cost from token usage and pricing information
	 * @param tokens - Token usage breakdown
	 * @param tokens.input_tokens - Number of input tokens
	 * @param tokens.output_tokens - Number of output tokens
	 * @param tokens.cache_creation_input_tokens - Number of cache creation tokens
	 * @param tokens.cache_read_input_tokens - Number of cache read tokens
	 * @param pricing - Model pricing rates
	 * @returns Total cost in USD
	 */
	calculateCostFromPricing(
		tokens: {
			input_tokens: number;
			output_tokens: number;
			cache_creation_input_tokens?: number;
			cache_read_input_tokens?: number;
		},
		pricing: ModelPricing,
	): number {
		let cost = 0;

		// Input tokens cost
		if (pricing.input_cost_per_token != null) {
			cost += tokens.input_tokens * pricing.input_cost_per_token;
		}

		// Output tokens cost
		if (pricing.output_cost_per_token != null) {
			cost += tokens.output_tokens * pricing.output_cost_per_token;
		}

		// Cache creation tokens cost
		if (
			tokens.cache_creation_input_tokens != null
			&& pricing.cache_creation_input_token_cost != null
		) {
			cost
				+= tokens.cache_creation_input_tokens
					* pricing.cache_creation_input_token_cost;
		}

		// Cache read tokens cost
		if (tokens.cache_read_input_tokens != null && pricing.cache_read_input_token_cost != null) {
			cost
				+= tokens.cache_read_input_tokens * pricing.cache_read_input_token_cost;
		}

		return cost;
	}
}

