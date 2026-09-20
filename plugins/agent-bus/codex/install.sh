#!/usr/bin/env bash
# Links the agent-bus CLI and the Codex-side skill from THIS checkout into your home directory.
# Symlinks only, so PROTOCOL.md and policies/ stay the single source and `git pull` updates
# everything. It never edits AGENTS.md — that block is yours to paste (codex/AGENTS.snippet.md).
#   ./install.sh              install
#   ./install.sh --uninstall  remove only the links that point into this checkout
set -euo pipefail

plugin="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
bin_dir="${AGENT_BUS_BIN_DIR:-$HOME/.local/bin}"
skills_dir="${AGENT_BUS_CODEX_SKILLS_DIR:-$HOME/.agents/skills}"
links=("$bin_dir/agent-bus:$plugin/bin/agent-bus" "$skills_dir/agent-bus-reviewer:$plugin/codex/skills/agent-bus-reviewer")

for pair in "${links[@]}"; do
  link="${pair%%:*}"; target="${pair#*:}"
  if [[ "${1:-}" == "--uninstall" ]]; then
    if [[ -L "$link" && "$(readlink "$link")" == "$target" ]]; then rm "$link"; echo "removed $link"; fi
    continue
  fi
  mkdir -p "$(dirname "$link")"
  if [[ -e "$link" && ! -L "$link" ]]; then
    # Somebody's own file (an earlier hand-installed agent-bus, for one). Not ours to overwrite.
    echo "SKIPPED $link — a regular file is already there. Move it away and run this again." >&2
    continue
  fi
  ln -sfn "$target" "$link"
  echo "linked  $link -> $target"
done

[[ "${1:-}" == "--uninstall" ]] && { echo "Stop any running 'agent-bus serve-codex' yourself. The mailbox and its replies were not touched."; exit 0; }

case ":$PATH:" in *":$bin_dir:"*) ;; *) echo "NOTE: $bin_dir is not on PATH — add it, or the agents will not find agent-bus." >&2 ;; esac
echo
echo "Next: agent-bus doctor"
echo "Optional: paste $plugin/codex/AGENTS.snippet.md into ~/.codex/AGENTS.md and restart open Codex sessions."
