This manual browser fixture renders the production file menu with a real, read-only OS association inventory. Selections do not launch programs. It supplements native Rust and UI workflow tests; it is not desktop launch acceptance.

Generate the local inventory from the repository root:

```sh
cargo run --manifest-path desktop/src-tauri/Cargo.toml --example file_associations > web/tests/fixtures/file-associations/native-apps.json
```

Start Vite and visit `/tests/fixtures/file-associations/index.html`. The generated inventory is ignored because application identifiers can contain local filesystem paths.
