package server

// SPEC §6.18 session tasks (MMM5). In-memory task tracking per session
// for backends that fan out subagents or plan multi-step work.

import (
	"net/http"
	"sync"
	"time"

	"github.com/JaimeCernuda/gact-tui/emulator/pkg/gact"
	"github.com/google/uuid"
)

type tasksStore struct {
	mu    sync.RWMutex
	tasks map[string]*gact.SessionTask // by id
}

func newTasksStore() *tasksStore {
	return &tasksStore{tasks: map[string]*gact.SessionTask{}}
}

func (t *tasksStore) listForSession(sid string) []gact.SessionTask {
	t.mu.RLock()
	defer t.mu.RUnlock()
	out := make([]gact.SessionTask, 0)
	for _, tk := range t.tasks {
		if tk.SessionID == sid {
			out = append(out, *tk)
		}
	}
	return out
}

func (t *tasksStore) create(tk gact.SessionTask) gact.SessionTask {
	t.mu.Lock()
	defer t.mu.Unlock()
	now := time.Now().UTC()
	if tk.ID == "" {
		tk.ID = "tsk_" + uuid.NewString()[:24]
	}
	if tk.CreatedAt.IsZero() {
		tk.CreatedAt = now
	}
	tk.UpdatedAt = now
	if tk.Status == "" {
		tk.Status = "pending"
	}
	cp := tk
	t.tasks[tk.ID] = &cp
	return cp
}

func (t *tasksStore) patch(id string, patch gact.SessionTask) (*gact.SessionTask, bool) {
	t.mu.Lock()
	defer t.mu.Unlock()
	cur, ok := t.tasks[id]
	if !ok {
		return nil, false
	}
	if patch.Title != "" {
		cur.Title = patch.Title
	}
	if patch.Status != "" {
		cur.Status = patch.Status
	}
	if patch.Metadata != nil {
		cur.Metadata = patch.Metadata
	}
	cur.UpdatedAt = time.Now().UTC()
	cp := *cur
	return &cp, true
}

func (t *tasksStore) delete(id string) bool {
	t.mu.Lock()
	defer t.mu.Unlock()
	if _, ok := t.tasks[id]; !ok {
		return false
	}
	delete(t.tasks, id)
	return true
}

// --- HTTP handlers ---------------------------------------------------------

type tasksListBody struct {
	Tasks []gact.SessionTask `json:"tasks"`
}

func (s *Server) handleListSessionTasks(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	if _, err := s.store.GetSession(sid); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	writeJSON(w, http.StatusOK, tasksListBody{Tasks: s.tasks.listForSession(sid)})
}

func (s *Server) handleCreateSessionTask(w http.ResponseWriter, r *http.Request) {
	sid := r.PathValue("id")
	if _, err := s.store.GetSession(sid); err != nil {
		writeStoreError(w, err, "session_not_found", "invalid_session")
		return
	}
	var req gact.SessionTask
	if !decodeJSON(w, r, &req) {
		return
	}
	if req.Title == "" {
		writeError(w, http.StatusBadRequest, "invalid_body", "title required")
		return
	}
	req.SessionID = sid
	created := s.tasks.create(req)
	writeJSON(w, http.StatusCreated, created)
}

func (s *Server) handlePatchTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	var req gact.SessionTask
	if !decodeJSON(w, r, &req) {
		return
	}
	updated, ok := s.tasks.patch(id, req)
	if !ok {
		writeError(w, http.StatusNotFound, "task_not_found", "no task with id "+id)
		return
	}
	writeJSON(w, http.StatusOK, updated)
}

func (s *Server) handleDeleteTask(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("id")
	if !s.tasks.delete(id) {
		writeError(w, http.StatusNotFound, "task_not_found", "no task with id "+id)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
