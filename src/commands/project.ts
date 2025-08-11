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
	description: 'Show usage report grouped by project (current week by default)',
	args: {
		...sharedCommandConfig.args,
		full: {
			type: 'boolean',
			short: 'f',
			description: 'Show all projects without time restriction',
			default: false,
		},
	},
	toKebab: true,
	async run(ctx) {
		// --jq implies --json
		const useJson = ctx.values.json || ctx.values.jq != null;
		if (useJson) {
			logger.level = 0;
		}

		// Calculate current week boundaries if --full is not specified
		let since = ctx.values.since;
		const until = ctx.values.until;

		if (!ctx.values.full && since == null && until == null) {
			// Calculate current week (Monday to Sunday) using the specified timezone
			const timezone = ctx.values.timezone || Intl.DateTimeFormat().resolvedOptions().timeZone;
			const formatter = new Intl.DateTimeFormat('en-US', {
				timeZone: timezone,
				year: 'numeric',
				month: '2-digit',
				day: '2-digit',
				weekday: 'long',
			});

			const partsToRecord = (date: Date): Record<string, string> => {
				return Object.fromEntries(formatter.formatToParts(date).map(p => [p.type, p.value]));
			};

			const nowParts = partsToRecord(new Date());
			const weekdayName = nowParts.weekday;
			const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
			const currentIndex = days.indexOf(weekdayName as typeof days[number]);
			const mondayOffset = currentIndex === 0 ? -6 : -(currentIndex - 1); // Days to subtract to get to Monday

			const mondayParts = partsToRecord(new Date(Date.now() + mondayOffset * 24 * 60 * 60 * 1000));
			since = `${mondayParts.year}${mondayParts.month}${mondayParts.day}`;
		}

		const projectData = await loadUnifiedProjectData({
			since,
			until,
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
			try {
				const mismatchStats = await detectMismatches(undefined);
				printMismatchReport(mismatchStats, ctx.values.debugSamples);
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				logger.debug(`Debug mismatch detection skipped: ${message}`);
			}
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
			logger.box('Open+Claude Code Token Usage Report - By Project');

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
				if (data == null) {
					continue;
				}

				// Add visual separation before projects with multiple sources (but not before the first project)
						if (!isFirstProject && !ctx.values.breakdown) {
					const sourceBreakdowns = data.sourceBreakdowns;
					if (sourceBreakdowns != null && sourceBreakdowns.length > 1) {
						// Add separator row before projects that have multiple sources
								const separatorCols = table.columnCount;
						table.push(Array.from({ length: separatorCols }, (_, idx) => (idx === 1 ? pc.dim('───────────────') : '')));
					}
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
					if ((data.sourceBreakdowns != null) && data.sourceBreakdowns.length > 0) {
						const sourceBreakdowns = data.sourceBreakdowns;
						for (const sourceBreakdown of sourceBreakdowns) {
							table.push([
								formatSources([sourceBreakdown.source]),
								data.projectName,
								formatModelsDisplayMultiline(data.modelsUsed),
								formatNumber(sourceBreakdown.inputTokens),
								formatNumber(sourceBreakdown.outputTokens),
								formatNumber(sourceBreakdown.cacheCreationTokens),
								formatNumber(sourceBreakdown.cacheReadTokens),
								formatNumber(getTotalTokens(sourceBreakdown)),
								formatCurrency(sourceBreakdown.totalCost),
								data.lastActivity,
							]);
						}

						// Add total row if there are multiple sources
						if (sourceBreakdowns.length > 1) {
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
									const separatorCols = table.columnCount;
								table.push(Array.from({ length: separatorCols }, (_, idx) => (idx === 1 ? pc.dim('───────────────') : '')));
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
			const totalsCols = table.columnCount;
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
