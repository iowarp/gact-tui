package ui

import (
	"strconv"
	"testing"

	tea "charm.land/bubbletea/v2"
)

func TestLMConfigAdvancedRowsUseVerticalNavigation(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0 // LM Studio exposes temperature/max output/context length.
	a.lmConfig.field = lmFieldTemperature
	a.lmConfig.temperature = "1.0"
	a.lmConfig.maxTokens = "4096"
	a.lmConfig.contextLength = "32768"
	a.lmConfig.parallel = "2"

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.lmConfig.field != lmFieldMaxTokens {
		t.Fatalf("down should move from temperature to max output, got %v", a.lmConfig.field)
	}
	if a.lmConfig.temperature != "1.0" {
		t.Fatalf("down should not adjust temperature, got %q", a.lmConfig.temperature)
	}

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyDown})
	if a.lmConfig.field != lmFieldContextLength {
		t.Fatalf("down should move from max output to context length, got %v", a.lmConfig.field)
	}

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyUp})
	if a.lmConfig.field != lmFieldMaxTokens {
		t.Fatalf("up should move from context length to max output, got %v", a.lmConfig.field)
	}

	_, _ = a.lmConfig.handleKey(tea.KeyPressMsg{Code: tea.KeyRight})
	if a.lmConfig.field != lmFieldMaxTokens {
		t.Fatalf("right should keep focus on max output, got %v", a.lmConfig.field)
	}
	if a.lmConfig.maxTokens != "4608" {
		t.Fatalf("right should adjust max output by one step, got %q", a.lmConfig.maxTokens)
	}
}

func TestLMConfigAdvancedArrowTargetsAdjustValues(t *testing.T) {
	cases := []struct {
		name       string
		selected   int
		field      lmConfigField
		start      func(*App)
		afterInc   func(*testing.T, *App)
		afterDec   func(*testing.T, *App)
		fieldLabel string
	}{
		{
			name:       "temperature",
			selected:   0,
			field:      lmFieldTemperature,
			fieldLabel: "temperature",
			start:      func(a *App) { a.lmConfig.temperature = "1.0" },
			afterInc: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.temperature != "1.1" {
					t.Fatalf("increment temperature = %q, want 1.1", a.lmConfig.temperature)
				}
			},
			afterDec: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.temperature != "1.0" {
					t.Fatalf("decrement temperature = %q, want 1.0", a.lmConfig.temperature)
				}
			},
		},
		{
			name:       "max output",
			selected:   0,
			field:      lmFieldMaxTokens,
			fieldLabel: "max output",
			start:      func(a *App) { a.lmConfig.maxTokens = "4096" },
			afterInc: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.maxTokens != "4608" {
					t.Fatalf("increment max output = %q, want 4608", a.lmConfig.maxTokens)
				}
			},
			afterDec: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.maxTokens != "4096" {
					t.Fatalf("decrement max output = %q, want 4096", a.lmConfig.maxTokens)
				}
			},
		},
		{
			name:       "context length",
			selected:   0,
			field:      lmFieldContextLength,
			fieldLabel: "context length",
			start:      func(a *App) { a.lmConfig.contextLength = "32768" },
			afterInc: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.contextLength != "36864" {
					t.Fatalf("increment context length = %q, want 36864", a.lmConfig.contextLength)
				}
			},
			afterDec: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.contextLength != "32768" {
					t.Fatalf("decrement context length = %q, want 32768", a.lmConfig.contextLength)
				}
			},
		},
		{
			name:       "thinking budget",
			selected:   2,
			field:      lmFieldThinkingBudget,
			fieldLabel: "thinking budget",
			start:      func(a *App) { a.lmConfig.thinkingBudget = "2048" },
			afterInc: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.thinkingBudget != "3072" {
					t.Fatalf("increment thinking budget = %q, want 3072", a.lmConfig.thinkingBudget)
				}
			},
			afterDec: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.thinkingBudget != "2048" {
					t.Fatalf("decrement thinking budget = %q, want 2048", a.lmConfig.thinkingBudget)
				}
			},
		},
		{
			name:       "parallel requests",
			selected:   0,
			field:      lmFieldParallel,
			fieldLabel: "parallel requests",
			start:      func(a *App) { a.lmConfig.parallel = "2" },
			afterInc: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.parallel != "3" {
					t.Fatalf("increment parallel = %q, want 3", a.lmConfig.parallel)
				}
			},
			afterDec: func(t *testing.T, a *App) {
				t.Helper()
				if a.lmConfig.parallel != "2" {
					t.Fatalf("decrement parallel = %q, want 2", a.lmConfig.parallel)
				}
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			a := newLMConfigTestApp()
			a.MouseEnabled = true
			a.lmConfig.selected = tc.selected
			a.lmConfig.field = tc.field
			a.lmConfig.temperature = "1.0"
			a.lmConfig.maxTokens = "4096"
			a.lmConfig.contextLength = "32768"
			a.lmConfig.thinkingBudget = "2048"
			a.lmConfig.parallel = "2"
			tc.start(a)

			targetID := "lm-config:advanced:" + strconv.Itoa(int(tc.field))
			_ = a.View()
			target, ok := findHitTargetForTest(a, targetID+":inc")
			if !ok {
				t.Fatalf("missing semantic LM %s increment target", tc.fieldLabel)
			}
			if target.rect.w <= 1 {
				t.Fatalf("advanced increment hit width = %d, want wider than glyph-only", target.rect.w)
			}
			model, cmd := a.Update(tea.MouseClickMsg(tea.Mouse{
				X:      target.rect.x + target.rect.w/2,
				Y:      target.rect.y,
				Button: tea.MouseLeft,
			}))
			a = model.(*App)

			if cmd != nil {
				t.Fatal("advanced increment click should not dispatch a command")
			}
			if a.lmConfig.field != tc.field {
				t.Fatalf("field = %v, want %v", a.lmConfig.field, tc.field)
			}
			tc.afterInc(t, a)

			_ = a.View()
			target, ok = findHitTargetForTest(a, targetID+":dec")
			if !ok {
				t.Fatalf("missing semantic LM %s decrement target", tc.fieldLabel)
			}
			if target.rect.w <= 1 {
				t.Fatalf("advanced decrement hit width = %d, want wider than glyph-only", target.rect.w)
			}
			model, cmd = a.Update(tea.MouseClickMsg(tea.Mouse{
				X:      target.rect.x + target.rect.w/2,
				Y:      target.rect.y,
				Button: tea.MouseLeft,
			}))
			a = model.(*App)

			if cmd != nil {
				t.Fatal("advanced decrement click should not dispatch a command")
			}
			if a.lmConfig.field != tc.field {
				t.Fatalf("field = %v, want %v", a.lmConfig.field, tc.field)
			}
			tc.afterDec(t, a)
		})
	}
}

func TestLMConfigAdvancedRowsAndHitsShareOrdering(t *testing.T) {
	a := newLMConfigTestApp()
	a.lmConfig.selected = 0 // LM Studio exposes temperature/max output/context length.
	a.lmConfig.field = lmFieldTemperature
	a.lmConfig.temperature = "1.0"
	a.lmConfig.maxTokens = "4096"
	a.lmConfig.contextLength = "32768"
	a.lmConfig.parallel = "2"

	rows, hits := a.lmConfig.renderAdvancedRowsAndHits(60)
	if len(rows) != 4 {
		t.Fatalf("advanced rows = %d, want 4", len(rows))
	}
	if len(hits) != len(rows)*3 {
		t.Fatalf("advanced hits = %d, want %d", len(hits), len(rows)*3)
	}
	for row := range rows {
		base := row * 3
		for i := 0; i < 3; i++ {
			if hits[base+i].row != row {
				t.Fatalf("hit %d row = %d, want %d", base+i, hits[base+i].row, row)
			}
		}
	}
	wantID := "lm-config:advanced:" + strconv.Itoa(int(lmFieldTemperature))
	if hits[0].id != wantID {
		t.Fatalf("first advanced hit id = %q, want %q", hits[0].id, wantID)
	}
}
