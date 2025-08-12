# Migration Plan: Pure Bun Codebase

## 🎯 Objective
Convert occusage from a hybrid Node.js/Bun project to a pure Bun-only codebase by removing all Node.js and npm-specific configurations and dependencies.

## 📊 Current State Analysis

### ✅ What's Already Bun-Compatible
- **Source Code**: 100% compatible - all `node:` imports work natively in Bun
- **Test Suite**: All 84 tests pass perfectly with Bun (637ms runtime, 0 failures)
- **Dependencies**: All 24 devDependencies are pure JavaScript/TypeScript
- **Build System**: Already using `bun run` commands exclusively
- **Module System**: ESM modules throughout (no CommonJS)

### ❌ Node.js/npm Cruft to Remove
- Node engine specification in package.json
- npm distribution configuration (dist, exports, main, bin)
- Unused Node-specific dependencies
- npm-related documentation and badges
- Outdated npm publishing references

## 🚀 Migration Steps

### Phase 1: Core Configuration Cleanup

#### 1.1 package.json Modifications
**File**: `package.json`

**Remove these fields:**
```json
{
  "engines": {
    "node": ">=20.19.4"  // Lines 40-42
  },
  "exports": {           // Lines 24-32
    ".": "./dist/index.js",
    "./calculate-cost": "./dist/calculate-cost.js",
    "./data-loader": "./dist/data-loader.js",
    "./debug": "./dist/debug.js",
    "./logger": "./dist/logger.js",
    "./pricing-fetcher": "./dist/pricing-fetcher.js",
    "./package.json": "./package.json"
  },
  "main": "./dist/index.js",     // Line 33
  "module": "./dist/index.js",   // Line 34
  "types": "./dist/index.d.ts",  // Line 35
  "bin": "./dist/index.js",      // Line 36
  "files": [                     // Lines 37-39
    "dist"
  ]
}
```

**Remove from devDependencies:**
```json
"@hono/node-server": "^1.18.1"  // Unused dependency
```

**Optional additions:**
```json
{
  "engines": {
    "bun": ">=1.0.0"
  },
  "packageManager": "bun@1.2.20"
}
```

#### 1.2 Vitest Configuration Optimization
**File**: `vitest.config.ts`

**Current:**
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'node',  // Change this
    include: ['test/**/*.test.ts'],
  },
});
```

**Updated:**
```typescript
export default defineConfig({
  test: {
    globals: true,
    environment: 'happy-dom', // or remove entirely for default
    include: ['test/**/*.test.ts'],
  },
});
```

### Phase 2: Documentation Updates

#### 2.1 Update README.md
**File**: `README.md`

**Changes needed:**
- Remove any npm-specific installation instructions
- Emphasize Bun-only approach in installation section
- Update all examples to use `bun` commands exclusively
- Add clear statement: "This project requires Bun runtime"
- Remove references to Node.js compatibility

#### 2.2 Delete Outdated Documentation
**File**: `README-old.md`
- **Action**: Delete entirely
- **Reason**: Contains npm badges, npmjs.com references, and outdated npm publishing information

### Phase 3: Dependency Cleanup

#### 3.1 Remove Unused Dependencies
```bash
bun remove @hono/node-server
```

#### 3.2 Verify Remaining Dependencies
All remaining dependencies are Bun-compatible:
- CLI tools: `gunshi`, `consola`, `picocolors`
- Utilities: `es-toolkit`, `zod`, `fast-sort`
- Testing: `vitest`, `fs-fixture`
- Types: `type-fest`, `@types/bun`

### Phase 4: Validation & Testing

#### 4.1 Pre-Migration Testing
```bash
# Ensure clean starting state
bun test
# Expected: 84 tests pass, 0 fail
```

#### 4.2 Post-Migration Testing
```bash
# After each change, run full test suite
bun test

# Test all CLI commands
./testManual.sh --all

# Verify no regression in functionality
bun run start --breakdown
bun run start blocks --live
```

#### 4.3 Performance Verification
```bash
# Measure test performance (should remain ~600ms)
time bun test

# Verify CLI startup time
time bun run start --help
```

## 🔍 Risk Assessment

### ✅ Zero Risk Elements
- **Source code**: No changes needed - all `node:` imports work in Bun
- **Test suite**: Already passing 100% with Bun
- **Dependencies**: All are platform-agnostic JavaScript
- **Functionality**: No behavioral changes expected

### ⚠️ Low Risk Elements
- **Vitest environment**: Change from 'node' to 'happy-dom' is cosmetic
- **package.json structure**: Removing unused fields can't break anything
- **Documentation**: Pure content changes

### 🛡️ Mitigation Strategies
- **Incremental approach**: Test after each major change
- **Git branching**: Create `pure-bun-migration` branch
- **Rollback plan**: All changes are easily reversible
- **Backup**: Current state preserved in git history

## 📋 Validation Checklist

### Pre-Migration
- [ ] All tests passing with current setup
- [ ] CLI commands working correctly
- [ ] Performance baseline established

### During Migration
- [ ] package.json cleaned of Node/npm references
- [ ] Unused dependencies removed
- [ ] Vitest config optimized for Bun
- [ ] Documentation updated

### Post-Migration
- [ ] All 84 tests still passing
- [ ] CLI functionality unchanged
- [ ] Performance maintained or improved
- [ ] No Node.js references remaining
- [ ] Clear Bun-only messaging in docs

## 🚀 Success Criteria

### Technical Success
1. **All tests pass**: 84/84 tests with zero failures
2. **Full CLI functionality**: All commands work identically
3. **Performance maintained**: Test suite runs in <1 second
4. **Clean configuration**: No Node/npm references in codebase

### Documentation Success
1. **Clear intent**: README clearly states Bun-only requirement
2. **Accurate instructions**: All examples use Bun commands
3. **No confusion**: No mixed Node/Bun messaging

## 🔄 Rollback Plan

If issues arise:
1. **Git revert**: All changes in version control
2. **Dependency restoration**: `bun add @hono/node-server`
3. **Config restoration**: Restore original package.json fields
4. **Documentation revert**: Restore original README content

## 📈 Expected Benefits

### Development Experience
- **Clearer mental model**: Single runtime to consider
- **Faster everything**: Bun's performance advantages
- **Simplified setup**: No Node version management
- **Future-proof**: Aligned with Bun ecosystem growth

### Maintenance Benefits
- **Reduced complexity**: No dual-runtime confusion
- **Cleaner dependencies**: No unused Node-specific packages
- **Focused documentation**: Single installation path
- **Community alignment**: Clear positioning as Bun-first project

## 🎯 Timeline

- **Preparation**: 5 minutes (create migration branch)
- **Core changes**: 10 minutes (package.json, config)
- **Documentation**: 15 minutes (README updates, file deletion)
- **Testing**: 10 minutes (validation across all commands)
- **Total estimated time**: 40 minutes

This migration represents a low-risk, high-reward cleanup that aligns the project configuration with its actual runtime requirements and eliminates confusing hybrid setup.