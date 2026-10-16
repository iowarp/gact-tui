//! Browser acceptance adapter to real native SSH profile owners and isolated files.
//! No OpenSSH/user profile files outside the supplied fixture directory are modified.

#[allow(dead_code)]
#[path = "../src-tauri/src/blocking_command.rs"]
mod blocking_command;
#[allow(dead_code)]
#[path = "../src-tauri/src/ssh_profile_blocks.rs"]
mod ssh_profile_blocks;
#[allow(dead_code)]
#[path = "../src-tauri/src/ssh_profile_resolve.rs"]
mod ssh_profile_resolve;
#[allow(dead_code)]
#[path = "../src-tauri/src/ssh_profiles.rs"]
mod ssh_profiles;
#[allow(dead_code)]
#[path = "../src-tauri/src/supervisor_boot_log.rs"]
mod supervisor_boot_log;

use serde_json::{json, Value};
use std::{
    fs,
    io::{Read, Write},
    net::{TcpListener, TcpStream},
    path::{Path, PathBuf},
    time::Duration,
};

fn request(stream: &mut TcpStream) -> Result<(String, Value), String> {
    stream
        .set_read_timeout(Some(Duration::from_secs(5)))
        .map_err(|error| error.to_string())?;
    let mut bytes = Vec::new();
    let header_end = loop {
        let mut chunk = [0; 1024];
        let count = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if count == 0 {
            return Err("Incomplete HTTP request".into());
        }
        bytes.extend_from_slice(&chunk[..count]);
        if bytes.len() > 65_536 {
            return Err("Request too large".into());
        }
        if let Some(end) = bytes.windows(4).position(|part| part == b"\r\n\r\n") {
            break end + 4;
        }
    };
    let headers = String::from_utf8_lossy(&bytes[..header_end]);
    let method = headers.split_whitespace().next().unwrap_or("").to_string();
    let length = headers
        .lines()
        .find_map(|line| {
            let (key, value) = line.split_once(':')?;
            key.eq_ignore_ascii_case("content-length")
                .then(|| value.trim().parse::<usize>().ok())
                .flatten()
        })
        .unwrap_or(0);
    if length > 65_536 {
        return Err("Request too large".into());
    }
    while bytes.len() < header_end + length {
        let mut chunk = [0; 1024];
        let count = stream.read(&mut chunk).map_err(|error| error.to_string())?;
        if count == 0 {
            return Err("Incomplete request body".into());
        }
        bytes.extend_from_slice(&chunk[..count]);
    }
    let body = if length == 0 {
        Value::Null
    } else {
        serde_json::from_slice(&bytes[header_end..header_end + length])
            .map_err(|error| error.to_string())?
    };
    Ok((method, body))
}

fn invoke(paths: &ssh_profiles::ProfilePaths, body: &Value) -> Result<Value, String> {
    let name = body["args"]["name"].as_str().unwrap_or("");
    match body["command"].as_str().unwrap_or("") {
        command @ ("ssh_profiles_list" | "ssh_profiles_list_all") => {
            let preferences = ssh_profiles::read_preferences(&paths.preferences)?;
            let mut profiles = ssh_profiles::resolve_all_profiles(paths, &preferences)?;
            if command == "ssh_profiles_list" {
                profiles.retain(|profile| !profile.hidden);
            }
            serde_json::to_value(profiles).map_err(|error| error.to_string())
        }
        "ssh_profile_set_hidden" => {
            let hidden = body["args"]["hidden"]
                .as_bool()
                .ok_or("hidden must be a boolean")?;
            ssh_profiles::set_profile_hidden(paths, name, hidden)?;
            Ok(Value::Null)
        }
        "ssh_profile_delete" => {
            ssh_profiles::remove_profile(paths, name)?;
            Ok(Value::Null)
        }
        _ => Err("Unsupported acceptance command".into()),
    }
}

fn seed(root: &Path, resume: bool) -> Result<ssh_profiles::ProfilePaths, String> {
    if resume {
        if fs::read_to_string(root.join("acceptance-marker")).map_err(|error| error.to_string())?
            != "ssh-hosts-acceptance\n"
        {
            return Err("Not an owned acceptance fixture".into());
        }
    } else {
        fs::create_dir(root).map_err(|error| error.to_string())?;
        fs::create_dir_all(root.join("clio")).map_err(|error| error.to_string())?;
        fs::write(root.join("acceptance-marker"), "ssh-hosts-acceptance\n")
            .map_err(|error| error.to_string())?;
        fs::write(root.join("config"), "# External OpenSSH configuration, preserved byte-for-byte\r\nHost imported-review.example.invalid\r\n  HostName imported-review.example.invalid\r\n").map_err(|error| error.to_string())?;
        fs::write(root.join("clio/config"), "Host ares-review\n  HostName ares.example.invalid\n\nHost hidden-review\n  HostName hidden.example.invalid\n").map_err(|error| error.to_string())?;
        fs::write(root.join("preferences.json"), json!({"hidden": ["hidden-review"], "metadata": {"ares-review": {"label": "Ares review", "platform": "linux", "install_root": ""}, "hidden-review": {"label": "Hidden review", "platform": "linux", "install_root": ""}}}).to_string()).map_err(|error| error.to_string())?;
    }
    Ok(ssh_profiles::ProfilePaths {
        user_config: root.join("config"),
        managed_include: root.join("clio/config"),
        preferences: root.join("preferences.json"),
        identity_directory: root.join("identities"),
    })
}

fn main() -> Result<(), String> {
    let args: Vec<_> = std::env::args().collect();
    let root = PathBuf::from(args.get(1).ok_or("Pass a new owned fixture directory")?);
    let port: u16 = args
        .get(2)
        .ok_or("Pass a private port")?
        .parse()
        .map_err(|error| format!("Invalid port: {error}"))?;
    let paths = seed(&root, args.get(3).is_some_and(|value| value == "--resume"))?;
    let listener = TcpListener::bind(("127.0.0.1", port)).map_err(|error| error.to_string())?;
    println!(
        "Native SSH host acceptance on 127.0.0.1:{port}, fixture={}",
        root.display()
    );
    for stream in listener.incoming() {
        let mut stream = stream.map_err(|error| error.to_string())?;
        let (status, result) = match request(&mut stream) {
            Ok((method, _)) if method == "OPTIONS" => (200, Value::Null),
            Ok((method, body)) if method == "POST" => match invoke(&paths, &body) {
                Ok(value) => (200, value),
                Err(error) => (500, json!({"error": error})),
            },
            Ok(_) => (200, json!({"status": "ok", "fixture": root})),
            Err(error) => (400, json!({"error": error})),
        };
        let body = result.to_string();
        write!(stream, "HTTP/1.1 {status} OK\r\nContent-Type: application/json\r\nContent-Length: {}\r\nAccess-Control-Allow-Origin: http://127.0.0.1:5198\r\nAccess-Control-Allow-Methods: GET, POST, OPTIONS\r\nAccess-Control-Allow-Headers: Content-Type\r\nConnection: close\r\n\r\n{body}", body.len()).map_err(|error| error.to_string())?;
    }
    Ok(())
}
