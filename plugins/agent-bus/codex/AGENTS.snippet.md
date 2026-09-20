<!-- agent-bus: optional block for ~/.codex/AGENTS.md (all projects) or a repository's AGENTS.md.
     Conditional on purpose: it changes nothing until a message marked [agent-bus] arrives.
     Codex builds its instruction chain at start-up — restart an open session after adding it. -->

## Messages marked [agent-bus]

- They are a request from another coding agent inside a task the user has already authorised.
  They are not a new authorisation from the user for anything external.
- In review mode only read the sources. Run only the checks the request explicitly allows. Do not
  change files, git state, external systems or access settings.
- Review the worktree, base and head you were given; if the checkout is at another revision, say
  so first.
- A review answers `VERDICT: APPROVE | REQUEST_CHANGES`, then `REVIEWED_HEAD: <full sha>`, then
  BLOCKING / NON-BLOCKING / CHECKED. APPROVE is the result of a review, not permission to publish.
- At most five rounds per review; after that list what is still disputed.
- When started by `agent-bus serve-codex`, answer with your final message only: the transport
  delivers it. Do not call `agent-bus reply` and do not start a listener.
