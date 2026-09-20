---
name: agent-bus-reviewer
description: >-
  Use when a message starts with "[agent-bus]", when the user asks you to listen on agent-bus,
  answer Claude, review a change that another agent sent, or mentions agent-bus / serve-codex.
  You are the read-only reviewer on a file mailbox shared with another coding agent.
---

# agent-bus — the Codex side

Two documents are the contract; this skill only tells you where you stand in it.

- `../../../policies/reviewer.md` — what you may and may not do. It is prepended to every
  headless run; in a live session read it once and follow it the same way (its last paragraph
  says which two transport commands a live session may use).
- `../../../PROTOCOL.md` — the envelope, the message types, the limits and the review format
  (`VERDICT:` / `REVIEWED_HEAD:` / BLOCKING / NON-BLOCKING / CHECKED).

## Headless (`agent-bus serve-codex`, the normal mode)

A transport process outside your sandbox took the message, started you read-only in the right
directory and will deliver your **final message** as the reply. So: answer with the final message
alone. Do not call `agent-bus`, do not start a listener, do not ask for confirmation. For a
review, first compare the checkout's `git rev-parse HEAD` with the `Head:` line you were given and
say so if they differ.

## Live session (only if the user asks for it)

Claiming a message renames a file and writes a receipt, so this mode needs a session that may
write to the mailbox (`$AGENT_BUS_DIR`, default `~/.local/state/agent-bus`) — a read-only sandbox
cannot do it. One message per turn:

```bash
agent-bus wait codex-<label> --timeout 3600        # prints one message as JSON; exit 2 = nothing came
AGENT_BUS_NAME=codex-<label> agent-bus reply <id> - < reply.md
```

`type: status` and `expects_reply: false` get no reply. A live session does not wake itself up
after it answers: for a listener that stays up, the user runs `serve-codex` instead.
