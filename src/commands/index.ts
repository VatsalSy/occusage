import process from 'node:process';
import { cli } from 'gunshi';
import { description, name, version } from '../../package.json';
import { blocksCommand } from './blocks.ts';
import { dailyCommand } from './daily.ts';
import { mcpCommand } from './mcp.ts';
import { monthlyCommand } from './monthly.ts';
import { projectCommand } from './project.ts';
import { sessionCommand } from './session.ts';
import { statuslineCommand } from './statusline.ts';
import { todayCommand } from './today.ts';
import { weeklyCommand } from './weekly.ts';

/**
 * Map of available CLI subcommands
 */
const subCommands = new Map();
subCommands.set('daily', dailyCommand);
subCommands.set('today', todayCommand);
subCommands.set('monthly', monthlyCommand);
subCommands.set('weekly', weeklyCommand);
subCommands.set('session', sessionCommand);
subCommands.set('project', projectCommand);
subCommands.set('blocks', blocksCommand);
subCommands.set('mcp', mcpCommand);
subCommands.set('statusline', statuslineCommand);

/**
 * Default command when no subcommand is specified (defaults to today)
 */
const mainCommand = todayCommand;

// eslint-disable-next-line antfu/no-top-level-await
await cli(process.argv.slice(2), mainCommand, {
	name,
	version,
	description,
	subCommands,
	renderHeader: null,
});
