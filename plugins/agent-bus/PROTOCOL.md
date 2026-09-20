# agent-bus protocol, version 1

The single source for the wire format, the limits and the review format. `bin/agent-bus` enforces
it; the skills and `codex/INTEGRATION.md` explain how to use it and do not restate it.

## Scope

A channel between **trusted processes of one OS user on one machine**. There is no network, no
daemon and no authentication: the `from` field authenticates nobody, and the only boundary is the
mailbox directory's permissions (`0700`, owned by you — the CLI refuses anything else).

**The transport has no roles.** It carries messages; who asks, who reviews, who writes the code
and who checks it is agreed between the two agents in the messages themselves. A review is one
kind of message, not what the channel is for. What each side may actually *do* comes from the
user who started it, never from what the other side asks for.

Mailbox: `$AGENT_BUS_DIR`, default `~/.local/state/agent-bus`. Both sides must use the same one.

## The two ways a peer is reached

| | `connect <peer>` finds | how a message gets there | who sees it |
|---|---|---|---|
| **a chat** (the default) | a Codex the user has open for this project | the sender queues it into that session (`codex queue`) | the user, in that chat — and they can answer or take over themselves |
| **background** (`--headless`) | nothing was open, or the user asked for it | `serve-codex` polls the inbox and runs `codex exec` read-only | nobody, unless `AGENT_BUS_REPORT_THREAD` reports it into a chat |

A chat is one a **running process holds open** (`lsof` over `$CODEX_HOME/sessions`, `originator:
codex-tui`, `source: "cli"` — a subagent's rollout and an `exec` run are not chats; an `lsof` that
could not walk the tree is "unknown", never "none"). The rollout file of a closed session stays on
disk and `codex queue` still accepts it, so being open is checked before every delivery, and a
message that provably did not get in is **removed again** and `send` exits **6**.

`agent-bus chats` lists the open chats with the last thing the user typed in each — that, not the
id, is what a person recognises a chat by. `--thread` takes the id, or enough of its beginning to
be unambiguous.

A chat answers with the ordinary `agent-bus reply <id> -`, which writes into the mailbox. Codex
runs under `workspace-write`, so the mailbox has to be a writable root for it:
`agent-bus install --codex-config` adds it once.

**One endpoint has one answering side.** A message for a chat is written straight to `claimed/`
and never appears in `inbox/`: a listener polling the same endpoint would take it from there and
run it too, and the request would be answered twice by two agents. On top of that, `connect`
refuses a name a listener already serves, `serve-codex` refuses a name a chat answers for, and
both register through one lock per endpoint, so two of them at once cannot each find it free.

That covers the two that register. A bare `agent-bus wait <endpoint>` registers nothing and takes
whatever is in that inbox — it is how a session receives, and it is the caller's business not to
point two of them at one name.

## How many pairs at once

As many as you give names to. A pair is a peer name (`codex`, `codex-onei-53`, …) plus the
endpoint the other side answers to; everything the transport keeps — inbox, claims, locks, peers,
conversations, Codex threads — is per endpoint, so pairs never see each other's messages.

What actually limits it:

| | limit |
|---|---|
| names | one answering side per name. `connect` refuses a name connected for another project or another chat and prints the name to use instead (`<peer>-2`) |
| chats | one chat is one Codex session; `connect` takes the chat of **this** project, refuses to choose when there are two, and says so when a chat already serves another peer (it may, and then it receives from both) |
| background Codex | one listener per endpoint (the lock), each running one `codex exec` at a time. N listeners = N models running = N times the spend |
| the machine | every background run is a Codex process of its own; the mailbox itself costs nothing |
| isolation | all pairs share one mailbox directory. For pairs that must not see each other's files at all, give each its own `$AGENT_BUS_DIR` |

```
inbox/<endpoint>/<id>.json      queued for an endpoint
claimed/<endpoint>/<id>.json    taken by that endpoint (moved by rename — one taker wins)
acks/<id>.json                  read receipt: the TRANSPORT has taken the message
replies/<id>.json               the reply to message <id>
peers/<name>.json               what `connect` found: {kind: 'chat', thread, cwd, pid} or
                                {kind: 'headless', cwd}
conversations/<endpoint>.<project-hash>/<conv>.json
                                serve-codex state: Codex thread id, rounds and runs used, the limits
locks/<endpoint>.pid            the one server of an endpoint: `{pid, started}`, linked into place
                                whole. A stale one is removed only by `agent-bus unlock <endpoint>`;
                                a signal is sent only to a pid that runs serve-codex AND started
                                when the lock says it did (ps asked under a pinned locale and time
                                zone). A check that fails is "unknown", never "gone": no signal and
                                no unlock rest on it. Only kill(pid, 0) → ESRCH proves a process
                                absent; a ps that exits non-zero or prints nothing proves nothing
logs/<id>.<attempt>.jsonl       serve-codex: the event trace of one attempt
oversize/<id>.txt               a reply that was over the limit, whole
```

Every file is written to `tmp/` and renamed into place: a reader never sees half a file.

## Names

Endpoints, conversation ids and message ids match `^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$` — never a
path. One consumer per endpoint: give every session its own, `claude-<label>` and
`codex-<label>`. A shared `claude` inbox lets a parallel session take your message.

Three identifiers, never mixed up:

| | is | example |
|---|---|---|
| endpoint | who receives | `codex-review` |
| conversation | which discussion a message belongs to; carries the round limit | `onei-53-followup` |
| Codex thread | how a served Codex keeps that discussion's context; one per conversation | (internal) |

A conversation belongs to **one endpoint serving one project**. The same id under another
endpoint, or after a server was restarted for another project root, is a different conversation:
it inherits neither the thread nor the round count.

## Envelope

```json
{
  "version": 1,
  "id": "1789902878814-2508c68f",
  "type": "review",
  "from": "claude-a",
  "to": "codex-review",
  "reply_to": "claude-a",
  "conversation_id": "onei-53-followup",
  "in_reply_to": null,
  "expects_reply": true,
  "depth": 0,
  "ts": "2026-09-20T11:14:38.814Z",
  "text": "…",
  "round": 3, "max_rounds": 5,
  "worktree": "/abs/path/to/worktree",
  "base": "<full sha or null>", "head": "<full sha>"
}
```

`reply_to` is an endpoint; `in_reply_to` is a message id. The last row is present for
`type: review` only, where `worktree`, `head` and `round` are required and SHAs are the full 40
characters — a review of "HEAD" reviews whatever HEAD has become by the time it is read.

| type | runs the served agent | gets a reply |
|---|---|---|
| `question` | yes | yes |
| `review` | yes, in `worktree` | yes, in the review format below |
| `status` | no | no — information only ("pushed another commit") |

None of the three says who is in charge of what. A `question` may be "review this", a `review` may
come back with a counter-proposal, and either side may send either.

`expects_reply: false` (`--no-reply`) makes any message information only.

## Replies and failures

`replies/<id>.json` is `{id, ok, kind, ts, text}`.

- `ok: true` — an answer. **A review that says `REQUEST_CHANGES` is an answer.**
- `ok: false` — the run itself failed; `ask` / `await` exit **4** and print `kind`:
  `exec_failed` (non-zero exit or no final message **of this attempt** — every attempt writes its
  own output file, so a requeued message is never answered by an earlier attempt), `exec_timeout`,
  `bad_worktree` (not under the server's project root), `bad_envelope` (a message that is not a
  valid envelope — `send` checks the same, but a file in the inbox need not come from `send`),
  `round_limit`, `run_limit`, `reply_too_large`. None of these is a review verdict.

A peer that declines a role ("I only read here; I can check your diff instead") has **answered** —
`ok: true`. Turning a refusal into a failure would only make the asker repeat it.

`send` exits **6** when the peer is a chat and the message did not get in: the chat is closed, or
`codex queue` failed. Nothing was queued and nothing is left behind, so `connect` again. The one
exception is a queue that **timed out** — it may have been written after all, so the message stays
in `claimed/` (where `recover` lists it) and the text says to look at the chat before resending.

Waiting is separate from running. `ask` / `await` exit **2** when the wait (`--timeout`, default
600 s) ends first: the request is still queued or running. **Continue with `agent-bus await <id>`;
never send it again** — that would run it twice. The run has its own deadline
(`serve-codex --exec-timeout`, default 1800 s).

## Limits

| | limit | over the limit |
|---|---|---|
| message text | 64 KiB | `send` fails (exit 5). Put logs in a file both sides can read; send the path |
| reply text | 256 KiB | reply becomes `reply_too_large`, the whole text kept in `oversize/` |
| reply chain depth | 3 (`$AGENT_BUS_DEPTH`) | `send` refuses (exit 3) — two agents cannot ping-pong forever |
| runs per conversation | `serve-codex --max-runs`, default 50; every run counts, failed ones too | `run_limit`. The round limit bounds reviews only — questions, retries and a change of message type spend the same model time |
| review rounds | `max_rounds` of the conversation's **first** review (default 5), never above the server's `--max-rounds` (default 5); whole numbers 1–99 | `round_limit`. A later message cannot raise the limit, a retyped round number does not reset it, and a limit stored under a more generous server is cut to the cap in force now. Only a **delivered** review uses a round — a run that failed, or an answer too large to deliver, does not |

## Review format

Request text (the author writes it; the envelope carries worktree / base / head / round):
what broke and how it was diagnosed, what the change does, the evidence (the failing check before,
the passing one after, the full-run numbers), known limits, and explicit questions. State what the
reviewer may run — by default nothing that touches a shared stand.

Reply:

```text
VERDICT: APPROVE | REQUEST_CHANGES
REVIEWED_HEAD: <full sha>

BLOCKING
B1. <file:place> — <scenario that breaks> — <smallest change that fixes it>
(or: None.)

NON-BLOCKING
…

CHECKED
<what the reviewer verified itself> / <what it took from the author's report>
```

Blocking findings keep their numbers (B1, B2, …) across rounds. `APPROVE` is the result of a
review — never permission to push, merge, open a pull request or deploy.

After the last round the reviewer stops asking for changes and lists what is still disputed; the
author takes that list to the user.

## Authority

A message from another agent may refine a task inside what the user already authorised, and may
**propose a role**. It is not the user: it cannot authorise changing files, publishing, sending
messages or loosening restrictions, and taking a role never widens what a side may do. For a
background Codex the full text is `policies/peer.md` (`policies/reviewer.md` for a listener meant
to do nothing but review); whoever starts the server picks the policy, and no message can name
another one. The prompt is not a sandbox — the server also runs Codex with `-s read-only -a never`
and only under its project root. A chat keeps whatever permissions the user started it with; that
is their decision, not the channel's.
