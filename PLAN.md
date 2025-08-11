# Multi-CLI Integration Plan: OpenCode + Claude Code

## 🎯 Multi-CLI Integration Plan

Based on comprehensive exploration of both Claude Code and OpenCode data structures, here's the detailed plan for integrating OpenCode usage tracking with the existing Claude Code functionality in `occusage`.

### 📊 Data Structure Analysis

#### **Claude Code (JSONL)**
- **Location**: `~/.claude/projects/{project-name}/{sessionId}.jsonl`
- **Format**: JSONL (one JSON object per line)
- **Structure**: Each line contains a complete message with:
  - `sessionId`: UUID for the session
  - `message.usage`: Token counts (input_tokens, output_tokens, cache tokens)
  - `timestamp`: ISO timestamp
  - `model`: Model used (e.g., "gpt-5-mini")
  - `type`: "user" or "assistant"
  - `costUSD`: Pre-calculated cost (when available)

#### **OpenCode (Distributed JSON)**
- **Location**: `~/.local/share/opencode/project/{project-path}/storage/session/`
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
- **Claude Code**: Sessions are file-based (one JSONL = one session)
- **OpenCode**: Sessions are directory-based with multiple parts
- **Session Accumulation**:
  - Use timestamps to detect session boundaries (configurable gap, default 30 min)
  - Aggregate parts within a session for OpenCode
  - Maintain source attribution for debugging and filtering
  - Handle cross-source sessions (same project, overlapping time)

#### **4. Configuration Updates**
```typescript
// Environment variables
CLAUDE_CONFIG_DIR     // Existing: Claude data directories
OPENCODE_DATA_DIR     // New: defaults to ~/.local/share/opencode
OCCUSAGE_SOURCES      // New: comma-separated list ('claude,opencode', 'claude', 'opencode')
OCCUSAGE_SESSION_GAP  // New: session boundary timeout in minutes (default 30)

// CLI flags
--source claude,opencode  // Filter by data source
--session-gap 30         // Override session boundary detection
```

### 📝 Implementation Plan

#### **Phase 1: Data Discovery & Path Resolution**
1. **Create `OpenCodePathResolver`**:
   - Scan `~/.local/share/opencode/project/`
   - Map encoded project paths to readable names (Users-vatsal-... → /Users/vatsal/...)
   - Handle special cases (global project, relative paths)
   - Create project name normalization for cross-source matching

2. **Create `OpenCodeSessionScanner`**:
   - Discover all sessions in a project directory
   - Read session info files for metadata (title, created/updated times)
   - Build session index with timestamps and basic info
   - Handle missing or corrupted session files gracefully

#### **Phase 2: OpenCode Data Parsing**
1. **Create `OpenCodePartParser`**:
   - Parse different part types:
     - `step-finish`: Contains token usage and cost data
     - `text`: User/assistant text content
     - `patch`: File modifications
     - `step-start`: Beginning of operations
   - Extract token data from `step-finish` parts only
   - Handle missing or malformed token data

2. **Create `OpenCodeMessageAggregator`**:
   - Group parts by messageId within a session
   - Sum tokens across all parts of a message
   - Calculate message-level costs and timing
   - Handle partial messages (missing parts)

3. **Create `OpenCodeSessionAggregator`**:
   - Aggregate all messages within a session
   - Calculate session totals and duration
   - Extract session metadata (title, model usage patterns)

#### **Phase 3: Unified Data Interface**
1. **Update Existing Types**:
   - Add `source` field to all usage interfaces
   - Extend `LoadOptions` with source selection
   - Add provider information to model tracking
   - Update cost calculation to handle different cost sources

2. **Create `UnifiedDataLoader`**:
   - Parallel loading from both sources
   - Merge and sort by timestamp
   - Handle conflicts and duplicates
   - Provide source filtering capabilities

3. **Update Commands**:
   - Modify all existing commands (daily, monthly, session, blocks) to handle multi-source data
   - Add source attribution in output tables
   - Update JSON output format to include source information

#### **Phase 4: Session Intelligence & Boundary Detection**
1. **Create `SessionBoundaryDetector`**:
   - Analyze timestamp gaps between interactions
   - Configurable session timeout (default 30 minutes)
   - Handle different timezone data
   - Detect natural conversation boundaries

2. **Create `SessionAccumulator`**:
   - Group related interactions across sources
   - Calculate true session duration
   - Track session continuity and breaks
   - Handle overlapping sessions from different sources

3. **Create `CrossSourceSessionMatcher`**:
   - Match sessions across Claude Code and OpenCode
   - Use project path and timestamp proximity
   - Handle cases where same conversation spans both tools

#### **Phase 5: Model & Cost Normalization**
1. **Create `ModelNameNormalizer`**:
   - Map different model naming conventions:
     - Claude Code: "gpt-5-mini", "claude-sonnet-4-20250514"
     - OpenCode: "claude-sonnet-4-20250514", provider-specific names
   - Maintain compatibility with existing LiteLLM integration
   - Handle model aliases and version mapping

2. **Update Cost Calculation**:
   - Prefer pre-calculated costs when available
   - Handle different cost calculation modes per source
   - Maintain existing cost modes (auto, calculate, display)
   - Add source-specific cost overrides

### 🔧 Technical Implementation Details

#### **File Structure Changes**
```
src/
├── data-loader/
│   ├── index.ts              # Unified loader interface
│   ├── claude-loader.ts      # Existing JSONL logic (refactored)
│   ├── opencode-loader.ts    # New distributed JSON logic
│   ├── unified-loader.ts     # Orchestration layer
│   └── types.ts              # Shared loader types
├── session/
│   ├── boundary-detector.ts  # Session boundary detection
│   ├── accumulator.ts        # Session aggregation
│   ├── cross-matcher.ts      # Cross-source session matching
│   └── types.ts              # Session type definitions
├── model/
│   ├── normalizer.ts         # Model name normalization
│   └── provider-map.ts       # Provider-specific mappings
├── _opencode-types.ts        # OpenCode-specific type definitions
└── _types.ts                 # Updated with unified types
```

#### **Performance Optimizations**
- **Lazy Loading**: Don't parse all OpenCode parts upfront
- **Smart Caching**: Cache parsed OpenCode data with file modification time checks
- **Parallel Processing**: Use Promise.all for concurrent file operations
- **Incremental Updates**: Track last processed timestamps per source
- **Memory Management**: Stream large datasets, avoid loading everything into memory

#### **Error Handling & Resilience**
- **Graceful Degradation**: Handle missing OpenCode directory
- **Validation**: Zod schemas for all new data structures
- **Error Recovery**: Skip malformed files, log warnings with context
- **Partial Data**: Handle incomplete OpenCode sessions gracefully
- **Backward Compatibility**: Ensure existing Claude-only workflows unchanged

### 🎯 Key Challenges & Solutions

#### **1. Data Granularity Mismatch**
- **Challenge**: Claude Code has message-level data, OpenCode has part-level data
- **Solution**: Normalize at the message level, aggregate parts for OpenCode

#### **2. Session Continuity Across Sources**
- **Challenge**: Users might switch between Claude Code and OpenCode mid-conversation
- **Solution**: Use project path + timestamp proximity for correlation, configurable gap detection

#### **3. Model Name Inconsistencies**
- **Challenge**: Different naming conventions ("gpt-5-mini" vs "claude-sonnet-4-20250514")
- **Solution**: Create comprehensive model alias mapping, maintain LiteLLM compatibility

#### **4. Cost Calculation Differences**
- **Challenge**: Different cost calculation methods and currencies
- **Solution**: Prefer pre-calculated costs, fallback to LiteLLM, maintain existing cost modes

#### **5. File System Performance**
- **Challenge**: OpenCode creates many small files vs Claude Code's single JSONL files
- **Solution**: Implement smart caching, batch file operations, lazy loading

#### **6. Project Path Mapping**
- **Challenge**: Different path encoding between sources
- **Solution**: Normalize paths early, create bidirectional mapping

### 📊 Output Format Updates

#### **Table Output Enhancements**
- Add source column: `[C]` for Claude Code, `[O]` for OpenCode, `[M]` for mixed
- Color coding for different sources
- Source-specific model information
- Combined totals with source breakdown

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

### 🚀 Migration Strategy

#### **Phase 1: Foundation (Week 1)**
- Implement OpenCode data discovery and basic parsing
- Create unified data types and interfaces
- Add source filtering to existing commands

#### **Phase 2: Integration (Week 2)**
- Implement session boundary detection
- Add OpenCode data to daily/monthly reports
- Update output formats with source information

#### **Phase 3: Intelligence (Week 3)**
- Implement cross-source session matching
- Add advanced session analytics
- Optimize performance for large datasets

#### **Phase 4: Polish (Week 4)**
- Add comprehensive error handling
- Implement caching and performance optimizations
- Update documentation and examples

### 🧪 Testing Strategy

#### **Unit Tests**
- OpenCode file parsing with various part types
- Session boundary detection with different gap scenarios
- Model name normalization across sources
- Cost calculation with mixed data sources

#### **Integration Tests**
- End-to-end data loading from both sources
- Command output verification with multi-source data
- Performance testing with large OpenCode datasets
- Error handling with corrupted or missing files

#### **Compatibility Tests**
- Ensure existing Claude-only workflows unchanged
- Verify backward compatibility with existing data
- Test graceful degradation when OpenCode unavailable

This comprehensive plan ensures seamless integration of OpenCode data while maintaining the existing functionality, performance, and user experience of `occusage`.