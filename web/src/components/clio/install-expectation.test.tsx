import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { vocab } from '@/lib/brand-vocabulary';
import { InstallExpectation } from './install-expectation';
import { installExpectation } from './install-expectation-model';

afterEach(cleanup);

// Sizes read in binary units, as file managers show them.
const GIB = 1024 ** 3;

const reuse = (thing: string) => ({
  kind: 'apptainer',
  thing,
  identity: 'sha256:0123',
  path: '',
  size_bytes: 9.8e9,
  saved_seconds: 754,
  message: '',
  step: undefined,
});

describe('installExpectation', () => {
  it('says several minutes and that leaving is safe when nothing is measured', () => {
    expect(installExpectation({ thing: 'vLLM' })).toBe(
      `${vocab.agent} downloads and prepares vLLM. This can take several minutes. ` +
        'You can leave this page; progress continues.',
    );
  });

  it('adds only what was measured: download size and the last install time', () => {
    const text = installExpectation({ thing: 'vLLM', downloadBytes: 8 * GIB, lastSeconds: 754 });
    expect(text).toContain('About 8.0 GB to download.');
    expect(text).toContain('Last install took ~13 min.');
    expect(installExpectation({ thing: 'vLLM', lastSeconds: 40 })).toContain(
      'Last install took under a minute.',
    );
    expect(installExpectation({ thing: 'vLLM', downloadBytes: null, lastSeconds: 0 })).not.toMatch(
      /About|Last install/u,
    );
  });

  it('expects under a minute when the reuse preflight verified what is needed', () => {
    expect(
      installExpectation({
        thing: 'vLLM',
        lastSeconds: 754,
        reused: [reuse('vLLM image'), reuse('vLLM image')],
      }),
    ).toBe('Reusing vLLM image. This should take under a minute.');
  });
});

describe('InstallExpectation', () => {
  it('renders a quiet line, not a second live status', () => {
    render(<InstallExpectation thing="org/model" downloadBytes={2 * GIB} />);
    const line = screen.getByText(/This can take several minutes/u);
    expect(line).toHaveTextContent('org/model');
    expect(line).toHaveTextContent('About 2.0 GB to download.');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
});
