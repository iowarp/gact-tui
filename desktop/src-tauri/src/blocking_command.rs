//! Running blocking desktop work off the main thread.
//!
//! Tauri runs a synchronous `#[tauri::command]` on the main (UI) thread, so
//! any command that waits — on OpenSSH, on a child process, on a shutdown —
//! freezes the window ("Not responding") for as long as it waits. Commands
//! that can block are `async` and hand their work to `off_main`.

/// Run `work` on Tauri's blocking pool and await its result. A panic in
/// `work` comes back as an error instead of taking the command down.
pub(crate) async fn off_main<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, String> + Send + 'static,
) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| format!("Desktop background task failed: {error}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_panicking_task_is_reported_not_propagated() {
        let result: Result<(), String> =
            tauri::async_runtime::block_on(off_main(|| panic!("boom")));
        assert!(result
            .unwrap_err()
            .starts_with("Desktop background task failed"));
    }
}
