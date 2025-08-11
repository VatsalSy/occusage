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
import { formatDateCompact, loadUnifiedProjectData } from '../data-loader.ts';
import { detectMismatches, printMismatchReport } from '../debug.ts';
import { log, logger } from '../logger.ts';

export const projectCommand = define({
	name: 'project',
	description: 'Show usage report grouped by project',
	...sharedCommandConfig,
	async run(ctx) {
		// --jq implies --json
		const useJson = ctx.values.json || ctx.values.jq != null;
		if (useJson) {
			logger.level = 0;
		}

		const projectData = await loadUnifiedProjectData({
			since: ctx.values.since,
			until: ctx.values.until,
			mode: ctx.values.mode,
			order: ctx.values.order,
			offline: ctx.values.offline,
			timezone: ctx.values.timezone,
			locale: ctx.values.locale,
		});

		if (projectData.length === 0) {
			if (useJson) {
				log(JSON.stringify([]));
			}
			else {
				logger.warn('No Claude usage data found.');
			}
			process.exit(0);
		}

		// Calculate totals
		const totals = calculateTotals(projectData);

		// Show debug information if requested
		if (ctx.values.debug && !useJson) {
			const mismatchStats = await detectMismatches(undefined);
			printMismatchReport(mismatchStats, ctx.values.debugSamples);
		}

		if (useJson) {
			// Output JSON format
			const jsonOutput = {
				projects: projectData.map(data => ({
					projectName: data.projectName,
					inputTokens: data.inputTokens,
					outputTokens: data.outputTokens,
					cacheCreationTokens: data.cacheCreationTokens,
					cacheReadTokens: data.cacheReadTokens,
					totalTokens: getTotalTokens(data),
					totalCost: data.totalCost,
					lastActivity: data.lastActivity,
					modelsUsed: data.modelsUsed,
					modelBreakdowns: data.modelBreakdowns,
					sourceBreakdowns: data.sourceBreakdowns,
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
			logger.box('Claude Code Token Usage Report - By Project');

			// Create table with compact mode support
			// When breakdown is enabled, remove Source column for cleaner display
			const table = new ResponsiveTable({
				head: ctx.values.breakdown
					? [
							'Project',
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
							'Project',
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
							'Project',
							'Models',
							'Input',
							'Output',
							'Cost (USD)',
							'Last Activity',
						]
					: [
							'Source',
							'Project',
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

			// Add project data with visual separation between projects
			let isFirstProject = true;

			for (let i = 0; i < projectData.length; i++) {
				const data = projectData[i];

				// Add visual separation before projects with multiple sources (but not before the first project)
				if (!isFirstProject && !ctx.values.breakdown && data.sourceBreakdowns?.length > 1) {
					// Add separator row before projects that have multiple sources
					const separatorCols = 10;
					table.push(Array.from({ length: separatorCols }, (_, idx) => idx === 1 ? pc.dim('───────────────') : ''));
				}

				if (ctx.values.breakdown) {
					// In breakdown mode, show one row per project with aggregated totals
					table.push([
						data.projectName,
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
								data.projectName,
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
								data.projectName,
								formatModelsDisplayMultiline(data.modelsUsed),
								formatNumber(data.inputTokens),
								formatNumber(data.outputTokens),
								formatNumber(data.cacheCreationTokens),
								formatNumber(data.cacheReadTokens),
								formatNumber(getTotalTokens(data)),
								formatCurrency(data.totalCost),
								data.lastActivity,
							]);

							// Add separator after TOTAL row (if not the last project)
							if (i < projectData.length - 1) {
								const separatorCols = 10;
								table.push(Array.from({ length: separatorCols }, (_, idx) => idx === 1 ? pc.dim('───────────────') : ''));
							}
						}
					}
					else {
						// Fallback for data without source breakdowns
						table.push([
							'',
							data.projectName,
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

				isFirstProject = false;
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
					'', // Empty for Project column in totals
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
