/**
 * @fileoverview Cost calculation utilities for usage data analysis
 *
 * This module provides functions for calculating costs and aggregating token usage
 * across different time periods and models. It handles both pre-calculated costs
 * and dynamic cost calculations based on model pricing.
 *
 * @module calculate-cost
 */

import type { AggregatedTokenCounts } from './_token-utils.ts';
import type { DailyUsage, MonthlyUsage, ProjectUsage, SessionUsage, WeeklyUsage } from './data-loader.ts';
import { getTotalTokens } from './_token-utils.ts';
import {
	createActivityDate,
	createDailyDate,
	createModelName,
	createProjectPath,
	createSessionId,
	createVersion,
} from './_types.ts';

/**
 * Alias for AggregatedTokenCounts from shared utilities
 * @deprecated Use AggregatedTokenCounts from _token-utils.ts instead
 */
type TokenData = AggregatedTokenCounts;

/**
 * Token totals including cost information
 */
type TokenTotals = TokenData & {
	totalCost: number;
};

/**
 * Complete totals object with token counts, cost, and total token sum
 */
type TotalsObject = TokenTotals & {
	totalTokens: number;
};

/**
 * Calculates total token usage and cost across multiple usage data entries
 * @param data - Array of daily, monthly, weekly, session, or project usage data
 * @returns Aggregated token totals and cost
 */
export function calculateTotals(
	data: Array<DailyUsage | MonthlyUsage | WeeklyUsage | SessionUsage | ProjectUsage>,
): TokenTotals {
	return data.reduce(
		(acc, item) => ({
			inputTokens: acc.inputTokens + item.inputTokens,
			outputTokens: acc.outputTokens + item.outputTokens,
			cacheCreationTokens: acc.cacheCreationTokens + item.cacheCreationTokens,
			cacheReadTokens: acc.cacheReadTokens + item.cacheReadTokens,
			totalCost: acc.totalCost + item.totalCost,
		}),
		{
			inputTokens: 0,
			outputTokens: 0,
			cacheCreationTokens: 0,
			cacheReadTokens: 0,
			totalCost: 0,
		},
	);
}

// Re-export getTotalTokens from shared utilities for backward compatibility
export { getTotalTokens };

/**
 * Creates a complete totals object by adding total token count to existing totals
 * @param totals - Token totals with cost information
 * @returns Complete totals object including total token sum
 */
export function createTotalsObject(totals: TokenTotals): TotalsObject {
	return {
		...totals,
		totalTokens: getTotalTokens(totals),
	};
}


