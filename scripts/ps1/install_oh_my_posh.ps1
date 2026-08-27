# 1. Define the exact configuration we want to add
$psReadLineConfig = @"

# === PSReadLine ZSH-Style Config Start ===
Import-Module PSReadLine

# Autosuggestions
Set-PSReadLineOption -PredictionSource History
Set-PSReadLineOption -PredictionViewStyle InlineView

# Autocompletion Menu
Set-PSReadLineKeyHandler -Key Tab -Function MenuComplete

# History Navigation
Set-PSReadLineKeyHandler -Key UpArrow -Function HistorySearchBackward
Set-PSReadLineKeyHandler -Key DownArrow -Function HistorySearchForward

# Accepting Suggestions
Set-PSReadLineKeyHandler -Key RightArrow -Function AcceptNextSuggestionWord
Set-PSReadLineKeyHandler -Chord 'Alt+RightArrow' -Function ForwardWord
# === PSReadLine ZSH-Style Config End ===
"@

Write-Host "Setting up PSReadLine configuration..." -ForegroundColor Cyan

# 2. Check if the profile exists, and create it if it doesn't
if (-not (Test-Path $PROFILE)) {
    Write-Host "Profile not found. Creating a new profile at: $PROFILE" -ForegroundColor Yellow
    $null = New-Item -Path $PROFILE -Type File -Force
}

# 3. Read the current profile to prevent duplicating the config
$currentProfileContent = Get-Content -Path $PROFILE -Raw -ErrorAction SilentlyContinue

if ($currentProfileContent -match "Set-PSReadLineOption -PredictionSource History") {
    Write-Host "It looks like the PSReadLine configuration is already in your profile!" -ForegroundColor Yellow
} else {
    # 4. Append the configuration to the profile
    Add-Content -Path $PROFILE -Value $psReadLineConfig
    Write-Host "Successfully added PSReadLine configuration to your profile!" -ForegroundColor Green
}

# 5. Provide instructions to reload
Write-Host "`nTo apply the changes right now, run:" -ForegroundColor Cyan
Write-Host ". `$PROFILE" -ForegroundColor White