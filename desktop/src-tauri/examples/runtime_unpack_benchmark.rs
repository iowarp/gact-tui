//! Compare the former sequential extractor and the bounded runtime extractor.
//! Usage: runtime_unpack_benchmark <baseline|bounded> <archive> <empty-output>
//! Output is deliberately retained for byte comparison and relocation checks.

#[path = "../src/runtime_unpack.rs"]
mod runtime_unpack;

use std::{
    fs::{self, File},
    io::BufReader,
    path::Path,
    time::Instant,
};

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args_os().collect();
    if args.len() != 4 {
        return Err(
            "usage: runtime_unpack_benchmark <baseline|bounded> <archive> <new-output>".into(),
        );
    }
    let archive = Path::new(&args[2]);
    let output = Path::new(&args[3]);
    fs::create_dir(output).map_err(|e| format!("create new benchmark output: {e}"))?;
    let started = Instant::now();
    let files = match args[1].to_str() {
        Some("baseline") => baseline(archive, output)?,
        Some("bounded") => {
            runtime_unpack::unpack_runtime(archive, output, None, &|s| println!("{s}"))?.files
        }
        _ => return Err("mode must be baseline or bounded".into()),
    };
    println!(
        "files={files} seconds={:.3}",
        started.elapsed().as_secs_f64()
    );
    Ok(())
}

fn baseline(path: &Path, output: &Path) -> Result<u64, String> {
    let file = File::open(path).map_err(|e| e.to_string())?;
    let decoder =
        zstd::stream::read::Decoder::new(BufReader::new(file)).map_err(|e| e.to_string())?;
    let mut archive = tar::Archive::new(decoder);
    let mut files = 0;
    let mut last_progress = Instant::now();
    for entry in archive.entries().map_err(|e| e.to_string())? {
        let mut entry = entry.map_err(|e| e.to_string())?;
        if !entry.unpack_in(output).map_err(|e| e.to_string())? {
            return Err("entry attempted to leave staging directory".into());
        }
        if entry.header().entry_type().is_file() {
            files += 1;
        }
        if last_progress.elapsed().as_secs() >= 3 {
            println!("Baseline: {files} files...");
            last_progress = Instant::now();
        }
    }
    Ok(files)
}
