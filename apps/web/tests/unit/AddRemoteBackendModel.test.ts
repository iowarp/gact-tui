import { describe, expect, it } from 'vitest';
import {
  DEFAULT_HTTP_BACKEND_URL,
  DEFAULT_SSH_REMOTE_PORT,
  INACTIVE_SSH_TUNNEL_URL,
  buildRemoteBackendEntry,
  buildRemoteBackendId,
  normalizeBackendUrl,
  parseSshRemotePort,
  validateAddRemoteBackendValues,
  type AddRemoteBackendValues,
} from '../../src/routes/AddRemoteBackendModel.js';

const baseValues: AddRemoteBackendValues = {
  mode: 'http',
  label: 'Remote',
  url: DEFAULT_HTTP_BACKEND_URL,
  token: '',
  sshHost: '',
  sshUser: '',
  sshKey: '',
  sshRemotePort: DEFAULT_SSH_REMOTE_PORT,
};

describe('AddRemoteBackendModel', () => {
  it('validates the required fields for HTTP and SSH backends', () => {
    expect(validateAddRemoteBackendValues({ ...baseValues, label: ' ' })).toMatch(
      /Pick a label/,
    );
    expect(validateAddRemoteBackendValues({ ...baseValues, url: ' ' })).toMatch(
      /URL is required/,
    );
    expect(
      validateAddRemoteBackendValues({
        ...baseValues,
        mode: 'ssh',
        sshHost: '',
        sshUser: 'jcernuda',
      }),
    ).toMatch(/SSH host and user/);
    expect(
      validateAddRemoteBackendValues({
        ...baseValues,
        mode: 'ssh',
        sshHost: 'polaris.alcf.anl.gov',
        sshUser: 'jcernuda',
        sshRemotePort: '0',
      }),
    ).toMatch(/Remote port/);
    expect(validateAddRemoteBackendValues(baseValues)).toBeNull();
  });

  it('normalizes URLs and remote backend ids', () => {
    expect(normalizeBackendUrl(' http://127.0.0.1:18221/// ')).toBe(
      'http://127.0.0.1:18221',
    );
    expect(buildRemoteBackendId('ssh', 'abc123')).toBe('ssh:abc123');
    expect(parseSshRemotePort(' 17800 ')).toBe(17800);
  });

  it('builds HTTP backend entries from trimmed form values', () => {
    expect(
      buildRemoteBackendEntry(
        {
          ...baseValues,
          label: ' Remote B ',
          url: ' http://127.0.0.1:18221/ ',
          token: ' secret ',
        },
        'http:id',
      ),
    ).toEqual({
      id: 'http:id',
      label: 'Remote B',
      url: 'http://127.0.0.1:18221',
      bearerToken: 'secret',
      kind: 'http',
      ssh: undefined,
    });
  });

  it('builds SSH backend entries with inactive or opened tunnel details', () => {
    const values: AddRemoteBackendValues = {
      ...baseValues,
      mode: 'ssh',
      label: ' Polaris ',
      token: ' token ',
      sshHost: ' polaris.alcf.anl.gov ',
      sshUser: ' jcernuda ',
      sshKey: ' ~/.ssh/id_ed25519 ',
      sshRemotePort: ' 17800 ',
    };

    expect(buildRemoteBackendEntry(values, 'ssh:id')).toEqual({
      id: 'ssh:id',
      label: 'Polaris',
      url: INACTIVE_SSH_TUNNEL_URL,
      bearerToken: 'token',
      kind: 'ssh-tunnel',
      ssh: {
        host: 'polaris.alcf.anl.gov',
        user: 'jcernuda',
        keyPath: '~/.ssh/id_ed25519',
      },
    });
    expect(
      buildRemoteBackendEntry(values, 'ssh:id', {
        localUrl: 'http://127.0.0.1:30001',
        localPort: 30001,
      }).ssh,
    ).toMatchObject({ localPort: 30001 });
  });
});
