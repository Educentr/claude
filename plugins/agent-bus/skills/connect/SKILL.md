---
name: connect
description: >-
  Open the agent-bus channel to Codex for this project, close it, or show its state. Run by the
  user as /agent-bus:connect, /agent-bus:connect disconnect or /agent-bus:connect status.
disable-model-invocation: true
argument-hint: "[disconnect|status] [peer-name] [--headless] [project-dir]"
allowed-tools: Bash(agent-bus *) Bash(git rev-parse *)
---

# /agent-bus:connect

Connects you to the **Codex the user already has open** for this project: messages are queued
into that chat, the user sees both sides and can answer or take over. When no Codex chat is open,
a background one is started instead — read-only, answering by itself. Starting another agent is
the user's decision, which is what invoking this command is: never open a channel on your own
initiative; outside this command, give the user the command line instead.

**Several pairs may run at once**, one per peer name: `codex` for the first, `codex-<label>` for
the next (and each Claude session keeps its own `AGENT_BUS_NAME=claude-<label>`). One name has one
answering side — connecting a name that is already connected for another project, another chat, or
that a background listener serves, is refused with the name to use instead. Take that suggestion
rather than disconnecting someone else's pair.

Arguments: `$ARGUMENTS`

## connect (no `disconnect` / `status` in the arguments)

1. `agent-bus doctor`. Stop and explain if the mailbox, Node or the Codex CLI fails. A peer it
   already lists is **not** a reason to stop: whether that peer is the right one for this project
   and still alive is decided by `connect` itself, in step 3.
2. The project root: the directory from the arguments, else `git rev-parse --show-toplevel`, else
   the current directory.
3. ```bash
   agent-bus connect <peer> --cd "<root>"         # <peer> is `codex` unless the user named one
   ```
   - **A chat was found** — it prints the thread and the id of the handshake message it queued
     there. Wait for it in the background (`agent-bus await <id> --timeout 600`, `run_in_background`)
     and report the answer. An answer proves both directions; a denied mailbox write is what the
     reply will say, and `agent-bus install --codex-config` is the fix (Codex must then be
     restarted).
   - **No chat was open** — it starts a background Codex and says so. Tell the user plainly that
     nobody is watching that one, and that opening Codex themselves gives them the visible channel.
     `--headless` forces this even when a chat is open; pass it only if they asked.
   - **It stopped with a question** — the message says which. Put it to the user, never guess:
     - *two chats for this project* — it lists each one with its directory and **the last thing
       the user typed in it**. Ask them which (AskUserQuestion, one option per chat, that last
       line as the description), then repeat with `--thread <id>`; the first few characters of the
       id are enough.
     - *`--thread …` is not open*, *the name belongs to another pair*, *`lsof` could not read the
       sessions directory* — report what it said and what it offers (another name, `--headless`).
   - `agent-bus chats` answers "which chats are open" on its own — use it when the user asks, or
     before connecting if they want to choose up front.
4. Report: the peer name, which chat (or that it is a background one), the project root, and how
   to close it.

## disconnect

`agent-bus disconnect <peer>` — forgets the chat, or stops the background listener. The Codex
chat itself is untouched. Report what it printed.

## status

`agent-bus doctor` (it lists the peers and the served endpoints), then
`agent-bus recover <peer>` — messages claimed and never answered. Only report those: putting one
back runs it again, which the user decides.
