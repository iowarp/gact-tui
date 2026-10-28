//! Keep managed-package workers inside the desktop's Windows process lifetime.
//!
//! The desktop itself joins the job before starting an installer, so descendants
//! inherit membership from birth. Assigning only the child after spawn would race
//! its own children. Match the launcher's breakaway policy for the shared Core daemon.

use std::sync::OnceLock;

use windows_sys::Win32::{
    Foundation::CloseHandle,
    System::{
        JobObjects::{
            AssignProcessToJobObject, CreateJobObjectW, JobObjectExtendedLimitInformation,
            SetInformationJobObject, JOBOBJECT_EXTENDED_LIMIT_INFORMATION,
            JOB_OBJECT_LIMIT_BREAKAWAY_OK, JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE,
        },
        Threading::GetCurrentProcess,
    },
};

// Intentionally held until process exit: Windows closes the handle even if the
// app is terminated before Tauri's shutdown callback or Rust destructors run.
static JOB: OnceLock<Result<usize, String>> = OnceLock::new();

pub(crate) fn ensure_owned_job() -> Result<(), String> {
    JOB.get_or_init(create_owned_job)
        .as_ref()
        .map(|_| ())
        .map_err(Clone::clone)
}

pub(crate) fn configure_launcher(command: &mut std::process::Command) {
    use std::os::windows::process::CommandExt;

    // The launcher already owns its backend job and monitors the desktop through
    // a pinned handle. Let it outlive our job long enough to launch shared-Core
    // crash cleanup after a forced desktop exit.
    let breakaway = if JOB.get().is_some_and(|result| result.is_ok()) {
        0x0100_0000
    } else {
        0
    };
    command.creation_flags(0x0800_0000 | breakaway);
}

fn create_owned_job() -> Result<usize, String> {
    unsafe {
        let job = CreateJobObjectW(std::ptr::null(), std::ptr::null());
        if job.is_null() {
            return Err(format!(
                "create installer process job: {}",
                std::io::Error::last_os_error()
            ));
        }
        let mut info: JOBOBJECT_EXTENDED_LIMIT_INFORMATION = std::mem::zeroed();
        info.BasicLimitInformation.LimitFlags =
            JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE | JOB_OBJECT_LIMIT_BREAKAWAY_OK;
        let configured = SetInformationJobObject(
            job,
            JobObjectExtendedLimitInformation,
            (&info as *const JOBOBJECT_EXTENDED_LIMIT_INFORMATION).cast(),
            std::mem::size_of_val(&info) as u32,
        );
        if configured == 0 || AssignProcessToJobObject(job, GetCurrentProcess()) == 0 {
            let error = std::io::Error::last_os_error();
            CloseHandle(job);
            return Err(format!("own installer process job: {error}"));
        }
        Ok(job as usize)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{
        process::{Child, Command, Stdio},
        time::{Duration, Instant},
    };
    use windows_sys::Win32::{
        Foundation::{HANDLE, WAIT_OBJECT_0, WAIT_TIMEOUT},
        System::Threading::{
            OpenProcess, TerminateProcess, WaitForSingleObject, PROCESS_QUERY_LIMITED_INFORMATION,
            PROCESS_TERMINATE,
        },
    };

    const FIXTURE: &str = "execution_install_job::tests::installer_job_fixture";

    struct Owned(Child);
    impl Drop for Owned {
        fn drop(&mut self) {
            let _ = self.0.kill();
            let _ = self.0.wait();
        }
    }

    struct Pinned(HANDLE);
    impl Pinned {
        fn open(pid: u32) -> Self {
            let handle = unsafe {
                OpenProcess(
                    PROCESS_QUERY_LIMITED_INFORMATION | PROCESS_TERMINATE | 0x0010_0000,
                    0,
                    pid,
                )
            };
            assert!(!handle.is_null());
            Self(handle)
        }
    }
    impl Drop for Pinned {
        fn drop(&mut self) {
            unsafe {
                TerminateProcess(self.0, 1);
                WaitForSingleObject(self.0, 5000);
                CloseHandle(self.0);
            }
        }
    }

    #[test]
    fn installer_job_fixture() {
        let Ok(role) = std::env::var("GACT_INSTALLER_JOB_FIXTURE") else {
            return;
        };
        if role == "parent" {
            ensure_owned_job().expect("hold parent kill job");
            let child = Command::new(std::env::current_exe().unwrap())
                .args(["--exact", FIXTURE, "--nocapture"])
                .env("GACT_INSTALLER_JOB_FIXTURE", "descendant")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap();
            let mut launcher = Command::new(std::env::current_exe().unwrap());
            launcher
                .args(["--exact", FIXTURE, "--nocapture"])
                .env("GACT_INSTALLER_JOB_FIXTURE", "launcher")
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null());
            configure_launcher(&mut launcher);
            let launcher = launcher.spawn().unwrap();
            std::fs::write(
                std::env::var("GACT_INSTALLER_JOB_READY").unwrap(),
                format!("{},{}", child.id(), launcher.id()),
            )
            .unwrap();
        } else {
            // A failing witness still retires itself if the test cannot open it.
            std::thread::sleep(Duration::from_secs(30));
            return;
        }
        loop {
            std::thread::sleep(Duration::from_secs(1));
        }
    }

    #[test]
    fn installer_job_reaps_workers_and_preserves_launcher_cleanup() {
        let ready = std::env::temp_dir().join(format!(
            "gact-install-job-{}-{}.pid",
            std::process::id(),
            rand::random::<u64>()
        ));
        let mut parent = Owned(
            Command::new(std::env::current_exe().unwrap())
                .args(["--exact", FIXTURE, "--nocapture"])
                .env("GACT_INSTALLER_JOB_FIXTURE", "parent")
                .env("GACT_INSTALLER_JOB_READY", &ready)
                .stdin(Stdio::null())
                .stdout(Stdio::null())
                .stderr(Stdio::null())
                .spawn()
                .unwrap(),
        );
        let deadline = Instant::now() + Duration::from_secs(10);
        let pids = loop {
            if let Ok(value) = std::fs::read_to_string(&ready) {
                if let Ok(pids) = value
                    .split(',')
                    .map(str::parse::<u32>)
                    .collect::<Result<Vec<_>, _>>()
                {
                    if pids.len() == 2 {
                        break pids;
                    }
                }
            }
            assert!(
                Instant::now() < deadline,
                "installer descendant did not start"
            );
            assert!(parent.0.try_wait().unwrap().is_none(), "job fixture failed");
            std::thread::sleep(Duration::from_millis(20));
        };
        std::fs::remove_file(ready).unwrap();
        // Pin the exact process before killing the parent: no PID-reuse check.
        let worker = Pinned::open(pids[0]);
        let launcher = Pinned::open(pids[1]);
        parent.0.kill().unwrap();
        parent.0.wait().unwrap();
        let result = unsafe { WaitForSingleObject(worker.0, 5000) };
        assert_eq!(
            result, WAIT_OBJECT_0,
            "installer descendant survived desktop termination"
        );
        assert_eq!(
            unsafe { WaitForSingleObject(launcher.0, 100) },
            WAIT_TIMEOUT,
            "launcher cannot run its existing shared-Core cleanup after desktop exit"
        );
    }
}
