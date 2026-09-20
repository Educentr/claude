---
name: codex-review
description: >-
  Use when a change should be reviewed by Codex before it is pushed or a pull request is opened —
  "review with Codex", "отдай на ревью Codex", "ревью через agent-bus", a fix in a risky area, or
  a project rule that every change passes an agent review. Defines the author/reviewer roles, the
  request and verdict format, the five-round limit, how to handle REQUEST_CHANGES and what
  APPROVE does and does not permit. Needs the agent-bus skill for the transport.
---

# codex-review — a review by another agent, in rounds

You are the **author**; Codex is a **read-only reviewer**. The format is specified in
`PROTOCOL.md` at the plugin root (`${CLAUDE_SKILL_DIR}/../../PROTOCOL.md`); the reviewer's side
of the contract is `policies/reviewer.md`. This skill is how the author behaves.

**Announce at the start:** "Using the codex-review skill: round N of 5."

## Before round 1

- The change is **committed** in its own worktree or branch. The reviewer reads a commit, not your
  editor. Do not touch that worktree while a round is running.
- You have your own evidence first: the check that failed before the change and passes after it,
  and the project's full run. A review is not a substitute for running the tests.
- One conversation id per change (the ticket id works). The round limit and Codex's memory of the
  earlier rounds both hang on it.

## The request

```bash
AGENT_BUS_NAME=claude-<label> agent-bus ask codex - --type review \
  --conversation <ticket> --round <N> --max-rounds 5 \
  --worktree "$(git rev-parse --show-toplevel)" \
  --base "$(git merge-base HEAD <parent-branch>)" --head "$(git rev-parse HEAD)" \
  --timeout 1800 < review-request.md > review-answer-rN.txt 2>&1
```

In the background, as in the agent-bus skill. Full SHAs, always — "look at HEAD" reviews whatever
HEAD has become by then. The request text, in this order:

1. **What broke** — the symptom and how it was observed (test, log line, ticket).
2. **Diagnosis** — the chain from symptom to cause, with file and line.
3. **The change** — what it does and what it deliberately leaves alone.
4. **Evidence** — red before / green after, full-run numbers, anything reproduced by hand.
5. **Known limits** — what is still not covered. Say it before the reviewer finds it.
6. **Questions** — the two or three places where you are least sure.
7. **What the reviewer may run** — by default nothing that touches a shared stand or a database.

From round 2 on: answer every blocking finding by its number (B1, B2, …) — fixed how, or why you
disagree — then the new head and the new evidence.

## The answer

First line `VERDICT: APPROVE` or `VERDICT: REQUEST_CHANGES`, second `REVIEWED_HEAD: <sha>`.
Check that the reviewed head is the one you sent; if it is not, the round does not count.

**REQUEST_CHANGES** — for each blocking finding decide on the merits, not on who said it:

- It is right → fix it at the root, add the check that would have caught it, re-run the full
  suite, commit, next round.
- It is wrong → say why with evidence in the next round. Do not change correct code to end a
  review.
- Never mark a finding fixed without a check that fails without the fix.

Non-blocking findings: fix the cheap ones in the same round, and record the rest where the user
will see them (the ticket, the PR body) — do not drop them silently.

**APPROVE** is the result of a review. It is **not** permission to push, merge, open a pull
request or deploy; those remain whatever the user and the project's rules say.

Exit 4 from `ask` is not a verdict — the run failed (`exec_timeout`, `bad_worktree`,
`bad_envelope`, …). Fix the cause and repeat the same round number: a run that failed does not use
up a round.

## Five rounds, then the user

The limit is per conversation, fixed by its first request (and never above the server's own cap),
and the server enforces it (`round_limit`). If round 5 still ends in
REQUEST_CHANGES, stop: list the findings still disputed, each side's argument in a sentence, and
take that to the user. Do not open a new conversation to get more rounds.

## Tell the user

One line per message in each direction (`📤 Claude → Codex: review round 2, fixed B1 by …`,
`📨 Codex → Claude: REQUEST_CHANGES — B2: …`), and at the end: the verdict, the number of rounds,
what was changed because of the review, and what was left as non-blocking.
