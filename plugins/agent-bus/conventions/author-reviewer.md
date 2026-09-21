# I write, you review

The user has agreed this way of working for the channel and has given standing permission for the
handovers described here: neither side asks before each one.

**Who does what.** I do the work and bring it to you finished. You review it, read-only, and I take
your findings seriously. Either of us may say the roles no longer fit the task; then we agree new
ones, we do not drift.

**What a handover is.** A commit on its own branch or worktree, never my editor's contents, with my
own evidence already in hand: the check that failed before the change and passes after it, and the
project's full run. A review is not a substitute for running the tests.

**The request says**, in this order: what broke and how it was observed; the chain from symptom to
cause, with file and line; what the change does and what it deliberately leaves alone; the
evidence; what is still not covered; the two or three places I am least sure about; and what you
may run — by default nothing that touches a shared stand or a database.

**One conversation per change** (the ticket id works), full 40-character SHAs, rounds counted
against that conversation. After the last round the disputed points go to the user rather than into
another round.

**Blocking findings are answered on their merits.** Right → fixed at the root, with a check that
fails without the fix, then the next round. Wrong → I say why, with evidence; I do not change
correct code to end a review. Non-blocking: the cheap ones now, the rest written where the user
will see them.

**APPROVE is the result of a review.** It is not permission to push, merge, open a pull request or
deploy — those stay the user's decisions, and on this channel nobody takes them for them.
