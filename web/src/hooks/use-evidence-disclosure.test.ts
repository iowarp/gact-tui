// @vitest-environment jsdom
import { act, renderHook } from '@testing-library/react';
import { beforeEach, expect, it } from 'vitest';
import { useEvidenceDisclosure } from './use-evidence-disclosures';

beforeEach(() => {
  localStorage.clear();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
});

it('starts a section closed and remembers both opening and closing after dismissal', () => {
  const first = renderHook(() => useEvidenceDisclosure('evidence:tools', false));
  expect(first.result.current[0]).toBe(false);
  act(() => first.result.current[1](true));
  expect(first.result.current[0]).toBe(true);
  first.unmount();
  const second = renderHook(() => useEvidenceDisclosure('evidence:tools', false));
  expect(second.result.current[0]).toBe(true);
  act(() => second.result.current[1](false));
  second.unmount();
  const third = renderHook(() => useEvidenceDisclosure('evidence:tools', false));
  expect(third.result.current[0]).toBe(false);
});

it('keeps an explicit closing of a default-open section', () => {
  const section = renderHook(() => useEvidenceDisclosure('evidence:questions'));
  expect(section.result.current[0]).toBe(true);
  act(() => section.result.current[1](false));
  section.unmount();
  expect(renderHook(() => useEvidenceDisclosure('evidence:questions')).result.current[0]).toBe(
    false,
  );
});
