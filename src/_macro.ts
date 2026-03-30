/**
 * Prefetch bundled model pricing data for supported model families.
 */

import type { ModelPricing } from './_types.ts';
import { loadBundledModelPricing } from './_pricing-data.ts';
import { modelPricingSchema } from './_types.ts';
import { isClaudeModel, isOpenAIModel, normalizeModelId } from './_model-utils.ts';

/**
 * Prefetches the bundled pricing data for Claude and OpenAI models.
 * This function loads the local pricing snapshot and filters out relevant model families.
 * It returns a record of model names to their pricing information.
 *
 * @returns A promise that resolves to a record of model names and their pricing information.
 * @throws Will throw an error if the bundled pricing data cannot be read.
 */
export async function prefetchClaudePricing(): Promise<Record<string, ModelPricing>> {
	const data = await loadBundledModelPricing() as Record<string, unknown>;

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
