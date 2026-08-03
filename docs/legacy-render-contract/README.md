# Legacy render contract (superseded)

These documents were the acceptance contract for the **Solid** web client that
the Session v3 rebuild replaces (gact-tui#322):

- `CANONICAL-CONVERSATION.md` — the owner-locked render target for the old
  transcript grammar.
- `RENDERING_SPEC.md` — the rendering rules that grammar depended on.
- `DESIGN.md` — the old client's design notes.

They are **preserved, not deleted**, for two reasons:

1. They are an owner-locked artifact. Superseding them is an owner decision,
   and the P4 phase gate calls for `CANONICAL-SESSION-V3` to be **regenerated
   from live captures** and locked in their place — not for the contract to
   simply vanish.
2. Repo skills still cite them by path (`gact-architecture-contract`,
   `gact-debugging-playbook`, `gact-interface-parity-campaign`). Deleting them
   outright would leave those references dangling with no forwarding address.

They no longer describe any shipping surface: the tree they asserted against
(`apps/web/src/components`, `apps/web/src/routes`) is gone. Treat them as
history until `CANONICAL-SESSION-V3` replaces them.
