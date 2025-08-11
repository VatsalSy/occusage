#!/bin/zsh

# Enable strict mode for better error handling
set -euo pipefail
IFS=$'\n\t'

# Function to run a command with and without --breakdown
run_command() {
    local cmd="$1"
    if [[ "$cmd" == "today" ]]; then
        echo "Running: bun run start"
        bun run start
        echo "Running: bun run start --breakdown"
        bun run start --breakdown
    else
        echo "Running: bun run start \"$cmd\""
        bun run start "$cmd"
        echo "Running: bun run start \"$cmd\" --breakdown"
        bun run start "$cmd" --breakdown
    fi
    echo ""
}

# Parse command line arguments
commands_to_run=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --daily)
            commands_to_run+=("daily")
            shift
            ;;
        --weekly)
            commands_to_run+=("weekly")
            shift
            ;;
        --monthly)
            commands_to_run+=("monthly")
            shift
            ;;
        --session)
            commands_to_run+=("session")
            shift
            ;;
        --project)
            commands_to_run+=("project")
            shift
            ;;
        --blocks)
            commands_to_run+=("blocks")
            shift
            ;;
        --today)
            commands_to_run+=("today")
            shift
            ;;
        --all)
            commands_to_run=("today" "daily" "weekly" "monthly" "session" "project" "blocks")
            shift
            ;;
        *)
            echo "Unknown option: $1"
            echo "Usage: $0 [--today] [--daily] [--weekly] [--monthly] [--session] [--project] [--blocks] [--all]"
            exit 1
            ;;
    esac
done

# If no arguments provided, default to today
if [[ ${#commands_to_run[@]} -eq 0 ]]; then
    commands_to_run=("today")
fi

# Run the selected commands
for cmd in "${commands_to_run[@]}"; do
    run_command "$cmd"
done