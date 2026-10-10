//! Recognize canonical document working copies produced by current and legacy servers.
use std::path::{Component, Path};

pub(crate) fn is_document_working_copy_path(path: &Path) -> bool {
    let components: Vec<_> = path
        .components()
        .filter_map(|component| match component {
            Component::Normal(value) => Some(value.to_string_lossy()),
            _ => None,
        })
        .collect();
    // The filename must immediately follow the copy ID; nested lookalike roots are not copies.
    let Some((file, parents)) = components.split_last() else {
        return false;
    };
    if file.is_empty() {
        return false;
    }
    let Some((copy, root)) = parents.split_last() else {
        return false;
    };
    if !copy.starts_with("docwc_") || copy.len() <= "docwc_".len() {
        return false;
    }
    let suffix = |names: &[&str]| {
        root.len() >= names.len()
            && root[root.len() - names.len()..]
                .iter()
                .zip(names)
                .all(|(actual, expected)| actual.eq_ignore_ascii_case(expected))
    };
    suffix(&["artifacts", "document-working-copies"])
        || suffix(&[".clio", "agent", "documents", "working-copies"])
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn accepts_current_and_legacy_server_layouts() {
        for path in [
            "C:/workspace/artifacts/document-working-copies/docwc_abc/raccoon.html",
            "C:/workspace/.clio/agent/documents/working-copies/docwc_abc/brief.docx",
            "C:/workspace/ARTIFACTS/document-working-copies/docwc_abc/brief.docx",
        ] {
            assert!(is_document_working_copy_path(Path::new(path)), "{path}");
        }
    }

    #[test]
    fn rejects_regular_files_invalid_ids_and_nested_lookalikes() {
        for path in [
            "C:/workspace/raccoon.html",
            "C:/workspace/artifacts/document-working-copies/untrusted/raccoon.html",
            "C:/workspace/artifacts/document-working-copies/docwc_/raccoon.html",
            "C:/workspace/artifacts/document-working-copies/docwc_abc/nested/raccoon.html",
            "C:/workspace/.clio/agent/documents/working-copies/docwc_abc/nested/brief.docx",
        ] {
            assert!(!is_document_working_copy_path(Path::new(path)), "{path}");
        }
    }
}
