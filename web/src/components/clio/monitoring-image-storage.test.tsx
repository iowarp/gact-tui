import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, expect, it, vi } from 'vitest';
import { MonitoringImageStorage } from './monitoring-image-storage';

afterEach(cleanup);

it('offers a deployment-owned store only for Podman and explains the volume distinction', async () => {
  const onChange = vi.fn();
  const { rerender } = render(
    <MonitoringImageStorage
      configuration={{}}
      runtime="docker"
      owned={false}
      hostLabel="Homelab"
      onChange={onChange}
    />,
  );
  await userEvent.click(screen.getByRole('combobox', { name: 'Container image storage' }));
  expect(screen.getByRole('option', { name: 'Service folder · Podman' })).toHaveAttribute(
    'aria-disabled',
    'true',
  );
  await userEvent.keyboard('{Escape}');
  rerender(
    <MonitoringImageStorage
      configuration={{}}
      runtime="podman"
      owned={false}
      hostLabel="Homelab"
      onChange={onChange}
    />,
  );
  await userEvent.click(screen.getByRole('combobox', { name: 'Container image storage' }));
  await userEvent.click(screen.getByRole('option', { name: 'Service folder · Podman' }));
  expect(onChange).toHaveBeenCalledWith('service');
  await userEvent.click(screen.getByRole('button', { name: 'About container image storage' }));
  expect(await screen.findByText(/including on another disk/u)).toBeVisible();
});

it('keeps the existing image store fixed while data is retained', () => {
  render(
    <MonitoringImageStorage
      configuration={{ image_storage: 'service' }}
      runtime="podman"
      owned
      hostLabel="Homelab"
      onChange={vi.fn()}
    />,
  );
  expect(screen.getByRole('combobox', { name: 'Container image storage' })).toBeDisabled();
  expect(screen.getByText('Service folder · Podman')).toBeVisible();
});
