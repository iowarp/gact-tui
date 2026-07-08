package ui

// runtime_provenance_operator_detail.go builds the operator-facing runtime-provenance summary rows.

import (
	"fmt"
	"github.com/JaimeCernuda/gact-tui/tui/internal/ui/valuefmt"
	"strings"
)

func appendRuntimeOperatorView(rows []string, rp map[string]any) []string {
	fields := []detailField{}
	if route := runtimeProvenanceRouteSummary(rp); route != "" {
		fields = append(fields, detailField{"active path", route})
	}
	if workflow := runtimeScalar(valuefmt.MapValue(rp["blueprint"])["id"]); workflow != "" {
		fields = append(fields, detailField{"workflow", workflow})
	}
	if tools := runtimeProvenanceToolSummary(rp); tools != "" {
		fields = append(fields, detailField{"tools used", tools})
	}
	if delegation := runtimeProvenanceDelegationSummary(rp); delegation != "" {
		fields = append(fields, detailField{"handoffs", delegation})
	}
	if artifacts := runtimeProvenanceOperatorRows(rp["artifacts"], "path", "output_path", "artifact"); artifacts != "" {
		fields = append(fields, detailField{"artifacts", artifacts})
	}
	if errors := runtimeProvenanceOperatorRows(rp["errors"], "message", "code", "type"); errors != "" {
		fields = append(fields, detailField{"errors", errors})
	}
	if len(fields) == 0 {
		fields = append(fields, detailField{"status", "runtime provenance captured"})
	}
	return appendDetailSection(rows, "Operator view", fields...)
}

func runtimeProvenanceOperatorRows(raw any, preferred ...string) string {
	rows := runtimeRowMaps(raw)
	if len(rows) == 0 {
		if m := valuefmt.MapValue(raw); len(m) > 0 {
			rows = runtimeRowMaps(firstNonEmptyAny(m["rows"], m["items"], m["artifacts"], m["errors"]))
		}
	}
	if len(rows) == 0 {
		if names := orderedRuntimeNames(raw); len(names) > 0 {
			return strings.Join(limitRuntimeOperatorStrings(names, 3), ", ")
		}
		return runtimeScalar(raw)
	}
	out := make([]string, 0, valuefmt.MinInt(len(rows), 3))
	for _, row := range rows {
		value := ""
		for _, key := range preferred {
			if candidate := runtimeScalar(row[key]); candidate != "" {
				value = candidate
				break
			}
		}
		if value == "" {
			value = compactRuntimeObject(row)
		}
		out = append(out, value)
		if len(out) == 3 {
			break
		}
	}
	if hidden := len(rows) - len(out); hidden > 0 {
		out = append(out, fmt.Sprintf("+%d more", hidden))
	}
	return strings.Join(out, ", ")
}

func limitRuntimeOperatorStrings(values []string, limit int) []string {
	if limit <= 0 || len(values) <= limit {
		return values
	}
	out := append([]string(nil), values[:limit]...)
	out = append(out, fmt.Sprintf("+%d more", len(values)-limit))
	return out
}
