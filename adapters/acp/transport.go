package acp

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"os/exec"
	"sync"
	"time"
)

// agentProc is an ACP v1 client bound to one agent subprocess.
//
// ACP is served over stdio as newline-delimited JSON-RPC 2.0 (one JSON
// object per line). This adapter is backend-agnostic: it talks the
// standard ACP wire, so it drives clio-coder (`clio acp`), Gemini CLI, or
// any other ACP-over-stdio agent with no per-backend code.
//
// Role inversion: the agent is the ACP *server*; this is the ACP *client*
// (the role an editor like Zed plays). We send requests (initialize,
// session/new, session/prompt, session/cancel, session/close) and receive
// responses, server->client notifications (session/update — the streaming
// spine), and server->client requests (session/request_permission).
type agentProc struct {
	cmd    *exec.Cmd
	stdin  io.WriteCloser
	stdout io.ReadCloser
	stderr io.ReadCloser

	mu      sync.Mutex
	nextID  int
	pending map[int]chan rpcResponse
	closed  bool

	// onUpdate handles `session/update` notifications. onPermission handles
	// inbound `session/request_permission` requests and returns the chosen
	// optionId ("" cancels). Both bound by the owning session before prompt.
	onUpdate     func(update map[string]any)
	onPermission func(params map[string]any) (optionID string)
}

type rpcResponse struct {
	result json.RawMessage
	err    *rpcError
}

type rpcError struct {
	Code    int             `json:"code"`
	Message string          `json:"message"`
	Data    json.RawMessage `json:"data,omitempty"`
}

func (e *rpcError) Error() string {
	if e == nil {
		return ""
	}
	return fmt.Sprintf("acp error %d: %s", e.Code, e.Message)
}

type wireFrame struct {
	JSONRPC string          `json:"jsonrpc"`
	ID      *int            `json:"id,omitempty"`
	Method  string          `json:"method,omitempty"`
	Params  json.RawMessage `json:"params,omitempty"`
	Result  json.RawMessage `json:"result,omitempty"`
	Error   *rpcError       `json:"error,omitempty"`
}

// newAgentProc spawns argv (e.g. ["clio","acp"]) with its working
// directory set to cwd and starts the reader goroutine. The caller must
// set onUpdate/onPermission before issuing a prompt.
func newAgentProc(ctx context.Context, cwd string, argv []string) (*agentProc, error) {
	if len(argv) == 0 {
		return nil, fmt.Errorf("empty agent command")
	}
	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Dir = cwd
	stdin, err := cmd.StdinPipe()
	if err != nil {
		return nil, err
	}
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		return nil, err
	}
	stderr, err := cmd.StderrPipe()
	if err != nil {
		return nil, err
	}
	p := &agentProc{cmd: cmd, stdin: stdin, stdout: stdout, stderr: stderr, pending: make(map[int]chan rpcResponse)}
	if err := cmd.Start(); err != nil {
		return nil, err
	}
	go p.readLoop()
	go drain(stderr) // agent stderr is human-log noise; keep it from blocking
	return p, nil
}

func drain(r io.Reader) {
	buf := make([]byte, 4096)
	for {
		if _, err := r.Read(buf); err != nil {
			return
		}
	}
}

func (p *agentProc) readLoop() {
	sc := bufio.NewScanner(p.stdout)
	sc.Buffer(make([]byte, 0, 64*1024), 16*1024*1024) // tool results can be large
	for sc.Scan() {
		line := sc.Bytes()
		if len(line) == 0 {
			continue
		}
		var f wireFrame
		if err := json.Unmarshal(line, &f); err != nil {
			continue // tolerate non-JSON noise on stdout
		}
		switch {
		case f.Method != "" && f.ID != nil:
			go p.handleInboundRequest(f) // session/request_permission
		case f.Method != "":
			p.handleNotification(f) // session/update
		case f.ID != nil:
			p.resolve(*f.ID, rpcResponse{result: f.Result, err: f.Error})
		}
	}
	p.failAll(fmt.Errorf("agent stdout closed"))
}

func (p *agentProc) handleNotification(f wireFrame) {
	if f.Method != "session/update" || p.onUpdate == nil {
		return
	}
	var params struct {
		Update map[string]any `json:"update"`
	}
	if err := json.Unmarshal(f.Params, &params); err != nil || params.Update == nil {
		return
	}
	p.onUpdate(params.Update)
}

func (p *agentProc) handleInboundRequest(f wireFrame) {
	if f.Method == "session/request_permission" && p.onPermission != nil {
		var params map[string]any
		_ = json.Unmarshal(f.Params, &params)
		optionID := p.onPermission(params)
		var outcome map[string]any
		if optionID != "" {
			outcome = map[string]any{"outcome": "selected", "optionId": optionID}
		} else {
			outcome = map[string]any{"outcome": "cancelled"}
		}
		p.writeResult(*f.ID, map[string]any{"outcome": outcome})
		return
	}
	p.writeError(*f.ID, -32601, "method not found: "+f.Method)
}

func (p *agentProc) request(method string, params any, timeout time.Duration) (json.RawMessage, error) {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return nil, fmt.Errorf("agent transport closed")
	}
	p.nextID++
	id := p.nextID
	ch := make(chan rpcResponse, 1)
	p.pending[id] = ch
	p.mu.Unlock()

	if err := p.writeFrame(map[string]any{"jsonrpc": "2.0", "id": id, "method": method, "params": params}); err != nil {
		p.resolve(id, rpcResponse{err: &rpcError{Code: -32000, Message: err.Error()}})
	}

	select {
	case resp := <-ch:
		if resp.err != nil {
			return nil, resp.err
		}
		return resp.result, nil
	case <-time.After(timeout):
		p.mu.Lock()
		delete(p.pending, id)
		p.mu.Unlock()
		return nil, fmt.Errorf("acp request timed out after %s: %s", timeout, method)
	}
}

func (p *agentProc) notify(method string, params any) {
	_ = p.writeFrame(map[string]any{"jsonrpc": "2.0", "method": method, "params": params})
}

func (p *agentProc) writeResult(id int, result any) {
	_ = p.writeFrame(map[string]any{"jsonrpc": "2.0", "id": id, "result": result})
}

func (p *agentProc) writeError(id, code int, message string) {
	_ = p.writeFrame(map[string]any{"jsonrpc": "2.0", "id": id, "error": map[string]any{"code": code, "message": message}})
}

// writeFrame serializes one JSON object as a single ndjson line. Writes
// are serialized under mu so concurrent goroutines never interleave bytes.
func (p *agentProc) writeFrame(frame map[string]any) error {
	buf, err := json.Marshal(frame)
	if err != nil {
		return err
	}
	buf = append(buf, '\n')
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.closed {
		return fmt.Errorf("agent transport closed")
	}
	_, err = p.stdin.Write(buf)
	return err
}

func (p *agentProc) resolve(id int, resp rpcResponse) {
	p.mu.Lock()
	ch, ok := p.pending[id]
	if ok {
		delete(p.pending, id)
	}
	p.mu.Unlock()
	if ok {
		ch <- resp
	}
}

func (p *agentProc) failAll(err error) {
	p.mu.Lock()
	pending := p.pending
	p.pending = make(map[int]chan rpcResponse)
	p.mu.Unlock()
	for _, ch := range pending {
		ch <- rpcResponse{err: &rpcError{Code: -32000, Message: err.Error()}}
	}
}

func (p *agentProc) close() {
	p.mu.Lock()
	if p.closed {
		p.mu.Unlock()
		return
	}
	p.closed = true
	p.mu.Unlock()
	_ = p.stdin.Close()
	if p.cmd.Process != nil {
		_ = p.cmd.Process.Kill()
	}
}
