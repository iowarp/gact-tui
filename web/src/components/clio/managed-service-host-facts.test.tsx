import type { TargetFacts } from '@clio/core/v3';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { ManagedServiceHostFacts } from './managed-service-host-facts';
import { hostSummary, runtimeFactLines } from './managed-service-target-utils';

// Verbatim from the owner's machine (0.9.4.19): Docker Desktop installed, not running.
const DOCKER_STOPPED =
  'error during connect: Get "http://%2F%2F.%2Fpipe%2FdockerDesktopLinuxEngine/v1.51/info": open //./pipe/dockerDesktopLinuxEngine: The system cannot find the file specified.';

const facts = (
  overrides: Partial<TargetFacts>,
  runtimes: TargetFacts['container_runtimes'],
): TargetFacts => ({
  target_id: 'local',
  label: 'This computer',
  os: 'windows',
  arch: 'x86_64',
  accelerator: 'none',
  docker_available: false,
  docker_installed: true,
  uv_available: true,
  transport_state: 'connected',
  container_runtimes: runtimes,
  ...overrides,
});

const windowsDockerStopped = facts({}, [
  {
    name: 'docker',
    installed: true,
    usable: false,
    version: '',
    reason: 'unusable',
    failure: 'not_running',
    detail: DOCKER_STOPPED,
  },
  {
    name: 'podman',
    installed: false,
    usable: false,
    version: '',
    reason: 'not_installed',
    detail: '',
  },
  {
    name: 'apptainer',
    installed: false,
    usable: false,
    version: '',
    reason: 'not_installed',
    detail: '',
  },
]);

afterEach(cleanup);

describe('deployment target facts in plain words', () => {
  it('summarizes the computer without internal vocabulary', () => {
    expect(hostSummary(windowsDockerStopped)).toBe('Windows, 64-bit. No GPU detected.');
    expect(hostSummary(facts({ os: 'linux', arch: 'aarch64', accelerator: 'nvidia' }, []))).toBe(
      'Linux, 64-bit ARM. NVIDIA GPU detected.',
    );
    expect(hostSummary(facts({ os: 'macos', arch: 'aarch64', accelerator: 'amd' }, []))).toBe(
      'macOS, 64-bit ARM. AMD GPU detected.',
    );
  });

  it('says what each runtime needs, keeping the raw error only as a detail', () => {
    expect(runtimeFactLines(windowsDockerStopped)).toEqual([
      {
        name: 'docker',
        text: 'Docker is installed but not running. Start Docker Desktop, then check again.',
        detail: DOCKER_STOPPED,
      },
      { name: 'podman', text: 'Podman is not installed.', detail: '' },
      { name: 'apptainer', text: 'Apptainer is not installed.', detail: '' },
    ]);
  });

  it('names permission, timeout, readiness and unclassified failures plainly', () => {
    const lines = runtimeFactLines(
      facts({ os: 'linux' }, [
        {
          name: 'docker',
          installed: true,
          usable: false,
          version: '',
          reason: 'unusable',
          failure: 'permission_denied',
          detail: 'permission denied while trying to connect to the Docker daemon socket',
        },
        {
          name: 'podman',
          installed: true,
          usable: false,
          version: '',
          reason: 'unusable',
          detail: 'stat /run/user/1008: no such file or directory',
        },
        { name: 'apptainer', installed: true, usable: true, version: '1.3.4', detail: '' },
      ]),
    ).map((line) => line.text);

    expect(lines).toEqual([
      'Docker is installed but your account is not allowed to use it.',
      'Podman is installed but is not working.',
      'Apptainer 1.3.4 is ready.',
    ]);
  });

  it('falls back to the Docker flags for a host inspected without runtime facts', () => {
    expect(runtimeFactLines(facts({}, [])).map((line) => line.text)).toEqual([
      'Docker is installed but not running.',
    ]);
  });

  it('renders sentences with the raw runtime error behind a details disclosure', async () => {
    render(<ManagedServiceHostFacts facts={windowsDockerStopped} />);

    expect(screen.getByText('Windows, 64-bit. No GPU detected.')).toBeVisible();
    expect(
      screen.getByText(
        'Docker is installed but not running. Start Docker Desktop, then check again.',
      ),
    ).toBeVisible();
    expect(screen.getByText('Podman is not installed.')).toBeVisible();
    expect(screen.queryByText(/dockerDesktopLinuxEngine/u)).not.toBeInTheDocument();
    expect(screen.queryByText(/accelerator/u)).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Show details' }));

    expect(screen.getByText(DOCKER_STOPPED)).toBeVisible();
  });
});
