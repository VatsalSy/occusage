# AGENTS.md - Development Guidelines

## Build/Test Commands
```bash
bun install                    # Install dependencies
bun run start                  # Run the CLI tool
bun test                       # Run all tests
bun test test/specific.test.ts # Run single test file
bun run test:statusline        # Run statusline test with sample data
./testManual.sh                # Run all commands manually -- direct testing
```

## Code Style Guidelines

### Runtime & Modules
- **Runtime**: Bun with TypeScript ESM modules (`"type": "module"`)
- **Target**: ESNext with bundler module resolution
- **Imports**: Use `.ts` extensions, relative imports for local modules, named imports preferred

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