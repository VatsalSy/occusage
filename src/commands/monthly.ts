import type { MonthlyUsage } from '../data-loader.ts';
import process from 'node:process';
import { Result } from '@praha/byethrow';
import { define } from 'gunshi';
import pc from 'picocolors';
import { processWithJq } from '../_jq-processor.ts';
import { sharedArgs } from '../_shared-args.ts';
import { aggregateModelBreakdowns, formatCurrency, formatModelName, formatModelsDisplayMultiline, formatNumber, formatSources, ResponsiveTable } from '../_utils.ts';
import {
	calculateTotals,
	createTotalsObject,
	getTotalTokens,
} from '../calculate-cost.ts';
import { formatDateCompact, loadUnifiedMonthlyUsageData } from '../data-loader.ts';
import { detectMismatches, printMismatchReport } from '../debug.ts';
import { log, logger } from '../logger.ts';

/**
 * Aggregates model breakdowns across all sources for a monthly period
 * This ensures we show combined totals per model in breakdown mode
 */
function aggregateMonthlyModelBreakdowns(data: MonthlyUsage) {
    return aggregateModelBreakdowns(data.modelBreakdowns);
}

export const monthlyCommand = define({
	name: 'monthly',
	description: 'Show usage report grouped by month',
	args: {
		...sharedArgs,
		startOfMonth: {
			type: 'number',
			short: 'M',
			description: 'Day of month to start billing cycle on (1-31)',
			default: 28,
		},
	},
	toKebab: true,
	async run(ctx) {
		// --jq implies --json
		const useJson = ctx.values.json || ctx.values.jq != null;
		if (useJson) {
			logger.level = 0;
		}

        // Validate startOfMonth is within 1-31
        const startOfMonth = Number(ctx.values.startOfMonth);
        if (Number.isFinite(startOfMonth) && (startOfMonth < 1 || startOfMonth > 31)) {
            logger.error('Start of month must be between 1 and 31');
            process.exit(1);
        }

		const monthlyData = await loadUnifiedMonthlyUsageData({
			since: ctx.values.since,
			until: ctx.values.until,
			mode: ctx.values.mode,
			order: ctx.values.order,
			offline: ctx.values.offline,
			timezone: ctx.values.timezone,
			locale: ctx.values.locale,
			startOfMonth: ctx.values.startOfMonth,
		});

		if (monthlyData.length === 0) {
			if (useJson) {
				const emptyOutput = {
					monthly: [],
					totals: {
						inputTokens: 0,
						outputTokens: 0,
						cacheCreationTokens: 0,
						cacheReadTokens: 0,
						totalTokens: 0,
						totalCost: 0,
					},
				};
				log(JSON.stringify(emptyOutput, null, 2));
			}
			else {
				logger.warn('No Claude usage data found.');
			}
			process.exit(0);
		}

		// Calculate totals
		const totals = calculateTotals(monthlyData);

		// Show debug information if requested
		if (ctx.values.debug && !useJson) {
			const mismatchStats = await detectMismatches(undefined);
			printMismatchReport(mismatchStats, ctx.values.debugSamples);
		}

		if (useJson) {
			// Output JSON format
			const jsonOutput = {
				monthly: monthlyData.map(data => ({
					month: data.month,
					inputTokens: data.inputTokens,
					outputTokens: data.outputTokens,
					cacheCreationTokens: data.cacheCreationTokens,
					cacheReadTokens: data.cacheReadTokens,
					totalTokens: getTotalTokens(data),
					totalCost: data.totalCost,
					modelsUsed: data.modelsUsed,
					modelBreakdowns: data.modelBreakdowns,
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
			logger.box('Open+Claude Code Token Usage Report - Monthly');

			// Create table with compact mode support
			const table = new ResponsiveTable({
				head: ctx.values.breakdown
					? [
							'Month',
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
							'Month',
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
							'Month',
							'Models',
							'Input',
							'Output',
							'Cost (USD)',
						]
					: [
							'Source',
							'Month',
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

			// Add monthly data
			let previousMonth = '';
			let isFirstMonth = true;

			for (const data of monthlyData) {
				// Format month display with start day indicator
				const startDay = ctx.values.startOfMonth;
				const monthDisplay = startDay !== 1 ? `${data.month} (${startDay}th)` : data.month;

				if (ctx.values.breakdown) {
					// In breakdown mode, show aggregated totals per month
					// Show one row per month with aggregated totals
					table.push([
						monthDisplay,
						formatModelsDisplayMultiline(data.modelsUsed),
						formatNumber(data.inputTokens),
						formatNumber(data.outputTokens),
						formatNumber(data.cacheCreationTokens),
						formatNumber(data.cacheReadTokens),
						formatNumber(getTotalTokens(data)),
						formatCurrency(data.totalCost),
					]);

					// Add model breakdown rows with aggregated data
                    const aggregatedBreakdowns = aggregateMonthlyModelBreakdowns(data);
					for (const breakdown of aggregatedBreakdowns) {
						const totalTokens = breakdown.inputTokens + breakdown.outputTokens
							+ breakdown.cacheCreationTokens + breakdown.cacheReadTokens;

                        const formattedModelName = formatModelName(breakdown.modelName);

						table.push([
							'', // Empty Month column
							`└─ ${formattedModelName}`, // Model name in Models column
							formatNumber(breakdown.inputTokens),
							formatNumber(breakdown.outputTokens),
							formatNumber(breakdown.cacheCreationTokens),
							formatNumber(breakdown.cacheReadTokens),
							formatNumber(totalTokens),
							formatCurrency(breakdown.cost),
						]);
					}
				}
				else {
					// Normal mode with source separation
					// Add visual separation between different months
					if (data.month !== previousMonth && !isFirstMonth) {
						// Add separator row between months
						table.push(['', pc.dim('─'.repeat(15)), '', '', '', '', '', '', '']);
					}

					// Show separate rows for each source
					if (data.sourceBreakdowns?.length > 0) {
						for (const sourceBreakdown of data.sourceBreakdowns) {
							table.push([
								formatSources([sourceBreakdown.source]),
								monthDisplay,
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
								monthDisplay,
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
							monthDisplay,
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

				previousMonth = data.month;
				isFirstMonth = false;
			}

			// Add empty row for visual separation before totals
			const emptyRowCols = ctx.values.breakdown ? 8 : 9;
			table.push(Array.from({ length: emptyRowCols }, () => ''));

			// Add totals
			if (ctx.values.breakdown) {
				// Breakdown mode: 8 columns
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
				// Normal mode: 9 columns
				table.push([
					pc.yellow('Total'),
					'', // Empty for Month column in totals
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
