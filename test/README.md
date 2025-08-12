# Test Suite Documentation

This directory contains the comprehensive test suite for **occusage**, a TypeScript CLI tool for analyzing OpenCode and Claude Code usage data.

## Overview

The test suite uses **Vitest** as the testing framework and follows a traditional file-based structure with dedicated `.test.ts` files for each source module.

### Test Statistics
- **84 tests** across **18 test files**
- **273 assertions** with **100% pass rate**
- **Comprehensive coverage** of core functionality

## Test Structure

### Test Files Organization

```
test/
├── README.md                    # This documentation
├── _consts.test.ts             # Constants and configuration values
├── _daily-grouping.test.ts     # Daily data grouping functionality
├── _jq-processor.test.ts       # JSON processing with jq
├── _live-monitor.test.ts       # Live monitoring and caching
├── _live-rendering.test.ts     # Terminal rendering utilities
├── _opencode-loader.test.ts    # OpenCode path encoding/decoding
├── _project-names.test.ts      # Project name parsing and formatting
├── _session-blocks.test.ts     # Session block identification
├── _shared-args.test.ts        # Shared CLI argument definitions
├── _terminal-utils.test.ts     # Terminal width and emoji handling
├── _token-utils.test.ts        # Token counting and aggregation
├── _utils.test.ts              # Utility functions and table formatting
├── calculate-cost.test.ts      # Cost calculation logic
├── commands-index.test.ts      # Command structure validation
├── data-loader.test.ts         # Data loading and parsing
├── debug.test.ts               # Debug utilities and mismatch detection
├── logger.test.ts              # Logging functionality
└── pricing-fetcher.test.ts     # Model pricing and cost fetching
```

## Test Categories

### 1. Core Data Processing Tests
- **`data-loader.test.ts`**: JSONL file loading, date formatting, session data aggregation
- **`calculate-cost.test.ts`**: Token aggregation, cost calculations, totals creation
- **`_token-utils.test.ts`**: Token counting across different formats (raw/aggregated)
- **`_session-blocks.test.ts`**: 5-hour billing window identification, burn rate calculations

### 2. Integration & External Services
- **`pricing-fetcher.test.ts`**: LiteLLM pricing API integration, offline mode, cost calculations
- **`_opencode-loader.test.ts`**: OpenCode project path encoding/decoding, legacy compatibility
- **`debug.test.ts`**: Cost mismatch detection, pricing validation

### 3. CLI & Command Tests
- **`commands-index.test.ts`**: Command structure validation, unique naming
- **`_shared-args.test.ts`**: CLI argument definitions and validation

### 4. Utility & Formatting Tests
- **`_utils.test.ts`**: Responsive table layout, number/currency formatting, model name display
- **`_terminal-utils.test.ts`**: Terminal width detection, emoji rendering
- **`_live-rendering.test.ts`**: Token display formatting for live monitoring
- **`_project-names.test.ts`**: Project name extraction and formatting

### 5. Data Processing & Grouping
- **`_daily-grouping.test.ts`**: Daily usage data grouping by project
- **`_jq-processor.test.ts`**: JSON processing with jq filters

### 6. System & Configuration Tests
- **`_consts.test.ts`**: Configuration constants, environment variables, URLs
- **`logger.test.ts`**: Logging levels, output methods

### 7. Live Monitoring Tests
- **`_live-monitor.test.ts`**: Real-time usage tracking, cache management, file monitoring

## Test Patterns & Best Practices

### 1. Mock Data & Fixtures
Tests use `fs-fixture` for creating temporary file systems:

```typescript
const { createFixture } = await import('fs-fixture');
await using fixture = await createFixture({
  'projects/test-project/session1.jsonl': JSON.stringify({
    timestamp: '2024-01-01T12:00:00Z',
    message: { model: 'claude-sonnet-4-20250514', usage: {...} },
    costUSD: 0.01,
    version: '1.0.0'
  })
});
```

### 2. Result Type Handling
Tests properly handle the `@praha/byethrow` Result pattern:

```typescript
import { Result } from '@praha/byethrow';

const result = await someFunction();
const value = Result.unwrap(result);  // For success cases
const error = Result.unwrapError(result);  // For error cases
```

### 3. Type Safety
Tests use proper TypeScript interfaces and branded types:

```typescript
const mockEntry: LoadedUsageEntry = {
  source: 'claude' as const,
  timestamp: new Date('2024-01-01T10:00:00Z'),
  usage: { inputTokens: 100, outputTokens: 50, ... },
  model: 'claude-sonnet-4-20250514'
};
```

### 4. Environment Isolation
Tests avoid dependencies on actual user data:

```typescript
// Good: Use offline mode for external services
await using fetcher = new PricingFetcher(true);

// Good: Flexible assertions for environment-dependent data
expect(typeof activeBlock.tokenCounts.inputTokens).toBe('number');
expect(activeBlock.tokenCounts.inputTokens).toBeGreaterThanOrEqual(0);
```

## Running Tests

### Basic Commands
```bash
# Run all tests
bun test

# Run specific test file
bun test test/_token-utils.test.ts

# Run tests in watch mode
bun test --watch

# Run tests with timezone consistency
TZ=UTC bun test
```

### Test Debugging
```bash
# Run tests with verbose output
bun test --reporter=verbose

# Run single test with debugging
bun test test/pricing-fetcher.test.ts --reporter=verbose
```

## Test Quality Standards

### ✅ What Makes Tests Good
1. **Isolated**: Don't depend on external services or user data
2. **Fast**: Complete test suite runs in under 1 second
3. **Reliable**: 100% pass rate, no flaky tests
4. **Comprehensive**: Cover both happy path and edge cases
5. **Type-Safe**: Use proper TypeScript types and interfaces

### ✅ Test Maintenance
- Tests are updated whenever source files change
- Mock data matches current API expectations
- Error cases are tested alongside success cases
- Tests validate both structure and behavior

## Integration with Development Workflow

### Before Committing Changes
1. **Run unit tests**: `bun test`
2. **Run manual CLI tests**: `./testManual.sh --all`
3. **Update tests if needed**: Modify tests when source APIs change
4. **Verify all tests pass**: Ensure 100% pass rate before committing

### When Modifying Source Files
1. **Check affected tests**: Identify which tests cover the modified code
2. **Update test expectations**: Adjust mocks and assertions if APIs changed
3. **Add new tests**: Cover new functionality or edge cases
4. **Run targeted tests**: Test specific files before running full suite

## Common Test Scenarios

### Testing CLI Commands
```typescript
// Test command structure
expect(command).toHaveProperty('name');
expect(command).toHaveProperty('run');
expect(typeof command.run).toBe('function');
```

### Testing Data Processing
```typescript
// Test with realistic mock data
const result = processFunction(mockData);
expect(result).toHaveLength(expectedCount);
expect(result[0]).toMatchObject(expectedStructure);
```

### Testing Error Handling
```typescript
// Test error cases
const result = await functionThatMightFail(invalidInput);
const error = Result.unwrapError(result);
expect(error.message).toContain('expected error text');
```

## Future Test Improvements

### Potential Enhancements
1. **Performance Tests**: Add benchmarks for large data sets
2. **Integration Tests**: Full CLI workflow testing
3. **Property-Based Tests**: Generate random test data
4. **Visual Regression**: Test terminal output formatting
5. **Coverage Reports**: Track test coverage metrics

### Test Infrastructure
- Consider adding test utilities for common patterns
- Implement custom matchers for domain-specific assertions
- Add test data generators for complex scenarios
- Create shared fixtures for common test scenarios

---

This test suite provides a solid foundation for maintaining code quality and preventing regressions as the codebase evolves. The tests are designed to be maintainable, reliable, and comprehensive while remaining fast and isolated.