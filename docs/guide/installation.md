# Installation

occusage can be installed and used in several ways depending on your preferences and use case.

## Why No Installation Needed?

Thanks to occusage's incredibly small bundle size, you don't need to install it globally. Unlike other CLI tools, we pay extreme attention to bundle size optimization, achieving an impressively small footprint even without minification. This means:

- ✅ Near-instant startup times
- ✅ Minimal download overhead
- ✅ Always use the latest version
- ✅ No global pollution of your system

## Quick Start (Recommended)

The fastest way to use occusage is to run it directly:

::: code-group

```bash [bunx (Recommended)]
bunx occusage
```

```bash [npx]
npx occusage@latest
```

```bash [pnpm]
pnpm dlx occusage
```

```bash [deno]
deno run -E -R=$HOME/.claude/projects/ -S=homedir -N='raw.githubusercontent.com:443' npm:occusage@latest
```

:::

::: tip Speed Recommendation
We strongly recommend using `bunx` instead of `npx` due to the massive speed difference. Bunx caches packages more efficiently, resulting in near-instant startup times after the first run.
:::

::: info Deno Security
Consider using `deno run` if you want additional security controls. Deno allows you to specify exact permissions, making it safer to run tools you haven't audited.
:::

### Performance Comparison

Here's why runtime choice matters:

| Runtime | First Run | Subsequent Runs | Notes |
|---------|-----------|-----------------|-------|
| bunx | Fast | **Instant** | Best overall choice |
| npx | Slow | Moderate | Widely available |
| pnpm dlx | Fast | Fast | Good alternative |
| deno | Moderate | Fast | Best for security |

## Global Installation (Optional)

While not necessary due to our small bundle size, you can still install occusage globally if you prefer:

::: code-group

```bash [npm]
npm install -g occusage
```

```bash [bun]
bun install -g occusage
```

```bash [yarn]
yarn global add occusage
```

```bash [pnpm]
pnpm add -g occusage
```

:::

After global installation, run commands directly:

```bash
occusage daily
occusage monthly --breakdown
occusage blocks --live
```

## Development Installation

For development or contributing to occusage:

```bash
# Clone the repository
git clone https://github.com/ryoppippi/occusage.git
cd occusage

# Install dependencies
bun install

# Run directly from source
bun run start daily
bun run start monthly --json
```

### Development Scripts

```bash
# Run tests
bun run test

# Type checking
bun typecheck

# Build distribution
bun run build

# Lint and format
bun run format
```

## Runtime Requirements

### Node.js

- **Minimum**: Node.js 20.x
- **Recommended**: Node.js 20.x or later
- **LTS versions** are fully supported

### Bun (Alternative)

- **Minimum**: Bun 1.2+
- **Recommended**: Latest stable release
- Often faster than Node.js for occusage

### Deno

Deno 2.0+ is fully supported with proper permissions:

```bash
deno run \
  -E \
  -R=$HOME/.claude/projects/ \
  -S=homedir \
  -N='raw.githubusercontent.com:443' \
  npm:occusage@latest
```

Also you can use `offline` mode to run occusage without network access:

```bash
deno run \
  -E \
  -R=$HOME/.claude/projects/ \
  -S=homedir \
  npm:occusage@latest --offline
```

## Verification

After installation, verify occusage is working:

```bash
# Check version
occusage --version

# Run help command
occusage --help

# Test with daily report
occusage daily
```

## Updating

### Direct Execution (npx/bunx)

Always gets the latest version automatically.

### Global Installation

```bash
# Update with npm
npm update -g occusage

# Update with bun
bun update -g occusage
```

### Check Current Version

```bash
occusage --version
```

## Uninstalling

### Global Installation

::: code-group

```bash [npm]
npm uninstall -g occusage
```

```bash [bun]
bun remove -g occusage
```

```bash [yarn]
yarn global remove occusage
```

```bash [pnpm]
pnpm remove -g occusage
```

:::

### Development Installation

```bash
# Remove cloned repository
rm -rf occusage/
```

## Troubleshooting Installation

### Permission Errors

If you get permission errors during global installation:

::: code-group

```bash [npm]
# Use npx instead of global install
npx occusage@latest

# Or configure npm to use a different directory
npm config set prefix ~/.npm-global
export PATH=~/.npm-global/bin:$PATH
```

```bash [Node Version Managers]
# Use nvm (recommended)
nvm install node
npm install -g occusage

# Or use fnm
fnm install node
npm install -g occusage
```

:::

### Network Issues

If installation fails due to network issues:

```bash
# Try with different registry
npm install -g occusage --registry https://registry.npmjs.org

# Or use bunx for offline-capable runs
bunx occusage
```

### Version Conflicts

If you have multiple versions installed:

```bash
# Check which version is being used
which occusage
occusage --version

# Uninstall and reinstall
npm uninstall -g occusage
npm install -g occusage@latest
```

## Next Steps

After installation, check out:

- [Getting Started Guide](/guide/getting-started) - Your first usage report
- [Configuration](/guide/configuration) - Customize occusage behavior
- [Daily Reports](/guide/daily-reports) - Understand daily usage patterns
