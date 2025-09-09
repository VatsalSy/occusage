import type { ModelName } from '../_types.ts';
import type { DailyUsage, ModelBreakdown } from '../data-loader.ts';
import process from 'node:process';
import { Result } from '@praha/byethrow';
import { define } from 'gunshi';
import pc from 'picocolors';

import { processWithJq } from '../_jq-processor.ts';

import { sharedCommandConfig } from '../_shared-args.ts';
import { aggregateModelBreakdowns, formatCurrency, formatModelName, formatModelsDisplayMultiline, formatNumber, formatSources, ResponsiveTable } from '../_utils.ts';
import {
	calculateTotals,
	createTotalsObject,
	getTotalTokens,
} from '../calculate-cost.ts';
import { formatDateCompact, loadUnifiedDailyUsageData } from '../data-loader.ts';
import { detectMismatches, printMismatchReport } from '../debug.ts';
import { log, logger } from '../logger.ts';


export const dailyCommand = define({
	name: 'daily',
	description: 'Show usage report grouped by date',
	...sharedCommandConfig,
	args: {
		...sharedCommandConfig.args,
		project: {
			type: 'string',
			short: 'p',
			description: 'Filter to specific project name',
		},
	},
	async run(ctx) {
		// --jq implies --json
		const useJson = ctx.values.json || ctx.values.jq != null;
		if (useJson) {
			logger.level = 0;
		}

		const dailyData = await loadUnifiedDailyUsageData({
			since: ctx.values.since,
			until: ctx.values.until,
			mode: ctx.values.mode,
			order: ctx.values.order,
			offline: ctx.values.offline,
			forceRefreshPricing: ctx.values.forceRefreshPricing,
			noCache: ctx.values.noCache,
			project: ctx.values.project,
			timezone: ctx.values.timezone,
			locale: ctx.values.locale,
		});

		if (dailyData.length === 0) {
			if (useJson) {
				log(JSON.stringify([]));
			}
			else {
				logger.warn('No Claude usage data found.');
			}
			process.exit(0);
		}

		// Calculate totals
		const totals = calculateTotals(dailyData);

		// Show debug information if requested
		if (ctx.values.debug && !useJson) {
			const mismatchStats = await detectMismatches(undefined);
			printMismatchReport(mismatchStats, ctx.values.debugSamples);
		}

		if (useJson) {
			// Output JSON format
			const jsonOutput = {
				daily: dailyData.map(data => ({
					date: data.date,
					inputTokens: data.inputTokens,
					outputTokens: data.outputTokens,
					cacheCreationTokens: data.cacheCreationTokens,
					cacheReadTokens: data.cacheReadTokens,
					totalTokens: getTotalTokens(data),
					totalCost: data.totalCost,
					modelsUsed: data.modelsUsed,
					modelBreakdowns: data.modelBreakdowns,
					...(data.project != null && { project: data.project }),
				})),
				totals: createTotalsObject(totals),
			};

			// Process with jq if specified
			if (ctx.values.jq != null) {
				const jqResult = await processWithJq(jsonOutput, ctx.values.jq);
				if (Result.isFailure(jqResult)) {
					logger.error((jqResult.error).message);
					process.exit(1);
				}
				log(jqResult.value);
			}
			else {
				log(JSON.stringify(jsonOutput, null, 2));
			}
		}
		else {
			// Print header
			logger.box('Open+Claude Code Token Usage Report - Daily');

			// Create table with compact mode support
			// When breakdown is enabled, remove Source column for cleaner display
			const table = new ResponsiveTable({
				head: ctx.values.breakdown
					? [
							'Date',
							'Models',
							'Input',
							'Output',
							'Cache Create',
							'Cache Read',
							'Total Tokens',
							'Cost (USD)',
						]
					: [
							'Source',
							'Date',
							'Models',
							'Input',
							'Output',
							'Cache Create',
							'Cache Read',
							'Total Tokens',
							'Cost (USD)',
						],
				style: {
					head: ['cyan'],
				},
				colAligns: ctx.values.breakdown
					? [
							'left',
							'left',
							'right',
							'right',
							'right',
							'right',
							'right',
							'right',
						]
					: [
							'center',
							'left',
							'left',
							'right',
							'right',
							'right',
							'right',
							'right',
							'right',
						],
				dateFormatter: (dateStr: string) => formatDateCompact(dateStr, ctx.values.timezone, ctx.values.locale),
				compactHead: ctx.values.breakdown
					? [
							'Date',
							'Models',
							'Input',
							'Output',
							'Cost (USD)',
						]
					: [
							'Source',
							'Date',
							'Models',
							'Input',
							'Output',
							'Cost (USD)',
						],
				compactColAligns: ctx.values.breakdown
					? [
							'left',
							'left',
							'right',
							'right',
							'right',
						]
					: [
							'center',
							'left',
							'left',
							'right',
							'right',
							'right',
						],
				compactThreshold: 100,
			});

			// Add daily data - group by date for visual separation
			let previousDate = '';
			let isFirstDate = true;

			for (const data of dailyData) {
				// Add visual separation between different dates (only in normal mode, not breakdown)
				if (data.date !== previousDate && !isFirstDate && !ctx.values.breakdown) {
					// Add separator row between dates
					const separatorCols = 9;
					table.push(Array.from({ length: separatorCols }, (_, i) => i === 1 ? pc.dim('─'.repeat(10)) : ''));
				}

				if (ctx.values.breakdown) {
					// In breakdown mode, show one row per day with aggregated totals
					table.push([
						data.date,
						formatModelsDisplayMultiline(data.modelsUsed),
						formatNumber(data.inputTokens),
						formatNumber(data.outputTokens),
						formatNumber(data.cacheCreationTokens),
						formatNumber(data.cacheReadTokens),
						formatNumber(getTotalTokens(data)),
						formatCurrency(data.totalCost),
					]);

					// Add model breakdown rows with aggregated data
						const aggregatedBreakdowns = aggregateModelBreakdowns(data.modelBreakdowns);
					// In breakdown mode, we need: ['', '└─ model', data...]
					for (const breakdown of aggregatedBreakdowns) {
						const totalTokens = breakdown.inputTokens + breakdown.outputTokens
							+ breakdown.cacheCreationTokens + breakdown.cacheReadTokens;

                        const formattedModelName = formatModelName(breakdown.modelName);

						table.push([
							'', // Empty Date column
							`  └─ ${formattedModelName}`, // Model name in Models column
							pc.gray(formatNumber(breakdown.inputTokens)),
							pc.gray(formatNumber(breakdown.outputTokens)),
							pc.gray(formatNumber(breakdown.cacheCreationTokens)),
							pc.gray(formatNumber(breakdown.cacheReadTokens)),
							pc.gray(formatNumber(totalTokens)),
							pc.gray(formatCurrency(breakdown.cost)),
						]);
					}
				}
				else {
					// Show separate rows for each source
					if (data.sourceBreakdowns?.length > 0) {
						for (const sourceBreakdown of data.sourceBreakdowns) {
							table.push([
								formatSources([sourceBreakdown.source]),
								data.date,
								formatModelsDisplayMultiline(data.modelsUsed),
								formatNumber(sourceBreakdown.inputTokens),
								formatNumber(sourceBreakdown.outputTokens),
								formatNumber(sourceBreakdown.cacheCreationTokens),
								formatNumber(sourceBreakdown.cacheReadTokens),
								formatNumber(sourceBreakdown.inputTokens + sourceBreakdown.outputTokens + sourceBreakdown.cacheCreationTokens + sourceBreakdown.cacheReadTokens),
								formatCurrency(sourceBreakdown.totalCost),
							]);
						}

						// Add total row if there are multiple sources
						if (data.sourceBreakdowns.length > 1) {
							table.push([
								pc.bold('TOTAL'),
								data.date,
								formatModelsDisplayMultiline(data.modelsUsed),
								formatNumber(data.inputTokens),
								formatNumber(data.outputTokens),
								formatNumber(data.cacheCreationTokens),
								formatNumber(data.cacheReadTokens),
								formatNumber(getTotalTokens(data)),
								formatCurrency(data.totalCost),
							]);
						}
					}
					else {
						// Fallback for data without source breakdowns
						table.push([
							'',
							data.date,
							formatModelsDisplayMultiline(data.modelsUsed),
							formatNumber(data.inputTokens),
							formatNumber(data.outputTokens),
							formatNumber(data.cacheCreationTokens),
							formatNumber(data.cacheReadTokens),
							formatNumber(getTotalTokens(data)),
							formatCurrency(data.totalCost),
						]);
					}
				}

				previousDate = data.date;
				isFirstDate = false;
			}

			// Add empty row for visual separation before totals
			const totalsCols = ctx.values.breakdown ? 8 : 9;
			table.push(Array.from({ length: totalsCols }, () => ''));

			// Add totals
			if (ctx.values.breakdown) {
				table.push([
					pc.yellow('Total'),
					'', // Empty for Models column in totals
					pc.yellow(formatNumber(totals.inputTokens)),
					pc.yellow(formatNumber(totals.outputTokens)),
					pc.yellow(formatNumber(totals.cacheCreationTokens)),
					pc.yellow(formatNumber(totals.cacheReadTokens)),
					pc.yellow(formatNumber(getTotalTokens(totals))),
					pc.yellow(formatCurrency(totals.totalCost)),
				]);
			}
			else {
				table.push([
					pc.yellow('Total'),
					'', // Empty for Date column in totals
					'', // Empty for Models column in totals
					pc.yellow(formatNumber(totals.inputTokens)),
					pc.yellow(formatNumber(totals.outputTokens)),
					pc.yellow(formatNumber(totals.cacheCreationTokens)),
					pc.yellow(formatNumber(totals.cacheReadTokens)),
					pc.yellow(formatNumber(getTotalTokens(totals))),
					pc.yellow(formatCurrency(totals.totalCost)),
				]);
			}

			log(table.toString());

			// Show guidance message if in compact mode
			if (table.isCompactMode()) {
				logger.info('\nRunning in Compact Mode');
				logger.info('Expand terminal width to see cache metrics and total tokens');
			}
		}
	},
});
