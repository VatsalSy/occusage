import process from 'node:process';
import { Result } from '@praha/byethrow';
import { define } from 'gunshi';
import pc from 'picocolors';
import { processWithJq } from '../_jq-processor.ts';
import { sharedCommandConfig } from '../_shared-args.ts';
import { formatCurrency, formatModelsDisplayMultiline, formatNumber, formatSources, pushBreakdownRows, ResponsiveTable } from '../_utils.ts';
import {
	calculateTotals,
	createTotalsObject,
	getTotalTokens,
} from '../calculate-cost.ts';
import { formatDateCompact, loadUnifiedSessionData } from '../data-loader.ts';
import { detectMismatches, printMismatchReport } from '../debug.ts';
import { log, logger } from '../logger.ts';

export const sessionCommand = define({
	name: 'session',
	description: 'Show usage report grouped by conversation session',
	...sharedCommandConfig,
	async run(ctx) {
		// --jq implies --json
		const useJson = ctx.values.json || ctx.values.jq != null;
		if (useJson) {
			logger.level = 0;
		}

		const sessionData = await loadUnifiedSessionData({
			since: ctx.values.since,
			until: ctx.values.until,
			mode: ctx.values.mode,
			order: ctx.values.order,
			offline: ctx.values.offline,
			timezone: ctx.values.timezone,
			locale: ctx.values.locale,
		});

		if (sessionData.length === 0) {
			if (useJson) {
				log(JSON.stringify([]));
			}
			else {
				logger.warn('No Claude usage data found.');
			}
			process.exit(0);
		}

		// Calculate totals
		const totals = calculateTotals(sessionData);

		// Show debug information if requested
		if (ctx.values.debug && !useJson) {
			const mismatchStats = await detectMismatches(undefined);
			printMismatchReport(mismatchStats, ctx.values.debugSamples);
		}

		if (useJson) {
			// Output JSON format
			const jsonOutput = {
				sessions: sessionData.map(data => ({
					sessionId: data.sessionId,
					inputTokens: data.inputTokens,
					outputTokens: data.outputTokens,
					cacheCreationTokens: data.cacheCreationTokens,
					cacheReadTokens: data.cacheReadTokens,
					totalTokens: getTotalTokens(data),
					totalCost: data.totalCost,
					lastActivity: data.lastActivity,
					modelsUsed: data.modelsUsed,
					modelBreakdowns: data.modelBreakdowns,
					projectPath: data.projectPath,
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
			logger.box('Claude Code Token Usage Report - By Session');

			// Create table with compact mode support
			// When breakdown is enabled, remove Source column for cleaner display
			const table = new ResponsiveTable({
				head: ctx.values.breakdown
					? [
							'Session',
							'Models',
							'Input',
							'Output',
							'Cache Create',
							'Cache Read',
							'Total Tokens',
							'Cost (USD)',
							'Last Activity',
						]
					: [
							'Source',
							'Session',
							'Models',
							'Input',
							'Output',
							'Cache Create',
							'Cache Read',
							'Total Tokens',
							'Cost (USD)',
							'Last Activity',
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
							'left',
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
							'left',
						],
				dateFormatter: (dateStr: string) => formatDateCompact(dateStr, ctx.values.timezone, ctx.values.locale),
				compactHead: ctx.values.breakdown
					? [
							'Session',
							'Models',
							'Input',
							'Output',
							'Cost (USD)',
							'Last Activity',
						]
					: [
							'Source',
							'Session',
							'Models',
							'Input',
							'Output',
							'Cost (USD)',
							'Last Activity',
						],
				compactColAligns: ctx.values.breakdown
					? [
							'left',
							'left',
							'right',
							'right',
							'right',
							'left',
						]
					: [
							'center',
							'left',
							'left',
							'right',
							'right',
							'right',
							'left',
						],
				compactThreshold: 100,
			});

			// Add session data
			let maxSessionLength = 0;
			for (const data of sessionData) {
				const sessionDisplay = data.sessionId.split('-').slice(-2).join('-'); // Display last two parts of session ID

				maxSessionLength = Math.max(maxSessionLength, sessionDisplay.length);

				if (ctx.values.breakdown) {
					// In breakdown mode, show one row per session with aggregated totals
					table.push([
						sessionDisplay,
						formatModelsDisplayMultiline(data.modelsUsed),
						formatNumber(data.inputTokens),
						formatNumber(data.outputTokens),
						formatNumber(data.cacheCreationTokens),
						formatNumber(data.cacheReadTokens),
						formatNumber(getTotalTokens(data)),
						formatCurrency(data.totalCost),
						data.lastActivity,
					]);

					// Add model breakdown rows
					pushBreakdownRows(table, data.modelBreakdowns, 1, 1);
				}
				else {
					// Normal mode: show separate rows for each source
					if (data.sourceBreakdowns?.length > 0) {
						for (const sourceBreakdown of data.sourceBreakdowns) {
							table.push([
								formatSources([sourceBreakdown.source]),
								sessionDisplay,
								formatModelsDisplayMultiline(data.modelsUsed),
								formatNumber(sourceBreakdown.inputTokens),
								formatNumber(sourceBreakdown.outputTokens),
								formatNumber(sourceBreakdown.cacheCreationTokens),
								formatNumber(sourceBreakdown.cacheReadTokens),
								formatNumber(sourceBreakdown.inputTokens + sourceBreakdown.outputTokens + sourceBreakdown.cacheCreationTokens + sourceBreakdown.cacheReadTokens),
								formatCurrency(sourceBreakdown.totalCost),
								data.lastActivity,
							]);
						}

						// Add total row if there are multiple sources
						if (data.sourceBreakdowns.length > 1) {
							table.push([
								pc.bold('TOTAL'),
								sessionDisplay,
								formatModelsDisplayMultiline(data.modelsUsed),
								formatNumber(data.inputTokens),
								formatNumber(data.outputTokens),
								formatNumber(data.cacheCreationTokens),
								formatNumber(data.cacheReadTokens),
								formatNumber(getTotalTokens(data)),
								formatCurrency(data.totalCost),
								data.lastActivity,
							]);
						}
					}
					else {
						// Fallback for data without source breakdowns
						table.push([
							'',
							sessionDisplay,
							formatModelsDisplayMultiline(data.modelsUsed),
							formatNumber(data.inputTokens),
							formatNumber(data.outputTokens),
							formatNumber(data.cacheCreationTokens),
							formatNumber(data.cacheReadTokens),
							formatNumber(getTotalTokens(data)),
							formatCurrency(data.totalCost),
							data.lastActivity,
						]);
					}
				}
			}

			// Add empty row for visual separation before totals
			const totalsCols = ctx.values.breakdown ? 9 : 10;
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
					'',
				]);
			}
			else {
				table.push([
					pc.yellow('Total'),
					'', // Empty for Session column in totals
					'', // Empty for Models column in totals
					pc.yellow(formatNumber(totals.inputTokens)),
					pc.yellow(formatNumber(totals.outputTokens)),
					pc.yellow(formatNumber(totals.cacheCreationTokens)),
					pc.yellow(formatNumber(totals.cacheReadTokens)),
					pc.yellow(formatNumber(getTotalTokens(totals))),
					pc.yellow(formatCurrency(totals.totalCost)),
					'',
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
