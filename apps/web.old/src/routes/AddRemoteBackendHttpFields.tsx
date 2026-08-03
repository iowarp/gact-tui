/**
 * HTTP-mode field set for the add-remote-backend form (URL + bearer token).
 */
import type { Accessor, Setter } from 'solid-js';

export function AddRemoteBackendHttpFields(props: {
  url: Accessor<string>;
  setUrl: Setter<string>;
  token: Accessor<string>;
  setToken: Setter<string>;
}) {
  return (
    <>
      <div class="field">
        <label for="add-url">Backend URL</label>
        <input
          id="add-url"
          type="url"
          value={props.url()}
          onInput={(e) => props.setUrl(e.currentTarget.value)}
          data-testid="add-remote-url"
        />
      </div>
      <div class="field">
        <label for="add-token">Bearer token</label>
        <input
          id="add-token"
          type="password"
          value={props.token()}
          onInput={(e) => props.setToken(e.currentTarget.value)}
          placeholder="paste a bearer token from the remote backend"
          data-testid="add-remote-token"
        />
      </div>
    </>
  );
}
