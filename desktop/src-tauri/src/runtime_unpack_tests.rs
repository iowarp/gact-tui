use super::*;
use std::time::{SystemTime, UNIX_EPOCH};

struct Case(PathBuf);

impl Case {
    fn new() -> Self {
        let suffix = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "clio-runtime-unpack-{}-{suffix}",
            std::process::id()
        ));
        fs::create_dir(&root).unwrap();
        fs::create_dir(root.join("staging")).unwrap();
        Self(root)
    }

    fn pack(&self, entries: &[(&str, tar::EntryType, &[u8])]) -> PathBuf {
        let path = self.0.join("pack.tar.zst");
        let encoder = zstd::stream::write::Encoder::new(File::create(&path).unwrap(), 1).unwrap();
        let mut builder = tar::Builder::new(encoder);
        for (name, kind, contents) in entries {
            let mut header = tar::Header::new_gnu();
            header.set_mode(0o644);
            header.set_entry_type(*kind);
            header.set_size(contents.len() as u64);
            // Raw name deliberately permits malicious paths for rejection tests.
            header.as_mut_bytes()[..name.len()].copy_from_slice(name.as_bytes());
            header.set_cksum();
            builder.append(&header, *contents).unwrap();
        }
        builder.into_inner().unwrap().finish().unwrap();
        path
    }

    fn unpack(&self, archive: &Path, expected: Option<u64>) -> Result<UnpackReport, String> {
        unpack_runtime(archive, &self.0.join("staging"), expected, &|_| {})
    }
}

impl Drop for Case {
    fn drop(&mut self) {
        fs::remove_dir_all(&self.0).expect("all writer handles must be closed before cleanup");
    }
}

#[test]
fn extracts_empty_small_threshold_and_streamed_files_exactly() {
    let case = Case::new();
    let threshold = vec![0x55; BUFFER_LIMIT as usize];
    let large = vec![0xa3; BUFFER_LIMIT as usize + 1];
    let entries = [
        (
            "gact-runtime/runtime.json",
            tar::EntryType::Regular,
            b"{}".as_slice(),
        ),
        (
            "gact-runtime/python/empty.py",
            tar::EntryType::Regular,
            b"".as_slice(),
        ),
        (
            "gact-runtime/python/small.py",
            tar::EntryType::Regular,
            b"print('hello')".as_slice(),
        ),
        (
            "gact-runtime/python/threshold.bin",
            tar::EntryType::Regular,
            threshold.as_slice(),
        ),
        (
            "gact-runtime/python/large.dll",
            tar::EntryType::Regular,
            large.as_slice(),
        ),
        // Directory entries may follow files that implicitly created them.
        (
            "gact-runtime/python",
            tar::EntryType::Directory,
            b"".as_slice(),
        ),
    ];
    let archive = case.pack(&entries);
    let report = case.unpack(&archive, Some(5)).unwrap();
    assert_eq!(report.files, 5);
    assert_eq!(
        report.bytes,
        entries.iter().map(|e| e.2.len() as u64).sum::<u64>()
    );
    for (name, kind, contents) in entries {
        if kind.is_file() {
            assert_eq!(
                fs::read(case.0.join("staging").join(name)).unwrap(),
                contents
            );
        }
    }
}

#[test]
fn rejects_paths_outside_runtime_and_windows_path_aliases() {
    for name in [
        "../escape.py",
        "gact-runtime/../../escape.py",
        "/gact-runtime/escape.py",
        "C:/gact-runtime/escape.py",
        "other/escape.py",
        "gact-runtime/file:stream",
        "gact-runtime/file.",
        "gact-runtime/file ",
        "gact-runtime/NUL.py",
        "gact-runtime/com1",
        "gact-runtime/LPT9.txt",
    ] {
        let case = Case::new();
        let archive = case.pack(&[(name, tar::EntryType::Regular, b"bad")]);
        assert!(case.unpack(&archive, Some(1)).is_err(), "accepted {name}");
        assert_eq!(
            fs::read_dir(case.0.join("staging")).unwrap().count(),
            0,
            "wrote {name}"
        );
    }
}

#[test]
fn rejects_links_and_special_entries_before_writing() {
    for kind in [
        tar::EntryType::Symlink,
        tar::EntryType::Link,
        tar::EntryType::Fifo,
    ] {
        let case = Case::new();
        let archive = case.pack(&[("gact-runtime/link", kind, b"")]);
        assert!(case
            .unpack(&archive, None)
            .unwrap_err()
            .contains("link or special"));
        assert!(!case.0.join("staging/gact-runtime/link").exists());
    }
}

#[test]
fn refuses_duplicate_files_and_joins_writers_after_failure() {
    let case = Case::new();
    let archive = case.pack(&[
        ("gact-runtime/file.py", tar::EntryType::Regular, b"first"),
        ("gact-runtime/file.py", tar::EntryType::Regular, b"second"),
    ]);
    assert!(case
        .unpack(&archive, Some(2))
        .unwrap_err()
        .contains("create runtime file"));
    // A failure may not return while another writer still owns staging files.
    fs::remove_dir_all(case.0.join("staging")).unwrap();
}

#[test]
fn refuses_nonempty_staging_without_overwriting_existing_files() {
    let case = Case::new();
    fs::write(case.0.join("staging/keep.txt"), b"preserve").unwrap();
    let archive = case.pack(&[("gact-runtime/runtime.json", tar::EntryType::Regular, b"{}")]);
    assert!(case
        .unpack(&archive, Some(1))
        .unwrap_err()
        .contains("empty staging"));
    assert_eq!(
        fs::read(case.0.join("staging/keep.txt")).unwrap(),
        b"preserve"
    );
}

#[test]
fn rejects_count_mismatch_and_truncated_archive() {
    let case = Case::new();
    let archive = case.pack(&[("gact-runtime/runtime.json", tar::EntryType::Regular, b"{}")]);
    assert!(case
        .unpack(&archive, Some(2))
        .unwrap_err()
        .contains("count mismatch"));
    fs::remove_dir_all(case.0.join("staging")).unwrap();
    fs::create_dir(case.0.join("staging")).unwrap();
    let bytes = fs::read(&archive).unwrap();
    fs::write(&archive, &bytes[..bytes.len() / 2]).unwrap();
    assert!(case.unpack(&archive, Some(1)).is_err());
}
