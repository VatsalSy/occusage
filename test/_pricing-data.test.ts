import { describe, expect, it } from 'vitest';
import { parseBundledModelPricing } from '../src/_pricing-data.ts';

describe('_pricing-data', () => {
	it('should reject non-object JSON roots', () => {
		expect(() => parseBundledModelPricing('[]', 'test://pricing.json')).toThrow(
			'Invalid model pricing data format in "test://pricing.json": expected a JSON object at the root.',
		);
	});

	it('should reject invalid pricing entries', () => {
		expect(() => parseBundledModelPricing(JSON.stringify({
			'gpt-5': {
				input_cost_per_token: 'not-a-number',
			},
		}), 'test://pricing.json')).toThrow(
			'Invalid model pricing entries in "test://pricing.json": gpt-5',
		);
	});

	it('should parse valid pricing entries', () => {
		const pricing = parseBundledModelPricing(JSON.stringify({
			'gpt-5': {
				input_cost_per_token: 0.00000125,
				output_cost_per_token: 0.00001,
				cache_read_input_token_cost: 0.000000125,
			},
		}), 'test://pricing.json');

		expect(pricing).toEqual({
			'gpt-5': {
				input_cost_per_token: 0.00000125,
				output_cost_per_token: 0.00001,
				cache_read_input_token_cost: 0.000000125,
			},
		});
	});
});
