/// Minimal Server-Sent Events data-field accumulator.
///
/// The frontend reducer reads the event type from the JSON payload, so this
/// parser intentionally ignores `event:`, `id:`, `retry:`, and comments. It
/// only joins one or more `data:` lines and returns the payload when a blank
/// line terminates the SSE event.
#[derive(Default)]
pub(crate) struct SseDataAccumulator {
    data: String,
}

impl SseDataAccumulator {
    pub(crate) fn push_line(&mut self, line: &str) -> Option<String> {
        let line = line.trim_end_matches(['\r', '\n']);
        if line.is_empty() {
            if self.data.is_empty() {
                return None;
            }
            return Some(std::mem::take(&mut self.data));
        }
        if let Some(rest) = line.strip_prefix("data:") {
            if !self.data.is_empty() {
                self.data.push('\n');
            }
            self.data.push_str(rest.strip_prefix(' ').unwrap_or(rest));
        }
        None
    }
}

#[cfg(test)]
mod tests {
    use super::SseDataAccumulator;

    #[test]
    fn emits_single_data_event_on_blank_line() {
        let mut parser = SseDataAccumulator::default();
        assert_eq!(parser.push_line("data: {\"type\":\"ready\"}\n"), None);
        assert_eq!(
            parser.push_line("\n"),
            Some("{\"type\":\"ready\"}".to_string())
        );
    }

    #[test]
    fn joins_multiline_data_with_newlines() {
        let mut parser = SseDataAccumulator::default();
        parser.push_line("data: first\r\n");
        parser.push_line("data:second\n");
        assert_eq!(parser.push_line("\r\n"), Some("first\nsecond".to_string()));
    }

    #[test]
    fn ignores_non_data_fields_and_empty_events() {
        let mut parser = SseDataAccumulator::default();
        assert_eq!(parser.push_line(": heartbeat\n"), None);
        assert_eq!(parser.push_line("event: message\n"), None);
        assert_eq!(parser.push_line("id: 7\n"), None);
        assert_eq!(parser.push_line("\n"), None);
    }
}
