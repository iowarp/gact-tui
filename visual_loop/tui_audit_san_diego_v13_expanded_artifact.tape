Output "visual_loop/screenshots/tui_audit_san_diego_v13_expanded_artifact.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "clear && cat visual_loop/tui_audit_san_diego_alcf_execution_projection_v13/b_expanded_artifact_rendered.txt"
Enter
Show

Wait+Screen /Artifact .*P475.CI.LY_.20_timeseries.png/
Screenshot "visual_loop/screenshots/tui_audit_san_diego_v13_expanded_artifact.png"
Sleep 300ms
