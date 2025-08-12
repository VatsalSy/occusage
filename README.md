# occusage

<p align="center">
    <a href="https://github.com/VatsalSy/occusage"><img src="https://img.shields.io/badge/github-occusage-blue" alt="GitHub" /></a>
    <a href="https://github.com/VatsalSy/occusage/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-green" alt="MIT License" /></a>
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

## 📦 Installation (Bun-only)

This project now requires the Bun runtime.

> Minimum tested Bun: **>= 1.2.20**. The `packageManager` is pinned to `bun@1.2.20` to ensure consistent tooling across contributors.

### Global CLI Installation

**Recommended: Install globally from local clone**

```bash
# Clone and install
git clone https://github.com/VatsalSy/occusage.git
cd occusage
bun install

# Install globally
bun add -g file:.

# Verify installation
occusage --help
occusage today --breakdown
```

**To update:** Pull latest changes and run `bun add -g file:.` again.

<details>
<summary>Advanced: Using bun link (for development)</summary>

```bash
# After cloning and installing dependencies
bun link             # registers this package
bun link occusage    # exposes `occusage` in your PATH
```

To update: re-run `bun link occusage` after pulling changes.
</details>

If the `occusage` command is not found, add Bun's global bin to your PATH (Zsh):

```bash
echo 'export BUN_INSTALL="$HOME/.bun"' >> ~/.zshrc
echo 'export PATH="$BUN_INSTALL/bin:$PATH"' >> ~/.zshrc
source ~/.zshrc && rehash  # or restart your terminal

# Then verify
which occusage
occusage --help
```

### Automated Installation

For a quick setup, use the included [install script](./install.sh):

```bash
./install.sh
```

This script will (with your user permissions):

1. Check for Bun installation (required prerequisite)
2. Install project dependencies via `bun install`
3. Link the package globally using `bun link`
4. Add Bun's global bin directory to your PATH if needed (modifies shell profile)
5. Verify the installation and provide next steps

**Note**: The script automatically detects your shell (bash/zsh) and updates the appropriate profile file (~/.bashrc, ~/.zshrc, or ~/.profile). Review the script before running if you prefer manual installation.

### Run without installing

```bash
bun run ./src/index.ts [command]
bun run start [command]
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

# Last 7 days examples:

# Linux/GNU date
bun run start daily --since $(date -d '7 days ago' +%Y%m%d)

# macOS/BSD date
bun run start daily --since $(date -v -7d +%Y%m%d)

# Portable (using Bun/Node)
bun run start daily --since $(bun -e "const d = new Date(); d.setDate(d.getDate() - 7); console.log(d.toISOString().slice(0,10).replace(/-/g,''))")

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
│  Open+Claude Code Token Usage Report - Today  │
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
- Bun >= 1.2.20 (minimum tested)

### Commands
```bash
# Install dependencies
bun install

# Run tests
bun test
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

### Original Project Recognition
- **Star the original**: https://github.com/ryoppippi/ccusage ⭐
- **Documentation**: https://ccusage.com/
- **Sponsor original author**: https://github.com/sponsors/ryoppippi

## 📚 Documentation

For detailed documentation on all features and commands, see the `/docs` directory or visit the original documentation at [ccusage.com](https://ccusage.com/).

## 📄 License

[MIT](LICENSE) © Original work by [@ryoppippi](https://github.com/ryoppippi), Fork enhancements by [@vatsalsy](https://github.com/VatsalSy)

## 🤝 Contributing

We welcome contributions! Please see our [Contributing Guidelines](CONTRIBUTING.md) for details on:
- Development workflow
- Code style guidelines  
- Testing requirements
- Submitting pull requests

### Quick Links

- [Report a Bug](https://github.com/VatsalSy/occusage/issues/new?template=bug_report.md)
- [Request a Feature](https://github.com/VatsalSy/occusage/issues/new?template=feature_request.md)
- [Contributing Guidelines](CONTRIBUTING.md)
- [Discussions](https://github.com/VatsalSy/occusage/discussions)

---

<p align="center">
    Made with ❤️ for the OpenCode and Claude Code community
</p>
