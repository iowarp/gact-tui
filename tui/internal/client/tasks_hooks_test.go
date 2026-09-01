package client

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/JaimeCernuda/gact-tui/contract/gact"
)

func TestSessionTaskClientEndpoints(t *testing.T) {
	var created gact.SessionTask
	var patched gact.SessionTask
	var deleted bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/sessions/s1/tasks":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"tasks": []gact.SessionTask{{ID: "task_1", SessionID: "s1", Title: "Plan", Status: "running"}},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/sessions/s1/tasks":
			if err := json.NewDecoder(r.Body).Decode(&created); err != nil {
				t.Fatalf("decode created task: %v", err)
			}
			created.ID = "task_new"
			_ = json.NewEncoder(w).Encode(created)
		case r.Method == http.MethodPatch && r.URL.Path == "/v1/tasks/task_1":
			if err := json.NewDecoder(r.Body).Decode(&patched); err != nil {
				t.Fatalf("decode patched task: %v", err)
			}
			patched.ID = "task_1"
			_ = json.NewEncoder(w).Encode(patched)
		case r.Method == http.MethodDelete && r.URL.Path == "/v1/tasks/task_1":
			deleted = true
			w.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	tasks, err := c.ListSessionTasks(t.Context(), "s1")
	if err != nil || len(tasks) != 1 || tasks[0].ID != "task_1" {
		t.Fatalf("ListSessionTasks: tasks=%#v err=%v", tasks, err)
	}
	task, err := c.CreateSessionTask(t.Context(), "s1", gact.SessionTask{Title: "Write", Status: "pending"})
	if err != nil || task.ID != "task_new" || created.Title != "Write" {
		t.Fatalf("CreateSessionTask: task=%#v created=%#v err=%v", task, created, err)
	}
	task, err = c.PatchTask(t.Context(), "task_1", gact.SessionTask{Status: "completed"})
	if err != nil || task.ID != "task_1" || patched.Status != "completed" {
		t.Fatalf("PatchTask: task=%#v patched=%#v err=%v", task, patched, err)
	}
	if err := c.DeleteTask(t.Context(), "task_1"); err != nil || !deleted {
		t.Fatalf("DeleteTask: deleted=%v err=%v", deleted, err)
	}
}

func TestHookClientEndpoints(t *testing.T) {
	var created gact.Hook
	var deleted bool
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && r.URL.Path == "/v1/hooks":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"hooks": []gact.Hook{{ID: "hook_1", Event: "tool.call.completed", Command: "notify"}},
			})
		case r.Method == http.MethodPost && r.URL.Path == "/v1/hooks":
			if err := json.NewDecoder(r.Body).Decode(&created); err != nil {
				t.Fatalf("decode created hook: %v", err)
			}
			created.ID = "hook_new"
			_ = json.NewEncoder(w).Encode(created)
		case r.Method == http.MethodDelete && r.URL.Path == "/v1/hooks/hook_1":
			deleted = true
			w.WriteHeader(http.StatusNoContent)
		default:
			http.NotFound(w, r)
		}
	}))
	defer srv.Close()

	c := New(srv.URL)
	hooks, err := c.ListHooks(t.Context())
	if err != nil || len(hooks) != 1 || hooks[0].ID != "hook_1" {
		t.Fatalf("ListHooks: hooks=%#v err=%v", hooks, err)
	}
	hook, err := c.CreateHook(t.Context(), gact.Hook{Event: "*", Command: "audit", SessionID: "s1"})
	if err != nil || hook.ID != "hook_new" || created.Event != "*" || created.SessionID != "s1" {
		t.Fatalf("CreateHook: hook=%#v created=%#v err=%v", hook, created, err)
	}
	if err := c.DeleteHook(t.Context(), "hook_1"); err != nil || !deleted {
		t.Fatalf("DeleteHook: deleted=%v err=%v", deleted, err)
	}
}
