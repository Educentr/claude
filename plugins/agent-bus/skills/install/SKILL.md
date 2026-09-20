---
name: install
description: >-
  Install or update the agent-bus CLI and the Codex-side skill OUTSIDE Claude Code, so that Codex
  (a separate program that does not see Claude Code plugins) can find them. Run by the user as
  /agent-bus:install after installing or updating the plugin.
disable-model-invocation: true
argument-hint: "[--link]"
allowed-tools: Bash(node *) Bash(agent-bus *)
---

# /agent-bus:install

Claude Code already has the CLI (the plugin's `bin/` is on the Bash `PATH`). This command is for
the **other side**: it puts the CLI and the Codex skill where Codex looks, from this plugin's own
files. It changes the user's home directory, so it runs only when the user asks for it.

## Steps

1. Install from **this plugin's copy** — not from whichever `agent-bus` happens to be first on
   `PATH`:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../bin/agent-bus" install $ARGUMENTS
   ```

   By default it **copies** `bin/`, `policies/`, `PROTOCOL.md` and `codex/` to
   `~/.local/share/agent-bus` (a plugin's own directory is a cache that an update may move) and
   links `~/.local/bin/agent-bus` and `~/.agents/skills/agent-bus-reviewer` to that copy. With
   `--link` it links straight to the source instead — only sensible for a git clone.

2. Read the output to the user. A line `SKIPPED … a regular file is already there` means an older,
   hand-installed `agent-bus`: **ask** before touching it, and only on a yes run
   `mv ~/.local/bin/agent-bus ~/.local/bin/agent-bus.old` and repeat step 1. If an old listener
   from that script is still running, follow "Switching from a hand-installed agent-bus" in
   `codex/INTEGRATION.md` instead of improvising.

3. Check the result: `node "${CLAUDE_SKILL_DIR}/../../bin/agent-bus" doctor`. Explain any `FAIL`
   line; `codex is not on PATH` is fine on a machine that will not run the listener.

4. **Ask** whether to add the optional block to `~/.codex/AGENTS.md`. Say what it is: a short,
   conditional rule — nothing changes for Codex until a message marked `[agent-bus]` arrives.
   Only on a yes:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../bin/agent-bus" install --agents-md $ARGUMENTS
   ```

   It is added once; a second run leaves the file alone. Open Codex sessions must be restarted to
   see it.

5. Do **not** start a listener from here. Tell the user the next step: `/agent-bus:serve` in the
   project they want reviewed.

## Report

What was copied or linked and which version, anything skipped and why, the `doctor` result, whether
the `AGENTS.md` block was added, and the next step. After a plugin update the user runs this
command again to refresh the copy, then restarts the listener so that it picks up the new code.
