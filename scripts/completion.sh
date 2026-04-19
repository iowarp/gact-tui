#!/usr/bin/env bash
# Print per-shell instructions for installing gact tab-completion.
#
# Usage: scripts/completion.sh
#
# Detects the current shell from $SHELL and prints the appropriate
# one-liner for either:
#   - sourcing the completion script in .bashrc / .zshrc / config.fish
#   - copying it into the system completion dir (where supported)
#
# The script doesn't write anything itself — it prints a copy-paste-able
# command so the user can pick where to install.

set -euo pipefail

shell_name="$(basename "${SHELL:-/bin/bash}")"

case "$shell_name" in
  bash)
    cat <<'EOF'
# Bash — append to ~/.bashrc:
echo 'source <(gact completion bash)' >> ~/.bashrc

# Or system-wide (root-owned dir on most distros):
sudo gact completion bash > /etc/bash_completion.d/gact
EOF
    ;;
  zsh)
    cat <<'EOF'
# Zsh — drop the script into a directory on $fpath. Common one is
# ~/.zsh/completions; create it if missing then add to .zshrc:

mkdir -p ~/.zsh/completions
gact completion zsh > ~/.zsh/completions/_gact

# Then in ~/.zshrc, before `compinit`:
fpath=(~/.zsh/completions $fpath)
EOF
    ;;
  fish)
    cat <<'EOF'
# Fish — completions live under ~/.config/fish/completions:
mkdir -p ~/.config/fish/completions
gact completion fish > ~/.config/fish/completions/gact.fish
EOF
    ;;
  *)
    echo "Unknown shell: $shell_name"
    echo "gact completion supports: bash, zsh, fish"
    echo "Try: gact completion bash > /path/to/your/completions/dir/_gact"
    exit 1
    ;;
esac
