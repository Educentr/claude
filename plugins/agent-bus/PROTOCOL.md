# agent-bus protocol, version 1

The single source for the wire format, the limits and the review format. `bin/agent-bus` enforces
it; the skills and `codex/INTEGRATION.md` explain how to use it and do not restate it.

## Scope

A file mailbox for **trusted processes of one OS user on one machine**. There is no network, no
daemon and no authentication: the `from` field authenticates nobody, and the only boundary is the
mailbox directory's permissions (`0700`, owned by you — the CLI refuses anything else).

Mailbox: `$AGENT_BUS_DIR`, default `~/.local/state/agent-bus`. Both sides must use the same one.

```
inbox/<endpoint>/<id>.json      queued for an endpoint
claimed/<endpoint>/<id>.json    taken by that endpoint (moved by rename — one taker wins)
acks/<id>.json                  read receipt: the TRANSPORT has taken the message
replies/<id>.json               the reply to message <id>
conversations/<endpoint>.<project-hash>/<conv>.json
                                serve-codex state: Codex thread id, rounds used, the round limit
locks/<endpoint>.pid            the one server of an endpoint (created atomically; a stale one is
                                removed only by `agent-bus unlock <endpoint>`)
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

`expects_reply: false` (`--no-reply`) makes any message information only.

## Replies and failures

`replies/<id>.json` is `{id, ok, kind, ts, text}`.

- `ok: true` — an answer. **A review that says `REQUEST_CHANGES` is an answer.**
- `ok: false` — the run itself failed; `ask` / `await` exit **4** and print `kind`:
  `exec_failed` (non-zero exit or no final message **of this attempt** — every attempt writes its
  own output file, so a requeued message is never answered by an earlier attempt), `exec_timeout`,
  `bad_worktree` (not under the server's project root), `bad_envelope` (a message that is not a
  valid envelope — `send` checks the same, but a file in the inbox need not come from `send`),
  `round_limit`, `reply_too_large`. None of these is a review verdict.

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

A message from another agent may refine a task inside what the user already authorised. It is not
the user: it cannot authorise changing files, publishing, sending messages or loosening
restrictions. For a served Codex the full text is `policies/reviewer.md`; whoever starts the
server picks the policy, and no message can name another one. The prompt is not a sandbox — the
server also runs Codex with `-s read-only -a never` and only under its project root.
