# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**occusage** is a Bun-based TypeScript CLI tool that analyzes OpenCode and Claude Code usage data from local JSONL files. It's an enhanced fork of ccusage with dual platform support, providing detailed token usage analytics and cost calculations.

## Essential Commands

### Development & Testing
```bash
bun install                    # Install dependencies
bun run start                  # Run CLI (default: today's usage)
bun test                       # Run all tests (78 tests, ~1s runtime)
bun test test/specific.test.ts # Run single test file
./testManual.sh                # Test CLI with --breakdown flag
./testManual.sh --all          # Test all available commands
```

### Testing Workflow (Critical)
**ALWAYS** follow this sequence after making changes:
1. **Update tests first** if APIs changed
2. Run `bun test` for unit tests
3. Run `./testManual.sh --breakdown` for CLI integration testing
4. Ensure 100% test pass rate before committing

### CLI Commands Structure
- **Entry Point**: `src/index.ts` → `src/commands/index.ts`
- **Default**: `today` command when no subcommand specified
- **Available Commands**: `today`, `daily`, `weekly`, `monthly`, `session`, `project`, `blocks`, `statusline`
- **Shared Options**: `--breakdown`, `--json`, `--mode`, `--timezone`, `--since`, `--until`

## Architecture

### Core Data Flow
1. **Data Loading** (`data-loader.ts`): Loads JSONL from OpenCode/Claude Code directories
2. **Cost Calculation** (`calculate-cost.ts`): Uses bundled model pricing with token counting
3. **Processing Modules**:
   - `_session-blocks.ts`: 5-hour billing windows
   - `_live-monitor.ts`: Real-time usage tracking
   - `_token-utils.ts`: Token aggregation
4. **Output** (`_utils.ts`): Responsive table formatting with source attribution

### Key Integration Points
- **OpenCode**: `~/.config/opencode/projects/` with path encoding/decoding
- **Claude Code**: `~/.claude/projects/` and `~/.config/claude/projects/`
- **Models**: Claude 4 Opus and Sonnet with per-model breakdowns
- **Live Monitoring**: Real-time dashboard with burn rate calculations

## Code Style (Bun + TypeScript ESM)

### Runtime & Types
- **Runtime**: Bun with ESNext modules (`"type": "module"`)
- **Validation**: Zod schemas with branded types (e.g., `z.string().brand<'ModelName'>()`)
- **Error Handling**: `@praha/byethrow` Result patterns, no exceptions
- **Testing**: Vitest with `fs-fixture` mocking

### File Naming & Imports
- **Files**: kebab-case, utilities prefixed with `_` (e.g., `_utils.ts`)
- **Imports**: Use `.ts` extensions, relative paths for local modules
- **Functions**: camelCase, branded type helpers like `createModelName()`

### Critical Testing Standards
- **18 test files** with 262 assertions covering all major modules
- **Environment isolated**: Tests don't depend on user data
- **Fast & reliable**: Complete suite under 1 second
- **Type-safe**: Proper TypeScript with `noUncheckedIndexedAccess`

## Important Implementation Notes

### Data Sources & Configuration
```bash
# Environment variables
export CLAUDE_CONFIG_DIR="/path/to/claude"
export OPENCODE_CONFIG_DIR="/path/to/opencode"
export LOG_LEVEL=0  # 0=silent, 5=trace
```

### Key Dependencies
- **CLI Framework**: `gunshi` for command structure
- **Validation**: `zod` for schema validation
- **Utilities**: `es-toolkit`, `fast-sort`, `picocolors`
- **Testing**: `vitest`, `fs-fixture`, `@praha/byethrow`

### Live Monitoring Features
- Real-time session progress with color-coded warnings
- Automatic/custom token limit detection
- Burn rate calculations (tokens/minute)
- 5-hour billing block tracking

## Development Workflow Critical Points

1. **Before Changes**: Run `bun test` to ensure clean state
2. **During Development**: Update tests when changing APIs
3. **After Changes**: Verify both unit tests (`bun test`) and CLI integration (`./testManual.sh`)
4. **Quality Gate**: 100% test pass rate required before commits

This codebase prioritizes type safety, comprehensive testing, and maintains compatibility across both OpenCode and Claude Code platforms. Focus on understanding the JSONL data flow and maintaining the existing patterns for Result-based error handling.
