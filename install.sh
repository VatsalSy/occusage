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
bun link

info "Making 'occusage' available in your PATH (bun link occusage)..."
bun link occusage

# 4) Ensure Bun's global bin is in PATH
BUN_INSTALL_DIR=${BUN_INSTALL:-"$HOME/.bun"}
BUN_BIN="$BUN_INSTALL_DIR/bin"
if ! command -v occusage >/dev/null 2>&1; then
  warn "'occusage' not found in PATH. Adding Bun's bin to your shell profile."

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

  if ! grep -qs "BUN_INSTALL=\"$HOME/.bun\"" "$PROFILE_FILE"; then
    {
      echo "export BUN_INSTALL=\"$HOME/.bun\""
      echo "export PATH=\"$BUN_INSTALL/bin:\$PATH\""
    } >> "$PROFILE_FILE"
    info "Appended Bun PATH setup to $PROFILE_FILE"
  else
    if ! grep -qs "\$BUN_INSTALL/bin" "$PROFILE_FILE"; then
      echo "export PATH=\"$BUN_INSTALL/bin:\$PATH\"" >> "$PROFILE_FILE"
      info "Appended Bun bin PATH to $PROFILE_FILE"
    fi
  fi

  warn "Please reload your shell: 'source $PROFILE_FILE' or open a new terminal."
fi

# 5) Final check and message
if command -v occusage >/dev/null 2>&1; then
  success "Installation complete! Try: 'occusage --help'"
else
  warn "Installation steps completed, but 'occusage' still not found in PATH."
  echo "You may need to add '$BUN_BIN' to PATH manually and restart your terminal:"
  echo "  export BUN_INSTALL=\"$HOME/.bun\""
  echo "  export PATH=\"$BUN_INSTALL/bin:$PATH\""
fi
