# agent-bus

Two coding agents on one machine — **Claude Code** writes, **Codex** reviews — talking through a
private file mailbox instead of through you. No server, no network, no dependencies: one Node
script.

```
Claude Code ──ask──▶ ~/.local/state/agent-bus ──▶ agent-bus serve-codex ──▶ codex exec (read-only)
            ◀─reply─                          ◀──            final message ◀──
```

## What is in the plugin

| | |
|---|---|
| `bin/agent-bus` | the CLI. Enabling the plugin puts it on Claude Code's Bash `PATH` |
| `skills/agent-bus` | for Claude: asking, waiting in the background, replying, timeouts, what another agent's message may and may not change, reporting every exchange to the user |
| `skills/codex-review` | for Claude as author: the review request, handling `REQUEST_CHANGES`, five rounds then the user, what `APPROVE` does not permit |
| [`PROTOCOL.md`](PROTOCOL.md) | the single source: envelope, message types, limits, failure kinds, review format |
| [`policies/reviewer.md`](policies/reviewer.md) | the single source for what a served Codex may do; prepended to every run |
| [`codex/`](codex/INTEGRATION.md) | everything for the Codex side: integration guide, installer, its skill, an optional `AGENTS.md` block |
| `test/` | the transport end to end with a fake `codex` — no model call |

## Install

Claude Code:

```
/plugin marketplace add Educentr/claude
/plugin install agent-bus@educentr-marketplace
```

Codex (a different tool — it does not see Claude's plugins), from a clone of this repository:

```sh
plugins/agent-bus/codex/install.sh && agent-bus doctor
```

Then the user starts a listener for the project — agents do not spawn each other:

```sh
agent-bus serve-codex --cd /abs/path/to/project
```

Full guide: [`codex/INTEGRATION.md`](codex/INTEGRATION.md).

## Use

- "Ask Codex whether …" → the `agent-bus` skill.
- "Review this with Codex before pushing" → `/agent-bus:codex-review`.

A review is a commit in its own worktree, a full head SHA, a round number — and an answer that
starts `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES`. At most five rounds per change; what is
still disputed after that goes to the user. `APPROVE` is a review result, never permission to
push, merge or deploy.

## Design decisions

- **Files, not a service.** Writes are rename-atomic, a claim is a rename (one taker wins), the
  mailbox is `0700` and the CLI refuses one that is not yours or not private.
- **The transport runs Codex, not the other way round.** Codex stays in a read-only sandbox and
  never touches the mailbox; its final message is the reply.
- **A failed run is not a verdict.** Timeouts, non-zero exits, a worktree outside the project and a
  spent round limit come back as failures (exit 4), not as a review.
- **Waiting is not running.** When the wait ends first, `await` the same id — resending would run
  the request twice.
- **One endpoint, one consumer; one conversation, one Codex thread.** Parallel sessions use their
  own endpoint names, and a conversation never crosses endpoints or projects.
- **The round limit cannot be talked up.** It is fixed by a conversation's first review and capped
  by the server; only delivered reviews count against it.
- **The policy is chosen by whoever starts the server.** No message can replace or relax it, and
  the prompt is backed by `-s read-only -a never` and a project-root check.

Not in this version: an MCP server, a scheduler, a queue service, a native Codex plugin manifest.

## Test

```sh
node --test plugins/agent-bus/test/agent-bus.test.mjs
```
