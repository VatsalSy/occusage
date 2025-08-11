# Configuration

occusage supports various configuration options to customize its behavior and adapt to different Claude Code installations.

## Environment Variables

### CLAUDE_CONFIG_DIR

The `CLAUDE_CONFIG_DIR` environment variable specifies where occusage should look for Claude Code data.

#### Single Directory

```bash
# Set a single custom Claude data directory
export CLAUDE_CONFIG_DIR="/path/to/your/claude/data"
occusage daily
```

#### Multiple Directories

```bash
# Set multiple directories (comma-separated)
export CLAUDE_CONFIG_DIR="/path/to/claude1,/path/to/claude2"
occusage daily
```

When multiple directories are specified, occusage automatically aggregates usage data from all valid locations.

### LOG_LEVEL

Control the verbosity of log output using the `LOG_LEVEL` environment variable. occusage uses [consola](https://github.com/unjs/consola) for logging under the hood:

```bash
# Set logging level
export LOG_LEVEL=0  # Silent (errors only)
export LOG_LEVEL=1  # Warnings
export LOG_LEVEL=2  # Normal logs
export LOG_LEVEL=3  # Informational logs (default)
export LOG_LEVEL=4  # Debug logs
export LOG_LEVEL=5  # Trace logs (most verbose)

# Examples
LOG_LEVEL=0 occusage daily       # Silent output, only show results
LOG_LEVEL=4 occusage daily       # Debug output for troubleshooting
LOG_LEVEL=5 occusage session     # Trace all operations
```

#### Use Cases

- **Clean Output**: Use `LOG_LEVEL=0` for scripts or when piping output
- **Debugging**: Use `LOG_LEVEL=4` or `5` to troubleshoot issues
- **CI/CD**: Use `LOG_LEVEL=1` to only see warnings and errors
- **Development**: Use higher levels to understand internal operations

### CCUSAGE_PROJECT_ALIASES

Configure custom display names for project directories using the `CCUSAGE_PROJECT_ALIASES` environment variable:

```bash
# Set custom project aliases
export CCUSAGE_PROJECT_ALIASES="long-project-name=Short Name,uuid-project=My Project"
occusage daily --instances
```

#### Format

Use comma-separated `raw-name=alias` pairs:

```bash
export CCUSAGE_PROJECT_ALIASES="project1=Production API,project2=Dev Environment"
```

#### Use Cases

- **UUID Projects**: Replace cryptic UUIDs with readable names
- **Long Paths**: Shorten verbose directory names for better table display
- **Team Consistency**: Standardize project names across team members

#### Example

```bash
# Without aliases
occusage daily --instances
# Shows: a2cd99ed-a586-4fe4-8f59-b0026409ec09

# With aliases
export CCUSAGE_PROJECT_ALIASES="a2cd99ed-a586-4fe4-8f59-b0026409ec09=My Project"
occusage daily --instances
# Shows: My Project
```

#### Project Name Formatting

occusage automatically formats complex project directory names into readable display names:

**Automatic Cleanup:**
- **Path Removal**: Strips common directory prefixes like `/Users/username/Development/`
- **UUID Shortening**: Reduces long UUIDs to last two segments for brevity
- **Feature Branch Parsing**: Extracts meaningful names from complex paths

**Examples:**

```bash
# Complex project paths → Formatted names
-Users-phaedrus-Development-adminifi-edugakko-api--feature-ticket-002-configure-dependabot
→ configure-dependabot

a2cd99ed-a586-4fe4-8f59-b0026409ec09.jsonl  
→ 8f59-b0026409ec09.jsonl

/Users/john/Development/my-app
→ my-app
```

**Priority Order:**
1. **Custom aliases** (via `CCUSAGE_PROJECT_ALIASES`) take highest priority
2. **Automatic formatting** applies intelligent parsing rules
3. **Original name** used as fallback if parsing fails

## Default Directory Detection

### Automatic Detection

occusage automatically searches for Claude Code data in these locations:

- **`~/.config/claude/projects/`** - New default location (Claude Code v1.0.30+)
- **`~/.claude/projects/`** - Legacy location (pre-v1.0.30)

::: info Directory Change
The directory change from `~/.claude` to `~/.config/claude` in Claude Code v1.0.30 was an undocumented breaking change. occusage handles both locations automatically for compatibility.
:::

### Search Priority

When `CLAUDE_CONFIG_DIR` is not set, occusage searches in this order:

1. `~/.config/claude/projects/` (preferred)
2. `~/.claude/projects/` (fallback)

Data from all valid directories is automatically combined.

## Command-Line Options

### Global Options

All occusage commands support these configuration options:

```bash
# Date filtering
occusage daily --since 20250101 --until 20250630

# Output format
occusage daily --json                    # JSON output
occusage daily --breakdown              # Per-model breakdown

# Cost calculation modes
occusage daily --mode auto              # Use costUSD when available (default)
occusage daily --mode calculate         # Always calculate from tokens
occusage daily --mode display           # Always use pre-calculated costUSD

# Sort order
occusage daily --order desc             # Newest first (default)
occusage daily --order asc              # Oldest first

# Offline mode
occusage daily --offline                # Use cached pricing data
occusage daily -O                       # Short alias

# Timezone
occusage daily --timezone UTC           # Use UTC timezone
occusage daily -z America/New_York      # Use New York timezone
occusage daily --timezone Asia/Tokyo    # Use Tokyo timezone

# Locale
occusage daily --locale en-US           # US English (12-hour time)
occusage daily -l ja-JP                 # Japanese (24-hour time)
occusage daily --locale de-DE           # German (24-hour time)

# Project analysis (daily command only)
occusage daily --instances              # Group by project
occusage daily --project myproject      # Filter to specific project
occusage daily --instances --project myproject  # Combined usage
```

### Timezone Configuration

The `--timezone` option controls how dates are calculated for grouping usage data:

```bash
# Use UTC timezone for consistent reports
occusage daily --timezone UTC

# Use specific timezone
occusage daily --timezone America/New_York
occusage monthly -z Asia/Tokyo

# Default behavior (no timezone specified)
occusage daily  # Uses system's local timezone
```

#### Timezone Effect

The timezone affects how usage is grouped by date. For example, usage at 11 PM UTC on January 1st would appear on:
- **January 1st** when `--timezone UTC`
- **January 1st** when `--timezone America/New_York` (6 PM EST)
- **January 2nd** when `--timezone Asia/Tokyo` (8 AM JST next day)

#### Use Cases

- **UTC Alignment**: Use `--timezone UTC` for consistent reports across different locations
- **Remote Teams**: Align reports to team's primary timezone
- **Cross-Timezone Analysis**: Compare usage patterns across different time zones
- **CI/CD Environments**: Use UTC for consistent automated reports

### Locale Configuration

The `--locale` option controls date and time formatting:

```bash
# Use US English locale (12-hour time format)
occusage daily --locale en-US

# Use Japanese locale (24-hour time format)
occusage blocks --locale ja-JP

# Use German locale (24-hour time format)
occusage session -l de-DE

# Default behavior (no locale specified)
occusage daily  # Uses en-CA (ISO date format, 24-hour time)
```

#### Locale Effects

The locale affects how dates and times are displayed:

- **Date Format**:
  - `en-US`: 08/04/2025
  - `en-CA`: 2025-08-04 (ISO format)
  - `ja-JP`: 2025/08/04
  - `de-DE`: 04.08.2025

- **Time Format**:
  - `en-US`: 3:30:00 PM (12-hour)
  - `en-CA`, `ja-JP`, `de-DE`: 15:30:00 (24-hour)

#### Use Cases

- **International Teams**: Display dates/times in familiar formats
- **12/24 Hour Preference**: Choose between AM/PM or 24-hour time
- **Regional Standards**: Match local date formatting conventions
- **ISO Compliance**: Use `en-CA` for ISO 8601 date format

### Debug Options

```bash
# Debug pricing mismatches
occusage daily --debug

# Show sample discrepancies
occusage daily --debug --debug-samples 10
```

## Cost Calculation Modes

occusage supports three different cost calculation modes:

### auto (Default)

Uses pre-calculated `costUSD` values when available, falls back to calculating costs from token counts:

```bash
occusage daily --mode auto
```

- ✅ Most accurate when Claude provides cost data
- ✅ Falls back gracefully for older data
- ✅ Best for general use

### calculate

Always calculates costs from token counts using model pricing, ignores pre-calculated values:

```bash
occusage daily --mode calculate
```

- ✅ Consistent calculation method
- ✅ Useful for comparing different time periods
- ❌ May differ from actual Claude billing

### display

Always uses pre-calculated `costUSD` values only, shows $0.00 for missing costs:

```bash
occusage daily --mode display
```

- ✅ Shows only Claude-provided cost data
- ✅ Most accurate for recent usage
- ❌ Shows $0.00 for older entries without cost data

## Offline Mode

occusage can operate without network connectivity by using pre-cached pricing data:

```bash
# Use offline mode
occusage daily --offline
occusage monthly -O
```

### When to Use Offline Mode

#### ✅ Ideal For

- **Air-gapped systems** - Networks with restricted internet access
- **Corporate environments** - Behind firewalls or proxies
- **Consistent pricing** - Using cached model pricing for consistent reports
- **Fast execution** - Avoiding network delays

#### ❌ Limitations

- **Claude models only** - Only supports Claude models (Opus, Sonnet, etc.)
- **Pricing updates** - Won't get latest pricing information
- **New models** - May not support newly released models

### Updating Cached Data

Cached pricing data is updated automatically when running in online mode. To refresh:

```bash
# Run online to update cache
occusage daily

# Then use offline mode
occusage daily --offline
```

## MCP Server Configuration

occusage includes a built-in MCP (Model Context Protocol) server for integration with other tools.

### Basic Usage

```bash
# Start MCP server with stdio transport (default)
occusage mcp

# Start with HTTP transport
occusage mcp --type http --port 8080

# Configure cost calculation mode
occusage mcp --mode calculate
```

### Claude Desktop Integration

Add to your Claude Desktop configuration file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
	"mcpServers": {
		"occusage": {
			"command": "npx",
			"args": ["occusage@latest", "mcp"],
			"env": {
				"CLAUDE_CONFIG_DIR": "/custom/path/to/claude"
			}
		}
	}
}
```

Or with global installation:

```json
{
	"mcpServers": {
		"occusage": {
			"command": "occusage",
			"args": ["mcp"],
			"env": {}
		}
	}
}
```

### Available MCP Tools

- **`daily`** - Daily usage reports
- **`monthly`** - Monthly usage reports
- **`session`** - Session-based reports
- **`blocks`** - 5-hour billing blocks reports

Each tool accepts `since`, `until`, `mode`, `timezone`, and `locale` parameters.

## Terminal Display Configuration

occusage automatically adapts its display based on terminal width:

### Wide Terminals (≥100 characters)

- Shows all columns with full model names
- Displays cache metrics and total tokens
- Uses bulleted model lists for readability

### Narrow Terminals (<100 characters)

- Automatic compact mode with essential columns only
- Shows Date, Models, Input, Output, Cost (USD)
- Helpful message about expanding terminal width

### Force Display Mode

Currently, display mode is automatic based on terminal width. Future versions may include manual override options.

## Configuration Examples

### Development Environment

```bash
# Set environment variables in your shell profile
export CLAUDE_CONFIG_DIR="$HOME/.config/claude"

# Add aliases for common commands
alias ccu-daily="occusage daily --breakdown"
alias ccu-live="occusage blocks --live"
alias ccu-json="occusage daily --json"
```

### CI/CD Environment

```bash
# Use offline mode in CI
export CCUSAGE_OFFLINE=1
occusage daily --offline --json > usage-report.json
```

### Multiple Team Members

```bash
# Each team member sets their own Claude directory
export CLAUDE_CONFIG_DIR="/team-shared/claude-data/$USER"
occusage daily --since 20250101
```

## Troubleshooting Configuration

### Common Issues

#### No Data Found

If occusage reports no data found:

```bash
# Check if Claude directories exist
ls -la ~/.claude/projects/
ls -la ~/.config/claude/projects/

# Verify environment variable
echo $CLAUDE_CONFIG_DIR

# Test with explicit environment variable
export CLAUDE_CONFIG_DIR="/path/to/claude/projects"
occusage daily
```

#### Permission Errors

```bash
# Check directory permissions
ls -la ~/.claude/
ls -la ~/.config/claude/

# Fix permissions if needed
chmod -R 755 ~/.claude/
chmod -R 755 ~/.config/claude/
```

#### Network Issues in Offline Mode

```bash
# Run online first to cache pricing data
occusage daily

# Then use offline mode
occusage daily --offline
```

## Next Steps

After configuring occusage:

- Learn about [Custom Paths](/guide/custom-paths) for advanced directory management
- Explore [Cost Modes](/guide/cost-modes) for different calculation approaches
- Try [Live Monitoring](/guide/live-monitoring) for real-time usage tracking
