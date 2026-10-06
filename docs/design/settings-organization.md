# Settings organization and account scope

Settings uses a searchable sidebar grouped into Personal, Connections, Agent,
and Access & system. All 19 existing destinations remain accessible. Each page
scrolls independently of navigation. Narrow windows use a searchable section
menu; Down/Up moves from search to a result, Enter opens it, and Escape closes it.
Navigation keeps the connected service and originating workspace route.

Preference pages use label/description/control rows and compact headings.
Collection pages retain their actual tools, filters, disclosures, actions,
and service-reported details. The settings-only Frame adapter composes the
existing ReUI primitives with flat presentation; other Frame consumers and
registry components keep their styling. The component-reuse guard checks both
the Settings surfaces and their adapter. Product names and action icons use the
existing shared vocabulary.

Data sources in global Settings manages account sign-in and sign-out only.
It reads provider/account status; it never lists or modifies workspace sources.
Sign-in uses the existing private authorization UI without creating a source.
Sign-out retains the existing warning about its effect across workspaces.
Changing the connected service drops the previous private form. Folder and
dataset connection stays in workspace Attach and Files.

Connection health stays visible. Exact missing-feature reasons are available
under Unavailable features instead of forming a long warning above the controls.

## Review

Reviewed all 19 destinations against an isolated live CLIO service at 1440 x
1000, including System tabs and Marketplaces. Checked light/dark appearance,
search/empty/clear states, GitHub private form and back navigation, and the
640 x 900 section menu with keyboard search and account rows. Browser review
opened Attach without adding a source or changing account credentials.
Focused local tests ran individually for account/source separation, destination
search, narrow-menu keyboard navigation, segmented choices, and saving session
defaults. Lint and production online/offline builds passed. Full suites run in CI.

![Appearance](../screenshots/settings-organization/appearance.png)

![Account sign-in](../screenshots/settings-organization/data-source-accounts.png)

![Narrow-window accounts](../screenshots/settings-organization/narrow-data-sources.png)
