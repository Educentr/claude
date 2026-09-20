# Integrating Codex with agent-bus

Written for a Codex instance (or the person running it) that has never seen this channel. After
this file you can bring the channel up without asking anyone. The rules themselves live in two
places only — [`PROTOCOL.md`](../PROTOCOL.md) and [`policies/peer.md`](../policies/peer.md); this
file is about installation and operation and does not restate them.

## 1. Boundaries

- One machine, one OS user, one shared filesystem. No network, no daemon, no authentication: the
  mailbox directory's permissions are the only boundary, and the `from` field proves nothing.
- **The channel fixes no roles.** Either side may ask, review, write or decline; what each may
  actually do comes from the user who started it. A review is one use of the channel.
- **The normal peer is a Codex chat the user has open.** The sender queues the message into that
  session (`codex queue`); Codex answers with `agent-bus reply <id>`, which writes into the
  mailbox — so that session needs the mailbox as a writable root (§3).
- **A background Codex** (`agent-bus serve-codex`) is the fallback the user asks for when no chat
  is open: a transport process outside Codex's sandbox takes each message, starts Codex read-only
  for it and delivers its final message as the reply. Codex never writes to the mailbox then.
- Opening the channel and starting that process are the user's acts. An agent does not spawn
  another agent on its own.

## 2. Prerequisites

- Node 18 or newer (the CLI is one stdlib-only file).
- The Codex CLI, logged in. **Tested with `codex-cli 0.155.1`**; the lower bound was not
  established. Needed: `codex exec`, `codex exec resume`, `--json`, `-o`, `-s read-only`,
  `-a never`; `codex queue` only for the optional chat reports.
- Read access to the project and to every worktree that will be reviewed. They must be **under the
  directory the server is started for** (`--cd`).

## 3. Install

Two ways, one implementation (`agent-bus install`):

```sh
# from Claude Code, with the plugin enabled — run by the user:
/agent-bus:install

# or from a clone of this repository:
plugins/agent-bus/codex/install.sh      # = agent-bus install --link; --uninstall removes it again
agent-bus doctor
```

Either way you get `~/.local/bin/agent-bus` and the skill `~/.agents/skills/agent-bus` (a link
left by 1.x under the old name `agent-bus-reviewer` is removed).

**So that a Codex chat can answer**, the mailbox must be writable from it — Codex runs under
`workspace-write`, which allows the workspace and nothing else:

```sh
agent-bus install --codex-config     # adds ~/.local/state/agent-bus to writable_roots, once
```

It never edits a `[sandbox_workspace_write]` section that is already there; then it prints the
root to add by hand. Either way, open Codex sessions must be restarted. A session started with
`codex --add-dir "$HOME/.local/state/agent-bus"` gets the same access for that run only.

- **From the plugin** the files are **copied** to `~/.local/share/agent-bus` and linked from there:
  a plugin's own directory is a cache that an update may move. That directory belongs to `install`
  as a whole — an update replaces it and `--uninstall` removes it — so keep nothing of your own in it. After a plugin update run
  `/agent-bus:install` again and restart the listener.
- **From a clone** (`--link`) the links point straight into the clone, and `git pull` updates
  everything.

The CLI finds `policies/peer.md` next to itself in both cases. It refuses to overwrite a regular
file, never replaces a directory it did not make, and **edits your instructions only when asked**:
`agent-bus install --agents-md` (the slash command asks first) adds the block below once.

Optional, for all projects: [`AGENTS.snippet.md`](AGENTS.snippet.md) in `~/.codex/AGENTS.md` — by
hand, or with `--agents-md`. It is conditional — nothing changes until a message marked `[agent-bus]`
arrives. Project-specific limits (which checks a reviewer may run, where worktrees live) belong in
that repository's own `AGENTS.md`. Codex builds its instruction chain when it starts: restart an
open session after changing either file.

Claude Code needs no install step: enabling the plugin puts `bin/` on its Bash tool's `PATH`.

## 4. Quick start

The normal way — you have Codex open in one terminal and Claude Code in another:

```sh
# In Claude Code (or any shell): open the channel to that chat, for this project
agent-bus connect codex --cd /abs/path/to/project
#   → connected "codex": Codex chat <id> (<dir>), pid NNN. Handshake sent as <message id>
# The Codex chat receives the handshake and answers it:
agent-bus reply <message id> "Reading you."
# Back in Claude Code:
AGENT_BUS_NAME=claude-demo agent-bus ask codex "Which file decides the retry policy?" --timeout 600
```

`connect` picks the chat whose directory is this project and that a **running** process holds
open — by its thread lock, or by its rollout file on an older CLI. A Codex that is open there but
has never been spoken to has no conversation to deliver into: that is said plainly, and no
background Codex is started in its place. With no Codex there at all, a background one starts. It never picks between two chats of
one project — `agent-bus chats` lists what is open, with the last thing you typed in each, and
`--thread <id>` (a unique beginning of the id will do) says which. `--headless` asks for the
background one even when a chat is open. `agent-bus disconnect codex` closes the channel; the chat
itself is untouched.

**Several pairs at once** is the normal case: one peer name each (`codex`, `codex-<label>`), and
every Claude session with its own `AGENT_BUS_NAME=claude-<label>`. A name has one answering side —
`connect` refuses a name another pair holds, or that a listener serves, and prints the name to use
instead.

Both sides must see the same mailbox: `$AGENT_BUS_DIR`, default `~/.local/state/agent-bus`.

## 5. Modes

**A chat — the default.** `send` queues the message into that session with a header saying who
asked, the message id and how to reply, and quotes the text as a block quote. It is checked that
the session is still open first: a rollout file outlives its session and `codex queue` accepts it,
so an unchecked delivery would go nowhere. When the check fails the message is **withdrawn** from
the inbox and `send` exits 6 — nothing is left queued for something else to claim. A chat keeps
whatever permissions the user started it with; the channel changes none of them.

**Background `serve-codex` — when no chat is open.** For each message it runs

```sh
codex -C <dir> -s read-only -a never exec [resume <thread>] --skip-git-repo-check --json -o <out> -
```

with the policy, a header (type, sender, conversation; for a review also round, worktree, base,
head) and the message text on stdin. `<dir>` is the review's worktree, or `--cd` for a question.
The event trace goes to `logs/<id>.jsonl` on disk. Options: `--endpoint NAME` (default `codex`),
`--cd DIR` (project root; worktrees outside it are refused), `--policy FILE` (default: the shipped
`policies/peer.md`; a message cannot choose one), `--exec-timeout S` (default 1800),
`--max-rounds N` (default 5: the most review rounds any conversation may ask for), `--max-runs N`
(default 50: runs per conversation, failed ones included).
`--detach` starts the server as a process of its own, prints its pid and log
(`<mailbox>/serve-<endpoint>.log`) once the endpoint is held, and returns; `agent-bus stop
[endpoint]` ends it.

Stopping: Ctrl-C in the listener's terminal reaches Codex as well (the signal goes to the whole
foreground group), so the run ends and the listener exits, releasing its endpoint. A signal sent
to the listener alone (`kill <pid>`) is honoured **between** requests — a run in progress is not
cancelled and finishes or hits `--exec-timeout` first.

**Seeing the exchange in a Codex chat.** Headless runs happen in threads of their own, so the
chat you are looking at shows nothing by itself. Start the listener with
`AGENT_BUS_REPORT_THREAD=<id or exact name of that chat's session>` and the transport queues two
reports into it for every message (`codex queue`): what was **received** — type, sender,
conversation, for a review the round and head, and an excerpt of the request — and what was
**answered**, with an excerpt of the reply. Each names the file holding the whole text. Excerpts are
`AGENT_BUS_REPORT_CHARS` long (default 2000). The reports are marked as coming from the transport,
not from the user; a report that cannot be queued is logged and ignored — the reply is delivered
regardless, and nothing is run twice because of it. The quoted text arrives as a block quote; a
session that receives `[agent-bus:status]` only retells it to the user and executes nothing in it.

**Polling from a session** (`agent-bus wait <endpoint>`) is for a side that is not `connect`ed —
Claude Code does this to receive. It renames a file and writes a receipt, so it needs write access
to the mailbox, and a session does not wake itself after answering: a listener that stays up is an
external process. See the `agent-bus` skill on the Codex side.

## 6. Protocol in one paragraph

Messages are `question`, `review` or `status`, and none of them says who is in charge of what. A
receipt (`acks/`) means the message was taken — for a chat, that it was queued into it — not that
anyone began work. A `review` carries a worktree, a **full** head SHA and a
round number, and is answered `VERDICT: …` / `REVIEWED_HEAD: …` / BLOCKING / NON-BLOCKING /
CHECKED. Five rounds per conversation, then the open points go to the user. `APPROVE` permits
nothing. Everything else: [`PROTOCOL.md`](../PROTOCOL.md).

## 7. Several sessions

One consumer per endpoint. Give each pair its own names — `claude-<label>` asks
`codex-<label>`, served by `agent-bus serve-codex --endpoint codex-<label>`. A second server on
an endpoint exits with `already served by pid …`. The Codex thread is kept **per conversation**,
and a conversation belongs to one endpoint serving one project
(`conversations/<endpoint>.<project-hash>/<id>.json`): a new ticket starts a new thread, a further
round resumes the old one, and the same id under another endpoint or another project root shares
nothing. Two reviewers may read the same repository at once; only one thread is ever resumed at a
time because an endpoint handles its messages one by one. For full isolation use a separate
`AGENT_BUS_DIR` per pair.

## 8. When it goes wrong

| symptom | what it means | do |
|---|---|---|
| `ask` exits 2, "not taken yet" | no listener on that endpoint / another mailbox | start `serve-codex`; compare `AGENT_BUS_DIR` on both sides |
| `ask` exits 2, "taken, still working" | the wait ended before the run | `agent-bus await <id>` — **never resend**, it would run twice |
| exit 4 `exec_timeout` | Codex did not finish within `--exec-timeout` | read `logs/<id>.jsonl`; raise the deadline or narrow the request |
| exit 4 `exec_failed` | non-zero exit or no final message | same trace; check `codex login status` |
| exit 4 `bad_worktree` | the worktree is not under the server's `--cd` | start the server at a common parent |
| exit 6, `not delivered to "<peer>"` | the peer is a chat that is no longer open (or `codex queue` failed) | nothing was queued and nothing left behind: `agent-bus connect <peer>` again |
| exit 6, `it may or may not be in Codex chat …` | `codex queue` timed out — it may have been written | look at that chat before sending again; `agent-bus recover <peer>` lists it |
| `lsof is needed …` / `lsof could not read all of …` | lsof missing, or it could not walk the sessions directory | an open chat may have been missed, so no background Codex is started on the strength of it: fix lsof, name the chat with `--thread`, or ask for `--headless` |
| `another connect or listener is taking endpoint "…" right now` | two sessions registered the same endpoint at once | let the other finish, then `agent-bus doctor` |
| `served by a background Codex` / `connected to Codex chat …` | one endpoint, two would-be answering sides | use the name it suggests (`<peer>-2`) or disconnect the other |
| Codex says it cannot write to the mailbox | the chat's sandbox does not include it | `agent-bus install --codex-config`, then restart that session |
| exit 4 `run_limit` | the conversation has spent its `--max-runs` | take what is left to the user, or start another conversation |
| exit 4 `round_limit` | the conversation has used its rounds (the limit is fixed by its first review and never above the running server's `--max-rounds`; failed runs, an oversize reply included, do not count) | take the open points to the user |
| exit 4 `bad_envelope` | not a valid message: a round that is not a number, `max_rounds` over the server's cap, a short SHA | fix the request; the text says which field |
| `has a lock left by pid …, which is not running that server any more` | a server was killed and left its lock; the pid may be somebody else's by now | make sure no server for that endpoint is starting, then `agent-bus unlock <endpoint>` — a stale lock is never taken over automatically, and `stop` never signals a pid it cannot prove is that server (same command **and** same start time) |
| `the lock … does not hold a pid` | a damaged or half-written lock file | nothing was signalled; look at the file, then `agent-bus unlock <endpoint> --force` (`--force` works only for a file that is not a lock — never as a way round one that is) |
| `it could not be verified whether pid … is the server` | the check itself failed: `ps` did not answer, or the lock was written by agent-bus 1.0 and carries no start time | a check that failed is never read as "the server is gone": nothing is signalled and the lock stays. Look with `ps -p <pid>`; stop that server yourself if it is one, and delete the lock file by hand only when it is gone |
| server died mid-message | the message sits in `claimed/` with no reply | `agent-bus recover <endpoint>` lists it; `--requeue <id>` runs it **again** — a person decides |
| chat report failed | `codex queue` unavailable | ignored by design; the reply is in the mailbox |

## 9. Switching from an older agent-bus

**From 1.x.** Nothing in the wire format changed, so a 1.x client and a 2.0 listener understand
each other. What changed: the default policy is `policies/peer.md` (roles are no longer fixed to
"Codex reviews"), the Codex-side skill is now `agent-bus` and install removes the old
`agent-bus-reviewer` link, `/agent-bus:serve` became `/agent-bus:connect` (`--headless` is the old
behaviour), and a conversation now also has a run budget. Re-run `/agent-bus:install` and restart
the listener; running conversations keep their threads.

**From the hand-written script.** An earlier, single-file `agent-bus` used `/tmp/agent-bus`,
plain-text replies and one Codex thread for everything. The two do not mix: a running old listener keeps executing the old code it has
loaded, new clients default to another mailbox, an old `await` cannot read the new JSON replies,
and `/tmp/agent-bus` may fail the new ownership and permission check. Switch both sides together:

1. Let every request in flight be answered (`agent-bus await <id>` on the asking side).
2. Stop the old listener (Ctrl-C).
3. Move the old file away — the installer will not overwrite a regular file —
   `mv ~/.local/bin/agent-bus ~/.local/bin/agent-bus.old`, then, from the root of the clone, run
   `plugins/agent-bus/codex/install.sh`.
4. Open the channel again: `agent-bus connect codex --cd /abs/path/to/project` (add `--headless`
   for a background listener, which is what the old script did).
5. Enable the plugin in Claude Code and start a new session, so both sides use the default mailbox.

The old single thread is not carried over: conversations start fresh, one thread each.

## 10. Checking an installation

- Transport only, no model call, nothing leaves the machine:
  `node --test plugins/agent-bus/test/agent-bus.test.mjs` (a fake `codex` on `PATH`).
- A real round trip, when the user wants one: the quick start above with a harmless question.

## 11. Updating and removing

`git pull` in the clone updates the CLI, policy, protocol and skill at once (they are links); after
a plugin update, `/agent-bus:install` refreshes the copy. A running listener keeps the code it has
loaded: `agent-bus stop`, then start it again. `/agent-bus:uninstall` (or `install.sh --uninstall`,
or `agent-bus install --uninstall`) removes only the links that point into a place `install`
manages, and the copy only if `install` made it; the mailbox and every reply in it
are left alone — delete `~/.local/state/agent-bus` yourself when you no longer need the history.
