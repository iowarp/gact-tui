import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { AssociatedApplicationIcon } from './associated-application-icon';

afterEach(cleanup);
const app = { id: 'registered-app', name: 'Installed app', is_default: true };
const png = 'data:image/png;base64,iVBORw0KGgo=';

it('displays the native icon without adding a duplicate accessible app label', () => {
  const { container } = render(
    <AssociatedApplicationIcon application={{ ...app, icon_data_url: png }} />,
  );
  const image = container.querySelector('img');
  expect(image).toHaveAttribute('src', png);
  expect(image).toHaveAttribute('alt', '');
  expect(image).toHaveAttribute('aria-hidden', 'true');
  expect(image).toHaveAttribute('width', '16');
});

it.each([
  undefined,
  'https://remote.example/icon.png',
  'data:image/svg+xml,<svg/>',
  'data:image/png;base64,' + 'a'.repeat(2_800_000),
])('uses a generic icon when the supplied icon is missing or unsupported', (icon_data_url) => {
  const { container } = render(
    <AssociatedApplicationIcon application={{ ...app, icon_data_url }} />,
  );
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('svg')).not.toBeNull();
});

it('recovers from a broken icon and accepts a later replacement', () => {
  const { container, rerender } = render(
    <AssociatedApplicationIcon application={{ ...app, icon_data_url: png }} />,
  );
  fireEvent.error(container.querySelector('img')!);
  expect(container.querySelector('img')).toBeNull();
  expect(container.querySelector('svg')).not.toBeNull();
  const replacement = png + 'AA==';
  rerender(<AssociatedApplicationIcon application={{ ...app, icon_data_url: replacement }} />);
  expect(container.querySelector('img')).toHaveAttribute('src', replacement);
});
