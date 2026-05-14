# clio_diff demo: real CLIO turn produces a unified-diff Part rendered
# inline. Driver script seeded a propose-edit turn server-side before
# invoking VHS so the screenshot lands on the diff view directly.
# Apply + reject endpoints verified end-to-end via curl (see tests/
# test_integration_v0_2/test_real_capabilities.py::test_destructive_
# tool_requests_permission); this screenshot shows the proposed-edit
# rendering after the chat path's _direct_edit_answer fired.

Output "/tmp/gact-clio-diff.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "/tmp/gact --backend $GACT_BACKEND --no-intro"
Enter
Show

Sleep 2000ms
Screenshot "/home/jcernuda/tui/screenshots/clio_diff.png"

Sleep 300ms
Type "q"
