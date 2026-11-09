import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { StableInput } from './stable-input';

describe('StableInput', () => {
  it('leaves the node untouched when only the owner re-renders, and calls the latest handler', async () => {
    const first = vi.fn();
    const latest = vi.fn();
    const { container, rerender } = render(
      <StableInput aria-label="Upload files" onChange={first} type="file" />,
    );
    const input = container.querySelector('input')!;
    const mutations: string[] = [];
    const observer = new MutationObserver((records) => {
      for (const record of records) mutations.push(record.attributeName ?? '');
    });
    observer.observe(input, { attributes: true });

    rerender(<StableInput aria-label="Upload files" onChange={latest} type="file" />);
    await Promise.resolve();
    observer.disconnect();

    expect(mutations).toEqual([]);
    fireEvent.change(input);
    expect(first).not.toHaveBeenCalled();
    expect(latest).toHaveBeenCalledTimes(1);
  });

  it('still applies real prop changes', () => {
    const { container, rerender } = render(<StableInput name="message" type="hidden" value="a" />);
    rerender(<StableInput name="message" type="hidden" value="ab" />);
    expect(container.querySelector('input')).toHaveValue('ab');
  });
});
