import { readFile } from 'node:fs/promises';
import type { ModelPricing } from './_types.ts';
import { MODEL_PRICING_DATA_URL } from './_consts.ts';
import { modelPricingSchema } from './_types.ts';

export function parseBundledModelPricing(
	content: string,
	sourceDescription = MODEL_PRICING_DATA_URL.toString(),
): Record<string, ModelPricing> {
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (error) {
		throw new Error(`Failed to parse model pricing JSON from "${sourceDescription}"`, { cause: error });
	}

	if (typeof parsed !== 'object' || parsed == null || Array.isArray(parsed)) {
		throw new Error(`Invalid model pricing data format in "${sourceDescription}": expected a JSON object at the root.`);
	}

	const pricing: Record<string, ModelPricing> = {};
	const invalidModels: string[] = [];

	for (const [modelName, modelData] of Object.entries(parsed)) {
		const result = modelPricingSchema.safeParse(modelData);
		if (result.success) {
			pricing[modelName] = result.data;
		} else {
			invalidModels.push(modelName);
		}
	}

	if (invalidModels.length > 0) {
		throw new Error(
			`Invalid model pricing entries in "${sourceDescription}": ${invalidModels.join(', ')}`,
		);
	}

	if (Object.keys(pricing).length === 0) {
		throw new Error(`No valid model pricing entries loaded from "${sourceDescription}".`);
	}

	return pricing;
}

export async function loadBundledModelPricing(): Promise<Record<string, ModelPricing>> {
	const content = await readFile(MODEL_PRICING_DATA_URL, 'utf-8');
	return parseBundledModelPricing(content);
}
