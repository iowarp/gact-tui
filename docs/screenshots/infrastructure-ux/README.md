# Infrastructure review

These are actual Chromium captures of production Infrastructure components with
labelled **simulated repository inputs**. The review uses the generic workspace brand;
CLIO's build selects its own vocabulary. No live host, authentication, model download
or native setup is invoked by this fixture.

Twelve views passed at 1280×900, 960×960 and 390×844: Overview, Agent hosts, Tools and
Models & storage. Checks require actual host facts, warning counts, collapsed ready
groups, the selected Collect contract, the tool browser interaction, ordinary Windows
path display, loaded Inter/JetBrains fonts and no document/main horizontal overflow.
The four retained captures are byte-identical to the final review outputs.

| Capture | What it shows |
| --- | --- |
| [Overview at 960px](overview-narrow-fixture.png) | Host topology, actual capability facts and saved provider server |
| [Host warnings at 390px](agent-mobile-fixture.png) | Expanded warnings, readable titles and collapsed ready group |
| [Tools at 390px](tools-mobile-fixture.png) | Blue list action above Collect, full card section separators |
| [Models at 960px](models-narrow-fixture.png) | Machine facts, enabled download action and clean storage path |

Run the isolated review server from the repository root:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=2048'
pnpm --dir web exec vite --config tests/review/infrastructure-ux-vite.config.mts --host 127.0.0.1 --port 5214
```

In another terminal, run the sequential browser checks and then stop that server:

```powershell
$env:NODE_OPTIONS='--max-old-space-size=1024'
pnpm --dir web exec node tests/review/infrastructure-ux-check.mjs
```

Seven focused frontend cases passed individually with one worker. They additionally
cover native versus remote/tunneled folder selection, decoded machine facts, canonical
saved provider records, live sandbox warning-count reconciliation and displayed setup
verdicts. App TypeScript, scoped Oxlint/ESLint/format and all six frontend guards pass.

The native directory dialog is verified through its test-only plugin boundary.
Fresh native elevation/fence setup and a live Ares download still require acceptance in
a built Desktop with the corresponding core changes from CLIO PR1658.
