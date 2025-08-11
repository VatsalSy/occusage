# occusage

<p align="center">
    <a href="https://github.com/vatsalaggarwal/occusage"><img src="https://img.shields.io/badge/github-occusage-blue" alt="GitHub" /></a>
    <a href="https://github.com/vatsalaggarwal/occusage/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
</p>

> Analyze your OpenCode and Claude Code token usage and costs from local JSONL files — incredibly fast and informative!

## 🚀 What's New

**occusage** (OpenCode/Claude Code Usage) is an enhanced fork of the original [ccusage](https://github.com/ryoppippi/ccusage) project by [@ryoppippi](https://github.com/ryoppippi). This fork adds comprehensive support for **OpenCode** - Anthropic's new AI coding assistant that shares the same powerful Claude models and API infrastructure as Claude Code.

### Key Enhancements

- **Full OpenCode Support**: Complete integration with OpenCode's usage tracking
- **Dual Source Tracking**: Distinguish between OpenCode `[O]` and Claude Code `[C]` usage
- **Unified Reporting**: Combined usage statistics across both platforms
- **Advanced Features**: Project-based reporting, live monitoring, and 5-hour billing blocks
- **Model Support**: Track usage for Claude 4 Opus and Sonnet models

## 📦 Installation

### Quick Start (Recommended)

Run directly without installation using Bun (recommended for speed):

```bash
# Using bun (fastest)
bun run ./src/index.ts

# Or if you have it installed globally
occusage
```

### Development Setup

```bash
# Clone the repository
git clone https://github.com/vatsalaggarwal/occusage.git
cd occusage

# Install dependencies
bun install

# Run the tool
bun run start
```

## 📊 Usage Examples

### Basic Commands

```bash
# Default view - Today's usage
bun run start
# or
bun run ./src/index.ts

# Daily usage report
bun run start daily

# Weekly usage report (Monday to Sunday)
bun run start weekly

# Monthly usage report
bun run start monthly

# Session-based usage
bun run start session

# Project-based usage (current week by default)
bun run start project

# 5-hour billing blocks
bun run start blocks
```

### Advanced Features

#### Model Breakdown
See detailed per-model cost breakdown:

```bash
# Daily with model breakdown
bun run start daily --breakdown
bun run start --breakdown  # Today with breakdown

# Weekly with breakdown
bun run start weekly --breakdown

# Monthly with breakdown
bun run start monthly --breakdown

# Session with breakdown
bun run start session --breakdown

# Project with breakdown
bun run start project --breakdown
```

#### Live Monitoring
Real-time dashboard showing active session progress:

```bash
# Live monitoring with automatic token limit detection
bun run start blocks --live

# With custom token limit
bun run start blocks --live --token-limit 500000

# With maximum historical limit
bun run start blocks --live -t max
```

#### Date Filtering
Filter reports by date range:

```bash
# Specific date range
bun run start daily --since 20250101 --until 20250131

# Last 7 days
bun run start daily --since $(date -d '7 days ago' +%Y%m%d)

# Current month
bun run start monthly --since $(date +%Y%m01)
```

#### Project Analysis
Analyze usage by project:

```bash
# Current week projects (default)
bun run start project

# All projects without time restriction
bun run start project --full

# Project breakdown with models
bun run start project --breakdown
```

#### JSON Output
Export data for programmatic use:

```bash
# Daily report as JSON
bun run start daily --json

# Session data as JSON
bun run start session --json

# Blocks data as JSON
bun run start blocks --json

# Project data as JSON
bun run start project --json
```

## 🎯 Features

### Core Reports
- **📊 Daily Reports**: Token usage and costs aggregated by date
- **📅 Weekly Reports**: Week-by-week usage patterns (configurable start day)
- **📆 Monthly Reports**: Monthly aggregated statistics
- **💬 Session Reports**: Individual conversation analysis
- **🏗️ Project Reports**: Usage grouped by project/directory
- **⏰ Blocks Reports**: 5-hour billing window tracking

### Advanced Capabilities
- **🔴 Live Monitoring**: Real-time usage dashboard with burn rate calculations
- **🤖 Model Tracking**: Distinguish between Opus and Sonnet models
- **💰 Cost Analysis**: Accurate USD cost calculations using LiteLLM pricing
- **🔄 Cache Metrics**: Track cache creation and read tokens
- **📱 Responsive Display**: Automatic layout adjustment for terminal width
- **🌐 Offline Mode**: Use cached pricing data without network access
- **🎨 Beautiful Output**: Color-coded tables with smart formatting

### OpenCode & Claude Code Integration
- **[O] OpenCode**: Track usage from `~/.config/opencode/projects/`
- **[C] Claude Code**: Track usage from `~/.claude/projects/` and `~/.config/claude/projects/`
- **Combined Totals**: Unified reporting across both platforms
- **Source Attribution**: Clear labeling of usage source

## 📈 Example Output

### Today's Usage Report
```
╭──────────────────────────────────────────╮
│  Claude Code Token Usage Report - Today  │
╰──────────────────────────────────────────╯

┌──────────┬────────────────────┬───────────┬───────────┬───────────────┬──────────────┬───────────────┬─────────────┐
│  Source  │ Models             │     Input │    Output │  Cache Create │   Cache Read │  Total Tokens │  Cost (USD) │
├──────────┼────────────────────┼───────────┼───────────┼───────────────┼──────────────┼───────────────┼─────────────┤
│   [O]    │ • opus-4           │   535,786 │   333,188 │     4,181,107 │   86,119,005 │    91,169,086 │     $101.19 │
│          │ • sonnet-4         │           │           │               │              │               │             │
├──────────┼────────────────────┼───────────┼───────────┼───────────────┼──────────────┼───────────────┼─────────────┤
│   [C]    │ • opus-4           │     6,264 │    62,720 │     1,628,084 │   52,680,223 │    54,377,291 │      $96.72 │
│          │ • sonnet-4         │           │           │               │              │               │             │
├──────────┼────────────────────┼───────────┼───────────┼───────────────┼──────────────┼───────────────┼─────────────┤
│  TOTAL   │ • opus-4           │   542,050 │   395,908 │     5,809,191 │  138,799,228 │   145,546,377 │     $197.91 │
│          │ • sonnet-4         │           │           │               │              │               │             │
└──────────┴────────────────────┴───────────┴───────────┴───────────────┴──────────────┴───────────────┴─────────────┘
```

### With Model Breakdown
```bash
bun run start --breakdown
```
Shows individual model costs:
- `└─ opus-4`: Detailed Opus usage and costs
- `└─ sonnet-4`: Detailed Sonnet usage and costs

### Live Monitoring Dashboard
```bash
bun run start blocks --live
```
Real-time updates showing:
- Current session progress bar
- Token burn rate (tokens/minute)
- Time remaining in 5-hour block
- Cost projections
- Color-coded quota warnings

## 🛠️ Configuration

### Environment Variables
```bash
# Custom Claude/OpenCode data directories
export CLAUDE_CONFIG_DIR="/path/to/claude"
export OPENCODE_CONFIG_DIR="/path/to/opencode"

# Multiple directories (comma-separated)
export CLAUDE_CONFIG_DIR="/path1,/path2"

# Logging level (0=silent, 5=trace)
export LOG_LEVEL=0
```

### Cost Calculation Modes
```bash
# Use pre-calculated costs when available (default)
occusage daily --mode auto

# Always calculate from token counts
occusage daily --mode calculate

# Only use pre-calculated costs
occusage daily --mode display
```

### Timezone and Locale
```bash
# Use specific timezone
occusage daily --timezone UTC
occusage daily --timezone America/New_York

# Use specific locale for formatting
occusage daily --locale ja-JP
occusage daily --locale de-DE
```

## 🔧 Development

### Prerequisites
- [Bun](https://bun.sh) >= 1.0.0
- Node.js >= 20.19.4 (for compatibility)

### Commands
```bash
# Install dependencies
bun install

# Run tests
bun test

# Type checking
bun typecheck

# Format code
bun run format

# Build for distribution
bun run build

# Release new version
bun run release
```

### Testing

This project uses **in-source testing** with Vitest, where tests are written directly in the same files as the source code.

#### Running Tests

```bash
# Run all tests
bun test

# Run tests with timezone consistency
TZ=UTC bun test

# Run specific test file (statusline test)
bun run test:statusline

# Check test coverage across source files
bun test --coverage
```

#### Writing In-Source Tests

Tests are written at the bottom of source files using the `import.meta.vitest` pattern:

```typescript
// In-source tests
if (import.meta.vitest != null) {
    const { describe, it, expect } = import.meta.vitest;
    
    describe('Your feature', () => {
        it('should do something', () => {
            const result = yourFunction();
            expect(result).toBe(expectedValue);
        });
    });
}
```

#### Testing Guidelines

1. **In-Source Testing Pattern**:
   - Tests live in the same file as the code they test
   - Keeps tests close to implementation
   - Reduces context switching
   - Tests are automatically excluded from production builds

2. **Test Coverage Areas**:
   - **Data Processing**: JSONL parsing, token aggregation (`data-loader.ts`)
   - **Cost Calculations**: Model pricing, token cost computation (`calculate-cost.ts`)
   - **Path Encoding**: URL encoding/decoding for project paths (`_opencode-loader.ts`)
   - **Date Handling**: Timezone conversions, date formatting (`_utils.ts`)
   - **CLI Commands**: Command parsing and execution (`commands/`)
   - **Live Monitoring**: Real-time dashboard updates (`_live-monitor.ts`)

3. **Mock Data Requirements**:
   - Use `fs-fixture` for creating temporary test directories
   - Mock Claude/OpenCode data directories for testing
   - Use current Claude 4 models (`claude-opus-4-20250514`, `claude-sonnet-4-20250514`) in test data
   - Test with realistic JSONL data structures

4. **Best Practices**:
   - Test both happy paths and edge cases
   - Include backward compatibility tests (legacy dash encoding)
   - Verify error handling and fallback mechanisms
   - Test with realistic data structures matching actual Claude/OpenCode output
   - Ensure tests work with UTC timezone (`TZ=UTC`)

#### Example Test Structure

```typescript
// Example from src/_opencode-loader.ts
if (import.meta.vitest != null) {
    const { describe, it, expect } = import.meta.vitest;
    
    describe('Project path encoding/decoding', () => {
        it('should encode and decode paths with dashes correctly', () => {
            const originalPath = '/Users/vatsal/my-project';
            const encoded = encodeProjectPath(originalPath);
            const decoded = decodeProjectPath(encoded);
            expect(decoded).toBe(originalPath);
        });
        
        it('should fallback to legacy dash replacement', () => {
            const legacyEncoded = 'Users-vatsal-my-project';
            const decoded = decodeProjectPath(legacyEncoded);
            expect(decoded).toBe('/Users/vatsal/my/project');
        });
        
        it('should handle complex paths with special characters', () => {
            const originalPath = '/Users/vatsal/my-project (2024) #1';
            const encoded = encodeProjectPath(originalPath);
            const decoded = decodeProjectPath(encoded);
            expect(decoded).toBe(originalPath);
        });
    });
}
```

#### Test Environment

- **Runtime**: Bun test runner with Vitest compatibility
- **Globals**: Vitest globals available via `import.meta.vitest`
- **Fixtures**: `fs-fixture` for file system mocking
- **Timezone**: Tests run with `TZ=UTC` for consistency
- **Models**: Tests use current Claude 4 models for LiteLLM compatibility
- **Dependencies**: All test dependencies are in `devDependencies`

#### Testing New Features

When adding new features:

1. **Write tests first** or alongside implementation
2. **Test edge cases** including malformed input data
3. **Verify backward compatibility** with existing data formats
4. **Test error handling** and graceful degradation
5. **Include performance tests** for data processing functions
6. **Mock external dependencies** (file system, network calls)

#### Debugging Tests

```bash
# Run tests with debug output
LOG_LEVEL=4 bun test

# Run single test file with verbose output
bun test --verbose src/_opencode-loader.ts

# Debug specific test patterns
bun test --grep "encoding"
```

### Project Structure
```
occusage/
├── src/
│   ├── commands/       # CLI subcommands
│   ├── index.ts        # Main entry point
│   ├── data-loader.ts  # JSONL parsing
│   ├── calculate-cost.ts # Cost calculations
│   └── ...
├── docs/               # Documentation
├── test/               # Test files
└── package.json
```

## 🙏 Credits & Attribution

This project is a fork of [ccusage](https://github.com/ryoppippi/ccusage) by [@ryoppippi](https://github.com/ryoppippi), with significant enhancements for OpenCode support.

### Original Contributors
- [@ryoppippi](https://github.com/ryoppippi) - Original creator of ccusage
- All [contributors](https://github.com/ryoppippi/ccusage/graphs/contributors) to the original ccusage project

### Fork History
- Last commit from original project: `fa9f2110d035e8d5ce27cf1f1a05aae19aecdc6b`
- Fork enhancements: OpenCode integration, project reporting, enhanced monitoring

### Why This Fork?
While the original ccusage project excellently serves Claude Code users, the introduction of OpenCode created a need for:
- Unified tracking across both OpenCode and Claude Code
- Distinction between usage sources
- Advanced project-based analytics
- Enhanced real-time monitoring capabilities

This fork maintains full compatibility with the original while adding these essential features for OpenCode users.

## 📚 Documentation

For detailed documentation on all features and commands, see the `/docs` directory or visit the original documentation at [ccusage.com](https://ccusage.com/).

## 📄 License

[MIT](LICENSE) © Original work by [@ryoppippi](https://github.com/ryoppippi), Fork enhancements by [@vatsalaggarwal](https://github.com/vatsalaggarwal)

## 🤝 Contributing

Contributions are welcome! Please feel free to submit issues and pull requests.

## 🌟 Star History

If you find this tool useful, please consider starring the repository!

---

<p align="center">
    Made with ❤️ for the OpenCode and Claude Code community
</p>
