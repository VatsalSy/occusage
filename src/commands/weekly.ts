import process from 'node:process';
import { Result } from '@praha/byethrow';
import { define } from 'gunshi';
import pc from 'picocolors';
import { WEEK_DAYS } from '../_consts.ts';
import { processWithJq } from '../_jq-processor.ts';
import { sharedArgs } from '../_shared-args.ts';
import { formatCurrency, formatModelsDisplayMultiline, formatNumber, formatSources, pushBreakdownRows, ResponsiveTable } from '../_utils.ts';
import {
	calculateTotals,
	createTotalsObject,
	getTotalTokens,
} from '../calculate-cost.ts';
import { formatDateCompact, loadUnifiedWeeklyUsageData } from '../data-loader.ts';
import { detectMismatches, printMismatchReport } from '../debug.ts';
import { log, logger } from '../logger.ts';

export const weeklyCommand = define({
	name: 'weekly',
	description: 'Show usage report grouped by week',
	args: {
		...sharedArgs,
		startOfWeek: {
			type: 'enum',
			short: 'w',
			description: 'Day to start the week on',
			default: 'monday' as const,
			choices: WEEK_DAYS,
		},
	},
	toKebab: true,
	async run(ctx) {
		// --jq implies --json
		const useJson = ctx.values.json || ctx.values.jq != null;
		if (useJson) {
			logger.level = 0;
		}

		const weeklyData = await loadUnifiedWeeklyUsageData({
			since: ctx.values.since,
			until: ctx.values.until,
			timezone: ctx.values.timezone,
			mode: ctx.values.mode,
			order: ctx.values.order,
			offline: ctx.values.offline,
			startOfWeek: ctx.values.startOfWeek,
			locale: ctx.values.locale,
		});

		if (weeklyData.length === 0) {
			if (useJson) {
				const emptyOutput = {
					weekly: [],
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
		const totals = calculateTotals(weeklyData);

		// Show debug information if requested
		if (ctx.values.debug && !useJson) {
			const mismatchStats = await detectMismatches(undefined);
			printMismatchReport(mismatchStats, ctx.values.debugSamples);
		}

		if (useJson) {
			// Output JSON format
			const jsonOutput = {
				weekly: weeklyData.map(data => ({
					week: data.week,
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
			logger.box('Claude Code Token Usage Report - Weekly');

			// Create table with compact mode support
			const table = new ResponsiveTable({
				head: [
					'Source',
					'Week',
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
				colAligns: [
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
				compactHead: [
					'Source',
					'Week',
					'Models',
					'Input',
					'Output',
					'Cost (USD)',
				],
				compactColAligns: [
					'center',
					'left',
					'left',
					'right',
					'right',
					'right',
				],
				compactThreshold: 100,
			});

			// Add weekly data with visual separation between weeks
			let previousWeek = '';
			let isFirstWeek = true;

			for (const data of weeklyData) {
				// Add visual separation between different weeks
				if (data.week !== previousWeek && !isFirstWeek) {
					// Add separator row between weeks
					table.push(['', pc.dim('─'.repeat(15)), '', '', '', '', '', '', '']);
				}

				// Show separate rows for each source
				if (data.sourceBreakdowns?.length > 0) {
					for (const sourceBreakdown of data.sourceBreakdowns) {
						table.push([
							formatSources([sourceBreakdown.source]),
							data.week,
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
							data.week,
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
						data.week,
						formatModelsDisplayMultiline(data.modelsUsed),
						formatNumber(data.inputTokens),
						formatNumber(data.outputTokens),
						formatNumber(data.cacheCreationTokens),
						formatNumber(data.cacheReadTokens),
						formatNumber(getTotalTokens(data)),
						formatCurrency(data.totalCost),
					]);
				}

				// Add model breakdown rows if flag is set
				if (ctx.values.breakdown) {
					pushBreakdownRows(table, data.modelBreakdowns);
				}

				previousWeek = data.week;
				isFirstWeek = false;
			}

			// Add empty row for visual separation before totals
			table.push([
				'',
				'',
				'',
				'',
				'',
				'',
				'',
				'',
				'',
			]);

			// Add totals
			table.push([
				pc.yellow('Total'),
				'', // Empty for Week column in totals
				'', // Empty for Models column in totals
				pc.yellow(formatNumber(totals.inputTokens)),
				pc.yellow(formatNumber(totals.outputTokens)),
				pc.yellow(formatNumber(totals.cacheCreationTokens)),
				pc.yellow(formatNumber(totals.cacheReadTokens)),
				pc.yellow(formatNumber(getTotalTokens(totals))),
				pc.yellow(formatCurrency(totals.totalCost)),
			]);

			log(table.toString());

			// Show guidance message if in compact mode
			if (table.isCompactMode()) {
				logger.info('\nRunning in Compact Mode');
				logger.info('Expand terminal width to see cache metrics and total tokens');
			}
		}
	},
});
