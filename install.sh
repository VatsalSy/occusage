#!/usr/bin/env bash
set -euo pipefail

# occusage local installer (Bun-only, no registry)

info() { printf "\033[1;34m[info]\033[0m %s\n" "$*"; }
success() { printf "\033[1;32m[success]\033[0m %s\n" "$*"; }
warn() { printf "\033[1;33m[warn]\033[0m %s\n" "$*"; }
err() { printf "\033[1;31m[error]\033[0m %s\n" "$*"; }

# 1) Ensure Bun is installed
if ! command -v bun >/dev/null 2>&1; then
  err "Bun is not installed. Please install Bun first:"
  echo "  curl -fsSL https://bun.sh/install | bash"
  exit 1
fi

# 2) Install dependencies in the current repo
info "Installing dependencies with Bun..."
bun install

# 3) Link this package globally and expose 'occusage'
info "Linking package globally (bun link)..."
if ! bun link; then
  err "'bun link' failed. Please check the output above and resolve any issues before continuing."
  exit 1
fi

info "Making 'occusage' available in your PATH (bun link occusage)..."
if ! bun link occusage; then
  err "'bun link occusage' failed. Please check the output above and resolve any issues before continuing."
  exit 1
fi

# 4) Ensure Bun's global bin is in PATH (check runtime first; only edit profile if needed)
BUN_INSTALL_DIR=${BUN_INSTALL:-"$HOME/.bun"}
BUN_BIN="$BUN_INSTALL_DIR/bin"

RUNTIME_HAS_BUN_BIN=false
case ":$PATH:" in
  *":$BUN_BIN:"*) RUNTIME_HAS_BUN_BIN=true ;;
esac

if command -v occusage >/dev/null 2>&1; then
  info "'occusage' already available on PATH. Skipping profile changes."
else
  if [ "$RUNTIME_HAS_BUN_BIN" = true ]; then
    info "Bun bin is already on PATH at runtime. No profile changes needed."
  else
    SHELL_NAME="${SHELL:-}"
    PROFILE_FILE=""
    case "$SHELL_NAME" in
      *zsh) PROFILE_FILE="$HOME/.zshrc" ;;
      *bash) PROFILE_FILE="$HOME/.bashrc" ;;
      *) PROFILE_FILE="$HOME/.profile" ;;
    esac

    if [ ! -f "$PROFILE_FILE" ]; then
      touch "$PROFILE_FILE"
    fi

    info "Using profile: $PROFILE_FILE"
    if ! grep -qs "BUN_INSTALL=\"$HOME/.bun\"" "$PROFILE_FILE"; then
      {
        echo "export BUN_INSTALL=\"$HOME/.bun\""
        echo "export PATH=\"\$BUN_INSTALL/bin:\$PATH\""
      } >> "$PROFILE_FILE"
      info "Bun PATH entries were not present; added to $PROFILE_FILE"
    else
      info "BUN_INSTALL already present in $PROFILE_FILE"
      if ! grep -qs "\$BUN_INSTALL/bin" "$PROFILE_FILE"; then
        echo "export PATH=\"\$BUN_INSTALL/bin:\$PATH\"" >> "$PROFILE_FILE"
        info "Bun bin PATH entry was missing; appended to $PROFILE_FILE"
      else
        info "Bun bin PATH entry already present in $PROFILE_FILE"
      fi
    fi
  fi

  # Also export for current script session to make occusage available immediately
  export BUN_INSTALL="$HOME/.bun"
  export PATH="$BUN_INSTALL/bin:$PATH"
  # Refresh command hash for current shell where possible
  if [ -n "$ZSH_VERSION" ]; then
    rehash 2>/dev/null || true
  elif [ -n "$BASH_VERSION" ]; then
    hash -r 2>/dev/null || true
  fi

  if command -v occusage >/dev/null 2>&1; then
    info "Bun PATH applied for current session."
  else
    warn "Please reload your shell to pick up PATH changes (e.g., 'exec $SHELL' or 'source your rc file')."
  fi
fi

# 5) Final check and message
if command -v occusage >/dev/null 2>&1; then
  success "Installation complete! Try: 'occusage --help'"
else
  warn "Installation completed. 'occusage' will be available after you reload your shell: 'source $PROFILE_FILE' or open a new terminal."
fi
