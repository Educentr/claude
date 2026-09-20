---
name: serve
description: >-
  Start, stop or check the agent-bus listener that answers messages with Codex for a project.
  Run by the user as /agent-bus:serve, /agent-bus:serve stop or /agent-bus:serve status.
disable-model-invocation: true
argument-hint: "[stop|status] [--endpoint NAME] [project-dir]"
allowed-tools: Bash(agent-bus *) Bash(git rev-parse *)
---

# /agent-bus:serve

The listener runs a headless, read-only Codex for every message. Starting one agent from another
is the **user's** decision — which is exactly what invoking this command is. Never start a
listener on your own initiative; outside this command, give the user the command line instead.

Arguments: `$ARGUMENTS`

## start (no `stop` / `status` in the arguments)

1. `agent-bus doctor`. If it fails on the mailbox, Node, the Codex CLI or the login, stop and
   explain. If it already lists the endpoint as served, report that pid and do nothing else.
2. The project root: the directory from the arguments, else `git rev-parse --show-toplevel`, else
   the current directory. Reviews are only accepted for worktrees **under** this root — if the
   user keeps worktrees elsewhere, suggest a common parent before starting.
3. Start it detached, so it outlives this session:

   ```bash
   agent-bus serve-codex --cd "<root>" --detach        # plus --endpoint NAME when one was given
   ```

   It prints the pid and the log file once the endpoint is held. `has a lock left by pid …, which
   is not running` means a server was killed earlier: **ask**, and only on a yes run
   `agent-bus unlock <endpoint>` and start again.
4. Report: endpoint, pid, project root, log file, and how to stop it (`/agent-bus:serve stop`).
   One endpoint has one server; a second project gets its own `--endpoint codex-<label>`.

## stop

`agent-bus stop <endpoint>` (default `codex`). A stop is honoured between requests: a review in
progress finishes first. Report what it printed.

## status

`agent-bus doctor`, then `agent-bus recover <endpoint>` — messages that were claimed and never
answered. Only report them: putting one back runs it again, which the user decides.
