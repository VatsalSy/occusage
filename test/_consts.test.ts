import { describe, it, expect } from 'vitest';
import {
	DEFAULT_CLAUDE_CODE_PATH,
	DEFAULT_CLAUDE_CONFIG_PATH,
	CLAUDE_CONFIG_DIR_ENV,
	CLAUDE_PROJECTS_DIR_NAME,
	USAGE_DATA_GLOB_PATTERN,
	USER_HOME_DIR,
	LITELLM_PRICING_URL,
	DEFAULT_RECENT_DAYS,
	DEFAULT_OPENCODE_DATA_PATH,
	OPENCODE_DATA_DIR_ENV,
	OPENCODE_PROJECTS_DIR_NAME,
	BLOCKS_WARNING_THRESHOLD,
	DEBUG_MATCH_THRESHOLD_PERCENT
} from '../src/_consts.ts';

describe('_consts', () => {
	it('should export string constants', () => {
		expect(typeof DEFAULT_CLAUDE_CODE_PATH).toBe('string');
		expect(typeof DEFAULT_CLAUDE_CONFIG_PATH).toBe('string');
		expect(typeof CLAUDE_CONFIG_DIR_ENV).toBe('string');
		expect(typeof CLAUDE_PROJECTS_DIR_NAME).toBe('string');
		expect(typeof USAGE_DATA_GLOB_PATTERN).toBe('string');
		expect(typeof USER_HOME_DIR).toBe('string');
		expect(typeof LITELLM_PRICING_URL).toBe('string');
		expect(typeof DEFAULT_OPENCODE_DATA_PATH).toBe('string');
		expect(typeof OPENCODE_DATA_DIR_ENV).toBe('string');
		expect(typeof OPENCODE_PROJECTS_DIR_NAME).toBe('string');
	});

	it('should export numeric constants', () => {
		expect(typeof DEFAULT_RECENT_DAYS).toBe('number');
		expect(DEFAULT_RECENT_DAYS).toBeGreaterThan(0);
		expect(typeof BLOCKS_WARNING_THRESHOLD).toBe('number');
		expect(BLOCKS_WARNING_THRESHOLD).toBeGreaterThan(0);
		expect(typeof DEBUG_MATCH_THRESHOLD_PERCENT).toBe('number');
		expect(DEBUG_MATCH_THRESHOLD_PERCENT).toBeGreaterThan(0);
	});

	it('should have valid URL format', () => {
		expect(LITELLM_PRICING_URL).toMatch(/^https?:\/\//);
	});

	it('should have valid glob pattern', () => {
		expect(USAGE_DATA_GLOB_PATTERN).toContain('*');
		expect(USAGE_DATA_GLOB_PATTERN).toContain('.jsonl');
	});

	it('should have valid directory names', () => {
		expect(CLAUDE_PROJECTS_DIR_NAME.length).toBeGreaterThan(0);
		expect(OPENCODE_PROJECTS_DIR_NAME.length).toBeGreaterThan(0);
	});

	it('should have valid environment variable names', () => {
		expect(CLAUDE_CONFIG_DIR_ENV.length).toBeGreaterThan(0);
		expect(OPENCODE_DATA_DIR_ENV.length).toBeGreaterThan(0);
	});
});