---
name: connect
description: >-
  Open the agent-bus channel to Codex for this project, close it, or show its state. Run by the
  user as /agent-bus:connect, /agent-bus:connect disconnect or /agent-bus:connect status.
disable-model-invocation: true
argument-hint: "[disconnect|status] [--headless] [--peer NAME] [project-dir]"
allowed-tools: Bash(agent-bus *) Bash(git rev-parse *)
---

# /agent-bus:connect

Connects you to the **Codex the user already has open** for this project: messages are queued
into that chat, the user sees both sides and can answer or take over. Only when no Codex chat is
open does a background Codex come into it — and starting one agent from another is the user's
decision, which is what invoking this command is. Never open a channel on your own initiative;
outside this command, give the user the command line instead.

Arguments: `$ARGUMENTS`

## connect (no `disconnect` / `status` in the arguments)

1. `agent-bus doctor`. Stop and explain if the mailbox, Node or the Codex CLI fails. If it
   already lists the peer, report that and do nothing else.
2. The project root: the directory from the arguments, else `git rev-parse --show-toplevel`, else
   the current directory.
3. ```bash
   agent-bus connect codex --cd "<root>"          # plus --headless, or --peer NAME as the endpoint
   ```
   - **A chat was found** — it prints the thread and the id of the handshake message it queued
     there. Wait for it in the background (`agent-bus await <id> --timeout 600`, `run_in_background`)
     and report the answer. An answer proves both directions; a denied mailbox write is what the
     reply will say, and `agent-bus install --codex-config` is the fix (Codex must then be
     restarted).
   - **No chat is open** — the command says so and offers `--headless`. **Ask** the user: start a
     Codex in the background (read-only, nobody watching), or open Codex themselves and connect
     again. Do not pass `--headless` unless they chose it.
   - **Several chats, none for this project** — it lists them; ask which, then
     `--thread <id>`.
4. Report: the peer name, which chat (or that it is a background one), the project root, and how
   to close it.

## disconnect

`agent-bus disconnect <peer>` — forgets the chat, or stops the background listener. The Codex
chat itself is untouched. Report what it printed.

## status

`agent-bus doctor` (it lists the peers and the served endpoints), then
`agent-bus recover <peer>` — messages claimed and never answered. Only report those: putting one
back runs it again, which the user decides.
