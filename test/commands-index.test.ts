import { describe, it, expect } from 'vitest';

describe('commands', () => {
	it('should export command objects', async () => {
		// Test that command files export their command definitions
		const { todayCommand } = await import('../src/commands/today.ts');
		const { dailyCommand } = await import('../src/commands/daily.ts');
		const { monthlyCommand } = await import('../src/commands/monthly.ts');
		const { weeklyCommand } = await import('../src/commands/weekly.ts');
		const { sessionCommand } = await import('../src/commands/session.ts');
		const { projectCommand } = await import('../src/commands/project.ts');
		const { blocksCommand } = await import('../src/commands/blocks.ts');
		const { statuslineCommand } = await import('../src/commands/statusline.ts');

		// Check that each command has the expected structure
		const commands = [
			todayCommand,
			dailyCommand,
			monthlyCommand,
			weeklyCommand,
			sessionCommand,
			projectCommand,
			blocksCommand,
			statuslineCommand
		];

		commands.forEach(command => {
			expect(command).toHaveProperty('name');
			expect(command).toHaveProperty('description');
			expect(command).toHaveProperty('run');
			expect(typeof command.name).toBe('string');
			expect(typeof command.description).toBe('string');
			expect(typeof command.run).toBe('function');
		});
	});

	it('should have unique command names', async () => {
		const { todayCommand } = await import('../src/commands/today.ts');
		const { dailyCommand } = await import('../src/commands/daily.ts');
		const { monthlyCommand } = await import('../src/commands/monthly.ts');
		const { weeklyCommand } = await import('../src/commands/weekly.ts');
		const { sessionCommand } = await import('../src/commands/session.ts');
		const { projectCommand } = await import('../src/commands/project.ts');
		const { blocksCommand } = await import('../src/commands/blocks.ts');
		const { statuslineCommand } = await import('../src/commands/statusline.ts');

		const commands = [
			todayCommand,
			dailyCommand,
			monthlyCommand,
			weeklyCommand,
			sessionCommand,
			projectCommand,
			blocksCommand,
			statuslineCommand
		];

		const names = commands.map(cmd => cmd.name);
		const uniqueNames = new Set(names);
		
		expect(uniqueNames.size).toBe(names.length);
	});
});