# Integrating Codex with agent-bus

Written for a Codex instance (or the person running it) that has never seen this channel. After
this file you can bring the channel up without asking anyone. The rules themselves live in two
places only — [`PROTOCOL.md`](../PROTOCOL.md) and [`policies/reviewer.md`](../policies/reviewer.md);
this file is about installation and operation and does not restate them.

## 1. Boundaries

- One machine, one OS user, one shared filesystem. No network, no daemon, no authentication: the
  mailbox directory's permissions are the only boundary, and the `from` field proves nothing.
- **Claude Code** writes the code and sends requests. **Codex** answers and reviews, read-only.
- A **transport process** (`agent-bus serve-codex`), started by the user *outside* Codex's
  sandbox, takes messages, starts Codex for each one and delivers Codex's final message as the
  reply. Codex never writes to the mailbox in this mode.
- Starting that process is the user's act. An agent does not spawn another agent on its own.

## 2. Prerequisites

- Node 18 or newer (the CLI is one stdlib-only file).
- The Codex CLI, logged in. **Tested with `codex-cli 0.155.1`**; the lower bound was not
  established. Needed: `codex exec`, `codex exec resume`, `--json`, `-o`, `-s read-only`,
  `-a never`; `codex queue` only for the optional chat reports.
- Read access to the project and to every worktree that will be reviewed. They must be **under the
  directory the server is started for** (`--cd`).

## 3. Install

From a clone of this repository:

```sh
plugins/agent-bus/codex/install.sh      # symlinks; --uninstall removes them
agent-bus doctor
```

It links `~/.local/bin/agent-bus` and the skill `~/.agents/skills/agent-bus-reviewer`. Links, not
copies: the CLI finds `policies/reviewer.md` next to itself, and `git pull` updates everything. It
refuses to overwrite a regular file and **never edits your instructions**.

Optional, for all projects: paste [`AGENTS.snippet.md`](AGENTS.snippet.md) into
`~/.codex/AGENTS.md`. It is conditional — nothing changes until a message marked `[agent-bus]`
arrives. Project-specific limits (which checks a reviewer may run, where worktrees live) belong in
that repository's own `AGENTS.md`. Codex builds its instruction chain when it starts: restart an
open session after changing either file.

Claude Code needs no install step: enabling the plugin puts `bin/` on its Bash tool's `PATH`.

## 4. Quick start — two terminals

```sh
# Terminal 1 — the user starts the listener for a project
cd /abs/path/to/project
agent-bus serve-codex --cd "$PWD"

# Terminal 2 — what Claude Code does
AGENT_BUS_NAME=claude-demo agent-bus ask codex "Which file decides the retry policy?" --timeout 600
```

Both must see the same mailbox: `$AGENT_BUS_DIR`, default `~/.local/state/agent-bus`.

## 5. Modes

**Headless `serve-codex` — the normal mode.** For each message it runs

```sh
codex -C <dir> -s read-only -a never exec [resume <thread>] --skip-git-repo-check --json -o <out> -
```

with the policy, a header (type, sender, conversation; for a review also round, worktree, base,
head) and the message text on stdin. `<dir>` is the review's worktree, or `--cd` for a question.
The event trace goes to `logs/<id>.jsonl` on disk. Options: `--endpoint NAME` (default `codex`),
`--cd DIR` (project root; worktrees outside it are refused), `--policy FILE` (default: the shipped
reviewer policy; a message cannot choose one), `--exec-timeout S` (default 1800).
`AGENT_BUS_REPORT_THREAD=<thread id>` additionally posts a one-line "took / answered / failed"
status into that Codex chat through `codex queue`; if that fails the reply is still delivered.

**Live session — on request only.** Claiming a message renames a file and writes a receipt, so
the session needs write access to the mailbox; a read-only sandbox cannot listen. And a session
does not wake itself after it answers, so a listener that stays up is an external process anyway.
See the `agent-bus-reviewer` skill.

## 6. Protocol in one paragraph

Messages are `question`, `review` or `status`. A receipt (`acks/`) means the transport took the
message — not that anyone began work. A `review` carries a worktree, a **full** head SHA and a
round number, and is answered `VERDICT: …` / `REVIEWED_HEAD: …` / BLOCKING / NON-BLOCKING /
CHECKED. Five rounds per conversation, then the open points go to the user. `APPROVE` permits
nothing. Everything else: [`PROTOCOL.md`](../PROTOCOL.md).

## 7. Several sessions

One consumer per endpoint. Give each pair its own names — `claude-<label>` asks
`codex-<label>`, served by `agent-bus serve-codex --endpoint codex-<label>`. A second server on
an endpoint exits with `already served by pid …`. The Codex thread is kept **per conversation**
(`conversations/<id>.json`): a new ticket starts a new thread, a further round resumes the old
one. Two reviewers may read the same repository at once; only one thread is ever resumed at a
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
| exit 4 `round_limit` | the conversation has used its rounds | take the open points to the user |
| server died mid-message | the message sits in `claimed/` with no reply | `agent-bus recover <endpoint>` lists it; `--requeue <id>` runs it **again** — a person decides |
| chat report failed | `codex queue` unavailable | ignored by design; the reply is in the mailbox |

## 9. Checking an installation

- Transport only, no model call, nothing leaves the machine:
  `node --test plugins/agent-bus/test/agent-bus.test.mjs` (a fake `codex` on `PATH`).
- A real round trip, when the user wants one: the quick start above with a harmless question.

## 10. Updating and removing

`git pull` in the clone updates the CLI, policy, protocol and skill at once (they are links). Stop
the listener (Ctrl-C) before replacing the CLI under it, then start it again. `install.sh
--uninstall` removes only the links that point into this clone; the mailbox and every reply in it
are left alone — delete `~/.local/state/agent-bus` yourself when you no longer need the history.
