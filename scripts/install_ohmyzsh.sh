#!/bin/bash

# This script automates the installation of Oh My Zsh, Powerlevel10k theme, plugins, and fonts.
# It also applies a pre-configured Powerlevel10k setup (if .p10k.zsh exists in the same directory).
# Designed for Debian/Ubuntu-based systems but can be adapted.
# Usage: chmod +x ./scripts/install_ohmyzsh.sh && ./scripts/install_ohmyzsh.sh

echo "🚀 Starting the ultimate Zsh setup..."

SUDO=""
if [ "$(id -u)" -ne 0 ] && command -v sudo >/dev/null 2>&1; then
    SUDO="sudo"
fi

$SUDO apt update || apt update || true
$SUDO apt install -y zsh git curl fontconfig || apt install -y zsh git curl fontconfig || true

# --- Step 2: Install Oh My Zsh ---
if [ -d "$HOME/.oh-my-zsh" ]; then
  echo "✔️ Oh My Zsh is already installed. Skipping installation."
else
  echo "💻 Step 2/7: Installing Oh My Zsh..."
  # The '--unattended' flag prevents the installer from trying to change the shell.
  sh -c "$(curl -fsSL https://raw.github.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" --unattended
fi

# --- Step 3: Install Fonts ---
echo "✒️ Step 3/7: Installing Powerlevel10k recommended fonts (MesloLGS NF)..."
# Create a local fonts directory if it doesn't exist
mkdir -p ~/.local/share/fonts
# Download the four font variants
echo "  📥 Downloading font files..."
wget -qO ~/.local/share/fonts/"MesloLGS NF Regular.ttf" https://github.com/romkatv/powerlevel10k-media/raw/master/MesloLGS%20NF%20Regular.ttf
wget -qO ~/.local/share/fonts/"MesloLGS NF Bold.ttf" https://github.com/romkatv/powerlevel10k-media/raw/master/MesloLGS%20NF%20Bold.ttf
wget -qO ~/.local/share/fonts/"MesloLGS NF Italic.ttf" https://github.com/romkatv/powerlevel10k-media/raw/master/MesloLGS%20NF%20Italic.ttf
wget -qO ~/.local/share/fonts/"MesloLGS NF Bold Italic.ttf" https://github.com/romkatv/powerlevel10k-media/raw/master/MesloLGS%20NF%20Bold%20Italic.ttf
# Refresh the font cache
echo "  🔄 Refreshing font cache..."
fc-cache -f -v > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  ✅ Fonts installed successfully"
else
    echo "  ⚠️  Font cache refresh failed, but fonts may still work"
fi

# --- Step 4: Install Powerlevel10k Theme ---
echo "🎨 Step 4/7: Installing Powerlevel10k theme..."
ZSH_CUSTOM=${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}
if [ -d "${ZSH_CUSTOM}/themes/powerlevel10k" ]; then
  echo "  ✔️ Powerlevel10k is already installed. Skipping installation."
else
  git clone --depth=1 https://github.com/romkatv/powerlevel10k.git ${ZSH_CUSTOM}/themes/powerlevel10k
  if [ $? -eq 0 ]; then
    echo "  ✅ Successfully installed Powerlevel10k"
  else
    echo "  ❌ Failed to install Powerlevel10k"
    exit 1
  fi
fi

# --- Step 5: Install Plugins ---
echo "🔌 Step 5/7: Installing zsh plugins..."

# Function to install a plugin if it doesn't exist
install_plugin() {
    local plugin_name=$1
    local repo_url=$2
    local install_path="${ZSH_CUSTOM}/plugins/${plugin_name}"

    if [ -d "$install_path" ]; then
        echo "  ✔️ Plugin '$plugin_name' already installed, skipping..."
    else
        echo "  📦 Installing plugin '$plugin_name'..."
        git clone "$repo_url" "$install_path"
        if [ $? -eq 0 ]; then
            echo "  ✅ Successfully installed '$plugin_name'"
        else
            echo "  ❌ Failed to install '$plugin_name'"
            return 1
        fi
    fi
}

# Function to add plugin to .zshrc if not already present
add_plugin_to_zshrc() {
    local plugin_name=$1
    local zshrc_file="$HOME/.zshrc"
    local temp_file="${zshrc_file}.tmp"
    local backup_file="${zshrc_file}.backup.$(date +%s)"

    # Check if plugin is already in the plugins array
    if grep -q "plugins=.*${plugin_name}" "$zshrc_file"; then
        echo "  ✔️ Plugin '$plugin_name' already configured in .zshrc"
        return 0
    fi
    
    echo "  📝 Adding '$plugin_name' to .zshrc plugins array..."
    
    # Check if the plugins=() pattern exists
    if ! grep -q "^plugins=(" "$zshrc_file"; then
        echo "  ❌ ERROR: Could not find 'plugins=()' line in .zshrc"
        echo "  💡 Expected format: plugins=(git ...)"
        return 1
    fi
    
    # Create backup
    if ! cp "$zshrc_file" "$backup_file"; then
        echo "  ❌ ERROR: Failed to create backup"
        return 1
    fi
    
    # Process file line by line, adding plugin to plugins array
    local plugin_added=false
    while IFS= read -r line || [ -n "$line" ]; do
        if [[ "$line" =~ ^plugins=\((.*)\)$ ]]; then
            local current_plugins="${BASH_REMATCH[1]}"
            echo "plugins=(${current_plugins} ${plugin_name})"
            plugin_added=true
        else
            echo "$line"
        fi
    done < "$zshrc_file" > "$temp_file"
    
    # Verify the temp file was created successfully
    if [ ! -s "$temp_file" ]; then
        echo "  ❌ ERROR: Failed to create temporary file"
        rm -f "$temp_file"
        return 1
    fi
    
    # Verify plugin was added
    if [ "$plugin_added" = false ]; then
        echo "  ❌ ERROR: Failed to add '$plugin_name' to plugins"
        rm -f "$temp_file"
        return 1
    fi
    
    # Atomically replace the file using cat
    if cat "$temp_file" > "$zshrc_file"; then
        echo "  ✅ Added '$plugin_name' to plugins configuration"
        rm -f "$temp_file"
        # Keep backup for safety
        return 0
    else
        echo "  ❌ ERROR: Failed to update .zshrc"
        echo "  🔄 Restoring backup..."
        cat "$backup_file" > "$zshrc_file"
        rm -f "$temp_file"
        return 1
    fi
}

# Install all plugins
install_plugin "zsh-autosuggestions" "https://github.com/zsh-users/zsh-autosuggestions.git"
install_plugin "zsh-syntax-highlighting" "https://github.com/zsh-users/zsh-syntax-highlighting.git"
install_plugin "fast-syntax-highlighting" "https://github.com/zdharma-continuum/fast-syntax-highlighting.git"
install_plugin "zsh-autocomplete" "https://github.com/marlonrichert/zsh-autocomplete.git"

# --- Step 6: Configure .zshrc ---
echo "📝 Step 6/7: Configuring .zshrc to enable theme and plugins..."

# Function to safely update .zshrc using structured approach
update_zshrc_config() {
    local zshrc_file="$HOME/.zshrc"
    local temp_file="${zshrc_file}.tmp"
    local backup_file="${zshrc_file}.backup.$(date +%s)"
    
    # Configuration object (key-value pairs to update)
    declare -A config_updates=(
        ["ZSH_THEME"]="powerlevel10k/powerlevel10k"
    )
    
    # Create backup
    if ! cp "$zshrc_file" "$backup_file"; then
        echo "  ❌ ERROR: Failed to create backup"
        return 1
    fi
    
    # Process file line by line with proper updates
    local line_updated=false
    while IFS= read -r line || [ -n "$line" ]; do
        local updated=false
        
        # Check each config key
        for key in "${!config_updates[@]}"; do
            if [[ "$line" =~ ^${key}=\".*\"$ ]] || [[ "$line" =~ ^${key}=\'.*\'$ ]]; then
                echo "${key}=\"${config_updates[$key]}\""
                updated=true
                line_updated=true
                break
            fi
        done
        
        # If line wasn't updated, keep original
        if [ "$updated" = false ]; then
            echo "$line"
        fi
    done < "$zshrc_file" > "$temp_file"
    
    # Verify the temp file was created successfully
    if [ ! -s "$temp_file" ]; then
        echo "  ❌ ERROR: Failed to create temporary file"
        rm -f "$temp_file"
        return 1
    fi
    
    # Verify changes were applied
    if [ "$line_updated" = false ]; then
        echo "  ❌ ERROR: Could not find ZSH_THEME line in .zshrc"
        echo "  💡 Expected format: ZSH_THEME=\"theme-name\""
        rm -f "$temp_file"
        return 1
    fi
    
    # Atomically replace the file using cat (safer than mv when file might be open)
    if cat "$temp_file" > "$zshrc_file"; then
        echo "  ✅ Theme successfully changed to Powerlevel10k"
        rm -f "$temp_file"
        # Keep backup for safety
        echo "  💾 Backup saved to: $backup_file"
        return 0
    else
        echo "  ❌ ERROR: Failed to update .zshrc"
        echo "  🔄 Restoring backup..."
        cat "$backup_file" > "$zshrc_file"
        rm -f "$temp_file"
        return 1
    fi
}

if [ ! -f ~/.zshrc ]; then
    echo "  📄 Creating default ~/.zshrc..."
    echo 'export ZSH="$HOME/.oh-my-zsh"' > ~/.zshrc
    echo 'ZSH_THEME="robbyrussell"' >> ~/.zshrc
    echo 'plugins=(git)' >> ~/.zshrc
    echo 'source $ZSH/oh-my-zsh.sh' >> ~/.zshrc
fi

# Check if ZSH_THEME line exists in the expected format
if ! grep -q '^ZSH_THEME=' ~/.zshrc; then
    echo 'ZSH_THEME="robbyrussell"' >> ~/.zshrc
fi

# Apply the configuration updates
if ! update_zshrc_config; then
    echo "  💡 Please manually set ZSH_THEME=\"powerlevel10k/powerlevel10k\" in ~/.zshrc"
    exit 1
fi

# Verify theme configuration
echo "🔍 Verifying theme configuration in .zshrc..."
if grep -q 'ZSH_THEME="powerlevel10k/powerlevel10k"' ~/.zshrc; then
    echo "  ✅ Theme configuration verified successfully"
else
    echo "  ❌ ERROR: Theme verification failed!"
    echo "  💡 Please manually set ZSH_THEME=\"powerlevel10k/powerlevel10k\" in ~/.zshrc"
    exit 1
fi

# Add all installed plugins to .zshrc configuration
echo "🔧 Configuring plugins in .zshrc..."
PLUGIN_ERRORS=0

# Define required plugins
declare -a REQUIRED_PLUGINS=(
    "zsh-autosuggestions"
    "zsh-syntax-highlighting"
    "fast-syntax-highlighting"
    "zsh-autocomplete"
)

# Add each plugin
for plugin in "${REQUIRED_PLUGINS[@]}"; do
    add_plugin_to_zshrc "$plugin" || PLUGIN_ERRORS=$((PLUGIN_ERRORS + 1))
done

# Verify all plugins are in .zshrc
echo "🔍 Verifying plugin installation in .zshrc..."
MISSING_PLUGINS=()
for plugin in "${REQUIRED_PLUGINS[@]}"; do
    if ! grep -q "plugins=.*${plugin}" ~/.zshrc; then
        MISSING_PLUGINS+=("$plugin")
    fi
done

# Report verification results
if [ ${#MISSING_PLUGINS[@]} -eq 0 ]; then
    echo "  ✅ All plugins successfully configured in .zshrc"
else
    echo ""
    echo "  ❌ ERROR: ${#MISSING_PLUGINS[@]} plugin(s) missing from .zshrc:"
    for plugin in "${MISSING_PLUGINS[@]}"; do
        echo "     - $plugin"
    done
    echo ""
    echo "  💡 Please manually add them by editing ~/.zshrc"
    echo "  📝 Change the plugins line to:"
    echo "     plugins=(git ${REQUIRED_PLUGINS[*]})"
    echo ""
    PLUGIN_ERRORS=$((PLUGIN_ERRORS + ${#MISSING_PLUGINS[@]}))
fi

# Check if any plugin additions failed
if [ $PLUGIN_ERRORS -gt 0 ]; then
    echo "  ⚠️  WARNING: $PLUGIN_ERRORS total plugin error(s) detected"
fi

# Install Powerlevel10k configuration
echo "⚙️  Applying Powerlevel10k configuration..."
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
P10K_CONFIG="${SCRIPT_DIR}/.p10k.zsh"

if [ -f "$P10K_CONFIG" ]; then
    echo "  📋 Copying pre-configured .p10k.zsh..."
    cp "$P10K_CONFIG" ~/.p10k.zsh

    # Ensure p10k config is sourced in .zshrc
    if ! grep -q "source ~/.p10k.zsh" ~/.zshrc && ! grep -q '\[[ ! -f ~/.p10k.zsh \]\] || source ~/.p10k.zsh' ~/.zshrc; then
        echo "  📝 Adding p10k config to .zshrc..."
        echo "" >> ~/.zshrc
        echo "# To customize prompt, run \`p10k configure\` or edit ~/.p10k.zsh." >> ~/.zshrc
        echo "[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh" >> ~/.zshrc
    fi

    echo "  ✅ Powerlevel10k configuration applied successfully"
else
    echo "  ⚠️  Pre-configured .p10k.zsh not found at: $P10K_CONFIG"
    echo "  💡 You'll need to run 'p10k configure' manually after installation"
fi

# --- Step 7: Set Zsh as Default Shell ---
echo "🐚 Step 7/7: Setting Zsh as the default shell..."
# Try to change the default shell to zsh
if $SUDO chsh -s $(which zsh) $(whoami) 2>/dev/null || chsh -s $(which zsh) 2>/dev/null; then
    echo "  ✅ Default shell changed to zsh"
else
    echo "  ⚠️  Could not change default shell automatically"
    echo "  💡 To change your default shell manually, run: sudo chsh -s \$(which zsh) \$(whoami)"
fi

# --- Final Instructions ---
echo ""
echo "🔍 Running final configuration verification..."
echo ""

# Final verification summary
declare -A VERIFICATION_RESULTS=(
    ["Oh My Zsh installed"]="false"
    ["Powerlevel10k theme installed"]="false"
    ["Theme configured in .zshrc"]="false"
    ["Plugins directory exists"]="false"
    ["All plugins configured"]="false"
    ["Fonts installed"]="false"
)

# Check Oh My Zsh
[ -d "$HOME/.oh-my-zsh" ] && VERIFICATION_RESULTS["Oh My Zsh installed"]="true"

# Check Powerlevel10k installation
ZSH_CUSTOM=${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}
[ -d "${ZSH_CUSTOM}/themes/powerlevel10k" ] && VERIFICATION_RESULTS["Powerlevel10k theme installed"]="true"

# Check theme configuration
grep -q 'ZSH_THEME="powerlevel10k/powerlevel10k"' ~/.zshrc && VERIFICATION_RESULTS["Theme configured in .zshrc"]="true"

# Check plugins directory
[ -d "${ZSH_CUSTOM}/plugins" ] && VERIFICATION_RESULTS["Plugins directory exists"]="true"

# Check all required plugins in .zshrc
ALL_PLUGINS_CONFIGURED=true
for plugin in "${REQUIRED_PLUGINS[@]}"; do
    if ! grep -q "plugins=.*${plugin}" ~/.zshrc; then
        ALL_PLUGINS_CONFIGURED=false
        break
    fi
done
[ "$ALL_PLUGINS_CONFIGURED" = true ] && VERIFICATION_RESULTS["All plugins configured"]="true"

# Check fonts
[ -f "$HOME/.local/share/fonts/MesloLGS NF Regular.ttf" ] && VERIFICATION_RESULTS["Fonts installed"]="true"

# Display verification results
echo "📋 Verification Results:"
echo "═══════════════════════════════════════════════════"
VERIFICATION_FAILED=false
for check in "Oh My Zsh installed" "Powerlevel10k theme installed" "Theme configured in .zshrc" "Plugins directory exists" "All plugins configured" "Fonts installed"; do
    if [ "${VERIFICATION_RESULTS[$check]}" = "true" ]; then
        echo "  ✅ $check"
    else
        echo "  ❌ $check"
        VERIFICATION_FAILED=true
    fi
done
echo "═══════════════════════════════════════════════════"
echo ""

if [ "$VERIFICATION_FAILED" = true ]; then
    echo "⚠️  Some verification checks failed. Review the output above."
    echo ""
fi

echo "✅ Installation Complete!"
echo ""
echo "#####################################################################"
echo "### ⚠️ IMPORTANT NEXT STEPS - PLEASE READ CAREFULLY ⚠️"
echo "#####################################################################"
echo ""
echo "To activate your new Zsh setup:"
echo ""
echo "1. **CLOSE THIS TERMINAL** completely and open a new terminal window"
echo "   OR run: exec zsh"
echo ""
echo "2. **CONFIGURE TERMINAL FONT** (if using a graphical terminal):"
echo "   Open terminal Preferences/Settings and set font to 'MesloLGS NF'"
echo "   This is REQUIRED for icons to display correctly."
echo ""
echo "3. **POWERLEVEL10K CONFIGURATION**:"
if [ -f "$P10K_CONFIG" ]; then
    echo "   ✅ Pre-configured theme has been applied automatically!"
    echo "   To customize, run: p10k configure"
else
    echo "   The Powerlevel10k wizard should start automatically."
    echo "   If not, manually run: p10k configure"
fi
echo ""
echo "Note: If p10k command is not found, ensure:"
echo "  - You're running zsh (check with: echo \$SHELL)"
echo "  - Powerlevel10k theme is set in ~/.zshrc"
echo "  - Source the config with: source ~/.zshrc"
echo ""
echo "#####################################################################"
echo ""