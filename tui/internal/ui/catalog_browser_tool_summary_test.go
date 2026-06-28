package ui

import (
	"strings"
	"testing"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
)

func TestToolSummaryOmitsRepeatedCommandDescription(t *testing.T) {
	got := toolSummary(gact.Tool{
		ID:          "parquet_compute_statistics",
		Name:        "parquet_compute_statistics",
		Description: "parquet_compute_statistics",
		ServerID:    "facility-data",
		Tags:        []string{"parquet", "statistics"},
	})

	if strings.Contains(got, "parquet_compute_statistics") {
		t.Fatalf("tool summary should omit repeated command-name description: %q", got)
	}
	for _, want := range []string{"connection: facility-data", "tagged: parquet, statistics"} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool summary missing useful metadata %q: %q", want, got)
		}
	}
}

func TestToolCatalogDescriptionUsesOperationalMetadata(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:                "parquet_compute_statistics",
		Name:              "parquet_compute_statistics",
		Description:       "Compute summary statistics for one Parquet column.\n\nAgent story: use this after schema inspection.",
		PermissionDefault: "ask",
		Owner:             "analysis",
		Tags:              []string{"parquet", "statistics", "tabular", "science"},
		VisibleTo:         []string{"analysis", "planner"},
		InputSchema: map[string]any{
			"properties": map[string]any{
				"filepath": map[string]any{"type": "string"},
				"column":   map[string]any{"type": "string"},
				"limit":    map[string]any{"type": "integer"},
				"method":   map[string]any{"type": "string"},
				"sample":   map[string]any{"type": "integer"},
			},
		},
	})

	for _, want := range []string{
		"owned by analysis",
		"asks first",
		"needs column, filepath, +3 more",
		"tagged parquet",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool catalog description missing %q: %q", want, got)
		}
	}
	for _, notWant := range []string{"owner:", "permission:", "inputs:", "tags:"} {
		if strings.Contains(got, notWant) {
			t.Fatalf("tool catalog description leaked backend label %q: %q", notWant, got)
		}
	}
	if strings.Contains(got, "Agent story") {
		t.Fatalf("catalog summary should omit long agent-story prose: %q", got)
	}
	if strings.Contains(got, "Compute summary statistics") {
		t.Fatalf("catalog summary should prefer operational metadata over prose when metadata exists: %q", got)
	}
}

func TestToolCatalogDescriptionOmitsRepeatedCommandName(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:                "parquet_compute_statistics",
		Name:              "parquet_compute_statistics",
		Description:       "parquet_compute_statistics",
		PermissionDefault: "ask",
		Owner:             "analysis",
	})

	if strings.Contains(got, "parquet_compute_statistics") {
		t.Fatalf("catalog description should omit repeated command-name description: %q", got)
	}
	for _, want := range []string{"owned by analysis", "asks first"} {
		if !strings.Contains(got, want) {
			t.Fatalf("tool catalog description missing fallback metadata %q: %q", want, got)
		}
	}
}

func TestToolCatalogDescriptionUsesPurposeWhenMetadataMissing(t *testing.T) {
	got := toolCatalogDescription(gact.Tool{
		ID:          "fetch_url",
		Name:        "fetch_url",
		Description: "Fetch a URL and return its response body.\n\nAgent story: useful for docs.",
	})

	if got != "Fetch a URL and return its response body." {
		t.Fatalf("fallback purpose = %q", got)
	}
}
