# CLIO visual language

This folder holds the reference for CLIO's visual language and for implementing it
in Web and Desktop. It is a visual proposal and is not implemented yet. `develop`
is the baseline: each page labels what exists today and what would change. Each
page is self-contained HTML (Notebook dark theme). Open it in a browser. Previews
are full-page renders at 1680 px.

## Pages

| Surface                             | Page                                                               | Preview                                                                                | Covers                                                                                                                                                                                                                                                                              |
| ----------------------------------- | ------------------------------------------------------------------ | -------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Whole app                           | [full-picture.html](full-picture.html)                             | [menu map](previews/full-picture-menu-map.png)                                         | Main consolidated document: menu map, left bar, CLIO menu, top bar, settings scopes, new conversation, conversation and composer, @ menu, conversation rail, bottom bar, notifications, design rules. Summarizes passes 1 to 16.                                                    |
| Workbench: right pocket             | [workbench-right-pocket.html](workbench-right-pocket.html)         | [png](previews/workbench-right-pocket.png)                                             | Lists on a strip at the edge (Files, Sources, Artifacts, Activity, Agent, Terminal, Browser pages); tabs only for what you opened; the Activity and Agent panels; the tab menu; width as a share of the window (40%, 320 px minimum, 70% maximum) at wide, laptop and narrow sizes. |
| Workbench: tabs                     | [workbench-tabs.html](workbench-tabs.html)                         | [png](previews/workbench-tabs.png)                                                     | One tab, one frame and one renderer per format; one row of chrome; icons with names on hover. Mostly superseded by the frame bar page; the frame owning the find bar is stated only here.                                                                                           |
| Workbench: frame bar                | [workbench-frame-bar.html](workbench-frame-bar.html)               | [png](previews/workbench-frame-bar.png)                                                | The frame bar shared by every tab (path, facts, @, comments, Copy, Open); comments on every format; the same frame across nine formats; the five shared states; what to drop.                                                                                                       |
| Workbench: lineage                  | [workbench-lineage.html](workbench-lineage.html)                   | [png](previews/workbench-lineage.png)                                                  | Render, Source and Lineage views; the states (couldn't read, too large, no preview, changed elsewhere); narrow order; Browser and Terminal as renderers; strip lists; where tabs come from.                                                                                         |
| Workbench: keyboard                 | [workbench-keyboard.html](workbench-keyboard.html)                 | [Windows](previews/workbench-keyboard.png), [Mac](previews/workbench-keyboard-mac.png) | Final keyboard pass: held-key badges; lineage from the Source view; menus that show keys; the `Ctrl /` sheet; Mac keys (`⌘`); rules; changes from earlier passes.                                                                                                                   |
| Workbench: keyboard (Windows draft) | [workbench-keyboard-windows.html](workbench-keyboard-windows.html) | [png](previews/workbench-keyboard-windows.png)                                         | The earlier keyboard pass, Windows keys only. Superseded by the keyboard page except for one rule: not every action gets a chord; each one has a name in `Ctrl K` and can be reached with Tab, F6 or Shift F10.                                                                     |
| Pickers and search                  | [pickers-search.html](pickers-search.html)                         | [Windows](previews/pickers-search.png), [Mac](previews/pickers-search-mac.png)         | One picker for choosing and searching; the model picker; `Ctrl K` global palette; narrow behaviour.                                                                                                                                                                                 |
| Settings                            | [settings.html](settings.html)                                     | [png](previews/settings.png)                                                           | Settings as a window; finding a setting with global search; fields and states; per-tool permissions and I/O; plugins and agents; memory; three scopes.                                                                                                                              |
| Connect and infrastructure          | [connect-infrastructure.html](connect-infrastructure.html)         | [png](previews/connect-infrastructure.png)                                             | The CLIO connect menu, adding an agent, connecting, SSH hosts, data sources, infrastructure, service deployment, models and storage.                                                                                                                                                |
| Runs and attention                  | [runs-attention.html](runs-attention.html)                         | [png](previews/runs-attention.png)                                                     | Runs in the rail and as tabs, run states, attention, and science views as viewers in the one tab.                                                                                                                                                                                   |
| Conversation states                 | [conversation-states.html](conversation-states.html)               | [png](previews/conversation-states.png)                                                | Ask card, activity row, menus, dialog frame, states and toasts, narrow behaviour and accessibility.                                                                                                                                                                                 |

The workbench pages are numbered passes. Later pages override earlier ones where
they conflict. Read them in table order.

## Design rules

- One general component per concept, reused everywhere.
- No stacked headers and no box inside a box.
- Show icons first, with names on hover. Use an icon and a name when the icon
  isn't obvious.
- Short prose.
- Percentages over absolute sizes.
- Keyboard shortcuts everywhere, Mac compatible (`⌘` shown on a Mac).
- Nothing wraps to two lines. Use an ellipsis instead.
- Status, badge and action columns are aligned and fixed width, so hover never
  shifts them.
- Settings is a window with no back arrow. Its search is the global search
  palette.
- Carry forward previously agreed designs.

## Open questions

- What "PTC" means in the tools settings. It is currently treated as the I/O
  column (Direct, Code, Both).
- Whether browser Back should close Settings.
- Per-tool host, permission and tokens in the tool record are new; `develop`
  doesn't have them.
- Run retry is not on `develop`.
- A Settings-level Tools page is only a suggestion. On `develop`, per-tool
  settings appear only in the plugin explorer's Tools tab.

Each page also lists its own open questions.
