package ui

import "testing"

func TestClassifyExecutionObservationLine(t *testing.T) {
	tests := []struct {
		name string
		line string
		want executionObservationLineKind
	}{
		{
			name: "diff add",
			line: "+ Site,Latitude,(deg)",
			want: executionObservationLineAdded,
		},
		{
			name: "diff remove",
			line: "- Site,Latitude,(deg),Height",
			want: executionObservationLineRemoved,
		},
		{
			name: "collapsed output affordance",
			line: "Ctrl+E full preview",
			want: executionObservationLineAffordance,
		},
		{
			name: "csv header",
			line: "Site,Latitude,(deg),Longitude,(deg)",
			want: executionObservationLineTable,
		},
		{
			name: "pipe table",
			line: "station | distance | status",
			want: executionObservationLineTable,
		},
		{
			name: "plain filename with one comma",
			line: "report, final.csv",
			want: executionObservationLinePlain,
		},
		{
			name: "plain summary",
			line: "prepared earthscope_stations_clean.csv",
			want: executionObservationLinePlain,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			if got := classifyExecutionObservationLine(tt.line); got != tt.want {
				t.Fatalf("classifyExecutionObservationLine(%q) = %v, want %v", tt.line, got, tt.want)
			}
		})
	}
}
