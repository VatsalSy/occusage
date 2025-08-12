# Contributing to occusage

Thank you for your interest in contributing to occusage! This document provides guidelines and instructions for contributing.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR-USERNAME/occusage.git`
3. Install dependencies: `bun install` (Minimum tested Bun: >= 1.2.20; `packageManager` is pinned to `bun@1.2.20`.)
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Workflow

### Before Making Changes

1. Run tests: `bun test` (ensures all tests pass)
2. Follow project's TypeScript/Bun conventions (see AGENTS.md for style guidelines)
3. Run manual CLI tests: `./testManual.sh` (optional, for CLI validation)
4. Ensure the current state is clean
5. Pull latest changes from upstream

### Making Changes

1. Follow the existing code style (see AGENTS.md for guidelines)
2. Update tests for any API changes
3. Add tests for new features
4. Update documentation as needed

### Testing Your Changes

```bash
# Run unit tests
bun test

# Test specific file
bun test test/your-test.test.ts

# Manual testing
./testManual.sh --all
```

### Submitting Changes

1. Commit with clear, descriptive messages
2. Push to your fork
3. Create a Pull Request with:
   - Clear description of changes
   - Link to related issues
   - Screenshots/output if applicable

## Code Style Guidelines

- **Runtime**: Bun with TypeScript ESM modules
- **Types**: Use Zod for validation, strict TypeScript
- **Naming**: camelCase for variables/functions, kebab-case for files
- **Error Handling**: Use Result patterns, avoid throwing exceptions

See [AGENTS.md](AGENTS.md) for detailed guidelines.

## Reporting Issues

- Use [issue templates](https://github.com/VatsalSy/occusage/issues/new/choose)
- Search existing issues first
- Provide environment details and reproduction steps

## Pull Request Process

1. Update README.md with details of changes if needed
2. Update CHANGELOG.md following Keep a Changelog format
3. Ensure all tests pass
4. Request review from maintainers

## Questions?

Feel free to open a [discussion](https://github.com/VatsalSy/occusage/discussions) for questions or suggestions.
