// Command gact-acp-adapter is a single-binary GACT v0.2 adapter that
// fronts any ACP v1 agent. It serves the GACT REST + SSE wire to a TUI /
// web / desktop client and translates each session into an agent
// subprocess speaking ACP over stdio.
//
//	# drive clio-coder (installed on PATH)
//	gact-acp-adapter --port 8123 --cwd /path/to/repo
//
//	# drive a source checkout of clio-coder via node
//	gact-acp-adapter --port 8123 --cwd /path/to/repo -- node /abs/dist/cli/index.js acp
//
//	# drive any other ACP agent
//	gact-acp-adapter --port 8123 --cwd /path/to/repo -- some-agent acp
//
// With no trailing command it launches `clio acp` from $PATH. Anything
// after `--` overrides the launch command.
package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/JaimeCernuda/gact-tui/adapters/acp"
)

func main() {
	port := flag.Int("port", 8123, "TCP port to listen on for GACT clients")
	host := flag.String("host", "127.0.0.1", "bind interface")
	cwd := flag.String("cwd", "", "workspace root passed to the agent (defaults to $PWD)")
	flag.Parse()

	if *cwd == "" {
		wd, err := os.Getwd()
		if err != nil {
			log.Fatalf("getwd: %v", err)
		}
		*cwd = wd
	}

	argv := flag.Args() // everything after `--`
	if len(argv) == 0 {
		argv = []string{"clio", "acp"}
	}

	srv := acp.New(*cwd, argv)
	defer srv.Close()

	httpServer := &http.Server{
		Addr:              fmt.Sprintf("%s:%d", *host, *port),
		Handler:           srv.Handler(),
		ReadHeaderTimeout: 5 * time.Second,
	}

	errCh := make(chan error, 1)
	go func() {
		log.Printf("ACP→GACT bridge on %s:%d -> cwd=%s launch=%v", *host, *port, *cwd, argv)
		if err := httpServer.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			errCh <- err
		}
		close(errCh)
	}()

	sig := make(chan os.Signal, 1)
	signal.Notify(sig, syscall.SIGINT, syscall.SIGTERM)
	select {
	case sg := <-sig:
		log.Printf("received %s, shutting down", sg)
	case err := <-errCh:
		if err != nil {
			log.Fatalf("server error: %v", err)
		}
	}

	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = httpServer.Shutdown(ctx)
}
