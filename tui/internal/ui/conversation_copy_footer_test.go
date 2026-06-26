package ui

import (
	"strings"
	"testing"
)

func TestConversationFooterShowsDragCopyWhenMouseEnabled(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.focus = FocusBody
	a.MouseEnabled = true

	variants := a.chrome.footerContextHintVariants(func(key, label string) string {
		return key + " " + label
	})
	if len(variants) == 0 {
		t.Fatal("missing conversation footer variants")
	}
	joined := strings.Join(variants[0], " | ")
	if !strings.Contains(joined, "drag app copy") {
		t.Fatalf("mouse-enabled conversation footer missing drag copy hint: %q", joined)
	}
	if !strings.Contains(joined, "Alt+drag terminal select") {
		t.Fatalf("mouse-enabled conversation footer should expose native terminal selection escape hatch: %q", joined)
	}
}

func TestConversationFooterPrioritizesCopyAtDemoWidth(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusBody
	a.MouseEnabled = true

	rendered := stripANSI(a.chrome.renderFooter())
	for _, want := range []string{"y copy", "drag app copy", "Alt+drag terminal select"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("conversation footer missing %q at demo width:\n%s", want, rendered)
		}
	}
}

func TestFooterRestoresNativeSelectionHintsWhenMouseDisabled(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusInput
	a.MouseEnabled = false

	rendered := stripANSI(a.chrome.renderFooter())
	for _, notWant := range []string{"drag app copy", "Alt+drag terminal select"} {
		if strings.Contains(rendered, notWant) {
			t.Fatalf("mouse-disabled footer should not advertise TUI mouse capture affordance %q:\n%s", notWant, rendered)
		}
	}
	for _, want := range []string{"/ cmd", "? help", "Ctrl+C quit"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("mouse-disabled footer missing normal terminal hint %q:\n%s", want, rendered)
		}
	}
}

func TestInputFooterShowsDragCopyWhenMouseEnabled(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 180
	a.focus = FocusInput
	a.MouseEnabled = true

	variants := a.chrome.footerContextHintVariants(func(key, label string) string {
		return key + " " + label
	})
	if len(variants) == 0 {
		t.Fatal("missing input footer variants")
	}
	hasDragVariant := false
	hasNativeVariant := false
	for _, variant := range variants {
		joined := strings.Join(variant, " | ")
		if strings.Contains(joined, "drag app copy") {
			hasDragVariant = true
		}
		if strings.Contains(joined, "Alt+drag terminal select") {
			hasNativeVariant = true
		}
	}
	if !hasDragVariant {
		t.Fatalf("mouse-enabled input footer variants missing drag copy hint: %#v", variants)
	}
	if !hasNativeVariant {
		t.Fatalf("mouse-enabled input footer variants missing native selection hint: %#v", variants)
	}
	rendered := stripANSI(a.chrome.renderFooter())
	if !strings.Contains(rendered, "\\+Enter newline") {
		t.Fatalf("wide mouse-enabled input footer should preserve newline hint:\n%s", rendered)
	}
	if !strings.Contains(rendered, "Enter send") {
		t.Fatalf("mouse-enabled rendered input footer should preserve input send hint:\n%s", rendered)
	}
}

func TestInputFooterPrioritizesDragCopyAtDemoWidth(t *testing.T) {
	a := newReadyApp(nil, nil)
	a.width = 150
	a.focus = FocusInput
	a.MouseEnabled = true

	rendered := stripANSI(a.chrome.renderFooter())
	for _, want := range []string{"drag app copy", "Alt+drag terminal select", "Enter send"} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("mouse-enabled input footer missing %q at demo width:\n%s", want, rendered)
		}
	}
}
