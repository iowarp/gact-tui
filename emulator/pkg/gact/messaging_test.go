package gact

import (
	"encoding/json"
	"reflect"
	"testing"
)

func TestAgentDefDefaultModelAcceptsStringOrObject(t *testing.T) {
	tests := []struct {
		name       string
		body       string
		providerID string
		modelID    string
	}{
		{
			name:    "string",
			body:    `{"id":"skill","title":"Skill","default_model":"qwopus3.5-9b-v3"}`,
			modelID: "qwopus3.5-9b-v3",
		},
		{
			name:       "object",
			body:       `{"id":"skill","title":"Skill","default_model":{"provider_id":"lm_studio","model_id":"qwopus3.5-9b-v3"}}`,
			providerID: "lm_studio",
			modelID:    "qwopus3.5-9b-v3",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var agent AgentDef
			if err := json.Unmarshal([]byte(tc.body), &agent); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if agent.DefaultModel == nil {
				t.Fatal("default_model decoded nil")
			}
			if agent.DefaultModel.ProviderID != tc.providerID {
				t.Fatalf("provider_id = %q, want %q", agent.DefaultModel.ProviderID, tc.providerID)
			}
			if agent.DefaultModel.ModelID != tc.modelID {
				t.Fatalf("model_id = %q, want %q", agent.DefaultModel.ModelID, tc.modelID)
			}
		})
	}
}

func TestAgentDefParametersAcceptArrayOrObject(t *testing.T) {
	tests := []struct {
		name string
		body string
		want []AgentParameter
	}{
		{
			name: "array",
			body: `{"id":"skill","title":"Skill","parameters":[{"name":"path","type":"string","required":true}]}`,
			want: []AgentParameter{{Name: "path", Type: "string", Required: true}},
		},
		{
			name: "object",
			body: `{"id":"skill","title":"Skill","parameters":{"limit":{"type":"number","description":"Rows"},"path":"ignored"}}`,
			want: []AgentParameter{
				{Name: "limit", Type: "number", Description: "Rows"},
				{Name: "path", Type: "string"},
			},
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			var agent AgentDef
			if err := json.Unmarshal([]byte(tc.body), &agent); err != nil {
				t.Fatalf("unmarshal: %v", err)
			}
			if len(agent.Parameters) != len(tc.want) {
				t.Fatalf("len(parameters) = %d, want %d", len(agent.Parameters), len(tc.want))
			}
			if !reflect.DeepEqual(agent.Parameters, tc.want) {
				t.Fatalf("parameters = %#v, want %#v", agent.Parameters, tc.want)
			}
		})
	}
}
