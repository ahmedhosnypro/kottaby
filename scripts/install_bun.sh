#!/bin/bash

set -e  # Exit on error

# 1. Install Bun using alternative method (direct GitHub download)
echo "📦 Starting Bun installation..."

# Detect OS and architecture
OS="$(uname -s)"
ARCH="$(uname -m)"

case "$OS" in
  Linux*)
    case "$ARCH" in
      x86_64) TARGET="linux-x64" ;;
      aarch64|arm64) TARGET="linux-aarch64" ;;
      *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  Darwin*)
    case "$ARCH" in
      x86_64) TARGET="darwin-x64" ;;
      arm64) TARGET="darwin-aarch64" ;;
      *) echo "❌ Unsupported architecture: $ARCH"; exit 1 ;;
    esac
    ;;
  *)
    echo "❌ Unsupported OS: $OS"
    exit 1
    ;;
esac

echo "🖥️  Detected: $OS ($ARCH) → $TARGET"

# Use direct download method (official installer is unreliable)
echo "📥 Using direct download method..."

BUN_INSTALL="${BUN_INSTALL:-$HOME/.bun}"
BIN_DIR="$BUN_INSTALL/bin"

# Create directories
mkdir -p "$BIN_DIR"

# Get latest version
echo "🔍 Fetching latest Bun version..."
LATEST_VERSION=$(curl -fsSL https://api.github.com/repos/oven-sh/bun/releases/latest | grep '"tag_name"' | sed -E 's/.*"bun-v([^"]+)".*/\1/')

if [ -z "$LATEST_VERSION" ]; then
  echo "❌ Failed to fetch latest Bun version"
  exit 1
fi

echo "📥 Downloading Bun v$LATEST_VERSION for $TARGET..."

# Download and extract
DOWNLOAD_URL="https://github.com/oven-sh/bun/releases/download/bun-v${LATEST_VERSION}/bun-${TARGET}.zip"

if curl -fsSL "$DOWNLOAD_URL" -o /tmp/bun.zip; then
  echo "📦 Extracting Bun..."
  unzip -q -o /tmp/bun.zip -d /tmp/
  mv "/tmp/bun-${TARGET}/bun" "$BIN_DIR/bun"
  chmod +x "$BIN_DIR/bun"
  rm -rf /tmp/bun.zip "/tmp/bun-${TARGET}"
  echo "✅ Bun installed successfully via direct download"
else
  echo "❌ Failed to download Bun from GitHub"
  exit 1
fi

# 2. Define environment variables
BUN_INSTALL="$HOME/.bun"

# 3. Define shell configuration files and their respective bun configurations
declare -A SHELL_CONFIGS=(
  ["$HOME/.zshrc"]="\n# bun\nexport BUN_INSTALL=\"$HOME/.bun\"\nexport PATH=\"$BUN_INSTALL/bin:\$PATH\""
  ["$HOME/.bashrc"]="\n# bun\nexport BUN_INSTALL=\"$HOME/.bun\"\nexport PATH=\"$BUN_INSTALL/bin:\$PATH\""
  ["$HOME/.bash_profile"]="\n# bun\nexport BUN_INSTALL=\"$HOME/.bun\"\nexport PATH=\"$BUN_INSTALL/bin:\$PATH\""
  ["$HOME/.profile"]="\n# bun\nexport BUN_INSTALL=\"$HOME/.bun\"\nexport PATH=\"$BUN_INSTALL/bin:\$PATH\""
  ["$HOME/.config/fish/config.fish"]="\n# bun\nset -gx BUN_INSTALL \"$HOME/.bun\"\nset -gx PATH \"$BUN_INSTALL/bin\" \$PATH"
)

# 4. Add bun configuration to all existing shell config files
echo "🔧 Adding Bun to your shell profiles..."

for config_file in "${!SHELL_CONFIGS[@]}"; do
  if [ -f "$config_file" ]; then
    if ! grep -q "BUN_INSTALL" "$config_file"; then
      echo "  Adding to $(basename "$config_file")..."
      echo -e "${SHELL_CONFIGS[$config_file]}" >> "$config_file"
    else
      echo "  Bun configuration already exists in $(basename "$config_file")."
    fi
  else
    echo "  $(basename "$config_file") not found, skipping..."
  fi
done

# 5. Create .profile if it doesn't exist (fallback for minimal systems)
if [ ! -f "$HOME/.profile" ]; then
  echo "  Creating $HOME/.profile as fallback..."
  echo -e "${SHELL_CONFIGS["$HOME/.profile"]}" > "$HOME/.profile"
fi

# 6. Export PATH for current session
export PATH="$BUN_INSTALL/bin:$PATH"

echo "✅ Bun configuration added to all available shell profiles."

# 7. Verify installation
echo ""
echo "� Veruifying installation..."
if command -v bun >/dev/null 2>&1; then
  echo "✅ Bun is now available in PATH: $(which bun)"
  echo "📋 Bun version: $(bun --version)"
else
  echo "⚠️  Bun not found in current PATH. Please restart your terminal or run:"
  echo "    export PATH=\"$BUN_INSTALL/bin:\$PATH\""
fi

# 8. Provide final instructions
echo ""
echo "🎉 Bun installation complete!"
echo "To get started:"
echo "  1. Restart your terminal, or"
echo "  2. Run: source ~/.profile (or your shell's config file)"
echo "  3. Test with: bun --help"
