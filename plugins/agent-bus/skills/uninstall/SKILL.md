---
name: uninstall
description: >-
  Remove what /agent-bus:install put outside Claude Code — the CLI link, the Codex skill link and
  the installed copy. Run by the user as /agent-bus:uninstall.
disable-model-invocation: true
allowed-tools: Bash(node *) Bash(agent-bus *)
---

# /agent-bus:uninstall

1. `agent-bus doctor` — if it lists served endpoints, **ask** whether to stop them first
   (`agent-bus stop <endpoint>`); a listener started from the installed copy keeps running the
   code it has loaded, but will not survive a restart once the copy is gone.
2. Remove the links and the copy:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../bin/agent-bus" install --uninstall
   ```

   Only links that point into a place `install` manages are removed, and the copy only if
   `install` made it. A regular file at `~/.local/bin/agent-bus` is somebody else's and is left.
3. Tell the user what is **not** removed: the mailbox `~/.local/state/agent-bus` with every
   request, reply and trace (delete it by hand when the history is no longer needed), a block
   added to `~/.codex/AGENTS.md`, and the plugin itself (`/plugin uninstall agent-bus@…`).
