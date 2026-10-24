package gact

import (
	"encoding/json"
	"testing"
)

func TestPluginAgentDecodesUserAgentDelta(t *testing.T) {
	var out struct {
		Agents []PluginAgent `json:"agents"`
	}
	if err := json.Unmarshal([]byte(`{"agents": [
		{"ref": "clio/standard", "id": "standard", "name": "CLIO", "kind": "agent",
		 "flow": {"id": "react", "options": {}}, "plugins": [{"ref": "core", "layer": "agent"}]},
		{"ref": "user/mine", "id": "mine", "name": "Mine", "kind": "user",
		 "extends": "clio/standard", "delta": {"add": ["hdf5"], "remove": ["xlsx"]}}
	]}`), &out); err != nil {
		t.Fatalf("decode agents: %v", err)
	}
	if len(out.Agents) != 2 || out.Agents[0].Ref != "clio/standard" || out.Agents[0].Delta != nil {
		t.Fatalf("agents = %+v", out.Agents)
	}
	user := out.Agents[1]
	if user.Kind != "user" || user.Extends != "clio/standard" || user.Delta == nil ||
		len(user.Delta.Add) != 1 || user.Delta.Remove[0] != "xlsx" {
		t.Fatalf("user agent = %+v", user)
	}
}

func TestPluginAgentDefinitionNamesTheRef(t *testing.T) {
	def := PluginAgent{Ref: "user/mine", ID: "mine", Kind: "user", Extends: "clio/standard"}.Definition()
	if def.ID != "user/mine" || def.Title != "mine" || def.Source != "user" || !def.Enabled || def.Metadata["extends"] != "clio/standard" {
		t.Fatalf("definition = %+v", def)
	}
	if got := (PluginAgent{Ref: "clio/standard", ID: "standard", Name: "CLIO"}).Definition(); got.Source != "plugin" || got.Title != "CLIO" {
		t.Fatalf("installed definition = %+v", got)
	}
}
