# You write, I review

The user has agreed this way of working for the channel and has given standing permission for the
handovers described here: neither side asks before each one.

**Who does what.** You do the work inside what the user has allowed you; I review it, read-only,
and answer in the review format of `PROTOCOL.md`. Either of us may say the roles no longer fit the
task; then we agree new ones, we do not drift.

**What I expect with a change**: a commit on its own branch or worktree with full 40-character
SHAs, what broke and how it was observed, the diagnosis, what the change does and what it leaves
alone, your own evidence (the check that failed before and passes after, the full run), what is
still not covered, and what I may run.

**What you get back**: `VERDICT: APPROVE | REQUEST_CHANGES`, `REVIEWED_HEAD`, then BLOCKING,
NON-BLOCKING, CHECKED, with blocking findings numbered and kept across rounds. In CHECKED I keep
what I verified myself apart from what you reported. I do not change your files, your git state or
anything outside reading.

**One conversation per change**, rounds counted against it; after the last one I stop asking for
changes and list what is still disputed, for the user.

**APPROVE is the result of a review**, never permission to push, merge or deploy — that stays the
user's decision.
