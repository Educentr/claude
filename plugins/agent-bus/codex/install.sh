#!/usr/bin/env bash
# From a git clone: links the agent-bus CLI and the Codex-side skill from THIS checkout into your
# home directory, so `git pull` updates everything. The work is done by `agent-bus install`;
# this wrapper only picks the clone as the source and the link mode.
#   ./install.sh               install (symlinks into this clone)
#   ./install.sh --agents-md   …and add the optional block to ~/.codex/AGENTS.md, once
#   ./install.sh --uninstall   remove the links (the mailbox is left alone)
set -euo pipefail
plugin="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd -P)"
exec node "$plugin/bin/agent-bus" install --link "$@"
