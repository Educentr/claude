# agent-bus

Two coding agents on one machine talking to each other instead of through you. You start Claude
Code, you start Codex, and one command in Claude Code opens the channel between them — into the
Codex chat you already have open, so you see both sides and can join in at any point. No server,
no network, no dependencies: one Node script.

```
you ──▶ Claude Code ──ask──▶ ~/.local/state/agent-bus ──queue──▶ your open Codex chat ◀── you
                    ◀─reply──                         ◀─agent-bus reply──
```

No chat open? Then, and only if you ask for it, a Codex is started in the background instead:

```
Claude Code ──ask──▶ mailbox ──▶ agent-bus serve-codex ──▶ codex exec (read-only) ──▶ reply
```

**The channel has no roles.** Who asks, who reviews, who writes the code and who checks it is
agreed in the messages. A review is one thing it is used for, not what it is for.

## What is in the plugin

| | |
|---|---|
| `bin/agent-bus` | the CLI. Enabling the plugin puts it on Claude Code's Bash `PATH` |
| `skills/agent-bus` | for Claude: asking, waiting in the background, replying, timeouts, what another agent's message may and may not change, reporting every exchange to the user |
| `skills/codex-review` | for Claude as author: the review request, handling `REQUEST_CHANGES`, five rounds then the user, what `APPROVE` does not permit |
| `skills/install`, `skills/connect`, `skills/mode`, `skills/uninstall` | commands only the user runs: `/agent-bus:install`, `/agent-bus:connect [disconnect\|status]`, `/agent-bus:mode [name]`, `/agent-bus:uninstall` |
| [`conventions/`](conventions/) | ready-made working agreements for a pair: who works, who reviews, what a handover carries |
| [`PROTOCOL.md`](PROTOCOL.md) | the single source: envelope, message types, limits, failure kinds, review format |
| [`policies/peer.md`](policies/peer.md), [`policies/reviewer.md`](policies/reviewer.md) | what the other side may do — the neutral one, and one for a listener meant to review and nothing else; prepended to every background run |
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
/agent-bus:install      copies the plugin to ~/.local/share/agent-bus, links the CLI and the Codex skill,
                        and — if you say yes — lets a Codex chat write its replies into the mailbox
/agent-bus:connect      opens the channel for this project; `disconnect` and `status` as arguments
```

Several pairs at once: give each its own name — `/agent-bus:connect`, then
`/agent-bus:connect codex-onei-53` for the next. One name has one answering side, and a name that
is taken is refused with the name to use instead. `agent-bus chats` lists the open Codex chats
with the last thing you typed in each, so you can say which one a pair should talk to
(`--thread <id>`, the first characters are enough).

Both are commands only the user can run: one changes your home directory, the other decides which
chat is spoken to (or starts another agent — agents do not spawn each other). Without Claude Code,
from a clone of this repository:

```sh
plugins/agent-bus/codex/install.sh && agent-bus doctor      # links into the clone; git pull updates it
agent-bus connect codex --cd /abs/path/to/project           # agent-bus disconnect codex   to close it
```

**Updating**: `/plugin update agent-bus@educentr-marketplace`, then `/agent-bus:install` again —
Codex does not see Claude Code's plugins, so its copy of the CLI and skill is refreshed
separately. Then reopen any channel that had a background Codex, since a running listener keeps
the code it loaded. `agent-bus` on `PATH` may be the installed copy, and a copy cannot update
itself — the installer refuses that rather than relinking to itself.

Full guide: [`codex/INTEGRATION.md`](codex/INTEGRATION.md).

## Use

- `/agent-bus:mode author-reviewer` right after connecting — then "I work, you review, here is what
  a handover carries" holds for every exchange, and neither side asks again.
- "Ask Codex whether …" → the `agent-bus` skill.
- "Review this with Codex before pushing" → `/agent-bus:codex-review`.
- Codex can start an exchange too: `agent-bus send claude-<label> "…"`, and Claude answers with
  `agent-bus reply`.

A review is a commit in its own worktree, a full head SHA, a round number — and an answer that
starts `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES`. At most five rounds per change; what is
still disputed after that goes to the user. `APPROVE` is a review result, never permission to
push, merge or deploy.

## Design decisions

- **Files, not a service.** Writes are rename-atomic, a claim is a rename (one taker wins), the
  mailbox is `0700` and the CLI refuses one that is not yours or not private.
- **A live chat first, a background agent when there is none.** The default peer is the Codex
  session the user has open — they watch the exchange and can take over. With no chat open, a
  read-only background Codex is started instead; `--headless` asks for that even when a chat is
  open. What is a question rather than an absence — two chats for one project, a named thread that
  is not open, an `lsof` that could not read the sessions directory — stops and asks.
- **An open chat is one a process holds open** — its thread lock (every version) or its rollout
  file (older ones); what the thread is comes from Codex's thread store. A closed session's
  rollout stays on disk and `codex queue` still accepts it, so delivery checks that first; a
  message that cannot be delivered is withdrawn (exit 6), never left for something else to claim.
- **A Codex open but never spoken to is not "no Codex".** It has no thread to queue into, so the
  answer is to say so — not to start a second one behind the user's back.
- **A failed run is not a verdict.** Timeouts, non-zero exits, a worktree outside the project and a
  spent round limit come back as failures (exit 4), not as a review.
- **Waiting is not running.** When the wait ends first, `await` the same id — resending would run
  the request twice.
- **One endpoint, one consumer; one conversation, one Codex thread.** Parallel sessions use their
  own endpoint names, and a conversation never crosses endpoints or projects.
- **The round limit cannot be talked up.** It is fixed by a conversation's first review and capped
  by the server; only delivered reviews count against it. A conversation also has a budget of runs
  (`--max-runs`, default 50) that failed runs and plain questions spend too.
- **You can watch it.** With `AGENT_BUS_REPORT_THREAD` set, the transport reports into a Codex chat
  what was received and what was answered — excerpts, with the path to the whole text.
- **A role is a proposal, permissions are the user's.** A message may ask you to review, to write,
  to check — and may be refused, which is an answer, not a failure. The policy is chosen by
  whoever starts the listener, no message can replace it, and the prompt is backed by
  `-s read-only -a never` and a project-root check.

## Known limits

- **A chat is found through `lsof`** over `$CODEX_HOME/thread-writer-locks` and
  `$CODEX_HOME/sessions` — that a running process holds one of those open is what "the chat is
  open" means here, and the thread store (`state_5.sqlite`, via `sqlite3`) says what each thread
  is. It leans on how the Codex CLI keeps those files; a version that keeps neither would look
  like no chat at all. Anything `lsof` cannot read makes the answer *unknown*, never "none".
- **A lock left by a crash is cleared by hand** (`agent-bus unlock <endpoint>`), on purpose: two
  starters could each decide it was stale, and the second would remove the lock the first had just
  taken.
- **Developed and tested on macOS.** Nothing in it is deliberately macOS-only — it is Node, `lsof`
  and `ps` — but Linux is not verified, so it is not claimed.
- **One consumer per endpoint** is enforced for `connect` and `serve-codex`. A bare
  `agent-bus wait <endpoint>` takes whatever is in that inbox without registering: pointing two of
  those at one name is the caller's business.
- **The CLI needs a Node to run it.** `install` puts a launcher on `PATH` that remembers the Node
  it was installed with and falls back to whatever `node` resolves to — because a Node from nvm or
  another version manager is invisible to a session started outside your shell, and a plain
  symlink would simply fail to execute there. `AGENT_BUS_NODE` overrides it; reinstall after
  changing Node versions.
- **A background listener is a detached process, but not an immortal one.** Started from inside an
  agent's sandboxed shell it may be killed when that shell's process tree is cleaned up — the log
  then simply stops after `serving "…"`, with no error, and `agent-bus doctor` shows the endpoint
  free. Observed twice; a listener started from an ordinary terminal (or from a session whose shell
  does not reap descendants) stays up for hours. If yours keeps dying, start it from a terminal —
  or use a live chat, which has no such process to lose.

Not in this version: an MCP server, a scheduler, a queue service, a native Codex plugin manifest.

## Test

```sh
node --test plugins/agent-bus/test/agent-bus.test.mjs
```
