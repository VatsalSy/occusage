# AGENTS.md - Development Guidelines

## Project Overview

**occusage** is a TypeScript CLI tool for analyzing OpenCode and Claude Code usage data from local JSONL files. It's an enhanced fork of ccusage with dual platform support, built using Bun runtime with ESNext modules.

## Build/Test Commands
```bash
bun install                    # Install dependencies
bun run start                  # Run CLI (default: today's usage)
bun test                       # Run all tests (uses Vitest)
bun test test/specific.test.ts # Run single test file
bun run test:statusline        # Run statusline test with sample data
./testManual.sh                # Test all CLI commands with --breakdown flag
./testManual.sh --all          # Test all available commands
./testManual.sh --daily --weekly  # Test specific commands
```

## CLI Commands Architecture

The CLI is built using the `gunshi` framework with the following command structure:

- **Main Entry**: `src/index.ts` → `src/commands/index.ts`
- **Default Command**: `today` (when no subcommand specified)
- **Available Commands**:
  - `today` - Today's usage (default)
  - `daily` - Daily usage reports with date filtering
  - `weekly` - Weekly usage reports (Monday-Sunday)
  - `monthly` - Monthly usage reports
  - `session` - Individual conversation analysis
  - `project` - Project-based usage (current week by default)
  - `blocks` - 5-hour billing window tracking with live monitoring
  - `statusline` - Status line integration for editors

### Command Options

All commands support these shared options:
- `--breakdown` - Show per-model cost breakdown
- `--json` - Output as JSON for programmatic use
- `--mode` - Cost calculation mode (auto/calculate/display)
- `--timezone` - Timezone for date calculations
- `--since YYYYMMDD` / `--until YYYYMMDD` - Date range filtering

## Architecture Overview

### Core Data Flow

1. **Data Loading** (`data-loader.ts`):
   - Loads JSONL files from OpenCode (`~/.config/opencode/projects/`) and Claude Code (`~/.claude/projects/`, `~/.config/claude/projects/`) directories
   - Parses usage entries with Zod validation
   - Aggregates data by date, session, or project

2. **Cost Calculation** (`calculate-cost.ts`):
   - Uses LiteLLM pricing data (`pricing-fetcher.ts`)
   - Calculates costs from token counts or uses pre-calculated values
   - Supports multiple models (Claude 4 Opus, Sonnet)

3. **Data Processing**:
   - **Session Blocks** (`_session-blocks.ts`): Groups usage into 5-hour billing windows
   - **Live Monitor** (`_live-monitor.ts`): Real-time usage tracking with burn rate calculations
   - **Token Utils** (`_token-utils.ts`): Token counting and aggregation utilities

4. **Output Formatting** (`_utils.ts`):
   - Responsive table layout with `ResponsiveTable` class
   - Color-coded output using `picocolors`
   - Source attribution ([O] OpenCode, [C] Claude Code)

### Key Modules

- **OpenCode Integration** (`_opencode-loader.ts`): Handles OpenCode project path encoding/decoding
- **Project Names** (`_project-names.ts`): Extracts and formats project names from file paths
- **Terminal Utils** (`_terminal-utils.ts`): Terminal width detection and responsive formatting
- **Daily Grouping** (`_daily-grouping.ts`): Groups usage data by date with timezone support

## Testing Strategy

Uses **traditional test files** in `test/` directory with Vitest:

```bash
# Test commands
bun test                                    # All tests
bun test test/_live-monitor.test.ts        # Specific test file
TZ=UTC bun test                            # Timezone-consistent tests
bun test --watch                           # Watch mode
```

### Test Structure
- Tests are in dedicated `.test.ts` files in `test/` directory
- Uses `fs-fixture` for file system mocking
- Tests with current Claude 4 models (`claude-opus-4-20250514`, `claude-sonnet-4-20250514`)
- Imports functions directly from source files for testing

### Key Test Areas
- Data loading and JSONL parsing
- Cost calculations and pricing
- Project path encoding/decoding
- Session block identification
- Live monitoring and burn rate calculations
- Token aggregation utilities

## Code Style Guidelines

### Runtime & Modules
- **Runtime**: Bun with TypeScript ESM modules (`"type": "module"`)
- **Target**: ESNext with bundler module resolution
- **Imports**: Use `.ts` extensions, relative imports for local modules, named imports preferred
- **Key Dependencies**: `gunshi` (CLI), `zod` (validation), `es-toolkit` (utilities), `vitest` (testing)

### Types & Validation
- **Schemas**: Zod for validation with branded types (e.g., `z.string().brand<'ModelName'>()`)
- **Types**: Strict TypeScript with `noUncheckedIndexedAccess: true`
- **Branded Types**: Use helper functions like `createModelName()` for type-safe conversions

### Naming & Structure
- **Variables/Functions**: camelCase
- **Constants**: SCREAMING_SNAKE_CASE for arrays, camelCase for objects
- **Files**: kebab-case with leading underscore for utilities (`_types.ts`, `_utils.ts`)

### Error Handling & Patterns
- **Results**: Use `@praha/byethrow` Result pattern, avoid throwing exceptions
- **Async**: Prefer async/await, handle errors with Result.unwrap/unwrapError
- **Validation**: Parse inputs with Zod schemas before processing

## Configuration

### Environment Variables
```bash
export CLAUDE_CONFIG_DIR="/path/to/claude"     # Custom Claude directory
export OPENCODE_CONFIG_DIR="/path/to/opencode" # Custom OpenCode directory
export LOG_LEVEL=0                             # Logging level (0=silent, 5=trace)
```

### Data Sources
- **Claude Code**: `~/.claude/projects/` and `~/.config/claude/projects/`
- **OpenCode**: `~/.config/opencode/projects/`
- **Usage Files**: `usage_*.jsonl` files in project directories

## Important Implementation Details

### Live Monitoring (`blocks --live`)
- Real-time dashboard showing session progress
- Automatic token limit detection or custom limits
- Color-coded quota warnings (red/yellow/green)
- Burn rate calculations (tokens/minute)

### Model Support
- Claude 4 Opus (`claude-opus-4-20250514`)
- Claude 4 Sonnet (`claude-sonnet-4-20250514`)
- Automatic model detection from usage data
- Per-model cost breakdown with `--breakdown` flag

### Data Aggregation
- Supports cache tokens (creation and read)
- Input/output token separation
- Cross-platform usage totals
- Timezone-aware date calculations

When working with this codebase, prioritize understanding the data flow from JSONL parsing through cost calculation to formatted output, and maintain the existing patterns for type safety and error handling.