/** Browser fixture: production dialog with only the native/remote boundaries simulated. */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createRoot } from 'react-dom/client';
import '../../src/index.css';

const timestamp = '2026-10-03T00:00:00Z';
const target = {
  id: 'preview-target',
  label: 'HPC',
  kind: 'ssh',
  install_root: '',
  ssh: { profile: 'hpc', host: 'cluster.example', user: 'scientist', port: 22, jump_hosts: [] },
  transport_state: 'connected',
  auto_reconnect: true,
  created_at: timestamp,
  updated_at: timestamp,
};
const nativeStatus = { session_id: 'ssh-preview', state: 'connected', reused: false, output: '' };
Object.assign(window, {
  __TAURI_INTERNALS__: {
    transformCallback: () => 1,
    unregisterCallback: () => undefined,
    invoke: async (command: string, args?: { req?: { url: string; method: string } }) => {
      if (command === 'get_backend')
        return {
          url: 'http://127.0.0.1:18947',
          bearer_token: 'preview',
          status: { kind: 'ready' },
        };
      if (command === 'desktop_deployment_owner') return 'desktop-preview';
      if (command === 'ssh_profiles_list' || command === 'ssh_profiles_list_all')
        return [
          {
            name: 'hpc',
            label: 'HPC',
            hostname: 'cluster.example',
            user: 'scientist',
            port: 22,
            platform: 'linux',
            jump_hosts: [],
            managed: false,
          },
        ];
      if (command.startsWith('plugin:event|')) return 1;
      if (command === 'ssh_transport_open' || command === 'ssh_transport_status')
        return nativeStatus;
      if (command === 'gact_http' && args?.req) {
        const { pathname } = new URL(args.req.url);
        let body: unknown;
        if (pathname === '/v1/infrastructure/targets')
          body = args.req.method === 'GET' ? { targets: [] } : target;
        else if (pathname.endsWith('/transport-state')) body = target;
        else if (pathname.endsWith('/actions'))
          body = {
            id: 'preview-operation',
            service_id: 'clio_agent',
            target_id: target.id,
            action: 'install',
            state: 'failed',
            progress: 'An existing agent needs a decision',
            logs: '',
            created_at: timestamp,
            updated_at: timestamp,
            error: 'clio_deploy_version_conflict',
            conflict: {
              installed_version: '0.9.4.24',
              target_version: '0.9.5b1',
              pid: '321',
              health: 'healthy',
              owner: '/home/scientist/.local/share/clio',
              port: 17800,
            },
          };
        else throw new Error(`Unexpected preview request: ${pathname}`);
        return { status: 200, status_text: 'OK', headers: {}, body: JSON.stringify(body) };
      }
      throw new Error(`Unexpected preview command: ${command}`);
    },
  },
  __TAURI_EVENT_PLUGIN_INTERNALS__: { unregisterListener: () => undefined },
});
class PreviewSocket extends EventTarget {
  static OPEN = 1;
  readyState = 0;
  protocol = 'clio.infrastructure.v2';
  constructor() {
    super();
    setTimeout(() => {
      this.readyState = 1;
      this.dispatchEvent(new Event('open'));
      this.dispatchEvent(new MessageEvent('message', { data: '{"type":"attached"}' }));
    }, 10);
  }
  send() {}
  close() {
    this.readyState = 3;
    this.dispatchEvent(new CloseEvent('close'));
  }
}
Object.assign(window, { WebSocket: PreviewSocket });
const { DeployClioDialog } = await import('../../src/components/clio/deploy-clio-dialog');
createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <DeployClioDialog open onReady={async () => undefined} />
  </QueryClientProvider>,
);
