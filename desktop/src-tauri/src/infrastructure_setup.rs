//! Minimal allowlisted deployment drivers for optional CLIO services.

use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::env;
use std::fs;
use std::path::PathBuf;
use std::process::{Command, Output};

const WEB_IMAGE: &str = "ghcr.io/iowarp/clio-web-search:0.3.0";
const LLAMA_CPU_IMAGE: &str = "ghcr.io/ggml-org/llama.cpp:server-b10621";
const LLAMA_VULKAN_IMAGE: &str = "ghcr.io/ggml-org/llama.cpp:server-vulkan-b10621";
const LLAMA_WINDOWS_CPU_ARCHIVE: &str =
    "https://github.com/ggml-org/llama.cpp/releases/download/b10621/llama-b10621-bin-win-cpu-x64.zip";
const MAX_LOG_CHARS: usize = 4_000;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SshProfile {
    pub name: String,
    pub hostname: Option<String>,
    pub user: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManagedTargetRequest {
    pub target: String,
    pub ssh_profile: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct TargetFacts {
    pub target: String,
    pub os: String,
    pub arch: String,
    pub accelerator: String,
    pub docker_available: bool,
    pub uv_available: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct ServiceConfigField {
    pub id: String,
    pub label: String,
    pub placeholder: String,
    pub required: bool,
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
    pub label: String,
    pub description: String,
    pub recommended_variant: String,
    pub variants: Vec<ServiceVariant>,
    pub configuration_fields: Vec<ServiceConfigField>,
    pub supports_stop: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ManagedServiceActionRequest {
    pub service_id: String,
    pub action: String,
    pub target: String,
    pub ssh_profile: Option<String>,
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
    pub ssh_profile: Option<String>,
    pub contact_email: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WebSearchDeployResult {
    pub action: String,
    pub target: String,
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
        let vllm_target_allowed = linux && !facts.target.eq_ignore_ascii_case("homelab");
        match self {
            Self::Vllm => definition(
                "vllm",
                "vLLM",
                "OpenAI-compatible model serving.",
                vec![
                    variant(
                        "cuda",
                        "NVIDIA CUDA",
                        "v0.28.0",
                        "vllm/vllm-openai:v0.28.0",
                        docker && vllm_target_allowed && facts.accelerator == "nvidia",
                        "Requires an approved Linux target and an NVIDIA GPU.",
                    ),
                    variant(
                        "rocm",
                        "AMD ROCm",
                        "v0.28.0",
                        "vllm/vllm-openai-rocm:v0.28.0",
                        docker && vllm_target_allowed && facts.accelerator == "amd",
                        "Requires an approved Linux target and a ROCm GPU.",
                    ),
                    variant(
                        "cpu",
                        "CPU",
                        "v0.28.0",
                        "vllm/vllm-openai-cpu:v0.28.0",
                        docker && vllm_target_allowed && facts.arch == "x86_64",
                        "Requires an approved x86-64 Linux target; CPU serving may be slow.",
                    ),
                ],
                vec![field("model", "Model", "Qwen/Qwen3-8B", true)],
                true,
            ),
            Self::LlamaCpp => definition(
                "llama_cpp",
                "llama.cpp",
                "Lightweight GGUF model serving.",
                vec![
                    ServiceVariant {
                        id: "native-windows-cpu".into(),
                        label: "Windows CPU (native)".into(),
                        version: "v0.3.0".into(),
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
                        "v0.3.0",
                        LLAMA_VULKAN_IMAGE,
                        docker && linux && facts.accelerator == "amd",
                        "Requires Linux and a Vulkan-capable AMD GPU.",
                    ),
                    variant(
                        "cpu",
                        "CPU",
                        "v0.3.0",
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
                "CLIO Web Search",
                "Private search and document conversion.",
                vec![variant(
                    "container",
                    "Docker",
                    "0.3.0",
                    WEB_IMAGE,
                    docker,
                    "Requires Docker.",
                )],
                vec![field(
                    "contact_email",
                    "Publication metadata email",
                    "scientist@example.org",
                    false,
                )],
                true,
            ),
            Self::Relay => {
                let compatible =
                    facts.target != "This computer" && local_available("uv", &["--version"]);
                definition(
                    "relay",
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

    fn install(self, variant: &ServiceVariant) -> Vec<CommandSpec> {
        match (self, variant.id.as_str()) {
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
        }
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
                    args.extend(strings(&["--device", "/dev/kfd", "--device", "/dev/dri"]));
                }
                args.extend([variant.artifact.clone(), "--model".into(), model.into()]);
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
                let bind = if request.target == "local" {
                    "127.0.0.1"
                } else {
                    "0.0.0.0"
                };
                let http = format!("{bind}:8089:8080");
                let cache = format!("{bind}:8090:6379");
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
                    &cache,
                    "--volume",
                    "clio-web-search-data:/var/lib/clio-web-search",
                ]);
                if !email.is_empty() {
                    args.extend([
                        "--env".into(),
                        format!("CLIO_WEB_SEARCH_CONTACT_EMAIL={email}"),
                    ]);
                }
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
pub fn infrastructure_preflight(request: ManagedTargetRequest) -> Result<TargetFacts, String> {
    preflight(&request)
}

/// Return the four compiled drivers and their compatible variants.
#[tauri::command]
pub fn infrastructure_managed_services(
    request: ManagedTargetRequest,
) -> Result<Vec<ManagedServiceDefinition>, String> {
    let facts = preflight(&request)?;
    Ok(Driver::all()
        .into_iter()
        .map(|driver| driver.definition(&facts))
        .collect())
}

/// Execute one typed lifecycle action; arbitrary programs and images are impossible.
#[tauri::command]
pub fn infrastructure_managed_service_action(
    request: ManagedServiceActionRequest,
) -> Result<ManagedServiceActionResult, String> {
    run_action(&request)
}

/// Preserve the existing Web Search dialog while routing it through the driver.
#[tauri::command]
pub fn infrastructure_deploy_web_search(
    request: WebSearchDeployRequest,
) -> Result<WebSearchDeployResult, String> {
    validate_email(request.contact_email.as_deref().unwrap_or(""))?;
    let target_request = ManagedTargetRequest {
        target: request.target.clone(),
        ssh_profile: request.ssh_profile.clone(),
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
        ssh_profile: request.ssh_profile.clone(),
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
        "install" => driver.install(variant),
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
    let (os, arch) = if request.target == "local" {
        (
            normalize_os(env::consts::OS),
            normalize_arch(env::consts::ARCH),
        )
    } else {
        (
            probe(request, "uname", &["-s"], normalize_os),
            probe(request, "uname", &["-m"], normalize_arch),
        )
    };
    let docker_available = available(
        request,
        "docker",
        &["version", "--format", "{{.Server.Version}}"],
    );
    let uv_available = available(request, "uv", &["--version"]);
    let accelerator = if available(
        request,
        "nvidia-smi",
        &["--query-gpu=name", "--format=csv,noheader"],
    ) {
        "nvidia"
    } else if available(request, "rocminfo", &["--version"])
        || request.target == "local" && windows_has_amd_gpu()
    {
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
        uv_available,
    })
}

fn run_specs(target: &ManagedTargetRequest, specs: Vec<CommandSpec>) -> Result<String, String> {
    let mut log = String::new();
    for spec in specs {
        let output = if spec.local_only {
            Command::new(&spec.program).args(&spec.args).output()
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
    Command::new(program).args(args).output()
}

fn target_invocation(
    target: &ManagedTargetRequest,
    program: &str,
    args: &[&str],
) -> (String, Vec<String>) {
    if target.target == "local" {
        return (program.into(), strings(args));
    }
    let command = std::iter::once(program)
        .chain(args.iter().copied())
        .map(shell_quote)
        .collect::<Vec<_>>()
        .join(" ");
    (
        "ssh".into(),
        vec![
            target.ssh_profile.clone().unwrap_or_default(),
            "--".into(),
            command,
        ],
    )
}

fn available(target: &ManagedTargetRequest, program: &str, args: &[&str]) -> bool {
    run_target(target, program, args)
        .map(|o| o.status.success())
        .unwrap_or(false)
}
fn local_available(program: &str, args: &[&str]) -> bool {
    Command::new(program)
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
fn probe(
    target: &ManagedTargetRequest,
    program: &str,
    args: &[&str],
    normalize: fn(&str) -> String,
) -> String {
    run_target(target, program, args)
        .map(|o| normalize(&String::from_utf8_lossy(&o.stdout)))
        .unwrap_or_else(|_| "unknown".into())
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
        target.ssh_profile.clone().unwrap_or_default()
    }
}

fn windows_has_amd_gpu() -> bool {
    env::consts::OS == "windows"
        && Command::new("powershell")
            .args([
                "-NoProfile",
                "-Command",
                "(Get-CimInstance Win32_VideoController).Name",
            ])
            .output()
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

fn field(id: &str, label: &str, placeholder: &str, required: bool) -> ServiceConfigField {
    ServiceConfigField {
        id: id.into(),
        label: label.into(),
        placeholder: placeholder.into(),
        required,
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
        label: label.into(),
        description: description.into(),
        recommended_variant,
        variants,
        configuration_fields: fields,
        supports_stop,
    }
}

fn validate_target(target: &ManagedTargetRequest) -> Result<(), String> {
    match target.target.as_str() {
        "local" => Ok(()),
        "ssh" => validate_ssh_profile(
            target
                .ssh_profile
                .as_deref()
                .ok_or("Choose an SSH profile.")?,
        ),
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
            uv_available: true,
        }
    }
    fn request(service: &str, variant: &str) -> ManagedServiceActionRequest {
        ManagedServiceActionRequest {
            service_id: service.into(),
            action: "start".into(),
            target: "local".into(),
            ssh_profile: None,
            variant_id: variant.into(),
            configuration: BTreeMap::new(),
        }
    }

    #[test]
    fn vllm_recommends_only_proven_acceleration() {
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
        assert!(homelab.recommended_variant.is_empty());
        assert!(homelab.variants.iter().all(|variant| !variant.compatible));
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

        let mut windows = facts("windows", "amd");
        windows.target = "This computer".into();
        let definition = Driver::LlamaCpp.definition(&windows);
        assert_eq!(definition.recommended_variant, "native-windows-cpu");
        let variant = &definition.variants[0];
        let install = Driver::LlamaCpp.install(variant);
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
    }

    #[test]
    fn builds_distinct_local_and_ssh_invocations() {
        let local = ManagedTargetRequest {
            target: "local".into(),
            ssh_profile: None,
        };
        assert_eq!(
            target_invocation(&local, "docker", &["pull", WEB_IMAGE]),
            ("docker".into(), strings(&["pull", WEB_IMAGE]))
        );

        let remote = ManagedTargetRequest {
            target: "ssh".into(),
            ssh_profile: Some("gpu-host".into()),
        };
        assert_eq!(
            target_invocation(&remote, "docker", &["pull", WEB_IMAGE]),
            (
                "ssh".into(),
                vec![
                    "gpu-host".into(),
                    "--".into(),
                    format!("'docker' 'pull' '{}'", WEB_IMAGE),
                ],
            )
        );
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
