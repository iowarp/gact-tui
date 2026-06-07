Output "visual_loop/screenshots/semantic_expert_packs_install_failure.gif"

Set Shell "bash"
Set FontSize 14
Set Width 1500
Set Height 900

Hide
Type "bash visual_loop/run_expert_packs_stress.sh"
Enter
Show

Wait+Screen /CONVERSATION/
Sleep 1000ms

Type "/expert-packs"
Enter
Wait+Screen /Expert Packs/
Wait+Screen /Data Semantics/
Sleep 400ms

Type "i"
Wait+Screen /Install expert pack/
Wait+Screen /Enter a local pack directory/
Type "install-fail://missing-manifest"
Sleep 300ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_install_source.png"

Enter
Wait+Screen /manifest clio-pack.yaml was not found/
Sleep 500ms
Screenshot "visual_loop/screenshots/semantic_expert_packs_install_failure.png"

Type "q"
