# Transcript activity baseline review

The desktop workspace baseline now shows the requested reader-controlled collapsed
activity and separately spaced completion fields. The public transcript, child
dispatch, artifact, native response tray and composer remain in their causal order.

The Linux capture comes from exact-head CI for commit
`0fabdeaead4a222c71a4f92fe41cdae8fe18ca60`, workspace run
[37772877241](https://github.com/iowarp/gact-tui/actions/runs/37772877241), in its
`workspace-browser-evidence` artifact. The actual capture and pixel diff were
visually inspected before copying the baseline. SHA-256:
`f170162f809d19fd2682d7e22dee79746264533b19a7d85dd4df78847722b170`.

The Windows capture comes from the same production build and fixture in a local
Chromium run. Its actual capture and pixel diff were also visually inspected before
copying. SHA-256:
`b898884960e59b57d6bcfce2f0495e11fb24c46d03b538537047789b76bb93b7`.
The complete dense-workspace case subsequently passed against that baseline,
including the accessibility audit and native response controls. The existing
3,500-pixel tolerance is unchanged; no masking was added.

Six previously failing browser cases pass individually and sequentially with one
worker and a 1 GB Node cap. They preserve full original request/results, content-fit
short results, uncompressed sections, keyboard scrolling and closing, visible public
updates, reader disclosure retention, exact failure counts, MCP consent/validation,
agent-answer history and one live app across replacement. Fixtures simulate recorded
provider data; this is browser presentation/interaction evidence, not live inference
or native Desktop setup acceptance.
