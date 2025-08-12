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

# If user has a custom BUN_INSTALL set, surface it explicitly
if [ -n "${BUN_INSTALL+x}" ] && [ "${BUN_INSTALL}" != "$HOME/.bun" ]; then
  info "Detected BUN_INSTALL set to '$BUN_INSTALL'; using that install path."
fi

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
      *fish)
        PROFILE_FILE="$HOME/.config/fish/config.fish"
        mkdir -p "$(dirname "$PROFILE_FILE")"
        ;;
      *zsh)
        PROFILE_FILE="$HOME/.zshrc"
        ;;
      *bash)
        if [ -f "$HOME/.bash_profile" ]; then
          PROFILE_FILE="$HOME/.bash_profile"
        else
          PROFILE_FILE="$HOME/.bashrc"
        fi
        ;;
      *)
        PROFILE_FILE="$HOME/.profile"
        ;;
    esac

    if [ ! -f "$PROFILE_FILE" ]; then
      touch "$PROFILE_FILE"
    fi

    info "Using profile: $PROFILE_FILE"
    case "$SHELL_NAME" in
      *fish)
        # Fish shell uses different syntax
        if ! grep -Fqs "set -gx BUN_INSTALL \"$BUN_INSTALL_DIR\"" "$PROFILE_FILE"; then
          echo "set -gx BUN_INSTALL \"$BUN_INSTALL_DIR\"" >> "$PROFILE_FILE"
          info "Added BUN_INSTALL to $PROFILE_FILE (fish syntax)"
        else
          info "BUN_INSTALL already present in $PROFILE_FILE (fish)"
        fi

        if ! grep -Fqs 'set -gx PATH $BUN_INSTALL/bin $PATH' "$PROFILE_FILE" && \
           ! grep -Fqs "set -gx PATH $BUN_INSTALL_DIR/bin $PATH" "$PROFILE_FILE"; then
          echo 'set -gx PATH $BUN_INSTALL/bin $PATH' >> "$PROFILE_FILE"
          info "Prepended Bun bin to PATH in $PROFILE_FILE (fish syntax)"
        else
          info "Bun bin PATH entry already present in $PROFILE_FILE (fish)"
        fi
        ;;
      *)
        if ! grep -Fqs "export BUN_INSTALL=\"$BUN_INSTALL_DIR\"" "$PROFILE_FILE"; then
          {
            echo "export BUN_INSTALL=\"$BUN_INSTALL_DIR\""
            echo "export PATH=\"\\$BUN_INSTALL/bin:\\$PATH\""
          } >> "$PROFILE_FILE"
          info "Bun PATH entries were not present; added to $PROFILE_FILE"
        else
          info "BUN_INSTALL already present in $PROFILE_FILE"
          if ! grep -qs "\\$BUN_INSTALL/bin" "$PROFILE_FILE" && \
             ! grep -Fqs "$BUN_INSTALL_DIR/bin" "$PROFILE_FILE"; then
            echo "export PATH=\"\\$BUN_INSTALL/bin:\\$PATH\"" >> "$PROFILE_FILE"
            info "Bun bin PATH entry was missing; appended to $PROFILE_FILE"
          else
            info "Bun bin PATH entry already present in $PROFILE_FILE"
          fi
        fi
        ;;
    esac
  fi

  # Also export for current script session to make occusage available immediately
  if [ -z "${BUN_INSTALL+x}" ]; then
    export BUN_INSTALL="$HOME/.bun"
  else
    export BUN_INSTALL="$BUN_INSTALL"
  fi
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
  if [ -n "${PROFILE_FILE:-}" ]; then
    warn "Installation completed. 'occusage' will be available after you reload your shell: 'source $PROFILE_FILE' or open a new terminal."
  else
    warn "Installation completed. 'occusage' will be available after you open a new terminal or source your shell profile (e.g., ~/.bashrc or ~/.zshrc)."
  fi
fi
