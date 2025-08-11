import { describe, it, expect } from 'vitest';
import { groupByProject, groupDataByProject } from '../src/_daily-grouping.ts';
import { createDailyDate, createModelName } from '../src/_types.ts';

describe('groupByProject', () => {
	it('groups daily data by project for JSON output', () => {
		const mockData = [
			{
				date: createDailyDate('2024-01-01'),
				project: 'project-a',
				inputTokens: 1000,
				outputTokens: 500,
				cacheCreationTokens: 100,
				cacheReadTokens: 200,
				totalCost: 0.01,
				modelsUsed: [createModelName('claude-sonnet-4-20250514')],
				modelBreakdowns: [],
			},
			{
				date: createDailyDate('2024-01-01'),
				project: 'project-b',
				inputTokens: 2000,
				outputTokens: 1000,
				cacheCreationTokens: 200,
				cacheReadTokens: 300,
				totalCost: 0.02,
				modelsUsed: [createModelName('claude-opus-4-20250514')],
				modelBreakdowns: [],
			},
		];

		const result = groupByProject(mockData);

		expect(Object.keys(result)).toHaveLength(2);
		expect(result['project-a']).toHaveLength(1);
		expect(result['project-b']).toHaveLength(1);
		expect(result['project-a']![0]!.totalTokens).toBe(1800);
		expect(result['project-b']![0]!.totalTokens).toBe(3500);
	});

	it('handles unknown project names', () => {
		const mockData = [
			{
				date: createDailyDate('2024-01-01'),
				project: undefined,
				inputTokens: 1000,
				outputTokens: 500,
				cacheCreationTokens: 0,
				cacheReadTokens: 0,
				totalCost: 0.01,
				modelsUsed: [createModelName('claude-sonnet-4-20250514')],
				modelBreakdowns: [],
			},
		];

		const result = groupByProject(mockData);

		expect(Object.keys(result)).toHaveLength(1);
		expect(result.unknown).toHaveLength(1);
	});
});

describe('groupDataByProject', () => {
	it('groups daily data by project for table display', () => {
		const mockData = [
			{
				date: createDailyDate('2024-01-01'),
				project: 'project-a',
				inputTokens: 1000,
				outputTokens: 500,
				cacheCreationTokens: 100,
				cacheReadTokens: 200,
				totalCost: 0.01,
				modelsUsed: [createModelName('claude-sonnet-4-20250514')],
				modelBreakdowns: [],
			},
			{
				date: createDailyDate('2024-01-02'),
				project: 'project-a',
				inputTokens: 800,
				outputTokens: 400,
				cacheCreationTokens: 50,
				cacheReadTokens: 150,
				totalCost: 0.008,
				modelsUsed: [createModelName('claude-sonnet-4-20250514')],
				modelBreakdowns: [],
			},
		];

		const result = groupDataByProject(mockData);

		expect(Object.keys(result)).toHaveLength(1);
		expect(result['project-a']).toHaveLength(2);
		expect(result['project-a']).toEqual(mockData);
	});
});