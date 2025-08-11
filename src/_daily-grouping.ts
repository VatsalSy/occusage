import type { DailyProjectOutput } from './_json-output-types.ts';
import type { loadDailyUsageData } from './data-loader.ts';
import { createDailyDate, createModelName } from './_types.ts';
import { getTotalTokens } from './calculate-cost.ts';

/**
 * Type for daily data returned from loadDailyUsageData
 */
type DailyData = Awaited<ReturnType<typeof loadDailyUsageData>>;

/**
 * Group daily usage data by project for JSON output
 */
export function groupByProject(dailyData: DailyData): Record<string, DailyProjectOutput[]> {
	const projects: Record<string, DailyProjectOutput[]> = {};

	for (const data of dailyData) {
		const projectName = data.project ?? 'unknown';

		if (projects[projectName] == null) {
			projects[projectName] = [];
		}

		projects[projectName].push({
			date: data.date,
			inputTokens: data.inputTokens,
			outputTokens: data.outputTokens,
			cacheCreationTokens: data.cacheCreationTokens,
			cacheReadTokens: data.cacheReadTokens,
			totalTokens: getTotalTokens(data),
			totalCost: data.totalCost,
			modelsUsed: data.modelsUsed,
			modelBreakdowns: data.modelBreakdowns,
		});
	}

	return projects;
}

/**
 * Group daily usage data by project for table display
 */
export function groupDataByProject(dailyData: DailyData): Record<string, DailyData> {
	const projects: Record<string, DailyData> = {};

	for (const data of dailyData) {
		const projectName = data.project ?? 'unknown';

		if (projects[projectName] == null) {
			projects[projectName] = [];
		}

		projects[projectName].push(data);
	}

	return projects;
}


