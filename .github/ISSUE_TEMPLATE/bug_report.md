---
name: Bug Report
about: Create a report to help us improve
title: '[BUG]'
labels: ['bug']
assignees: []
---

## Description

A clear and concise description of the bug.

## To Reproduce

Steps to reproduce the behavior:

1. Run command '...'
2. With options '...'
3. See error

## Expected Behavior

What you expected to happen.

## Actual Behavior

What actually happened.

## Environment

- OS: [e.g., macOS 14.0, Ubuntu 22.04]
- Bun Version: [run `bun --version`]
- occusage Version: [run `occusage --version`]
- occusage Commit (if running from source): [run `git rev-parse --short HEAD`]
- Shell: [bash/zsh/other]
- CPU Architecture: [arm64/x64]
- Install Method: [install.sh | bun link | other]

## Logs / Commands

Please paste the exact command(s) you ran and the raw terminal output using fenced code blocks:

**Commands** (use `sh` language tag):
```sh
# Example command
occusage today --breakdown
```

**Output** (use `text` language tag):
```text
# Example output
Error: Failed to load usage data
  at loadData (/path/to/file.ts:123:45)
```

Screenshots remain optional for additional visual context.

## Additional Context

Any other relevant information.
