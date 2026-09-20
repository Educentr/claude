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
| `skills/install`, `skills/serve`, `skills/uninstall` | commands only the user runs: `/agent-bus:install`, `/agent-bus:serve [stop\|status]`, `/agent-bus:uninstall` |
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

Codex is a different tool — it does not see Claude's plugins — so the CLI and its skill have to be
put where Codex looks. From Claude Code, in the project you want reviewed:

```
/agent-bus:install      copies the plugin to ~/.local/share/agent-bus, links the CLI and the Codex skill
/agent-bus:serve        starts the listener for this project, detached; `stop` and `status` as arguments
```

Both are commands only the user can run: one changes your home directory, the other starts another
agent — agents do not spawn each other. Without Claude Code, from a clone of this repository:

```sh
plugins/agent-bus/codex/install.sh && agent-bus doctor      # links into the clone; git pull updates it
agent-bus serve-codex --cd /abs/path/to/project --detach    # agent-bus stop   to end it
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
- **You can watch it.** With `AGENT_BUS_REPORT_THREAD` set, the transport reports into a Codex chat
  what was received and what was answered — excerpts, with the path to the whole text.
- **The policy is chosen by whoever starts the server.** No message can replace or relax it, and
  the prompt is backed by `-s read-only -a never` and a project-root check.

Not in this version: an MCP server, a scheduler, a queue service, a native Codex plugin manifest.

## Test

```sh
node --test plugins/agent-bus/test/agent-bus.test.mjs
```
