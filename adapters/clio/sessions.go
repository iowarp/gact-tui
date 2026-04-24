package clio

// Placeholder — adapter-owned session registry.
//
// CLIO doesn't maintain a server-side session list (session_id is
// just a UUID the caller invents). GACT clients expect to CRUD
// sessions, so the adapter keeps an in-memory registry backed by
// clio-sessions.json under ~/.config/gact/.
//
// TODO (CLIO-BBBBBBBBBB Phase 1):
//   - type SessionStore interface { Create(...) Session; Get(sid) (Session, bool); List() []Session; Delete(sid) error }
//   - type Session struct { ID, Title, CreatedAt, LastUsedAt; Status string }
//   - file-backed impl that flushes on change, reloads on restart.
//   - On POST /v1/sessions/{sid}/messages, update LastUsedAt +
//     Status while the turn runs.
