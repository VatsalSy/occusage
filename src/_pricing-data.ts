import { readFile } from 'node:fs/promises';
import type { ModelPricing } from './_types.ts';
import { MODEL_PRICING_DATA_URL } from './_consts.ts';
import { modelPricingSchema } from './_types.ts';

export async function loadBundledModelPricing(): Promise<Record<string, ModelPricing>> {
	const content = await readFile(MODEL_PRICING_DATA_URL, 'utf-8');
	const parsed = JSON.parse(content) as Record<string, unknown>;
	const pricing: Record<string, ModelPricing> = {};

	for (const [modelName, modelData] of Object.entries(parsed)) {
		const result = modelPricingSchema.safeParse(modelData);
		if (result.success) {
			pricing[modelName] = result.data;
		}
	}

	return pricing;
}
