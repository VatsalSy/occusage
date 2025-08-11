# Multi-CLI Integration Plan: OpenCode + Claude Code

## 🎯 Single-Day Sprint Implementation Plan

Based on comprehensive exploration of both Claude Code and OpenCode data structures, here's the streamlined plan for integrating OpenCode usage tracking with the existing Claude Code functionality in `occusage`. This implementation will be completed in a single sprint with focus on core functionality and visual differentiation.

### 📊 Data Structure Analysis

#### **Claude Code (JSONL)**
- **Location**: `~/.claude/projects/{project-name}/{sessionId}.jsonl`
- **Format**: JSONL (one JSON object per line)
- **Structure**: Each line contains a complete message with:
  - `sessionId`: UUID for the session (matches filename)
  - `message.usage`: Token counts (input_tokens, output_tokens, cache tokens)
  - `timestamp`: ISO timestamp
  - `model`: Model used (e.g., "claude-sonnet-4-20250514")
  - `type`: "user" or "assistant"
  - `costUSD`: Pre-calculated cost (when available)
- **Current Grouping**: 
  - "Session" command groups by `{project-name}/{sessionId}` (each JSONL file = one "session")
  - "Blocks" command groups by 5-hour time windows across all projects/sessions

#### **OpenCode (Distributed JSON)**
- **Location**: `~/.local/share/opencode/project/{encoded-project-path}/storage/session/`
- **Format**: Distributed JSON files in hierarchical structure
- **Structure**:
  ```
  session/
  ├── info/       # Session metadata (id, title, timestamps)
  │   └── {sessionId}.json
  ├── message/    # Message files with role, system prompts
  │   └── {sessionId}/
  │       └── {messageId}.json
  └── part/       # Message parts with token tracking
      └── {sessionId}/
          └── {messageId}/
              └── {partId}.json  # Contains tokens, cost, type
  ```
- **Token Tracking**: In `step-finish` type parts with:
  - `tokens.input`, `tokens.output`, `tokens.reasoning`
  - `tokens.cache.write`, `tokens.cache.read`
  - `cost`: Pre-calculated cost
  - `modelID`: Model identifier (e.g., "claude-sonnet-4-20250514")
  - `providerID`: Provider (e.g., "anthropic")
  - `time.created`, `time.completed`: Unix timestamps

#### **Key Mapping Insights**
- **Projects**: Claude Code `{project-name}` ↔ OpenCode decoded `{encoded-project-path}`
- **Sessions**: Claude Code `{sessionId}.jsonl` ↔ OpenCode individual conversation `{sessionId}` within a project
- **Current "Session" Command**: Actually groups by project+session combination, not just sessions
- **Blocks Integration**: OpenCode data needs to be integrated into existing 5-hour time window logic

### 🏗️ Architecture Design

#### **1. Unified Data Model**
```typescript
interface UnifiedUsageEntry {
  source: 'claude' | 'opencode';
  sessionId: string;
  projectPath: string;
  timestamp: Date;
  model: string;
  provider?: string;  // OpenCode specific
  tokens: {
    input: number;
    output: number;
    cache?: {
      read: number;
      write: number;
    };
    reasoning?: number;  // OpenCode specific
  };
  cost?: number;
  messageId?: string;  // OpenCode specific
  partId?: string;     // OpenCode specific
  type: 'user' | 'assistant' | 'system';
}
```

#### **2. Multi-Source Data Loader Architecture**
- **Abstract Factory Pattern**: Create loaders for each source
  - `ClaudeDataLoader`: Existing JSONL parser (refactored)
  - `OpenCodeDataLoader`: New distributed JSON parser
  - `UnifiedDataLoader`: Orchestrates both loaders

#### **3. Session Management Strategy**
- **Claude Code**: Current "session" = `{project-name}/{sessionId}` (file-based grouping)
- **OpenCode**: Hierarchical structure with project → session → messages → parts
- **Simplified Strategy**:
  - **Daily/Monthly/Weekly Commands**: Simple timestamp-based aggregation across both sources
  - **Session Command**: Group by project+session combination from both sources
  - **Blocks Command**: Integrate OpenCode data into existing 5-hour time window logic
  - **No Cross-Source Matching**: Keep data sources completely separate, only aggregate totals

#### **4. Blocks Integration Strategy**
Based on the current `identifySessionBlocks` implementation, OpenCode integration for blocks is straightforward:
- **Current Logic**: Groups entries by 5-hour time windows regardless of source
- **OpenCode Integration**: 
  - Convert OpenCode part timestamps to `LoadedUsageEntry` format
  - Feed into existing `identifySessionBlocks` function alongside Claude Code data
  - Maintain source attribution in the unified data model
  - Use existing gap detection and active block logic
- **Benefits**: Leverages proven time-window logic, no architectural changes needed

#### **5. Configuration Updates**
```typescript
// Environment variables
CLAUDE_CONFIG_DIR     // Existing: Claude data directories (supports multiple paths)
OPENCODE_DATA_DIR     // New: OpenCode data directories (supports multiple paths)
                      // Default: ~/.local/share/opencode (auto-detected like Claude)

// CLI flags
--source claude,opencode  // Filter by data source (default: both)
```

**OpenCode Directory Detection Pattern** (following Claude Code approach):
- **Default behavior**: Auto-detect `~/.local/share/opencode` 
- **Environment override**: `OPENCODE_DATA_DIR` supports comma-separated paths
- **Graceful fallback**: Skip OpenCode if directory doesn't exist
- **Multiple locations**: Same multi-path support as `CLAUDE_CONFIG_DIR`

### 📝 Single-Day Implementation Plan

#### **Core Implementation (Today's Sprint)**

1. **OpenCode Data Discovery & Parsing**:
   - Create `OpenCodePathResolver`: Map encoded project paths to readable names
   - Create `OpenCodePartParser`: Extract token data from `step-finish` parts only
   - Create `OpenCodeMessageAggregator`: Sum tokens across message parts
   - Create `OpenCodeSessionAggregator`: Aggregate session totals

2. **Unified Data Interface**:
   - Add `source` field to all usage interfaces
   - Create `UnifiedDataLoader`: Parallel loading from both sources
   - Update all commands (daily, monthly, weekly, session, blocks) for multi-source data

3. **Visual Output Enhancement**:
   - Add source icons: `[C]` for Claude Code, `[O]` for OpenCode
   - Implement color coding for different sources
   - Create two-row output format with combined totals
   - Update JSON output to include source information

4. **Error Handling & Edge Cases**:
   - Graceful degradation when OpenCode directory missing
   - Handle malformed OpenCode files
   - Maintain backward compatibility with Claude-only workflows

### 🔧 Technical Implementation Details

#### **Simplified File Structure Changes**
```
src/
├── _consts.ts                # Add OpenCode constants (following Claude pattern)
├── data-loader.ts            # Updated with OpenCode support
├── _opencode-loader.ts       # New: OpenCode distributed JSON parser
├── _opencode-types.ts        # New: OpenCode-specific type definitions
├── _types.ts                 # Updated with source field
└── commands/                 # Updated to handle multi-source data
    ├── daily.ts              # Enhanced with source rows
    ├── monthly.ts            # Enhanced with source rows
    ├── weekly.ts             # Enhanced with source rows
    ├── session.ts            # Enhanced with source rows
    └── blocks.ts             # Enhanced with source rows
```

**New Constants to Add** (following existing Claude pattern):
```typescript
// In _consts.ts
export const DEFAULT_OPENCODE_DATA_PATH = '.local/share/opencode';
export const OPENCODE_DATA_DIR_ENV = 'OPENCODE_DATA_DIR';
export const OPENCODE_PROJECTS_DIR_NAME = 'project'; // Note: singular in OpenCode
```

#### **Performance Considerations**
- **Lazy Loading**: Don't parse all OpenCode parts upfront
- **Parallel Processing**: Use Promise.all for concurrent file operations
- **Memory Management**: Stream large datasets, avoid loading everything into memory
- **Future Enhancement**: Caching can be added later if needed

#### **Error Handling & Resilience**
- **Graceful Degradation**: Handle missing OpenCode directory
- **Validation**: Zod schemas for all new data structures
- **Error Recovery**: Skip malformed files, log warnings with context
- **Partial Data**: Handle incomplete OpenCode sessions gracefully
- **Backward Compatibility**: Ensure existing Claude-only workflows unchanged

### 🎯 Sprint Focus: Core Integration with Visual Enhancement

#### **Key Implementation Priorities**
1. **No Cross-Source Session Matching**: Keep data sources completely separate
2. **Visual Differentiation**: Source icons `[C]` and `[O]` with color coding
3. **Two-Row Output Format**: Separate rows for each source plus combined totals
4. **Command Coverage**: All five commands (daily, monthly, weekly, session, blocks) support both sources

#### **Remaining Challenges & Solutions**

#### **1. Data Format Normalization**
- **Challenge**: OpenCode has part-level data, Claude Code has message-level data
- **Solution**: Aggregate OpenCode parts to message level during loading

#### **2. Project Path Encoding**
- **Challenge**: OpenCode uses encoded paths ("Users-vatsal-...")
- **Solution**: Create decoder to map encoded paths to readable project names

#### **3. File System Performance**
- **Challenge**: OpenCode creates many small files vs Claude Code's single JSONL files
- **Solution**: Implement caching and batch operations for OpenCode directory scanning

#### **4. Model Name Consistency**
- **Challenge**: Different model naming conventions between sources
- **Solution**: Lightweight model name normalization for consistent reporting

### 📊 Output Format Updates

#### **Table Output Enhancements**
```
Daily Usage Report - 2025-08-11
┌─────────┬──────────┬────────────┬────────────┬──────────┐
│ Source  │ Sessions │ Input      │ Output     │ Cost     │
├─────────┼──────────┼────────────┼────────────┼──────────┤
│ [C] Claude │ 5     │ 125,000    │ 45,000     │ $2.45    │
│ [O] OpenCode │ 3   │ 89,000     │ 32,000     │ $1.89    │
├─────────┼──────────┼────────────┼────────────┼──────────┤
│ TOTAL   │ 8        │ 214,000    │ 77,000     │ $4.34    │
└─────────┴──────────┴────────────┴────────────┴──────────┘
```
- Source icons: `[C]` for Claude Code, `[O]` for OpenCode
- Color coding: Blue for Claude, Green for OpenCode, Bold for totals
- Combined totals row with aggregated statistics

#### **JSON Output Extensions**
```json
{
  "date": "2025-08-11",
  "sources": {
    "claude": { "sessions": 3, "tokens": 15000, "cost": 0.45 },
    "opencode": { "sessions": 2, "tokens": 8000, "cost": 0.24 }
  },
  "combined": { "sessions": 5, "tokens": 23000, "cost": 0.69 },
  "entries": [
    {
      "source": "claude",
      "sessionId": "uuid-here",
      "model": "claude-sonnet-4-20250514",
      "tokens": { "input": 1000, "output": 500 },
      "cost": 0.15
    }
  ]
}
```

### 🚀 Single-Day Implementation Strategy

#### **Sprint Tasks (Today)**
1. **Foundation (2 hours)**:
   - Create OpenCode data types and parser
   - Update existing types with source field
   - Implement basic OpenCode data loading

2. **Integration (3 hours)**:
   - Update all five commands to handle multi-source data
   - Implement two-row output format with source icons
   - Add color coding for visual differentiation

3. **Polish (1 hour)**:
   - Add error handling for missing OpenCode directory
   - Test all commands with both data sources
   - Ensure backward compatibility with Claude-only setups

### 🧪 Testing Strategy

#### **Sprint Testing (Today)**
- **OpenCode Parsing**: Test with real OpenCode session data
- **Multi-Source Commands**: Verify all five commands show two-row output
- **Visual Output**: Confirm source icons and color coding work
- **Edge Cases**: Test with missing OpenCode directory
- **Backward Compatibility**: Ensure Claude-only setups still work

#### **Success Criteria**
- All commands (daily, monthly, weekly, session, blocks) show separate Claude/OpenCode rows
- Combined totals accurately sum both sources
- Visual differentiation with `[C]` and `[O]` icons plus colors
- Graceful handling when OpenCode data unavailable
- No breaking changes to existing Claude Code functionality

This streamlined plan delivers the core multi-CLI integration in a single sprint while maintaining all existing functionality and adding clear visual differentiation between data sources.