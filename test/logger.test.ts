import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { logger, log } from '../src/logger.ts';

describe('logger', () => {
	let originalLevel: number;

	beforeEach(() => {
		originalLevel = logger.level;
	});

	afterEach(() => {
		logger.level = originalLevel;
	});

	it('should have correct default level', () => {
		expect(typeof logger.level).toBe('number');
		expect(logger.level).toBeGreaterThanOrEqual(0);
	});

	it('should support setting log level', () => {
		logger.level = 0;
		expect(logger.level).toBe(0);
		
		logger.level = 3;
		expect(logger.level).toBe(3);
	});

	it('should have logging methods', () => {
		expect(typeof logger.debug).toBe('function');
		expect(typeof logger.info).toBe('function');
		expect(typeof logger.warn).toBe('function');
		expect(typeof logger.error).toBe('function');
	});

	it('should export log function', () => {
		expect(typeof log).toBe('function');
	});

	it('should not throw when calling logging methods', () => {
		// Set level to 0 to suppress output during tests
		logger.level = 0;
		
		expect(() => logger.debug('test')).not.toThrow();
		expect(() => logger.info('test')).not.toThrow();
		expect(() => logger.warn('test')).not.toThrow();
		expect(() => logger.error('test')).not.toThrow();
		expect(() => log('test')).not.toThrow();
	});
});