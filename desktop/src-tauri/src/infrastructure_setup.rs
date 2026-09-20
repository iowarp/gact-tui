//! Minimal allowlisted deployment drivers for optional CLIO services.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::env;
use std::fs;
#[cfg(windows)]
use std::os::windows::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Command, Output, Stdio};
use std::thread;
use std::time::{Duration, Instant};

use crate::ssh_auth::{append_auth_arguments, configure_askpass};

const WEB_IMAGE: &str = "ghcr.io/iowarp/clio-web-search:0.3.1";
const CLIO_AGENT_VERSION: &str = "0.9.4.2";
const CLIO_AGENT_PORT: u16 = 17800;
const LLAMA_CPU_IMAGE: &str = "ghcr.io/ggml-org/llama.cpp:server-b10621";
const LLAMA_VULKAN_IMAGE: &str = "ghcr.io/ggml-org/llama.cpp:server-vulkan-b10621";
const LLAMA_WINDOWS_CPU_ARCHIVE: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10621/llama-b10621-bin-win-cpu-x64.zip";
const MAX_LOG_CHARS: usize = 4_000;
const DISCOVERY_TIMEOUT: Duration = Duration::from_secs(12);
const DISCOVERY_POLL_INTERVAL: Duration = Duration::from_millis(50);
#[cfg(windows)]
const CREATE_NO_WINDOW: u32 = 0x0800_0000;
// Exact parser names registered by the pinned vLLM v0.28.0 runtime.
const VLLM_REASONING_PARSERS: &[&str] = &[
    "cohere_command3",
    "cohere_command4",
    "deepseek_r1",
    "deepseek_v3",
    "deepseek_v4",
    "ernie45",
    "gemma4",
    "glm45",
    "glm47",
    "granite",
    "holo2",
    "hunyuan_a13b",
    "hy_v3",
    "inkling",
    "kimi_k2",
    "kimi_k3",
    "ling3",
    "mimo",
    "minimax_m2",
    "minimax_m2_append_think",
    "minimax_m3",
    "mistral",
    "muse_glimmer",
    "nemotron_v3",
    "olmo3",
    "openai_gptoss",
    "poolside_v1",
    "qwen3",
    "seed_oss",
    "step3",
    "step3p5",
];

/// Construct a background command without ever opening a transient console.
///
/// Tauri is a GUI process on Windows, so a plain `Command::new` gives console
/// programs such as Docker, SSH, and PowerShell their own visible window.  The
/// managed-services page polls and operates those programs frequently; every
/// launch must therefore use the same hidden-window policy, not just the main
/// backend sidecar.
fn background_command(program: impl AsRef<std::ffi::OsStr>) -> Command {
    let mut command = Command::new(program);
    #[cfg(windows)]
    command.creation_flags(CREATE_NO_WINDOW);
    command
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SshProfile {
    pub name: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
}

#[derive(Debug, Clone, Default, Deserialize)]
pub struct ManagedTargetRequest {
    pub target: String,
    #[serde(default)]
    pub install_root: Option<String>,
    #[serde(default)]
    pub ssh_profile: Option<String>,
    #[serde(default)]
    pub ssh_host: Option<String>,
    #[serde(default)]
    pub ssh_user: Option<String>,
    #[serde(default)]
    pub ssh_port: Option<u16>,
    #[serde(default)]
    pub ssh_identity_file: Option<String>,
    #[serde(default)]
    pub ssh_auth_method: Option<String>,
    #[serde(default)]
    pub ssh_credential_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TargetFacts {
    pub target: String,
    pub os: String,
    pub arch: String,
    pub accelerator: String,
    pub docker_available: bool,
    pub docker_installed: bool,
    pub uv_available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServiceConfigField {
    pub id: String,
    pub label: String,
    pub placeholder: String,
    pub required: bool,
    pub options: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServiceVariant {
    pub id: String,
    pub label: String,
    pub version: String,
    pub install_type: String,
    pub artifact: String,
    pub compatible: bool,
    pub reason: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManagedServiceDefinition {
    pub id: String,
    /// Stable UI grouping. Consumers must not infer behavior from labels or
    /// maintain parallel hard-coded service-id lists.
    pub category: String,
    pub label: String,
    pub description: String,
    pub recommended_variant: String,
    pub variants: Vec<ServiceVariant>,
    pub configuration_fields: Vec<ServiceConfigField>,
    pub supports_stop: bool,
    /// Observed lifecycle state on the selected target. This is intentionally
    /// separate from compatibility: a supported service may already be
    /// running, stopped, or not installed at all.
    pub state: String,
    /// Direct endpoint for a discovered running service, when that service can
    /// be attached to CLIO without reopening deployment setup.
    pub connection_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManagedServiceCatalog {
    pub facts: TargetFacts,
    pub services: Vec<ManagedServiceDefinition>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManagedServiceActionRequest {
    pub service_id: String,
    pub action: String,
    pub target: String,
    #[serde(default)]
    pub ssh_profile: Option<String>,
    #[serde(default)]
    pub ssh_host: Option<String>,
    #[serde(default)]
    pub ssh_user: Option<String>,
    #[serde(default)]
    pub ssh_port: Option<u16>,
    #[serde(default)]
    pub ssh_identity_file: Option<String>,
    #[serde(default)]
    pub ssh_auth_method: Option<String>,
    #[serde(default)]
    pub ssh_credential_id: Option<String>,
    pub variant_id: String,
    #[serde(default)]
    pub configuration: BTreeMap<String, String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct ManagedServiceActionResult {
    pub service_id: String,
    pub action: String,
    pub target: String,
    pub status: String,
    pub logs: String,
}

#[derive(Debug, Deserialize)]
pub struct WebSearchDeployRequest {
    pub target: String,
    #[serde(default)]
    pub ssh_profile: Option<String>,
    #[serde(default)]
    pub ssh_host: Option<String>,
    #[serde(default)]
    pub ssh_user: Option<String>,
    #[serde(default)]
    pub ssh_port: Option<u16>,
    #[serde(default)]
    pub ssh_identity_file: Option<String>,
    #[serde(default)]
    pub ssh_auth_method: Option<String>,
    #[serde(default)]
    pub ssh_credential_id: Option<String>,
    pub contact_email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WebSearchDeployResult {
    pub action: String,
    pub target: String,
}

#[derive(Debug, Serialize)]
pub struct ClioDeployResult {
    pub target: String,
    pub remote_port: u16,
    pub status: String,
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Driver {
    Vllm,
    LlamaCpp,
    WebSearch,
    Relay,
}

#[derive(Debug, Clone)]
struct CommandSpec {
    program: String,
    args: Vec<String>,
    local_only: bool,
}

impl Driver {
    fn all() -> [Self; 4] {
        [Self::Vllm, Self::LlamaCpp, Self::WebSearch, Self::Relay]
    }

    fn from_id(value: &str) -> Option<Self> {
        match value {
            "vllm" => Some(Self::Vllm),
            "llama_cpp" => Some(Self::LlamaCpp),
            "web_search" => Some(Self::WebSearch),
            "relay" => Some(Self::Relay),
            _ => None,
        }
    }

    fn definition(self, facts: &TargetFacts) -> ManagedServiceDefinition {
        let docker = facts.docker_available;
        let linux = facts.os == "linux";
        // Compatibility is a property of the inspected machine, not its user-facing
        // name. A previous release special-cased the profile label `homelab`, which
        // made the same host change support status when reached through another alias.
        let vllm_target_allowed = linux;
        match self {
            Self::Vllm => definition(
                "vllm",
                "model_runtime",
                "vLLM",
                "OpenAI-compatible model serving.",
                vec![
                    variant(
                        "cuda",
                        "NVIDIA CUDA",
                        "v0.28.0",
                        "vllm/vllm-openai:v0.28.0",
                        docker && vllm_target_allowed && facts.accelerator == "nvidia",
                        "Requires Linux, Docker, and an NVIDIA GPU.",
                    ),
                    variant(
                        "rocm",
                        "AMD ROCm",
                        "v0.28.0",
                        "vllm/vllm-openai-rocm:v0.28.0",
                        docker && vllm_target_allowed && facts.accelerator == "amd",
                        "Requires Linux, Docker, and an AMD ROCm GPU.",
                    ),
                    variant(
                        "cpu",
                        "CPU",
                        "v0.28.0",
                        "vllm/vllm-openai-cpu:v0.28.0",
                        docker && vllm_target_allowed && facts.arch == "x86_64",
                        "Requires x86-64 Linux and Docker; CPU serving may be slow.",
                    ),
                ],
                vec![
                    field("model", "Model", "Qwen/Qwen3-8B", true),
                    choice_field(
                        "reasoning_parser",
                        "Reasoning parser",
                        "Automatic for common reasoning models",
                        false,
                        VLLM_REASONING_PARSERS,
                    ),
                ],
                true,
            ),
            Self::LlamaCpp => definition(
                "llama_cpp",
                "model_runtime",
                "llama.cpp",
                "Lightweight GGUF model serving.",
                vec![
                    ServiceVariant {
                        id: "native-windows-cpu".into(),
                        label: "Windows CPU (native)".into(),
                        version: "v0.3.1".into(),
                        install_type: "native_archive".into(),
                        artifact: LLAMA_WINDOWS_CPU_ARCHIVE.into(),
                        compatible: facts.target == "This computer"
                            && facts.os == "windows"
                            && facts.arch == "x86_64",
                        reason: "Requires local 64-bit Windows.".into(),
                    },
                    variant(
                        "vulkan",
                        "Vulkan",
                        "v0.3.1",
                        LLAMA_VULKAN_IMAGE,
                        docker && linux && facts.accelerator == "amd",
                        "Requires Linux and a Vulkan-capable AMD GPU.",
                    ),
                    variant(
                        "cpu",
                        "CPU",
                        "v0.3.1",
                        LLAMA_CPU_IMAGE,
                        docker,
                        "Portable CPU container.",
                    ),
                ],
                vec![field(
                    "model_path",
                    "GGUF model path",
                    "/models/model.gguf",
                    true,
                )],
                true,
            ),
            Self::WebSearch => definition(
                "web_search",
                "scientific_service",
                "CLIO Web Search",
                "Private search and document conversion.",
                vec![variant(
                    "container",
                    "Docker",
                    "0.3.1",
                    WEB_IMAGE,
                    docker,
                    if facts.docker_installed {
                        "Docker Desktop is installed but its engine is not running. Start Docker Desktop, then inspect this computer again."
                    } else {
                        "Docker is not installed."
                    },
                )],
                vec![
                    field(
                        "contact_email",
                        "Publication metadata email",
                        "scientist@example.org",
                        false,
                    ),
                    field("task_backend_port", "Document task port", "8090", false),
                ],
                true,
            ),
            Self::Relay => {
                let compatible =
                    facts.target != "This computer" && local_available("uv", &["--version"]);
                definition(
                    "relay",
                    "remote_access",
                    "CLIO Relay",
                    "Deploy and inspect a persistent worker on an SSH cluster.",
                    vec![ServiceVariant {
                        id: "uv-tool".into(),
                        label: "Released uv tool".into(),
                        version: "1.6.8".into(),
                        install_type: "uv_tool".into(),
                        artifact: "clio-relay==1.6.8".into(),
                        compatible,
                        reason: "Requires local uv and an explicit SSH target.".into(),
                    }],
                    vec![
                        field("cluster_name", "Cluster name", "my-cluster", true),
                        field("agent_bin", "Remote agent executable", "agent", true),
                        field(
                            "relay_artifact_sha256",
                            "Relay wheel SHA-256",
                            "Published release SHA-256",
                            true,
                        ),
                    ],
                    false,
                )
            }
        }
    }

    fn container(self, variant_id: &str) -> Option<&'static str> {
        match (self, variant_id) {
            (Self::LlamaCpp, "native-windows-cpu") => None,
            (Self::Vllm, _) => Some("clio-vllm"),
            (Self::LlamaCpp, _) => Some("clio-llama-cpp"),
            (Self::WebSearch, _) => Some("clio-web-search"),
            (Self::Relay, _) => None,
        }
    }

    fn install(
        self,
        request: &ManagedServiceActionRequest,
        variant: &ServiceVariant,
    ) -> Result<Vec<CommandSpec>, String> {
        let specs = match (self, variant.id.as_str()) {
            (Self::Relay, _) => vec![local(
                "uv",
                &[
                    "tool",
                    "install",
                    "--python",
                    "3.12",
                    "--no-config",
                    "clio-relay==1.6.8",
                ],
            )],
            (Self::LlamaCpp, "native-windows-cpu") => vec![local(
                "powershell",
                &[
                    "-NoProfile",
                    "-NonInteractive",
                    "-Command",
                    r#"$ErrorActionPreference='Stop'; $root=Join-Path $env:LOCALAPPDATA 'CLIO\services\llama.cpp\b10621'; New-Item -ItemType Directory -Force -Path $root | Out-Null; $archive=Join-Path $env:TEMP 'clio-llama-b10621.zip'; Invoke-WebRequest -UseBasicParsing -Uri $args[0] -OutFile $archive; Expand-Archive -LiteralPath $archive -DestinationPath $root -Force; Remove-Item -LiteralPath $archive -Force"#,
                    LLAMA_WINDOWS_CPU_ARCHIVE,
                ],
            )],
            _ => vec![target("docker", &["pull", &variant.artifact])],
        };
        if self != Self::WebSearch {
            return Ok(specs);
        }
        let mut specs = specs;
        specs.extend(self.start(request, variant)?);
        Ok(specs)
    }

    fn start(
        self,
        request: &ManagedServiceActionRequest,
        variant: &ServiceVariant,
    ) -> Result<Vec<CommandSpec>, String> {
        match self {
            Self::Vllm => {
                let model = config(request, "model", true)?;
                let mut args = strings(&[
                    "run",
                    "--detach",
                    "--name",
                    "clio-vllm",
                    "--restart",
                    "unless-stopped",
                    "--publish",
                    "127.0.0.1:8000:8000",
                ]);
                if variant.id == "cuda" {
                    args.extend(strings(&["--gpus", "all"]));
                }
                if variant.id == "rocm" {
                    args.extend(strings(&[
                        "--group-add",
                        "video",
                        "--cap-add",
                        "SYS_PTRACE",
                        "--security-opt",
                        "seccomp=unconfined",
                        "--device",
                        "/dev/kfd",
                        "--device",
                        "/dev/dri",
                    ]));
                }
                args.extend(strings(&["--ipc", "host"]));
                args.extend([variant.artifact.clone(), "--model".into(), model.into()]);
                let configured_parser = config(request, "reasoning_parser", false)?;
                let reasoning_parser = if configured_parser.is_empty() {
                    recommended_vllm_reasoning_parser(model)
                } else if VLLM_REASONING_PARSERS.contains(&configured_parser) {
                    Some(configured_parser)
                } else {
                    return Err(
                        "The reasoning_parser value is not supported by vLLM v0.28.0.".into(),
                    );
                };
                if let Some(parser) = reasoning_parser {
                    args.extend(strings(&["--reasoning-parser", parser]));
                }
                Ok(vec![CommandSpec {
                    program: "docker".into(),
                    args,
                    local_only: false,
                }])
            }
            Self::LlamaCpp => {
                let path = config(request, "model_path", true)?;
                if variant.id == "native-windows-cpu" {
                    return Ok(vec![local(
                        "powershell",
                        &[
                            "-NoProfile",
                            "-NonInteractive",
                            "-Command",
                            r#"$ErrorActionPreference='Stop'; $root=Join-Path $env:LOCALAPPDATA 'CLIO\services\llama.cpp\b10621'; $exe=Get-ChildItem -LiteralPath $root -Filter 'llama-server.exe' -Recurse | Select-Object -First 1; if (!$exe) { throw 'Install llama.cpp before starting it.' }; $stdout=Join-Path $root 'server.log'; $stderr=Join-Path $root 'server-error.log'; $process=Start-Process -FilePath $exe.FullName -ArgumentList @('-m',$args[0],'--host','127.0.0.1','--port','8088') -RedirectStandardOutput $stdout -RedirectStandardError $stderr -WindowStyle Hidden -PassThru; Set-Content -LiteralPath (Join-Path $root 'server.pid') -Value $process.Id"#,
                            path,
                        ],
                    )]);
                }
                let bind = if request.target == "local" {
                    "127.0.0.1:8088:8080"
                } else {
                    "0.0.0.0:8088:8080"
                };
                let mut args = strings(&[
                    "run",
                    "--detach",
                    "--name",
                    "clio-llama-cpp",
                    "--restart",
                    "unless-stopped",
                    "--publish",
                    bind,
                    "--volume",
                    &format!("{path}:/models/model.gguf:ro"),
                ]);
                if variant.id == "vulkan" {
                    args.extend(strings(&["--device", "/dev/dri"]));
                }
                args.extend([
                    variant.artifact.clone(),
                    "-m".into(),
                    "/models/model.gguf".into(),
                    "--host".into(),
                    "0.0.0.0".into(),
                    "--port".into(),
                    "8080".into(),
                ]);
                Ok(vec![CommandSpec {
                    program: "docker".into(),
                    args,
                    local_only: false,
                }])
            }
            Self::WebSearch => {
                let email = config(request, "contact_email", false)?;
                validate_email(email)?;
                let task_backend_port = config_port(request, "task_backend_port", 8090)?;
                let bind = if request.target == "local" {
                    "127.0.0.1"
                } else {
                    "0.0.0.0"
                };
                let http = format!("{bind}:8089:8080");
                let task_backend = format!("{bind}:{task_backend_port}:6379");
                let mut args = strings(&[
                    "run",
                    "--detach",
                    "--name",
                    "clio-web-search",
                    "--restart",
                    "unless-stopped",
                    "--publish",
                    &http,
                    "--publish",
                    &task_backend,
                    "--volume",
                    "clio-web-search-data:/var/lib/clio-web-search",
                ]);
                if !email.is_empty() {
                    args.extend([
                        "--env".into(),
                        format!("CLIO_WEB_SEARCH_CONTACT_EMAIL={email}"),
                    ]);
                }
                args.extend([
                    "--env".into(),
                    format!("CLIO_WEB_SEARCH_TASK_BACKEND_PUBLIC_PORT={task_backend_port}"),
                ]);
                args.push(variant.artifact.clone());
                Ok(vec![CommandSpec {
                    program: "docker".into(),
                    args,
                    local_only: false,
                }])
            }
            Self::Relay => relay_start(request),
        }
    }

    fn lifecycle(
        self,
        action: &str,
        request: &ManagedServiceActionRequest,
    ) -> Result<Vec<CommandSpec>, String> {
        if let Some(container) = self.container(&request.variant_id) {
            let verb = match action {
                "status" => "inspect",
                "stop" => "stop",
                "logs" => "logs",
                _ => return Err("Unsupported lifecycle action.".into()),
            };
            let args = if action == "status" {
                strings(&[verb, "--format", "{{.State.Status}}", container])
            } else if action == "logs" {
                strings(&[verb, "--tail", "80", container])
            } else {
                strings(&[verb, container])
            };
            return Ok(vec![CommandSpec {
                program: "docker".into(),
                args,
                local_only: false,
            }]);
        }
        if self == Self::LlamaCpp && request.variant_id == "native-windows-cpu" {
            let script = match action {
                "status" => {
                    r#"$root=Join-Path $env:LOCALAPPDATA 'CLIO\services\llama.cpp\b10621'; $pidFile=Join-Path $root 'server.pid'; if (!(Test-Path -LiteralPath $pidFile)) { throw 'llama.cpp is not running.' }; Get-Process -Id (Get-Content -LiteralPath $pidFile) -ErrorAction Stop | Select-Object -ExpandProperty Id"#
                }
                "stop" => {
                    r#"$root=Join-Path $env:LOCALAPPDATA 'CLIO\services\llama.cpp\b10621'; $pidFile=Join-Path $root 'server.pid'; if (Test-Path -LiteralPath $pidFile) { Stop-Process -Id (Get-Content -LiteralPath $pidFile) -ErrorAction Stop; Remove-Item -LiteralPath $pidFile -Force }"#
                }
                "logs" => {
                    r#"$root=Join-Path $env:LOCALAPPDATA 'CLIO\services\llama.cpp\b10621'; Get-Content -LiteralPath (Join-Path $root 'server.log') -Tail 80 -ErrorAction SilentlyContinue; Get-Content -LiteralPath (Join-Path $root 'server-error.log') -Tail 80 -ErrorAction SilentlyContinue"#
                }
                _ => return Err("Unsupported lifecycle action.".into()),
            };
            return Ok(vec![local(
                "powershell",
                &["-NoProfile", "-NonInteractive", "-Command", script],
            )]);
        }
        if action == "stop" {
            return Err(
                "Relay workers are persistent remote services and are not stopped by the desktop."
                    .into(),
            );
        }
        let cluster = config(request, "cluster_name", true)?;
        Ok(vec![local(
            "clio-relay",
            &["cluster", "endpoint-service-status", "--cluster", cluster],
        )])
    }
}

fn relay_start(request: &ManagedServiceActionRequest) -> Result<Vec<CommandSpec>, String> {
    let profile = request
        .ssh_profile
        .as_deref()
        .ok_or("Choose an SSH profile for CLIO Relay.")?;
    validate_ssh_profile(profile)?;
    let cluster = config(request, "cluster_name", true)?;
    let agent = config(request, "agent_bin", true)?;
    let sha = config(request, "relay_artifact_sha256", true)?;
    if sha.len() != 64 || !sha.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("Relay wheel SHA-256 must contain exactly 64 hex characters.".into());
    }
    Ok(vec![
        local(
            "clio-relay",
            &[
                "cluster",
                "add",
                "--name",
                cluster,
                "--ssh-host",
                profile,
                "--scheduler-provider",
                "slurm",
                "--agent-adapter",
                "exec",
                "--agent-bin",
                agent,
            ],
        ),
        local(
            "clio-relay",
            &[
                "cluster",
                "bootstrap",
                "--cluster",
                cluster,
                "--relay-artifact-sha256",
                sha,
            ],
        ),
        local(
            "clio-relay",
            &[
                "cluster",
                "install-endpoint-service",
                "--cluster",
                cluster,
                "--start",
                "--enable",
            ],
        ),
    ])
}

/// Return concrete OpenSSH aliases from the current user's config.
#[tauri::command]
pub fn infrastructure_ssh_profiles() -> Result<Vec<SshProfile>, String> {
    let path = ssh_config_path().ok_or("The current user has no home directory.")?;
    if !path.exists() {
        return Ok(Vec::new());
    }
    Ok(parse_ssh_profiles(&fs::read_to_string(&path).map_err(
        |e| format!("Could not read {}: {e}", path.display()),
    )?))
}

/// Inspect the selected local or SSH target without installing anything.
#[tauri::command]
pub async fn infrastructure_preflight(
    request: ManagedTargetRequest,
) -> Result<TargetFacts, String> {
    tauri::async_runtime::spawn_blocking(move || preflight(&request))
        .await
        .map_err(|error| format!("Target inspection stopped unexpectedly: {error}"))?
}

/// Inspect the target once and return the four compatible service drivers.
#[tauri::command]
pub async fn infrastructure_managed_service_catalog(
    request: ManagedTargetRequest,
) -> Result<ManagedServiceCatalog, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let facts = preflight(&request)?;
        let container_states = inspect_container_states(&request, &facts);
        let services = Driver::all()
            .into_iter()
            .map(|driver| {
                let mut definition = driver.definition(&facts);
                definition.state = observed_service_state(driver, &facts, &container_states);
                if driver == Driver::WebSearch && definition.state == "running" {
                    definition.connection_url = web_search_connection_url(&request);
                }
                definition
            })
            .collect();
        Ok(ManagedServiceCatalog { facts, services })
    })
    .await
    .map_err(|error| format!("Service inspection stopped unexpectedly: {error}"))?
}

/// Execute one typed lifecycle action; arbitrary programs and images are impossible.
#[tauri::command]
pub async fn infrastructure_managed_service_action(
    request: ManagedServiceActionRequest,
) -> Result<ManagedServiceActionResult, String> {
    tauri::async_runtime::spawn_blocking(move || run_action(&request))
        .await
        .map_err(|error| format!("Service action stopped unexpectedly: {error}"))?
}

/// Install the pinned CLIO release on a supported SSH target and start its service.
///
/// Local CLIO is owned by the desktop supervisor and deliberately does not use
/// this path. Remote execution is a fixed, allowlisted installer invocation;
/// no user-authored command text reaches the remote shell.
#[tauri::command]
pub async fn infrastructure_deploy_clio(
    request: ManagedTargetRequest,
) -> Result<ClioDeployResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        if request.target != "ssh" {
            return Err("Use the desktop-managed CLIO service on this computer.".into());
        }
        let facts = preflight(&request)?;
        if facts.os != "linux" && facts.os != "macos" {
            return Err("Remote CLIO deployment currently supports Linux and macOS hosts.".into());
        }
        let spec = clio_install_spec(request.install_root.as_deref())?;
        let logs = run_specs(&request, vec![spec])?;
        Ok(ClioDeployResult {
            target: target_label(&request),
            remote_port: CLIO_AGENT_PORT,
            status: if logs.to_ascii_lowercase().contains("already") {
                "ready".into()
            } else {
                "installed".into()
            },
        })
    })
    .await
    .map_err(|error| format!("CLIO deployment stopped unexpectedly: {error}"))?
}

fn clio_install_spec(install_root: Option<&str>) -> Result<CommandSpec, String> {
    let (prefix, bin_dir, data_dir, cte_dir, runtime_dir, launcher) =
        if let Some(value) = nonempty(install_root) {
            validate_remote_install_root(value)?;
            (
                shell_quote(value),
                shell_quote(&format!("{value}/bin")),
                shell_quote(&format!("{value}/data")),
                shell_quote(&format!("{value}/cte")),
                shell_quote(&format!("{value}/runtime-state")),
                shell_quote(&format!("{value}/bin/clio")),
            )
        } else {
            (
                "\"$HOME/.local/share/clio\"".into(),
                "\"$HOME/.local/bin\"".into(),
                "\"$HOME/.local/share/clio/data\"".into(),
                "\"$HOME/.local/share/clio/cte\"".into(),
                "\"$HOME/.local/share/clio/runtime-state\"".into(),
                "\"$HOME/.local/bin/clio\"".into(),
            )
        };
    let script = format!(
        "export CLIO_VERSION={CLIO_AGENT_VERSION} CLIO_INSTALLER_REF=v{CLIO_AGENT_VERSION} CLIO_PREFIX={prefix} CLIO_BIN_DIR={bin_dir} UV_INSTALL_DIR={bin_dir} UV_PYTHON_INSTALL_DIR={prefix}/uv-python UV_CACHE_DIR={prefix}/uv-cache UV_NO_MODIFY_PATH=1; export PATH=\"$CLIO_BIN_DIR:$HOME/.local/bin:$PATH\"; if ! command -v uv >/dev/null 2>&1; then curl -LsSf https://astral.sh/uv/install.sh | sh; fi && export PATH=\"$CLIO_BIN_DIR:$HOME/.local/bin:$PATH\" && curl -fsSL https://raw.githubusercontent.com/iowarp/clio-agent/v{CLIO_AGENT_VERSION}/install/install.sh | bash && export CLIO_PREFIX={prefix} CLIO_DATA_DIR={data_dir} CLIO_ARC_CTE_DIR={cte_dir} CLIO_RUNTIME_STATE_DIR={runtime_dir} && {launcher} start"
    );
    Ok(target_command("bash", &["-lc", &script]))
}

fn validate_remote_install_root(value: &str) -> Result<(), String> {
    if value.len() > 1_024 || value.contains(['\0', '\n', '\r']) {
        return Err("The remote install location is not valid.".into());
    }
    if !value.starts_with('/') {
        return Err("Enter an absolute remote install location beginning with /.".into());
    }
    if Path::new(value)
        .components()
        .any(|component| matches!(component, std::path::Component::ParentDir))
    {
        return Err("The remote install location cannot contain parent-directory segments.".into());
    }
    Ok(())
}

/// Preserve the existing Web Search dialog while routing it through the driver.
#[tauri::command]
pub fn infrastructure_deploy_web_search(
    request: WebSearchDeployRequest,
) -> Result<WebSearchDeployResult, String> {
    validate_email(request.contact_email.as_deref().unwrap_or(""))?;
    let target_request = ManagedTargetRequest {
        target: request.target.clone(),
        install_root: None,
        ssh_profile: request.ssh_profile.clone(),
        ssh_host: request.ssh_host.clone(),
        ssh_user: request.ssh_user.clone(),
        ssh_port: request.ssh_port,
        ssh_identity_file: request.ssh_identity_file.clone(),
        ssh_auth_method: request.ssh_auth_method.clone(),
        ssh_credential_id: request.ssh_credential_id.clone(),
    };
    let facts = preflight(&target_request)?;
    let driver = Driver::WebSearch;
    let definition = driver.definition(&facts);
    let variant = &definition.variants[0];
    if !variant.compatible {
        return Err(variant.reason.clone());
    }
    let existed = container_exists(&target_request, "clio-web-search")?;
    if existed && container_running(&target_request, "clio-web-search")? {
        return Ok(WebSearchDeployResult {
            action: "already_running".into(),
            target: target_label(&target_request),
        });
    }
    let mut configuration = BTreeMap::new();
    if let Some(email) = request.contact_email {
        configuration.insert("contact_email".into(), email);
    }
    run_action(&ManagedServiceActionRequest {
        service_id: "web_search".into(),
        action: "start".into(),
        target: request.target,
        ssh_profile: request.ssh_profile,
        ssh_host: request.ssh_host,
        ssh_user: request.ssh_user,
        ssh_port: request.ssh_port,
        ssh_identity_file: request.ssh_identity_file,
        ssh_auth_method: request.ssh_auth_method,
        ssh_credential_id: request.ssh_credential_id,
        variant_id: variant.id.clone(),
        configuration,
    })?;
    Ok(WebSearchDeployResult {
        action: if existed { "started" } else { "created" }.into(),
        target: target_label(&target_request),
    })
}

fn run_action(request: &ManagedServiceActionRequest) -> Result<ManagedServiceActionResult, String> {
    let target = ManagedTargetRequest {
        target: request.target.clone(),
        install_root: None,
        ssh_profile: request.ssh_profile.clone(),
        ssh_host: request.ssh_host.clone(),
        ssh_user: request.ssh_user.clone(),
        ssh_port: request.ssh_port,
        ssh_identity_file: request.ssh_identity_file.clone(),
        ssh_auth_method: request.ssh_auth_method.clone(),
        ssh_credential_id: request.ssh_credential_id.clone(),
    };
    let facts = preflight(&target)?;
    let driver = Driver::from_id(&request.service_id)
        .ok_or_else(|| format!("Unknown managed service: {}", request.service_id))?;
    let definition = driver.definition(&facts);
    let variant = definition
        .variants
        .iter()
        .find(|item| item.id == request.variant_id)
        .ok_or("Choose an approved service variant.")?;
    if !variant.compatible {
        return Err(variant.reason.clone());
    }
    let specs = match request.action.as_str() {
        "install" => driver.install(request, variant)?,
        "start" if driver == Driver::WebSearch && container_exists(&target, "clio-web-search")? => {
            let mut commands = vec![target_command(
                "docker",
                &["rm", "--force", "clio-web-search"],
            )];
            commands.extend(driver.start(request, variant)?);
            commands
        }
        "start"
            if driver.container(&variant.id).is_some()
                && container_exists(&target, driver.container(&variant.id).unwrap())? =>
        {
            vec![target_command(
                "docker",
                &["start", driver.container(&variant.id).unwrap()],
            )]
        }
        "start" => driver.start(request, variant)?,
        "status" | "stop" | "logs" => driver.lifecycle(&request.action, request)?,
        _ => return Err("Action must be install, start, status, stop, or logs.".into()),
    };
    let logs = run_specs(&target, specs)?;
    Ok(ManagedServiceActionResult {
        service_id: request.service_id.clone(),
        action: request.action.clone(),
        target: target_label(&target),
        status: "ok".into(),
        logs,
    })
}

fn preflight(request: &ManagedTargetRequest) -> Result<TargetFacts, String> {
    validate_target(request)?;
    if request.target == "ssh" {
        return remote_preflight(request);
    }
    // These probes are independent. Running them serially made an SSH target
    // appear frozen because every unavailable runtime could consume its own
    // discovery deadline. The bounded commands still stop individually, while
    // the user now waits for the slowest probe rather than their sum.
    let (
        os,
        arch,
        docker_installed,
        docker_available,
        uv_available,
        nvidia_available,
        rocm_available,
    ) = thread::scope(|scope| {
        let os = scope.spawn(|| {
            if request.target == "local" {
                Ok(normalize_os(env::consts::OS))
            } else {
                required_probe(request, "uname", &["-s"], normalize_os)
            }
        });
        let arch = scope.spawn(|| {
            if request.target == "local" {
                Ok(normalize_arch(env::consts::ARCH))
            } else {
                required_probe(request, "uname", &["-m"], normalize_arch)
            }
        });
        let docker_installed = scope.spawn(|| available(request, "docker", &["--version"]));
        let docker = scope.spawn(|| {
            available(
                request,
                "docker",
                &["version", "--format", "{{.Server.Version}}"],
            )
        });
        let uv = scope.spawn(|| available(request, "uv", &["--version"]));
        let nvidia = scope.spawn(|| {
            available(
                request,
                "nvidia-smi",
                &["--query-gpu=name", "--format=csv,noheader"],
            )
        });
        let rocm = scope.spawn(|| available(request, "rocminfo", &["--version"]));
        (
            os.join().unwrap_or_else(|_| {
                Err("Operating-system inspection stopped unexpectedly.".into())
            }),
            arch.join()
                .unwrap_or_else(|_| Err("Architecture inspection stopped unexpectedly.".into())),
            docker_installed.join().unwrap_or(false),
            docker.join().unwrap_or(false),
            uv.join().unwrap_or(false),
            nvidia.join().unwrap_or(false),
            rocm.join().unwrap_or(false),
        )
    });
    let os = os?;
    let arch = arch?;
    let accelerator = if nvidia_available {
        "nvidia"
    } else if rocm_available || request.target == "local" && windows_has_amd_gpu() {
        "amd"
    } else {
        "none"
    };
    Ok(TargetFacts {
        target: target_label(request),
        os,
        arch,
        accelerator: accelerator.into(),
        docker_available,
        docker_installed,
        uv_available,
    })
}

/// Inspect an SSH target through one bounded login. HPC login nodes commonly
/// throttle bursts of concurrent SSH sessions; opening one connection per fact
/// made required probes time out and made optional capabilities flicker between
/// refreshes. Individual commands are still bounded on hosts that provide the
/// standard `timeout` utility.
fn remote_preflight(request: &ManagedTargetRequest) -> Result<TargetFacts, String> {
    let script = r#"
run_bounded() {
  if command -v timeout >/dev/null 2>&1; then timeout 4 "$@"; else "$@"; fi
}
printf 'os=%s\n' "$(uname -s)"
printf 'arch=%s\n' "$(uname -m)"
if command -v docker >/dev/null 2>&1; then printf 'docker_installed=1\n'; else printf 'docker_installed=0\n'; fi
if command -v docker >/dev/null 2>&1 && run_bounded docker version --format '{{.Server.Version}}' >/dev/null 2>&1; then printf 'docker_available=1\n'; else printf 'docker_available=0\n'; fi
if command -v uv >/dev/null 2>&1; then printf 'uv_available=1\n'; else printf 'uv_available=0\n'; fi
if command -v nvidia-smi >/dev/null 2>&1 && run_bounded nvidia-smi --query-gpu=name --format=csv,noheader >/dev/null 2>&1; then printf 'nvidia_available=1\n'; else printf 'nvidia_available=0\n'; fi
if command -v rocminfo >/dev/null 2>&1 && run_bounded rocminfo --version >/dev/null 2>&1; then printf 'rocm_available=1\n'; else printf 'rocm_available=0\n'; fi
"#;
    let output = run_discovery_target(request, "bash", &["-lc", script])?;
    if !output.status.success() {
        let detail = bounded(&String::from_utf8_lossy(&output.stderr));
        return Err(if detail.is_empty() {
            format!("Could not inspect {}.", target_label(request))
        } else {
            format!("Could not inspect {}: {detail}", target_label(request))
        });
    }
    parse_remote_preflight(request, &String::from_utf8_lossy(&output.stdout))
}

fn parse_remote_preflight(
    request: &ManagedTargetRequest,
    stdout: &str,
) -> Result<TargetFacts, String> {
    let values = stdout
        .lines()
        .filter_map(|line| line.split_once('='))
        .collect::<BTreeMap<_, _>>();
    let os = values
        .get("os")
        .map(|value| normalize_os(value))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "Could not determine the operating system on {}.",
                target_label(request)
            )
        })?;
    let arch = values
        .get("arch")
        .map(|value| normalize_arch(value))
        .filter(|value| !value.is_empty())
        .ok_or_else(|| {
            format!(
                "Could not determine the architecture on {}.",
                target_label(request)
            )
        })?;
    let enabled = |name: &str| values.get(name).is_some_and(|value| *value == "1");
    let accelerator = if enabled("nvidia_available") {
        "nvidia"
    } else if enabled("rocm_available") {
        "amd"
    } else {
        "none"
    };
    Ok(TargetFacts {
        target: target_label(request),
        os,
        arch,
        accelerator: accelerator.into(),
        docker_available: enabled("docker_available"),
        docker_installed: enabled("docker_installed"),
        uv_available: enabled("uv_available"),
    })
}

fn run_specs(target: &ManagedTargetRequest, specs: Vec<CommandSpec>) -> Result<String, String> {
    let mut log = String::new();
    for spec in specs {
        let output = if spec.local_only {
            background_command(&spec.program).args(&spec.args).output()
        } else {
            run_target(
                target,
                &spec.program,
                &spec.args.iter().map(String::as_str).collect::<Vec<_>>(),
            )
        }
        .map_err(|e| format!("Could not start {}: {e}", spec.program))?;
        log.push_str(&String::from_utf8_lossy(&output.stdout));
        log.push_str(&String::from_utf8_lossy(&output.stderr));
        if !output.status.success() {
            return Err(bounded(&log));
        }
    }
    Ok(bounded(&log))
}

fn run_target(
    target: &ManagedTargetRequest,
    program: &str,
    args: &[&str],
) -> Result<Output, std::io::Error> {
    let (program, args) = target_invocation(target, program, args);
    let mut command = background_command(program);
    command.args(args);
    configure_askpass(
        &mut command,
        target.ssh_auth_method.as_deref(),
        target.ssh_credential_id.as_deref(),
    )
    .map_err(|error| std::io::Error::new(std::io::ErrorKind::InvalidInput, error))?;
    command.output()
}

fn run_discovery_target(
    target: &ManagedTargetRequest,
    program: &str,
    args: &[&str],
) -> Result<Output, String> {
    let (program, args) = target_invocation(target, program, args);
    let mut command = background_command(&program);
    command.args(&args);
    configure_askpass(
        &mut command,
        target.ssh_auth_method.as_deref(),
        target.ssh_credential_id.as_deref(),
    )?;
    output_before_deadline(command, &program, DISCOVERY_TIMEOUT)
}

fn output_before_deadline(
    mut command: Command,
    program: &str,
    timeout: Duration,
) -> Result<Output, String> {
    let mut child = command
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|error| format!("Could not start {program}: {error}"))?;
    let started = Instant::now();
    loop {
        match child.try_wait() {
            Ok(Some(_)) => {
                return child
                    .wait_with_output()
                    .map_err(|error| format!("Could not read {program} output: {error}"));
            }
            Ok(None) if started.elapsed() < timeout => {
                thread::sleep(DISCOVERY_POLL_INTERVAL);
            }
            Ok(None) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!(
                    "{program} did not finish target inspection within {} seconds",
                    timeout.as_secs()
                ));
            }
            Err(error) => {
                let _ = child.kill();
                let _ = child.wait();
                return Err(format!("Could not inspect {program}: {error}"));
            }
        }
    }
}

fn target_invocation(
    target: &ManagedTargetRequest,
    program: &str,
    args: &[&str],
) -> (String, Vec<String>) {
    if target.target == "local" {
        return (resolved_local_program(program), strings(args));
    }
    let command = std::iter::once(program)
        .chain(args.iter().copied())
        .map(shell_quote)
        .collect::<Vec<_>>()
        .join(" ");
    let mut ssh_args = Vec::new();
    append_auth_arguments(&mut ssh_args, target.ssh_auth_method.as_deref());
    if let Some(port) = target.ssh_port.filter(|port| *port != 22) {
        ssh_args.extend(["-p".into(), port.to_string()]);
    }
    if let Some(identity) = nonempty(target.ssh_identity_file.as_deref()) {
        ssh_args.extend(["-i".into(), identity.into()]);
    }
    ssh_args.extend([ssh_destination(target), "--".into(), command]);
    ("ssh".into(), ssh_args)
}

fn resolved_local_program(program: &str) -> String {
    resolved_local_program_from(program, &docker_install_candidates())
}

/// Well-known absolute paths a local Docker install may live at, outside
/// whatever the shell's `PATH` happens to resolve. Checked in order; the
/// first that exists as a real file wins.
fn docker_install_candidates() -> Vec<PathBuf> {
    let mut candidates = Vec::new();
    if let Some(program_files) = env::var_os("ProgramFiles") {
        candidates.push(
            PathBuf::from(program_files)
                .join("Docker")
                .join("Docker")
                .join("resources")
                .join("bin")
                .join("docker.exe"),
        );
    }
    candidates.extend([
        PathBuf::from("/usr/local/bin/docker"),
        PathBuf::from("/opt/homebrew/bin/docker"),
        PathBuf::from("/usr/bin/docker"),
    ]);
    candidates
}

/// Pure resolver split out from [`resolved_local_program`] so tests can
/// supply a controlled candidate list instead of depending on whether the
/// machine running the suite happens to have Docker Desktop installed.
fn resolved_local_program_from(program: &str, candidates: &[PathBuf]) -> String {
    if program != "docker" {
        return program.into();
    }
    candidates
        .iter()
        .find(|candidate| candidate.is_file())
        .map(|candidate| candidate.to_string_lossy().into_owned())
        .unwrap_or_else(|| program.into())
}

fn available(target: &ManagedTargetRequest, program: &str, args: &[&str]) -> bool {
    run_discovery_target(target, program, args)
        .map(|o| o.status.success())
        .unwrap_or(false)
}
fn local_available(program: &str, args: &[&str]) -> bool {
    background_command(resolved_local_program(program))
        .args(args)
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}
fn container_exists(target: &ManagedTargetRequest, name: &str) -> Result<bool, String> {
    run_target(target, "docker", &["inspect", name])
        .map(|o| o.status.success())
        .map_err(|e| format!("Docker could not be started: {e}"))
}
fn container_running(target: &ManagedTargetRequest, name: &str) -> Result<bool, String> {
    run_target(
        target,
        "docker",
        &["inspect", "--format", "{{.State.Running}}", name],
    )
    .map(|output| {
        output.status.success() && String::from_utf8_lossy(&output.stdout).trim() == "true"
    })
    .map_err(|error| format!("Docker could not be started: {error}"))
}

/// Read every known container state in one bounded Docker call. A failed
/// discovery leaves the state unknown without hiding the service catalog.
fn inspect_container_states(
    target: &ManagedTargetRequest,
    facts: &TargetFacts,
) -> BTreeMap<String, String> {
    if !facts.docker_available {
        return BTreeMap::new();
    }
    let Ok(output) = run_discovery_target(
        target,
        "docker",
        &["ps", "-a", "--format", "{{.Names}}\t{{.State}}"],
    ) else {
        return BTreeMap::new();
    };
    if !output.status.success() {
        return BTreeMap::new();
    }
    String::from_utf8_lossy(&output.stdout)
        .lines()
        .filter_map(|line| line.split_once('\t'))
        .map(|(name, state)| (name.trim().to_string(), state.trim().to_ascii_lowercase()))
        .collect()
}

fn observed_service_state(
    driver: Driver,
    facts: &TargetFacts,
    containers: &BTreeMap<String, String>,
) -> String {
    let container = match driver {
        Driver::Vllm => Some("clio-vllm"),
        Driver::LlamaCpp if facts.os != "windows" || facts.target != "This computer" => {
            Some("clio-llama-cpp")
        }
        Driver::WebSearch => Some("clio-web-search"),
        Driver::LlamaCpp | Driver::Relay => None,
    };
    let Some(container) = container else {
        return "unknown".into();
    };
    match containers.get(container).map(String::as_str) {
        Some("running") => "running".into(),
        Some(_) => "stopped".into(),
        None if facts.docker_available => "not_installed".into(),
        None => "unknown".into(),
    }
}
fn local(program: &str, args: &[&str]) -> CommandSpec {
    CommandSpec {
        program: program.into(),
        args: strings(args),
        local_only: true,
    }
}
fn target(program: &str, args: &[&str]) -> CommandSpec {
    target_command(program, args)
}
fn target_command(program: &str, args: &[&str]) -> CommandSpec {
    CommandSpec {
        program: program.into(),
        args: strings(args),
        local_only: false,
    }
}
fn strings(values: &[&str]) -> Vec<String> {
    values.iter().map(|value| (*value).to_string()).collect()
}
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace("'", "'\"'\"'"))
}
fn bounded(value: &str) -> String {
    value
        .chars()
        .rev()
        .take(MAX_LOG_CHARS)
        .collect::<String>()
        .chars()
        .rev()
        .collect::<String>()
        .trim()
        .to_string()
}
fn required_probe(
    target: &ManagedTargetRequest,
    program: &str,
    args: &[&str],
    normalize: fn(&str) -> String,
) -> Result<String, String> {
    let output = run_discovery_target(target, program, args)?;
    if !output.status.success() {
        let detail = bounded(&String::from_utf8_lossy(&output.stderr));
        return Err(if detail.is_empty() {
            format!("Could not inspect {} on {}.", program, target_label(target))
        } else {
            format!(
                "Could not inspect {} on {}: {}",
                program,
                target_label(target),
                detail
            )
        });
    }
    let value = normalize(&String::from_utf8_lossy(&output.stdout));
    if value.trim().is_empty() {
        return Err(format!(
            "{} returned no system information for {}.",
            program,
            target_label(target)
        ));
    }
    Ok(value)
}
fn normalize_os(value: &str) -> String {
    let value = value.trim().to_ascii_lowercase();
    if value.contains("linux") {
        "linux".into()
    } else if value.contains("windows") {
        "windows".into()
    } else if value.contains("darwin") {
        "macos".into()
    } else {
        value
    }
}
fn normalize_arch(value: &str) -> String {
    match value.trim().to_ascii_lowercase().as_str() {
        "amd64" | "x86_64" => "x86_64".into(),
        "arm64" | "aarch64" => "aarch64".into(),
        value => value.into(),
    }
}
fn target_label(target: &ManagedTargetRequest) -> String {
    if target.target == "local" {
        "This computer".into()
    } else {
        target
            .ssh_profile
            .clone()
            .filter(|value| !value.trim().is_empty())
            .unwrap_or_else(|| ssh_destination(target))
    }
}

fn nonempty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

fn ssh_destination(target: &ManagedTargetRequest) -> String {
    if let Some(profile) = nonempty(target.ssh_profile.as_deref()) {
        return profile.into();
    }
    let host = nonempty(target.ssh_host.as_deref()).unwrap_or_default();
    match nonempty(target.ssh_user.as_deref()) {
        Some(user) => format!("{user}@{host}"),
        None => host.into(),
    }
}

fn windows_has_amd_gpu() -> bool {
    let args = strings(&[
        "-NoProfile",
        "-NonInteractive",
        "-Command",
        "(Get-CimInstance Win32_VideoController).Name",
    ]);
    let mut command = background_command("powershell");
    command.args(&args);
    env::consts::OS == "windows"
        && output_before_deadline(command, "powershell", DISCOVERY_TIMEOUT)
            .map(|o| {
                String::from_utf8_lossy(&o.stdout)
                    .to_ascii_lowercase()
                    .contains("amd")
            })
            .unwrap_or(false)
}

fn config<'a>(
    request: &'a ManagedServiceActionRequest,
    key: &str,
    required: bool,
) -> Result<&'a str, String> {
    let value = request
        .configuration
        .get(key)
        .map(String::as_str)
        .unwrap_or("")
        .trim();
    if value.len() > 1_024 || value.chars().any(|c| "\n\r\0".contains(c)) {
        return Err(format!("The {key} value is not valid."));
    }
    if required && value.is_empty() {
        return Err(format!("The {key} value is required."));
    }
    Ok(value)
}

fn config_port(
    request: &ManagedServiceActionRequest,
    key: &str,
    default: u16,
) -> Result<u16, String> {
    let value = config(request, key, false)?;
    if value.is_empty() {
        return Ok(default);
    }
    value.parse::<u16>().map_err(|_| {
        format!(
            "{} must be a port between 1 and 65535.",
            key.replace('_', " ")
        )
    })
}

fn field(id: &str, label: &str, placeholder: &str, required: bool) -> ServiceConfigField {
    ServiceConfigField {
        id: id.into(),
        label: label.into(),
        placeholder: placeholder.into(),
        required,
        options: Vec::new(),
    }
}

fn choice_field(
    id: &str,
    label: &str,
    placeholder: &str,
    required: bool,
    options: &[&str],
) -> ServiceConfigField {
    ServiceConfigField {
        id: id.into(),
        label: label.into(),
        placeholder: placeholder.into(),
        required,
        options: strings(options),
    }
}

fn recommended_vllm_reasoning_parser(model: &str) -> Option<&'static str> {
    let model = model.to_ascii_lowercase();
    if model.contains("qwen3") || model.contains("qwopus") {
        Some("qwen3")
    } else if model.contains("deepseek-r1")
        || model.contains("deepseek_r1")
        || model.contains("qwq")
    {
        Some("deepseek_r1")
    } else if model.contains("gpt-oss") {
        Some("openai_gptoss")
    } else if model.contains("nemotron") {
        Some("nemotron_v3")
    } else if model.contains("gemma-4") || model.contains("gemma4") {
        Some("gemma4")
    } else {
        None
    }
}
fn variant(
    id: &str,
    label: &str,
    version: &str,
    artifact: &str,
    compatible: bool,
    reason: &str,
) -> ServiceVariant {
    ServiceVariant {
        id: id.into(),
        label: label.into(),
        version: version.into(),
        install_type: "container".into(),
        artifact: artifact.into(),
        compatible,
        reason: reason.into(),
    }
}
fn definition(
    id: &str,
    category: &str,
    label: &str,
    description: &str,
    variants: Vec<ServiceVariant>,
    fields: Vec<ServiceConfigField>,
    supports_stop: bool,
) -> ManagedServiceDefinition {
    let recommended_variant = variants
        .iter()
        .find(|v| v.compatible)
        .map(|v| v.id.clone())
        .unwrap_or_default();
    ManagedServiceDefinition {
        id: id.into(),
        category: category.into(),
        label: label.into(),
        description: description.into(),
        recommended_variant,
        variants,
        configuration_fields: fields,
        supports_stop,
        state: "unknown".into(),
        connection_url: None,
    }
}

fn web_search_connection_url(target: &ManagedTargetRequest) -> Option<String> {
    let detected_hostname = if target.target == "ssh" {
        if let Some(host) = nonempty(target.ssh_host.as_deref()) {
            Some(host.into())
        } else {
            let profile_name = target.ssh_profile.as_deref()?;
            ssh_config_path()
                .and_then(|path| fs::read_to_string(path).ok())
                .and_then(|contents| {
                    parse_ssh_profiles(&contents)
                        .into_iter()
                        .find(|profile| profile.name.eq_ignore_ascii_case(profile_name))
                        .and_then(|profile| profile.hostname)
                })
        }
    } else {
        None
    };
    web_search_connection_url_for_host(target, detected_hostname.as_deref())
}

fn web_search_connection_url_for_host(
    target: &ManagedTargetRequest,
    detected_hostname: Option<&str>,
) -> Option<String> {
    let host = match target.target.as_str() {
        "local" => "127.0.0.1",
        "ssh" => {
            let fallback = nonempty(target.ssh_host.as_deref())
                .or_else(|| nonempty(target.ssh_profile.as_deref()))?;
            detected_hostname.unwrap_or(fallback)
        }
        _ => return None,
    };
    Some(format!("http://{host}:8089"))
}

fn validate_target(target: &ManagedTargetRequest) -> Result<(), String> {
    match target.target.as_str() {
        "local" => Ok(()),
        "ssh" if nonempty(target.ssh_profile.as_deref()).is_some() => {
            validate_ssh_profile(target.ssh_profile.as_deref().unwrap())
        }
        "ssh" => {
            validate_ssh_host(
                target
                    .ssh_host
                    .as_deref()
                    .ok_or("Choose or add an SSH host.")?,
            )?;
            if let Some(user) = nonempty(target.ssh_user.as_deref()) {
                validate_ssh_user(user)?;
            }
            if matches!(target.ssh_port, Some(0)) {
                return Err("The SSH port must be between 1 and 65535.".into());
            }
            if let Some(identity) = nonempty(target.ssh_identity_file.as_deref()) {
                if identity.len() > 1_024 || identity.contains(['\0', '\n', '\r']) {
                    return Err("The SSH identity file path is not valid.".into());
                }
            }
            if let Some(method) = nonempty(target.ssh_auth_method.as_deref()) {
                if method != "key" && method != "password" {
                    return Err("SSH authentication must use a key or password.".into());
                }
                if method == "password" && nonempty(target.ssh_credential_id.as_deref()).is_none() {
                    return Err("Save an SSH password before connecting.".into());
                }
            }
            Ok(())
        }
        _ => Err("Deployment target must be local or ssh.".into()),
    }
}

fn validate_ssh_profile(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || value.starts_with('-')
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-@".contains(c))
    {
        Err("The SSH profile name is not valid.".into())
    } else {
        Ok(())
    }
}

fn validate_ssh_host(value: &str) -> Result<(), String> {
    let value = value.trim();
    if value.is_empty()
        || value.len() > 255
        || value.starts_with('-')
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".:_-%".contains(c))
    {
        Err("The SSH host address is not valid.".into())
    } else {
        Ok(())
    }
}

fn validate_ssh_user(value: &str) -> Result<(), String> {
    if value.is_empty()
        || value.len() > 128
        || value.starts_with('-')
        || !value
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || "._-".contains(c))
    {
        Err("The SSH username is not valid.".into())
    } else {
        Ok(())
    }
}

fn validate_email(value: &str) -> Result<(), String> {
    if value.is_empty() {
        return Ok(());
    }
    let Some((local, domain)) = value.split_once('@') else {
        return Err("The contact email is not valid.".into());
    };
    if value.len() > 254
        || local.is_empty()
        || domain.is_empty()
        || !local
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".+_-".contains(c))
        || !domain
            .chars()
            .all(|c| c.is_ascii_alphanumeric() || ".-".contains(c))
    {
        Err("The contact email is not valid.".into())
    } else {
        Ok(())
    }
}

fn ssh_config_path() -> Option<PathBuf> {
    env::var_os("USERPROFILE")
        .or_else(|| env::var_os("HOME"))
        .map(PathBuf::from)
        .map(|home| home.join(".ssh").join("config"))
}

fn parse_ssh_profiles(contents: &str) -> Vec<SshProfile> {
    let mut profiles = Vec::new();
    let mut current: Vec<SshProfile> = Vec::new();
    for raw in contents.lines() {
        let line = raw.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }
        let mut parts = line.split_whitespace();
        let Some(key) = parts.next() else { continue };
        let values = parts.collect::<Vec<_>>();
        if key.eq_ignore_ascii_case("host") {
            profiles.append(&mut current);
            current = values
                .into_iter()
                .filter(|name| !name.contains(['*', '?', '!']))
                .map(|name| SshProfile {
                    name: name.into(),
                    hostname: None,
                    user: None,
                })
                .collect();
        } else if let Some(value) = values.first() {
            for profile in &mut current {
                if key.eq_ignore_ascii_case("hostname") {
                    profile.hostname = Some((*value).into());
                }
                if key.eq_ignore_ascii_case("user") {
                    profile.user = Some((*value).into());
                }
            }
        }
    }
    profiles.append(&mut current);
    profiles.sort_by_key(|profile| profile.name.to_ascii_lowercase());
    profiles.dedup_by(|left, right| left.name.eq_ignore_ascii_case(&right.name));
    profiles
}

#[cfg(test)]
mod tests {
    use super::*;

    fn facts(os: &str, accelerator: &str) -> TargetFacts {
        TargetFacts {
            target: "test".into(),
            os: os.into(),
            arch: "x86_64".into(),
            accelerator: accelerator.into(),
            docker_available: true,
            docker_installed: true,
            uv_available: true,
        }
    }
    fn request(service: &str, variant: &str) -> ManagedServiceActionRequest {
        ManagedServiceActionRequest {
            service_id: service.into(),
            action: "start".into(),
            target: "local".into(),
            ssh_profile: None,
            ssh_host: None,
            ssh_user: None,
            ssh_port: None,
            ssh_identity_file: None,
            ssh_auth_method: None,
            ssh_credential_id: None,
            variant_id: variant.into(),
            configuration: BTreeMap::new(),
        }
    }

    #[test]
    fn parses_one_connection_remote_preflight_facts() {
        let target = ManagedTargetRequest {
            target: "ssh".into(),
            ssh_profile: Some("ares".into()),
            ..Default::default()
        };
        let parsed = parse_remote_preflight(
            &target,
            "os=Linux\narch=x86_64\ndocker_installed=1\ndocker_available=1\nuv_available=0\nnvidia_available=1\nrocm_available=0\n",
        )
        .expect("remote facts");
        assert_eq!(parsed.target, "ares");
        assert_eq!(parsed.os, "linux");
        assert_eq!(parsed.arch, "x86_64");
        assert_eq!(parsed.accelerator, "nvidia");
        assert!(parsed.docker_installed);
        assert!(parsed.docker_available);
        assert!(!parsed.uv_available);
    }

    #[test]
    fn remote_preflight_requires_identity_facts() {
        let target = ManagedTargetRequest {
            target: "ssh".into(),
            ssh_profile: Some("ares".into()),
            ..Default::default()
        };
        assert!(parse_remote_preflight(&target, "docker_installed=1\n").is_err());
    }

    #[test]
    fn discovered_web_search_uses_the_selected_targets_reachable_address() {
        let local = ManagedTargetRequest {
            target: "local".into(),
            ..Default::default()
        };
        assert_eq!(
            web_search_connection_url_for_host(&local, None).as_deref(),
            Some("http://127.0.0.1:8089")
        );

        let remote = ManagedTargetRequest {
            target: "ssh".into(),
            ssh_profile: Some("homelab".into()),
            ..Default::default()
        };
        assert_eq!(
            web_search_connection_url_for_host(&remote, Some("10.0.0.102")).as_deref(),
            Some("http://10.0.0.102:8089")
        );
    }

    #[test]
    fn web_search_distinguishes_a_stopped_docker_engine_from_a_missing_install() {
        let mut stopped = facts("windows", "none");
        stopped.docker_available = false;
        let stopped_definition = Driver::WebSearch.definition(&stopped);
        assert!(stopped_definition.variants[0]
            .reason
            .contains("installed but its engine is not running"));

        stopped.docker_installed = false;
        let missing_definition = Driver::WebSearch.definition(&stopped);
        assert_eq!(
            missing_definition.variants[0].reason,
            "Docker is not installed."
        );
    }

    #[test]
    fn web_search_deployment_publishes_the_document_task_backend_on_the_managed_port() {
        let request = request("web_search", "docker");
        let definition = Driver::WebSearch.definition(&facts("linux", "none"));
        let specs = Driver::WebSearch
            .start(&request, &definition.variants[0])
            .expect("web search deployment command");

        assert_eq!(specs.len(), 1);
        assert!(specs[0].args.iter().any(|arg| arg == "127.0.0.1:8089:8080"));
        assert!(specs[0].args.iter().any(|arg| arg == "127.0.0.1:8090:6379"));
        assert!(specs[0]
            .args
            .iter()
            .any(|arg| { arg == "CLIO_WEB_SEARCH_TASK_BACKEND_PUBLIC_PORT=8090" }));
        assert!(!specs[0].args.iter().any(|arg| arg == "6379:6379"));
    }

    #[test]
    fn web_search_accepts_an_alternate_document_task_port() {
        let definition = Driver::WebSearch.definition(&facts("linux", "none"));
        let mut input = request("web_search", "container");
        input.target = "ssh".into();
        input
            .configuration
            .insert("task_backend_port".into(), "18090".into());

        let specs = Driver::WebSearch
            .start(&input, &definition.variants[0])
            .expect("web search deployment command");

        assert!(specs[0].args.iter().any(|arg| arg == "0.0.0.0:18090:6379"));
        assert!(specs[0]
            .args
            .iter()
            .any(|arg| { arg == "CLIO_WEB_SEARCH_TASK_BACKEND_PUBLIC_PORT=18090" }));
    }

    #[test]
    fn observed_container_state_distinguishes_running_stopped_and_absent_resources() {
        let mut containers = BTreeMap::new();
        containers.insert("clio-web-search".into(), "running".into());
        containers.insert("clio-llama-cpp".into(), "exited".into());
        let linux = facts("linux", "none");

        assert_eq!(
            observed_service_state(Driver::WebSearch, &linux, &containers),
            "running"
        );
        assert_eq!(
            observed_service_state(Driver::LlamaCpp, &linux, &containers),
            "stopped"
        );
        assert_eq!(
            observed_service_state(Driver::Vllm, &linux, &containers),
            "not_installed"
        );
        assert_eq!(
            observed_service_state(Driver::Relay, &linux, &containers),
            "unknown"
        );
    }

    #[test]
    fn vllm_uses_inspected_capabilities_instead_of_host_names() {
        assert_eq!(
            Driver::Vllm
                .definition(&facts("linux", "nvidia"))
                .recommended_variant,
            "cuda"
        );
        let windows = Driver::Vllm.definition(&facts("windows", "amd"));
        assert!(windows.recommended_variant.is_empty());
        assert!(windows.variants.iter().all(|variant| !variant.compatible));

        let mut homelab = facts("linux", "nvidia");
        homelab.target = "homelab".into();
        let homelab = Driver::Vllm.definition(&homelab);
        assert_eq!(homelab.recommended_variant, "cuda");
        assert!(homelab
            .variants
            .iter()
            .any(|variant| variant.id == "cpu" && variant.compatible));
    }

    #[test]
    fn command_builders_use_only_approved_artifacts() {
        let definition = Driver::Vllm.definition(&facts("linux", "nvidia"));
        let mut input = request("vllm", "cuda");
        input
            .configuration
            .insert("model".into(), "Qwen/Qwen3-8B".into());
        let commands = Driver::Vllm.start(&input, &definition.variants[0]).unwrap();
        assert!(commands[0]
            .args
            .contains(&"vllm/vllm-openai:v0.28.0".into()));
        assert!(commands[0].args.contains(&"--gpus".into()));
        assert!(commands[0]
            .args
            .windows(2)
            .any(|pair| pair == ["--reasoning-parser", "qwen3"]));

        input
            .configuration
            .insert("reasoning_parser".into(), "shell-command".into());
        assert!(Driver::Vllm
            .start(&input, &definition.variants[0])
            .unwrap_err()
            .contains("not supported"));

        let mut windows = facts("windows", "amd");
        windows.target = "This computer".into();
        let definition = Driver::LlamaCpp.definition(&windows);
        assert_eq!(definition.recommended_variant, "native-windows-cpu");
        let variant = &definition.variants[0];
        let install = Driver::LlamaCpp
            .install(&request("llama_cpp", "native-windows-cpu"), variant)
            .unwrap();
        assert_eq!(install[0].program, "powershell");
        assert!(install[0]
            .args
            .contains(&LLAMA_WINDOWS_CPU_ARCHIVE.to_string()));
        let mut input = request("llama_cpp", "native-windows-cpu");
        input
            .configuration
            .insert("model_path".into(), r"D:\models\qwen.gguf".into());
        let start = Driver::LlamaCpp.start(&input, variant).unwrap();
        assert_eq!(start[0].program, "powershell");
        assert!(start[0]
            .args
            .iter()
            .any(|arg| arg.contains("Start-Process")));
    }

    #[test]
    fn web_search_install_creates_and_starts_the_managed_container() {
        let definition = Driver::WebSearch.definition(&facts("linux", "none"));
        let mut input = request("web_search", "container");
        input.target = "ssh".into();
        input.ssh_profile = Some("ares".into());
        input
            .configuration
            .insert("contact_email".into(), "scientist@example.org".into());

        let commands = Driver::WebSearch
            .install(&input, &definition.variants[0])
            .expect("Web Search deployment commands");

        assert_eq!(commands.len(), 2);
        assert_eq!(commands[0].args, strings(&["pull", WEB_IMAGE]));
        assert_eq!(commands[1].args[0], "run");
        assert!(commands[1].args.contains(&"clio-web-search".into()));
        assert!(commands[1].args.contains(&"0.0.0.0:8089:8080".into()));
        assert!(commands[1].args.contains(&"0.0.0.0:8090:6379".into()));
    }

    #[test]
    fn relay_builds_install_bootstrap_and_status_commands() {
        let mut input = request("relay", "uv-tool");
        input.target = "ssh".into();
        input.ssh_profile = Some("homelab".into());
        input
            .configuration
            .insert("cluster_name".into(), "lab".into());
        input
            .configuration
            .insert("agent_bin".into(), "agent".into());
        input
            .configuration
            .insert("relay_artifact_sha256".into(), "ab".repeat(32));
        let commands = Driver::Relay
            .start(
                &input,
                &Driver::Relay.definition(&facts("linux", "none")).variants[0],
            )
            .unwrap();
        assert_eq!(commands.len(), 3);
        assert!(commands[1].args.contains(&"bootstrap".into()));
        assert!(commands[2]
            .args
            .contains(&"install-endpoint-service".into()));
    }

    #[test]
    fn quotes_remote_arguments_and_rejects_shell_shaped_profiles() {
        assert_eq!(shell_quote("a'b"), "'a'\"'\"'b'");
        assert!(validate_ssh_profile("homelab").is_ok());
        assert!(validate_ssh_profile("-oProxyCommand=bad").is_err());
        assert!(validate_ssh_profile("host;bad").is_err());
        assert!(validate_ssh_profile("two hosts").is_err());
        assert!(validate_ssh_host("10.0.0.102").is_ok());
        assert!(validate_ssh_host("login.example.edu").is_ok());
        assert!(validate_ssh_host("host;bad").is_err());
        assert!(validate_ssh_user("alice.smith").is_ok());
        assert!(validate_ssh_user("alice;bad").is_err());
    }

    #[test]
    fn builds_distinct_local_and_ssh_invocations() {
        // Uses a program name other than the literal "docker": that name is
        // special-cased by resolved_local_program to prefer a real install
        // path when one exists on the host, which would make this assertion
        // depend on whether the machine running the suite has Docker Desktop
        // installed. See resolved_local_program_from's own tests below for
        // coverage of that resolution behavior with controlled candidates.
        let local = ManagedTargetRequest {
            target: "local".into(),
            ..Default::default()
        };
        assert_eq!(
            target_invocation(&local, "docker-compose", &["pull", WEB_IMAGE]),
            ("docker-compose".into(), strings(&["pull", WEB_IMAGE]))
        );

        let remote = ManagedTargetRequest {
            target: "ssh".into(),
            ssh_profile: Some("gpu-host".into()),
            ..Default::default()
        };
        assert_eq!(
            target_invocation(&remote, "docker", &["pull", WEB_IMAGE]),
            (
                "ssh".into(),
                vec![
                    "-o".into(),
                    "StrictHostKeyChecking=accept-new".into(),
                    "-o".into(),
                    "ConnectTimeout=8".into(),
                    "-o".into(),
                    "BatchMode=yes".into(),
                    "gpu-host".into(),
                    "--".into(),
                    format!("'docker' 'pull' '{}'", WEB_IMAGE),
                ],
            )
        );

        let manual = ManagedTargetRequest {
            target: "ssh".into(),
            ssh_host: Some("10.0.0.102".into()),
            ssh_user: Some("alice".into()),
            ssh_port: Some(2222),
            ssh_identity_file: Some(r"D:\keys\lab key".into()),
            ..Default::default()
        };
        assert_eq!(
            target_invocation(&manual, "uname", &["-s"]),
            (
                "ssh".into(),
                vec![
                    "-o".into(),
                    "StrictHostKeyChecking=accept-new".into(),
                    "-o".into(),
                    "ConnectTimeout=8".into(),
                    "-o".into(),
                    "BatchMode=yes".into(),
                    "-p".into(),
                    "2222".into(),
                    "-i".into(),
                    r"D:\keys\lab key".into(),
                    "alice@10.0.0.102".into(),
                    "--".into(),
                    "'uname' '-s'".into(),
                ],
            )
        );
    }

    #[test]
    fn clio_deployment_is_pinned_and_starts_the_installed_service() {
        let spec = clio_install_spec(None).expect("default CLIO install spec");
        assert_eq!(spec.program, "bash");
        assert_eq!(spec.args[0], "-lc");
        assert!(spec.args[1].contains("CLIO_VERSION=0.9.4.2"));
        assert!(spec.args[1].contains("/v0.9.4.2/install/install.sh"));
        assert!(spec.args[1].contains("CLIO_ARC_CTE_DIR="));
        assert!(spec.args[1].contains("CLIO_RUNTIME_STATE_DIR="));
        assert!(spec.args[1].contains("CLIO_DATA_DIR="));
        assert!(spec.args[1].contains("command -v uv"));
        assert!(spec.args[1].contains("https://astral.sh/uv/install.sh"));
        assert!(spec.args[1].contains("UV_PYTHON_INSTALL_DIR="));
        assert!(spec.args[1].contains("clio\" start"));

        let custom =
            clio_install_spec(Some("/mnt/common/alice/clio")).expect("custom CLIO install spec");
        assert!(custom.args[1].contains("'/mnt/common/alice/clio'"));
        assert!(custom.args[1].contains("'/mnt/common/alice/clio/bin'"));
        assert!(custom.args[1].contains("'/mnt/common/alice/clio/cte'"));
        assert!(custom.args[1].contains("'/mnt/common/alice/clio/bin/clio' start"));
        assert!(clio_install_spec(Some("relative/path")).is_err());
        assert!(clio_install_spec(Some("/mnt/common/../escape")).is_err());
    }

    #[test]
    fn resolved_local_program_falls_back_to_plain_docker_when_no_candidate_exists() {
        let candidates = [
            PathBuf::from("Z:\\definitely-not-a-real-clio-test-path\\docker.exe"),
            PathBuf::from("/definitely/not/a/real/clio/test/path/docker"),
        ];
        assert_eq!(resolved_local_program_from("docker", &candidates), "docker");
        // Non-docker programs never consult the filesystem at all.
        assert_eq!(
            resolved_local_program_from("docker-compose", &candidates),
            "docker-compose"
        );
    }

    #[test]
    fn resolved_local_program_prefers_a_real_known_install_when_present() {
        static UNIQUE: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
        let unique = UNIQUE.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
        let dir = env::temp_dir().join(format!(
            "clio-desktop-test-docker-{}-{unique}",
            std::process::id(),
        ));
        fs::create_dir_all(&dir).expect("create test candidate dir");
        let real = dir.join("docker.exe");
        fs::write(&real, b"").expect("write fake docker binary");
        let candidates = [
            PathBuf::from("Z:\\definitely-not-a-real-clio-test-path\\docker.exe"),
            real.clone(),
        ];
        assert_eq!(
            resolved_local_program_from("docker", &candidates),
            real.to_string_lossy()
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn discovery_commands_are_stopped_after_their_deadline() {
        #[cfg(target_os = "windows")]
        let (program, args) = (
            "powershell",
            strings(&[
                "-NoProfile",
                "-NonInteractive",
                "-Command",
                "Start-Sleep -Seconds 10",
            ]),
        );
        #[cfg(not(target_os = "windows"))]
        let (program, args) = ("sh", strings(&["-c", "sleep 10"]));

        let started = Instant::now();
        let mut command = background_command(program);
        command.args(&args);
        let error =
            output_before_deadline(command, program, Duration::from_millis(100)).unwrap_err();

        assert!(error.contains("did not finish target inspection"));
        assert!(started.elapsed() < Duration::from_secs(3));
    }

    #[test]
    fn parses_concrete_ssh_profiles_only() {
        let profiles = parse_ssh_profiles(
            r#"
            Host *
              ServerAliveInterval 30
            Host homelab
              HostName 10.0.0.102
              User scientist
            Host ares login-alias
              HostName login.example.edu
            Host *.internal
              User ignored
            "#,
        );
        assert_eq!(profiles.len(), 3);
        assert_eq!(profiles[0].name, "ares");
        assert_eq!(profiles[0].hostname.as_deref(), Some("login.example.edu"));
        assert_eq!(profiles[1].name, "homelab");
        assert_eq!(profiles[1].user.as_deref(), Some("scientist"));
    }

    #[test]
    fn restricts_contact_email_to_the_safe_remote_argument_charset() {
        assert!(validate_email("scientist@example.org").is_ok());
        assert!(validate_email("").is_ok());
        assert!(validate_email("a@example.org;touch-pwned").is_err());
        assert!(validate_email("a@example.org|whoami").is_err());
        assert!(validate_email("a@example.org$(whoami)").is_err());
        assert!(validate_email("a+tag@example.org").is_ok());
        assert!(validate_email("a@exam+ple.org").is_err());
        assert!(validate_ssh_profile("ares+login").is_err());
    }
}
