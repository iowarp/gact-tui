import type { CreateSourceInput, SourceProvider } from '@clio/core/v3';
import { cleanup, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it } from 'vitest';
import { renderWithTooltips } from '@/test/render-with-tooltips';
import { SourceS3Fields } from './source-s3-fields';
import { useSourceFields } from './use-source-fields';

const s3: SourceProvider = {
  id: 's3',
  name: 'Amazon S3',
  logo: 's3',
  authentication: 'none',
  configured: true,
  capabilities: { supported_modes: ['read_only'], unavailable_reasons: {} },
  setup_requirement: null,
};

let latest: { ready: boolean; input: CreateSourceInput } | undefined;

function Harness() {
  const fields = useSourceFields(s3);
  latest = { ready: fields.ready, input: fields.input('read_only') };
  return (
    <>
      <input
        aria-label="Bucket"
        value={fields.root}
        onChange={(e) => fields.setRoot(e.target.value)}
      />
      <SourceS3Fields fields={fields} formId="f" disabled={false} />
    </>
  );
}

describe('SourceS3Fields', () => {
  afterEach(cleanup);

  it('connects a public bucket with a region and sends no keys', async () => {
    const user = userEvent.setup();
    renderWithTooltips(<Harness />);
    await user.type(screen.getByLabelText('Bucket'), 'open-data/era5');
    expect(latest?.ready).toBe(false); // a region is required
    await user.type(screen.getByLabelText('Region'), 'us-west-2');
    expect(latest?.ready).toBe(true);
    expect(latest?.input).toMatchObject({
      provider: 's3',
      root: 'open-data/era5',
      configuration: { s3_region: 'us-west-2' },
    });
    expect(latest?.input.s3_credentials).toBeUndefined();
  });

  it('asks for both halves of an access key and sends them only with key access', async () => {
    const user = userEvent.setup();
    renderWithTooltips(<Harness />);
    await user.type(screen.getByLabelText('Bucket'), 'private/run1');
    await user.type(screen.getByLabelText('Region'), 'us-east-1');
    await user.click(screen.getByRole('radio', { name: 'Access key' }));
    expect(latest?.ready).toBe(false);
    await user.type(screen.getByLabelText('Access key ID'), 'AKIAEXAMPLE');
    expect(latest?.ready).toBe(false);
    const secret = screen.getByLabelText('Secret access key');
    expect(secret).toHaveAttribute('type', 'password');
    await user.type(secret, 's3cr3t');
    expect(latest?.ready).toBe(true);
    expect(latest?.input).toMatchObject({
      configuration: { s3_access: 'keys' },
      s3_credentials: { access_key_id: 'AKIAEXAMPLE', secret_access_key: 's3cr3t' },
    });
    await user.click(screen.getByRole('radio', { name: 'Public' }));
    expect(latest?.input.s3_credentials).toBeUndefined();
  });
});
