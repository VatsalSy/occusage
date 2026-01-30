/**
 * Prefetch claude data for the current user.
 */

import type { ModelPricing } from './_types.ts';
import { LITELLM_PRICING_URL } from './_consts.ts';
import { modelPricingSchema } from './_types.ts';
import { isClaudeModel, isOpenAIModel, normalizeModelId } from './_model-utils.ts';

/**
 * Prefetches the pricing data for Claude and OpenAI models from the LiteLLM API.
 * This function fetches the pricing data and filters out relevant model families.
 * It returns a record of model names to their pricing information.
 *
 * @returns A promise that resolves to a record of model names and their pricing information.
 * @throws Will throw an error if the fetch operation fails.
 */
export async function prefetchClaudePricing(): Promise<Record<string, ModelPricing>> {
	const response = await fetch(LITELLM_PRICING_URL);
	if (!response.ok) {
		throw new Error(`Failed to fetch pricing data: ${response.statusText}`);
	}

	const data = await response.json() as Record<string, unknown>;

	const prefetchClaudeData: Record<string, ModelPricing> = {};

	// Cache all Claude + OpenAI model families
	for (const [modelName, modelData] of Object.entries(data)) {
		const normalized = normalizeModelId(modelName);
		const providerPrefix = modelName.split(/[/:]/)[0];
		const shouldInclude = normalized != null && (isClaudeModel(normalized) || isOpenAIModel(normalized, providerPrefix));
		if (shouldInclude && modelData != null && typeof modelData === 'object') {
			const parsed = modelPricingSchema.safeParse(modelData);
			if (parsed.success) {
				prefetchClaudeData[modelName] = parsed.data;
			}
		}
	}

	return prefetchClaudeData;
}
