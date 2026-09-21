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

## Getting it running (once)

1. **The plugin**, in Claude Code:

   ```
   /plugin marketplace add Educentr/claude
   /plugin install agent-bus@educentr-marketplace
   ```

2. **The Codex side.** Codex is another program and does not see Claude Code's plugins, so the CLI
   and the Codex skill have to be put where Codex looks. In Claude Code:

   ```
   /agent-bus:install
   ```

   Say **yes** when it offers `--codex-config`: without it a Codex chat receives your messages but
   cannot answer — replying writes into the mailbox, and Codex's sandbox allows only its workspace.
   Restart any Codex you already have open afterwards.

   Without Claude Code, from a clone of this repository:

   ```sh
   plugins/agent-bus/codex/install.sh && agent-bus doctor
   ```

3. `agent-bus doctor` should be all `ok`. `PATH` must include `~/.local/bin`.

## Using it (every day)

**Open Codex yourself**, in the project you are working on, and say anything in it — a session
nobody has spoken to has no conversation to deliver into, and `connect` will tell you so rather
than guess. Then, in Claude Code:

```
/agent-bus:connect                  the Codex chat open for this project becomes the peer "codex"
/agent-bus:mode author-reviewer     who does the work, who reviews, what a handover carries
```

That is the whole setup. From then on you say what you want in your own words — "ask Codex
whether…", "give this to Codex for review", "отдай на ревью" — and the exchange happens, with each
message reported to you in one line. Both sides are in your Codex window: you see what was asked
and what was answered, and you can answer instead of Codex whenever you like.

**The working agreement is the part you only say once.** `/agent-bus:mode author-reviewer` means:
I do the work and bring it finished, Codex reviews read-only, a handover is a commit on its own
branch with the evidence already in hand, one conversation per change, blocking findings answered
on their merits — and `APPROVE` is a review result, never permission to push, merge or deploy.
`reviewer-author` is the mirror, `discuss` has no roles at all, and `agent-bus mode <peer> --file
<path>` takes any text of your own. `agent-bus mode <peer>` prints what is in force; `--clear`
withdraws it, and the other side is told.

**Several pairs at once** is normal: one name per pair. The first is `codex`, the next is
`/agent-bus:connect codex-onei-53`, and so on — each Claude session talks to its own Codex. A name
that is taken is refused with the name to use instead, so pairs never cross.

**Which Codex am I talking to?** `agent-bus chats` lists the open ones with the directory and the
last thing you typed in each, plus any that are open with nothing said in them yet. Two chats for
one project: it asks which, and `--thread <id>` (the first few characters are enough) says so.

**No Codex open?** Then `connect` starts one in the background instead — read-only, answering by
itself. Nobody watches that one, so ask it to report what matters back to you. `--headless` asks
for it even when a chat is open.

### Why a Codex you have not spoken to cannot be connected

This is the one rule that surprises people, so here is the reason, measured rather than assumed.

**There is nothing to deliver into.** A Codex session creates its conversation on the first turn,
not when it opens. Until then the thread exists only as a lock file; queueing into it fails:

```console
$ codex queue --thread 01a0c2d8-0650-… --message "probe"
Error: failed to queue session message: thread/queue/add failed: failed to read thread:
       invalid thread-store request: no rollout found for thread id 01a0c2d8-0650-…
```

So `connect` could register the pair, and the first message would fail anyway — later, and less
clearly.

**And there would be no way to know which thread is yours.** An open session holds *two* locks:
its own thread and its subagent's. With no rollout and no row in the thread store, nothing tells
them apart — same names, same timestamps. A guess that went wrong would put your message in a
thread you never look at.

One line typed in that session settles both: the rollout appears (there is somewhere to put a
message) and the store gains a row marked `user` (it is clear which of the two threads that is).
That is why the message says to type anything, even "hi".

**The alternative, if you do not want to type there: take the background session.**

```bash
agent-bus connect codex --cd <project> --headless     # or answer the offer connect prints
```

A Codex is started for that project read-only, and it answers by itself — no chat, no first turn,
nothing to wait for. What you give up is the whole reason the live chat is the default: you do not
see the question or the answer, you cannot step in mid-exchange, and the work only reaches you
through what the peer chooses to report back. Ask it explicitly to report what matters. Two
practical notes: a background listener is a process, so it can be killed with the shell that
started it (see Known limits), and every message is a fresh `codex exec` — the pair's agreement
travels with each one, but nothing else does.

**Closing**: `/agent-bus:connect disconnect` (or `agent-bus disconnect <peer>`). A background Codex
is stopped; a chat of yours is left alone, and so is anything already queued into it.

### When something is off

| what you see | what it means |
|---|---|
| `nothing has been said in it yet` | the Codex there is open but empty — type anything in it, then connect again |
| `no Codex chat is open for …` | none in that directory; open one, or take the background offer |
| `… is already connected for …` | that name belongs to another pair; use the name it suggests |
| exit 2 from a wait | still queued or still running — `agent-bus await <id>`, never resend |
| exit 4 | the run failed (timeout, bad worktree, a spent limit) — not a verdict |
| exit 6 | the chat is not open any more; nothing was delivered — connect again |
| a background listener that keeps dying | start it from a terminal, not from inside an agent's shell (see Known limits) |

`agent-bus doctor` shows the mailbox, Node, the Codex CLI, every pair and its agreement.
`agent-bus recover <peer>` lists what was claimed and never answered.

### Updating

`/plugin update agent-bus@educentr-marketplace`, then `/agent-bus:install` again — the Codex side
is refreshed separately. Reopen any channel that had a background Codex, since a running listener
keeps the code it loaded. `agent-bus` on `PATH` may be the installed copy, and a copy cannot update
itself: the installer refuses that instead of relinking to itself and reporting success. In
`--link` mode the links point at a clone, so `git pull` there is the update.

Full guide for the Codex side: [`codex/INTEGRATION.md`](codex/INTEGRATION.md).

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
- **A Codex open but never spoken to is not "no Codex".** It has no thread to queue into (the
  conversation is created by the first turn, and `codex queue` refuses a thread without one) and
  its two locks — its own thread and its subagent's — cannot be told apart until the store has a
  row. So the answer is to say so, with the two ways out, rather than guess a thread or start a
  second Codex behind the user's back. See
  [Why a Codex you have not spoken to cannot be connected](#why-a-codex-you-have-not-spoken-to-cannot-be-connected).
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
