# docs/ref — external reference studies

Read-only studies of other projects, kept for **guidance, not copying**. Each file
distills what a reference implementation does well (and badly), mapped against our
own surfaces so we can decide what's worth adopting.

These are not specs and not a backlog. They're a designer's notebook: "here is what
a mature version of this looks like, here is the reasoning, here is where we already
match and where we don't."

| File | Subject | Why it's here |
| --- | --- | --- |
| [`hermes-agent-desktop.md`](./hermes-agent-desktop.md) | NousResearch `hermes-agent` Electron desktop app | A polished, shipping open-source agentic desktop app — a model for "good" agentic UI/UX |

Source clones are NOT vendored into this repo. Re-clone on demand:

```sh
git clone --depth 1 --filter=blob:none --sparse https://github.com/NousResearch/hermes-agent.git
cd hermes-agent && git sparse-checkout set apps/desktop
```
