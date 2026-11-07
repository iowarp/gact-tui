# Repository instructions

Read [CLAUDE.md](CLAUDE.md) for the repository layout, product rules and checks.

For every new tool or change to tool arguments, results or lifecycle, follow
[Adding or changing a tool](docs/tool-result-presentation.md#adding-or-changing-a-tool).
Implement its compact row and meaningful input/output presentation through the
existing declarations and shared readers. Include large-data and relevant
failure-state showcases using production components; inspect their rendered
behavior. A raw JSON dump or registration-only test is not completion.
