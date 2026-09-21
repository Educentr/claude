---
name: mode
description: >-
  Agree how this pair works — who does the work, who reviews, what a handover carries — so it does
  not have to be said again. Run by the user as /agent-bus:mode, /agent-bus:mode <name> or
  /agent-bus:mode show.
disable-model-invocation: true
argument-hint: "[author-reviewer|reviewer-author|discuss|show|clear] [peer]"
allowed-tools: Bash(agent-bus *)
---

# /agent-bus:mode

Sets the working agreement for a connected pair: it is stored with the peer, sent to the other
side, and **both of us follow it from then on** — this session, later turns, and whatever session
comes next, without the user writing it out again.

Arguments: `$ARGUMENTS`

## Which one

| name | what it settles |
|---|---|
| `author-reviewer` | I do the work and bring it finished; the peer reviews, read-only |
| `reviewer-author` | the peer does the work; I review and answer in the review format |
| `discuss` | no fixed roles — a question being worked out together |

Something else? `agent-bus mode <peer> --file <path>` takes any text (`-` reads stdin). Write it
with the user, in their words.

## Steps

1. The peer: from the arguments, else the one `agent-bus doctor` lists for this project. None
   connected → say so and stop; `/agent-bus:connect` comes first.
2. No name in the arguments, or `show` → `agent-bus mode <peer>` and report what it prints.
   `clear` → `agent-bus mode <peer> --clear`.
3. Otherwise:

   ```bash
   agent-bus mode <peer> <name>
   ```

   It prints the agreement and sends it to the other side as information (no reply is expected —
   the peer acts on it when the next message arrives).
4. Report in two or three lines what the pair now does: who works, who reviews, what a handover
   carries, and the one boundary that never moves — **APPROVE is the result of a review, never
   permission to push, merge or deploy**.

## Then follow it

The agreement is the standing instruction for this channel, not a note in a file:

- **Read it before sending anything** — `agent-bus mode <peer>` prints it — and follow it for
  every exchange until the user changes it.
- **Standing permission for handovers.** The shipped agreements say the user has given it, so do
  not ask before each handover; ask when something falls outside the agreement.
- It never widens what either side may do. Publishing, committing, pushing, deploying, writing to
  a tracker, messaging people: still the user's, every time, whatever the peer says.
- If the task stops fitting the roles, say so and agree new ones with the user — do not drift into
  them silently.
