---
name: install
description: >-
  Install or update the agent-bus CLI and the Codex-side skill OUTSIDE Claude Code, so that Codex
  (a separate program that does not see Claude Code plugins) can find them. Run by the user as
  /agent-bus:install after installing or updating the plugin.
disable-model-invocation: true
argument-hint: "[--link]"
---

# /agent-bus:install

Claude Code already has the CLI (the plugin's `bin/` is on the Bash `PATH`). This command is for
the **other side**: it puts the CLI and the Codex skill where Codex looks, from this plugin's own
files. It changes the user's home directory, so it runs only when the user asks for it.

## Steps

1. Install from **this plugin's own files** — never from whichever `agent-bus` happens to be first
   on `PATH`. That one may be the installed copy, and a copy cannot update itself: the CLI refuses
   it, in either mode, rather than relinking to itself and reporting success.

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../bin/agent-bus" install $ARGUMENTS
   ```

   By default it **copies** `bin/`, `policies/`, `PROTOCOL.md` and `codex/` to
   `~/.local/share/agent-bus` (a plugin's own directory is a cache that an update may move) and
   links `~/.local/bin/agent-bus` and `~/.agents/skills/agent-bus` to that copy (a link left by
   1.x under the old name `agent-bus-reviewer` is removed). With
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

5. **Ask** whether to let a live Codex chat answer over the channel. `agent-bus reply` writes
   into the mailbox, which Codex's `workspace-write` sandbox denies unless the mailbox is a
   writable root. Only on a yes:

   ```bash
   node "${CLAUDE_SKILL_DIR}/../../bin/agent-bus" install --codex-config
   ```

   It adds one block to `~/.codex/config.toml`, once, and never touches a `sandbox_workspace_write`
   section that is already there — then it prints the root to add by hand. Open Codex sessions must
   be restarted. Without this the channel still works in one direction: Codex receives, and says it
   cannot write back.

6. Do **not** open a channel from here. Tell the user the next step: `/agent-bus:connect` in the
   project they are working on.

## Report

What was copied or linked and which version, anything skipped and why, the `doctor` result, whether
the `AGENTS.md` block was added, and the next step.

## Updating

This command **is** the update: after `/plugin update agent-bus@…`, run it again so that the files
Codex uses are refreshed too — Codex does not see Claude Code's plugins. `doctor` prints the
version it finds. A listener that is already running keeps the code it loaded: close and reopen
the channel (`/agent-bus:connect disconnect`, then `/agent-bus:connect`) for it to pick up the new
one. In `--link` mode the links point at a clone, so `git pull` there is the update and only the
listener needs restarting.
