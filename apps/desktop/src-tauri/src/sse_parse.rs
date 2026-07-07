//! Server-Sent Events field accumulator (WHATWG rules).
//!
//! Each line is split at the first colon into a field name and value, with one
//! optional leading space stripped from the value; consecutive `data` fields
//! accumulate with `\n` joins; a blank line dispatches the buffered event.
//! Comment lines (leading colon) and unknown fields are ignored.
//!
//! Unlike the earlier version, this captures the `id:` field so the desktop
//! bridge can surface the last event id to the frontend for `Last-Event-ID`
//! resume. The `event:` name is still not needed downstream (the reducer reads
//! the type from the JSON payload), so it is parsed-then-dropped.

/// One dispatched SSE event: the accumulated `data` payload plus the `id:`
/// value if the event carried one.
pub(crate) struct SseEvent {
    pub(crate) data: String,
    pub(crate) id: Option<String>,
}

#[derive(Default)]
pub(crate) struct SseDataAccumulator {
    data: String,
    has_data: bool,
    id: Option<String>,
}

impl SseDataAccumulator {
    pub(crate) fn push_line(&mut self, line: &str) -> Option<SseEvent> {
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            return self.dispatch();
        }
        if line.starts_with(':') {
            return None; // comment
        }
        let (field, value) = split_field(line);
        match field {
            "data" => {
                self.data.push_str(value);
                self.data.push('\n');
                self.has_data = true;
            }
            "id" => {
                self.id = Some(value.to_string());
            }
            // `event` is parsed but unused (type comes from the data JSON);
            // any other field is ignored per the SSE spec.
            _ => {}
        }
        None
    }

    /// Finalize the buffered event on a blank line. A block that accumulated
    /// no `data` field (comment- or metadata-only) does not dispatch, and its
    /// stray id/event are discarded — matching the SSE spec.
    fn dispatch(&mut self) -> Option<SseEvent> {
        if !self.has_data {
            self.reset();
            return None;
        }
        let mut data = std::mem::take(&mut self.data);
        // Drop the trailing newline the accumulator appends after each line.
        if data.ends_with('\n') {
            data.pop();
        }
        let id = self.id.take();
        self.has_data = false;
        Some(SseEvent { data, id })
    }

    fn reset(&mut self) {
        self.data.clear();
        self.has_data = false;
        self.id = None;
    }
}

/// Split an SSE line into its field name and value. With a colon, the field is
/// the text before it and the value the text after with one optional leading
/// space removed; with no colon, the whole line is a field name and the value
/// is empty.
fn split_field(line: &str) -> (&str, &str) {
    match line.find(':') {
        Some(i) => {
            let field = &line[..i];
            let value = &line[i + 1..];
            (field, value.strip_prefix(' ').unwrap_or(value))
        }
        None => (line, ""),
    }
}

#[cfg(test)]
mod tests {
    use super::SseDataAccumulator;

    #[test]
    fn emits_single_data_event_on_blank_line() {
        let mut parser = SseDataAccumulator::default();
        assert!(parser.push_line("data: {\"type\":\"ready\"}\n").is_none());
        let ev = parser.push_line("\n").expect("event on blank line");
        assert_eq!(ev.data, "{\"type\":\"ready\"}");
        assert_eq!(ev.id, None);
    }

    #[test]
    fn captures_id_field() {
        let mut parser = SseDataAccumulator::default();
        parser.push_line("id: 42\n");
        parser.push_line("event: message.created\n");
        parser.push_line("data:{\"type\":\"message.created\"}\n");
        let ev = parser.push_line("\n").expect("event");
        assert_eq!(ev.data, "{\"type\":\"message.created\"}");
        assert_eq!(ev.id.as_deref(), Some("42"));
    }

    #[test]
    fn accepts_no_space_fields() {
        let mut parser = SseDataAccumulator::default();
        parser.push_line("id:7\n");
        parser.push_line("data:{\"type\":\"x\"}\n");
        let ev = parser.push_line("\n").expect("event");
        assert_eq!(ev.data, "{\"type\":\"x\"}");
        assert_eq!(ev.id.as_deref(), Some("7"));
    }

    #[test]
    fn joins_multiline_data_with_newlines() {
        let mut parser = SseDataAccumulator::default();
        parser.push_line("data: first\r\n");
        parser.push_line("data:second\n");
        let ev = parser.push_line("\r\n").expect("event");
        assert_eq!(ev.data, "first\nsecond");
    }

    #[test]
    fn ignores_comments_unknown_fields_and_empty_events() {
        let mut parser = SseDataAccumulator::default();
        assert!(parser.push_line(": heartbeat\n").is_none());
        assert!(parser.push_line("retry: 5000\n").is_none());
        assert!(parser.push_line("x-vendor: whatever\n").is_none());
        // metadata-only block (id but no data) must not dispatch, and the
        // stray id must not leak into the next event.
        assert!(parser.push_line("id: 9\n").is_none());
        assert!(parser.push_line("\n").is_none());
        parser.push_line("data:{\"type\":\"y\"}\n");
        let ev = parser.push_line("\n").expect("event");
        assert_eq!(ev.data, "{\"type\":\"y\"}");
        assert_eq!(ev.id, None, "stray id from the dropped block must not leak");
    }

    // Provenance: this fixture is a copy of contract/testdata/sse_edge_cases.sse
    // (embedded rather than read from disk — cargo include paths across the
    // workspace root are fragile). Keep it in sync with that file; the Go and
    // TS parser tests read the on-disk original.
    const EDGE_CASES: &str = concat!(
        "id:1\n",
        "event:message.created\n",
        "data:{\"type\":\"message.created\",\"occurred_at\":\"t1\",\"payload\":{\"n\":1}}\n",
        "\n",
        "id: 2\n",
        "event: message.part.delta\n",
        "data: {\"type\":\"message.part.delta\",\"occurred_at\":\"t2\",\"payload\":{\"text\":\"hi\"}}\n",
        "\n",
        ": a comment inside a block is ignored\n",
        "id:3\n",
        "data:{\"type\":\"message.completed\",\n",
        "data:\"occurred_at\":\"t3\",\n",
        "data:\"payload\":{\"ok\":true}}\n",
        "\n",
        "retry: 5000\n",
        "x-unknown-field: ignored\n",
        "data: {\"type\":\"server.heartbeat\",\"occurred_at\":\"t4\",\"payload\":{}}\n",
        "\n",
        ": a lone comment with no data must not produce an event\n",
        "\n",
    );

    #[test]
    fn edge_case_fixture_decodes_to_four_events() {
        let mut parser = SseDataAccumulator::default();
        let mut events = Vec::new();
        for line in EDGE_CASES.split_inclusive('\n') {
            if let Some(ev) = parser.push_line(line) {
                events.push(ev);
            }
        }
        assert_eq!(events.len(), 4, "want 4 events");
        assert_eq!(events[0].id.as_deref(), Some("1"));
        assert!(events[0].data.contains("\"n\":1"));
        assert_eq!(events[1].id.as_deref(), Some("2"));
        assert!(events[1].data.contains("\"text\":\"hi\""));
        assert_eq!(events[2].id.as_deref(), Some("3"));
        // Multi-line data joined with newlines is still valid JSON.
        let v: serde_json::Value = serde_json::from_str(&events[2].data).expect("valid JSON");
        assert_eq!(v["payload"]["ok"], serde_json::json!(true));
        // Fourth event has no id: and no event: — id is None, type rides the JSON.
        assert_eq!(events[3].id, None);
        assert!(events[3].data.contains("server.heartbeat"));
    }
}
