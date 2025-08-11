import type { SessionBlock } from '../_session-blocks.ts';
import process from 'node:process';
import { Result } from '@praha/byethrow';
import { define } from 'gunshi';
import pc from 'picocolors';
import { BLOCKS_COMPACT_WIDTH_THRESHOLD, BLOCKS_DEFAULT_TERMINAL_WIDTH, BLOCKS_WARNING_THRESHOLD, DEFAULT_RECENT_DAYS, DEFAULT_REFRESH_INTERVAL_SECONDS, MAX_REFRESH_INTERVAL_SECONDS, MIN_REFRESH_INTERVAL_SECONDS } from '../_consts.ts';
import { processWithJq } from '../_jq-processor.ts';
import {
	calculateBurnRate,
	DEFAULT_SESSION_DURATION_HOURS,
	filterRecentBlocks,
	projectBlockUsage,

} from '../_session-blocks.ts';
import { sharedCommandConfig } from '../_shared-args.ts';
import { getTotalTokens } from '../_token-utils.ts';
import { formatCurrency, formatModelName, formatModelsDisplayMultiline, formatNumber, formatSources, ResponsiveTable } from '../_utils.ts';
import { getClaudePaths, loadSessionBlockData } from '../data-loader.ts';
import { log, logger } from '../logger.ts';
import { startLiveMonitoring } from './_blocks.live.ts';

/**
 * Formats the block period display (start time)
 * @param block - Session block to format
 * @param compact - Whether to use compact formatting for narrow terminals
 * @param locale - Locale for date/time formatting
 * @returns Formatted block period string
 */
function formatBlockPeriod(block: SessionBlock, compact = false, locale?: string): string {
	if (block.isGap ?? false) {
		const start = compact
			? block.startTime.toLocaleString(locale, {
					month: '2-digit',
					day: '2-digit',
					hour: '2-digit',
					minute: '2-digit',
				})
			: block.startTime.toLocaleString(locale, {
					month: 'short',
					day: 'numeric',
					hour: 'numeric',
					minute: '2-digit',
				});
		const end = compact
			? block.endTime.toLocaleString(locale, {
					hour: '2-digit',
					minute: '2-digit',
				})
			: block.endTime.toLocaleString(locale, {
					hour: 'numeric',
					minute: '2-digit',
				});
		return compact ? `${start}-${end}` : `${start} - ${end}`;
	}

	return compact
		? block.startTime.toLocaleString(locale, {
				month: '2-digit',
				day: '2-digit',
				hour: '2-digit',
				minute: '2-digit',
			})
		: block.startTime.toLocaleString(locale, {
				month: 'short',
				day: 'numeric',
				hour: 'numeric',
				minute: '2-digit',
			});
}

/**
 * Formats the duration/status display for a session block
 * @param block - Session block to format
 * @param compact - Whether to use compact formatting for narrow terminals
 * @returns Formatted duration/status string
 */
function formatBlockStatus(block: SessionBlock, compact = false): string {
	if (block.isGap ?? false) {
		const duration = Math.round((block.endTime.getTime() - block.startTime.getTime()) / (1000 * 60 * 60));
		return pc.gray(`GAP (${duration}h)`);
	}

	if (block.isActive) {
		const now = new Date();
		const elapsed = Math.round((now.getTime() - block.startTime.getTime()) / (1000 * 60));
		const remaining = Math.round((block.endTime.getTime() - now.getTime()) / (1000 * 60));
		const elapsedHours = Math.floor(elapsed / 60);
		const elapsedMins = elapsed % 60;
		const remainingHours = Math.floor(remaining / 60);
		const remainingMins = remaining % 60;

		if (compact) {
			return pc.green(`ACTIVE\n(${elapsedHours}h${elapsedMins}m/${remainingHours}h${remainingMins}m)`);
		}
		return pc.green(`ACTIVE (${elapsedHours}h ${elapsedMins}m / ${remainingHours}h ${remainingMins}m)`);
	}

	const duration = block.actualEndTime != null
		? Math.round((block.actualEndTime.getTime() - block.startTime.getTime()) / (1000 * 60))
		: 0;

	const hours = Math.floor(duration / 60);
	const mins = duration % 60;
	if (compact) {
		return hours > 0 ? `${hours}h${mins}m` : `${mins}m`;
	}
	return hours > 0 ? `${hours}h ${mins}m` : `${mins}m`;
}

/**
 * Formats the list of models used in a block for display
 * @param models - Array of model names
 * @returns Formatted model names string
 */
function formatModels(models: string[]): string {
	if (models.length === 0) {
		return '-';
	}
	// Use consistent multiline format across all commands
	return formatModelsDisplayMultiline(models);
}



/**
 * Parses token limit argument, supporting 'max' keyword
 * @param value - Token limit string value
 * @param maxFromAll - Maximum token count found in all blocks
 * @returns Parsed token limit or undefined if invalid
 */
function parseTokenLimit(value: string | undefined, maxFromAll: number): number | undefined {
	if (value == null || value === '' || value === 'max') {
		return maxFromAll > 0 ? maxFromAll : undefined;
	}

	const limit = Number.parseInt(value, 10);
	return Number.isNaN(limit) ? undefined : limit;
}

export const blocksCommand = define({
	name: 'blocks',
	description: 'Show usage report grouped by session billing blocks',
	args: {
		...sharedCommandConfig.args,
		active: {
			type: 'boolean',
			short: 'a',
			description: 'Show only active block with projections',
			default: false,
		},
		recent: {
			type: 'boolean',
			short: 'r',
			description: `Show blocks from last ${DEFAULT_RECENT_DAYS} days (including active)`,
			default: false,
		},
		tokenLimit: {
			type: 'string',
			short: 't',
			description: 'Token limit for quota warnings (e.g., 500000 or "max")',
		},
		sessionLength: {
			type: 'number',
			short: 'n',
			description: `Session block duration in hours (default: ${DEFAULT_SESSION_DURATION_HOURS})`,
			default: DEFAULT_SESSION_DURATION_HOURS,
		},
		live: {
			type: 'boolean',
			description: 'Live monitoring mode with real-time updates',
			default: false,
		},
		refreshInterval: {
			type: 'number',
			description: `Refresh interval in seconds for live mode (default: ${DEFAULT_REFRESH_INTERVAL_SECONDS})`,
			default: DEFAULT_REFRESH_INTERVAL_SECONDS,
		},
	},
	toKebab: true,
	async run(ctx) {
		// --jq implies --json
		const useJson = ctx.values.json || ctx.values.jq != null;
		if (useJson) {
			logger.level = 0;
		}

		// Validate session length
		if (ctx.values.sessionLength <= 0) {
			logger.error('Session length must be a positive number');
			process.exit(1);
		}

		let blocks = await loadSessionBlockData({
			since: ctx.values.since,
			until: ctx.values.until,
			mode: ctx.values.mode,
			order: ctx.values.order,
			offline: ctx.values.offline,
			sessionDurationHours: ctx.values.sessionLength,
			timezone: ctx.values.timezone,
			locale: ctx.values.locale,
		});

		if (blocks.length === 0) {
			if (useJson) {
				log(JSON.stringify({ blocks: [] }));
			}
			else {
				logger.warn('No Claude usage data found.');
			}
			process.exit(0);
		}

		// Calculate max tokens from ALL blocks before applying filters
		let maxTokensFromAll = 0;
		if (ctx.values.tokenLimit === 'max' || ctx.values.tokenLimit == null || ctx.values.tokenLimit === '') {
			for (const block of blocks) {
				if (!(block.isGap ?? false) && !block.isActive) {
					const blockTokens = getTotalTokens(block.tokenCounts);
					if (blockTokens > maxTokensFromAll) {
						maxTokensFromAll = blockTokens;
					}
				}
			}
			if (!useJson && maxTokensFromAll > 0) {
				logger.info(`Using max tokens from previous sessions: ${formatNumber(maxTokensFromAll)}`);
			}
		}

		// Apply filters
		if (ctx.values.recent) {
			blocks = filterRecentBlocks(blocks, DEFAULT_RECENT_DAYS);
		}

		if (ctx.values.active) {
			blocks = blocks.filter((block: SessionBlock) => block.isActive);
			if (blocks.length === 0) {
				if (useJson) {
					log(JSON.stringify({ blocks: [], message: 'No active block' }));
				}
				else {
					logger.info('No active session block found.');
				}
				process.exit(0);
			}
		}

		// Live monitoring mode
		if (ctx.values.live && !useJson) {
			// Live mode only shows active blocks
			if (!ctx.values.active) {
				logger.info('Live mode automatically shows only active blocks.');
			}

			// Default to 'max' if no token limit specified in live mode
			let tokenLimitValue = ctx.values.tokenLimit;
			if (tokenLimitValue == null || tokenLimitValue === '') {
				tokenLimitValue = 'max';
				if (maxTokensFromAll > 0) {
					logger.info(`No token limit specified, using max from previous sessions: ${formatNumber(maxTokensFromAll)}`);
				}
			}

			// Validate refresh interval
			const refreshInterval = Math.max(MIN_REFRESH_INTERVAL_SECONDS, Math.min(MAX_REFRESH_INTERVAL_SECONDS, ctx.values.refreshInterval));
			if (refreshInterval !== ctx.values.refreshInterval) {
				logger.warn(`Refresh interval adjusted to ${refreshInterval} seconds (valid range: ${MIN_REFRESH_INTERVAL_SECONDS}-${MAX_REFRESH_INTERVAL_SECONDS})`);
			}

			// Start live monitoring
			const paths = getClaudePaths();
			if (paths.length === 0) {
				logger.error('No valid Claude data directory found');
				throw new Error('No valid Claude data directory found');
			}

			await startLiveMonitoring({
				claudePaths: paths,
				tokenLimit: parseTokenLimit(tokenLimitValue, maxTokensFromAll),
				refreshInterval: refreshInterval * 1000, // Convert to milliseconds
				sessionDurationHours: ctx.values.sessionLength,
				mode: ctx.values.mode,
				order: ctx.values.order,
			});
			return; // Exit early, don't show table
		}

		if (useJson) {
			// Calculate totals for JSON output
			let totalInputTokens = 0;
			let totalOutputTokens = 0;
			let totalCacheCreationTokens = 0;
			let totalCacheReadTokens = 0;
			let totalCost = 0;
			let activeBlockData: {
				burnRate: { tokensPerMinute: number; costPerHour: number } | null;
				projection: { totalTokens: number; totalCost: number; remainingMinutes: number } | null;
				tokenLimit: {
					limit: number;
					currentUsage: number;
					currentPercent: number;
					projectedUsage?: number;
					projectedPercent?: number;
					status: string;
				} | null;
			} | null = null;

			for (const block of blocks) {
				if (!(block.isGap ?? false)) {
					totalInputTokens += block.tokenCounts.inputTokens;
					totalOutputTokens += block.tokenCounts.outputTokens;
					totalCacheCreationTokens += block.tokenCounts.cacheCreationInputTokens;
					totalCacheReadTokens += block.tokenCounts.cacheReadInputTokens;
					totalCost += block.costUSD;

					if (block.isActive) {
						const burnRate = calculateBurnRate(block);
						const projection = projectBlockUsage(block);
						const actualTokenLimit = parseTokenLimit(ctx.values.tokenLimit, maxTokensFromAll);

						activeBlockData = {
							burnRate: burnRate != null
								? {
										tokensPerMinute: burnRate.tokensPerMinute,
										costPerHour: burnRate.costPerHour,
									}
								: null,
							projection: projection != null
								? {
										totalTokens: projection.totalTokens,
										totalCost: projection.totalCost,
										remainingMinutes: projection.remainingMinutes,
									}
								: null,
							tokenLimit: actualTokenLimit != null
								? {
										limit: actualTokenLimit,
										currentUsage: getTotalTokens(block.tokenCounts),
										currentPercent: (getTotalTokens(block.tokenCounts) / actualTokenLimit) * 100,
										projectedUsage: projection?.totalTokens,
										projectedPercent: projection != null ? (projection.totalTokens / actualTokenLimit) * 100 : undefined,
										status: projection != null && projection.totalTokens > actualTokenLimit
											? 'exceeds'
											: projection != null && projection.totalTokens > actualTokenLimit * BLOCKS_WARNING_THRESHOLD
												? 'warning'
												: 'ok',
									}
								: null,
						};
					}
				}
			}

			// JSON output with consistent structure
			const jsonOutput = {
				blocks: blocks.map((block: SessionBlock) => ({
					id: block.id,
					period: {
						start: block.startTime.toISOString(),
						end: block.endTime.toISOString(),
						actualEnd: block.actualEndTime?.toISOString(),
					},
					status: (block.isGap ?? false) ? 'gap' : block.isActive ? 'active' : 'completed',
					usage: {
						inputTokens: block.tokenCounts.inputTokens,
						outputTokens: block.tokenCounts.outputTokens,
						cacheCreationTokens: block.tokenCounts.cacheCreationInputTokens,
						cacheReadTokens: block.tokenCounts.cacheReadInputTokens,
						totalTokens: getTotalTokens(block.tokenCounts),
					},
					cost: block.costUSD,
					models: block.models,
					sources: block.sources,
					entries: block.entries.length,
					...(block.usageLimitResetTime != null && { usageLimitResetTime: block.usageLimitResetTime.toISOString() }),
				})),
				totals: {
					inputTokens: totalInputTokens,
					outputTokens: totalOutputTokens,
					cacheCreationTokens: totalCacheCreationTokens,
					cacheReadTokens: totalCacheReadTokens,
					totalTokens: totalInputTokens + totalOutputTokens + totalCacheCreationTokens + totalCacheReadTokens,
					totalCost,
				},
				...(activeBlockData != null && { projections: activeBlockData }),
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
			// Table output
			if (ctx.values.active && blocks.length === 1) {
				// Detailed active block view
				const block = blocks[0] as SessionBlock;
				if (block == null) {
					logger.warn('No active block found.');
					process.exit(0);
				}
				const burnRate = calculateBurnRate(block);
				const projection = projectBlockUsage(block);

				logger.box('Current Session Block Status');

				const now = new Date();
				const elapsed = Math.round(
					(now.getTime() - block.startTime.getTime()) / (1000 * 60),
				);
				const remaining = Math.round(
					(block.endTime.getTime() - now.getTime()) / (1000 * 60),
				);

				log(`Block Started: ${pc.cyan(block.startTime.toLocaleString())} (${pc.yellow(`${Math.floor(elapsed / 60)}h ${elapsed % 60}m`)} ago)`);
				log(`Time Remaining: ${pc.green(`${Math.floor(remaining / 60)}h ${remaining % 60}m`)}\n`);

				log(pc.bold('Current Usage:'));
				log(`  Input Tokens:     ${formatNumber(block.tokenCounts.inputTokens)}`);
				log(`  Output Tokens:    ${formatNumber(block.tokenCounts.outputTokens)}`);
				log(`  Total Cost:       ${formatCurrency(block.costUSD)}\n`);

				if (burnRate != null) {
					log(pc.bold('Burn Rate:'));
					log(`  Tokens/minute:    ${formatNumber(burnRate.tokensPerMinute)}`);
					log(`  Cost/hour:        ${formatCurrency(burnRate.costPerHour)}\n`);
				}

				if (projection != null) {
					log(pc.bold('Projected Usage (if current rate continues):'));
					log(`  Total Tokens:     ${formatNumber(projection.totalTokens)}`);
					log(`  Total Cost:       ${formatCurrency(projection.totalCost)}\n`);

					if (ctx.values.tokenLimit != null) {
						// Parse token limit
						const limit = parseTokenLimit(ctx.values.tokenLimit, maxTokensFromAll);
						if (limit != null && limit > 0) {
							const currentTokens = getTotalTokens(block.tokenCounts);
							const remainingTokens = Math.max(0, limit - currentTokens);
							const percentUsed = (projection.totalTokens / limit) * 100;
							const status = percentUsed > 100
								? pc.red('EXCEEDS LIMIT')
								: percentUsed > BLOCKS_WARNING_THRESHOLD * 100
									? pc.yellow('WARNING')
									: pc.green('OK');

							log(pc.bold('Token Limit Status:'));
							log(`  Limit:            ${formatNumber(limit)} tokens`);
							log(`  Current Usage:    ${formatNumber(currentTokens)} (${((currentTokens / limit) * 100).toFixed(1)}%)`);
							log(`  Remaining:        ${formatNumber(remainingTokens)} tokens`);
							log(`  Projected Usage:  ${percentUsed.toFixed(1)}% ${status}`);
						}
					}
				}
			}
			else {
				// Table view for multiple blocks
				logger.box('Claude Code Token Usage Report - Session Blocks');

				// Note: actualTokenLimit is calculated in projections section when needed

				// Create table with consistent structure like other time-interval commands
				const tableHeaders = ctx.values.breakdown
					? ['Source', 'Block Period', 'Duration/Status', 'Models', 'Input', 'Output', 'Cache Create', 'Cache Read', 'Total Tokens', 'Cost (USD)']
					: ['Source', 'Block Period', 'Duration/Status', 'Models', 'Input', 'Output', 'Cache Create', 'Cache Read', 'Total Tokens', 'Cost (USD)'];

				const tableAligns: ('left' | 'right' | 'center')[] = ctx.values.breakdown
					? ['center', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right']
					: ['center', 'left', 'left', 'left', 'right', 'right', 'right', 'right', 'right', 'right'];

				const table = new ResponsiveTable({
					head: tableHeaders,
					style: { head: ['cyan'] },
					colAligns: tableAligns,
					compactHead: ['Source', 'Block Period', 'Status', 'Models', 'Total Tokens', 'Cost (USD)'],
					compactColAligns: ['center', 'left', 'left', 'left', 'right', 'right'],
					compactThreshold: BLOCKS_COMPACT_WIDTH_THRESHOLD,
				});

				// Detect if we need compact formatting
				const terminalWidth = process.stdout.columns || BLOCKS_DEFAULT_TERMINAL_WIDTH;
				const useCompactFormat = terminalWidth < BLOCKS_COMPACT_WIDTH_THRESHOLD;

				// Calculate totals for all non-gap, non-active blocks
				let totalInputTokens = 0;
				let totalOutputTokens = 0;
				let totalCacheCreationTokens = 0;
				let totalCacheReadTokens = 0;
				let totalCost = 0;
				let activeBlock: SessionBlock | null = null;

				for (const block of blocks) {
					if (!(block.isGap ?? false)) {
						if (block.isActive) {
							activeBlock = block;
						}
						else {
							totalInputTokens += block.tokenCounts.inputTokens;
							totalOutputTokens += block.tokenCounts.outputTokens;
							totalCacheCreationTokens += block.tokenCounts.cacheCreationInputTokens;
							totalCacheReadTokens += block.tokenCounts.cacheReadInputTokens;
							totalCost += block.costUSD;
						}
					}
				}

				// Add active block to totals for display purposes
				if (activeBlock != null) {
					totalInputTokens += activeBlock.tokenCounts.inputTokens;
					totalOutputTokens += activeBlock.tokenCounts.outputTokens;
					totalCacheCreationTokens += activeBlock.tokenCounts.cacheCreationInputTokens;
					totalCacheReadTokens += activeBlock.tokenCounts.cacheReadInputTokens;
					totalCost += activeBlock.costUSD;
				}

				// Render table rows
				for (const block of blocks) {
					if (block.isGap ?? false) {
						// Gap row - grayed out
						const gapRow = [
							'',
							pc.gray(formatBlockPeriod(block, useCompactFormat, ctx.values.locale)),
							pc.gray(formatBlockStatus(block, useCompactFormat)),
							pc.gray('-'),
							pc.gray('-'),
							pc.gray('-'),
							pc.gray('-'),
							pc.gray('-'),
							pc.gray('-'),
							pc.gray('-'),
						];
						table.push(gapRow);
					}
					else {
						// Regular block row
						const row = [
							formatSources(block.sources),
							formatBlockPeriod(block, useCompactFormat, ctx.values.locale),
							formatBlockStatus(block, useCompactFormat),
							formatModels(block.models),
							formatNumber(block.tokenCounts.inputTokens),
							formatNumber(block.tokenCounts.outputTokens),
							formatNumber(block.tokenCounts.cacheCreationInputTokens),
							formatNumber(block.tokenCounts.cacheReadInputTokens),
							formatNumber(getTotalTokens(block.tokenCounts)),
							formatCurrency(block.costUSD),
						];

						table.push(row);

						// Add model breakdown rows if breakdown mode is enabled
						if (ctx.values.breakdown && block.entries.length > 0) {
							// Create model breakdowns from block entries
							const modelBreakdowns = new Map<string, {
								inputTokens: number;
								outputTokens: number;
								cacheCreationTokens: number;
								cacheReadTokens: number;
								cost: number;
							}>();

							for (const entry of block.entries) {
								const existing = modelBreakdowns.get(entry.model) ?? {
									inputTokens: 0,
									outputTokens: 0,
									cacheCreationTokens: 0,
									cacheReadTokens: 0,
									cost: 0,
								};

								modelBreakdowns.set(entry.model, {
									inputTokens: existing.inputTokens + entry.usage.inputTokens,
									outputTokens: existing.outputTokens + entry.usage.outputTokens,
									cacheCreationTokens: existing.cacheCreationTokens + entry.usage.cacheCreationInputTokens,
									cacheReadTokens: existing.cacheReadTokens + entry.usage.cacheReadInputTokens,
									cost: existing.cost + (entry.costUSD ?? 0),
								});
							}

							// Add breakdown rows
							for (const [modelName, stats] of modelBreakdowns.entries()) {
								const breakdownRow = [
									'',
									'',
									'',
									pc.gray(`  └─ ${formatModelName(modelName)}`),
									pc.gray(formatNumber(stats.inputTokens)),
									pc.gray(formatNumber(stats.outputTokens)),
									pc.gray(formatNumber(stats.cacheCreationTokens)),
									pc.gray(formatNumber(stats.cacheReadTokens)),
									pc.gray(formatNumber(stats.inputTokens + stats.outputTokens + stats.cacheCreationTokens + stats.cacheReadTokens)),
									pc.gray(formatCurrency(stats.cost)),
								];
								table.push(breakdownRow);
							}
						}
					}
				}

				// Add separator row before totals
				table.push(['', '', '', '', '', '', '', '', '', '']);

				// Add totals row
				table.push([
					pc.yellow('Total'),
					'',
					'',
					'',
					pc.yellow(formatNumber(totalInputTokens)),
					pc.yellow(formatNumber(totalOutputTokens)),
					pc.yellow(formatNumber(totalCacheCreationTokens)),
					pc.yellow(formatNumber(totalCacheReadTokens)),
					pc.yellow(formatNumber(totalInputTokens + totalOutputTokens + totalCacheCreationTokens + totalCacheReadTokens)),
					pc.yellow(formatCurrency(totalCost)),
				]);

				log(table.toString());

				// Show projections section for active blocks
				if (activeBlock != null) {
					const projection = projectBlockUsage(activeBlock);
					const burnRate = calculateBurnRate(activeBlock);
					const actualTokenLimit = parseTokenLimit(ctx.values.tokenLimit, maxTokensFromAll);

					if (projection != null || burnRate != null || actualTokenLimit != null) {
						log(''); // Empty line for separation
						logger.box('Active Block Projections');

						if (burnRate != null) {
							log(pc.bold('Current Burn Rate:'));
							log(`  Tokens/minute: ${pc.cyan(formatNumber(burnRate.tokensPerMinute))}`);
							log(`  Cost/hour: ${pc.cyan(formatCurrency(burnRate.costPerHour))}`);
							log('');
						}

						if (projection != null) {
							log(pc.bold('Projected Usage (if current rate continues):'));
							log(`  Total Tokens: ${pc.yellow(formatNumber(projection.totalTokens))}`);
							log(`  Total Cost: ${pc.yellow(formatCurrency(projection.totalCost))}`);
							log('');
						}

						if (actualTokenLimit != null && actualTokenLimit > 0) {
							const currentTokens = getTotalTokens(activeBlock.tokenCounts);
							const remainingTokens = Math.max(0, actualTokenLimit - currentTokens);
							const currentPercent = (currentTokens / actualTokenLimit) * 100;

							let projectedPercent = 0;
							let projectedStatus = pc.green('OK');
							if (projection != null) {
								projectedPercent = (projection.totalTokens / actualTokenLimit) * 100;
								projectedStatus = projectedPercent > 100
									? pc.red('EXCEEDS LIMIT')
									: projectedPercent > BLOCKS_WARNING_THRESHOLD * 100
										? pc.yellow('WARNING')
										: pc.green('OK');
							}

							log(pc.bold('Token Limit Status:'));
							log(`  Limit: ${pc.cyan(formatNumber(actualTokenLimit))} tokens`);
							log(`  Current Usage: ${formatNumber(currentTokens)} (${currentPercent.toFixed(1)}%)`);
							log(`  Remaining: ${formatNumber(remainingTokens)} tokens`);
							if (projection != null) {
								log(`  Projected Usage: ${projectedPercent.toFixed(1)}% ${projectedStatus}`);
							}
						}
					}
				}

				// Show guidance message if in compact mode
				if (table.isCompactMode()) {
					log('');
					logger.info('Running in Compact Mode');
					logger.info('Expand terminal width to see cache metrics and individual token counts');
				}
			}
		}
	},
});
