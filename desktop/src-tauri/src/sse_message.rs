use serde::Serialize;

/// One message pushed to the frontend channel. `kind` discriminates:
/// `open` (stream connected), `event` (a parsed SSE event where `data`
/// carries the JSON envelope the reducer expects and `id` carries the
/// SSE `id:` value when present, so the frontend can echo it as
/// `Last-Event-ID` on reconnect), `error` (transport failure so the
/// frontend should back off + reconnect), `closed` (stream ended cleanly
/// / was stopped).
#[derive(Clone, Serialize)]
pub struct SseMessage {
    pub(crate) kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) data: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub(crate) id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    message: Option<String>,
}

impl SseMessage {
    pub(crate) fn open() -> Self {
        Self {
            kind: "open".into(),
            data: None,
            id: None,
            message: None,
        }
    }

    pub(crate) fn event(data: String, id: Option<String>) -> Self {
        Self {
            kind: "event".into(),
            data: Some(data),
            id,
            message: None,
        }
    }

    pub(crate) fn error(msg: String) -> Self {
        Self {
            kind: "error".into(),
            data: None,
            id: None,
            message: Some(msg),
        }
    }

    pub(crate) fn closed() -> Self {
        Self {
            kind: "closed".into(),
            data: None,
            id: None,
            message: None,
        }
    }
}

#[cfg(test)]
mod tests {
    use super::SseMessage;

    #[test]
    fn serializes_frontend_channel_shape() {
        let open = serde_json::to_string(&SseMessage::open()).expect("serialize open");
        assert_eq!(open, r#"{"kind":"open"}"#);

        let event = serde_json::to_string(&SseMessage::event(r#"{"type":"x"}"#.into(), None))
            .expect("serialize event");
        assert_eq!(event, r#"{"kind":"event","data":"{\"type\":\"x\"}"}"#);

        let event_with_id =
            serde_json::to_string(&SseMessage::event(r#"{"type":"x"}"#.into(), Some("42".into())))
                .expect("serialize event with id");
        assert_eq!(
            event_with_id,
            r#"{"kind":"event","data":"{\"type\":\"x\"}","id":"42"}"#
        );

        let error =
            serde_json::to_string(&SseMessage::error("boom".into())).expect("serialize error");
        assert_eq!(error, r#"{"kind":"error","message":"boom"}"#);

        let closed = serde_json::to_string(&SseMessage::closed()).expect("serialize closed");
        assert_eq!(closed, r#"{"kind":"closed"}"#);
    }
}
