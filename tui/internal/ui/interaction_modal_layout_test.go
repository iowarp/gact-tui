package ui

import "testing"

func TestMainModalsShareTopCornersAndWidthExceptCompactHelp(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.height = 45
	a.settings.settingsState = settingsState{tab: 3}
	a.catalog.current = &catalogBrowserState{
		kind:  catalogKindTools,
		title: "Tools",
		items: []catalogItem{{id: "one", title: "One", desc: "first tool"}},
	}
	a.quitConfirm.open = true

	rects := map[string]mouseRect{
		"settings": overlayMouseRect(a.settings.view(), a.width, a.height),
		"catalog":  overlayMouseRect(a.catalog.view(), a.width, a.height),
		"quit":     overlayMouseRect(a.quitConfirm.view(), a.width, a.height),
	}
	want := rects["settings"]
	for name, rect := range rects {
		if rect.x != want.x || rect.y != want.y || rect.w != want.w {
			t.Fatalf("%s rect = %+v, want same top corners and width as settings %+v", name, rect, want)
		}
	}
	help := overlayMouseRect(a.help.view(), a.width, a.height)
	if help.y != want.y || help.w >= want.w {
		t.Fatalf("help rect = %+v, want compact help with shared top and narrower width than %+v", help, want)
	}
}
