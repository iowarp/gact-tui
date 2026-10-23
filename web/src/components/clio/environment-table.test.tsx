import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { EnvironmentTable } from './environment-table';

afterEach(cleanup);

function Harness({ initial }: { initial: string }) {
  const [value, setValue] = useState(initial);
  return (
    <>
      <EnvironmentTable id="env" onChange={setValue} value={value} />
      <output data-testid="text">{value}</output>
    </>
  );
}

describe('EnvironmentTable', () => {
  it('keeps values with = and Windows paths, and drops pasted comment lines', () => {
    render(<Harness initial={'FOO=bar=baz\nPATHLIKE=C:\\Tools;D:\\bin\n# comment\n'} />);
    expect(screen.getByRole('textbox', { name: 'Variable 1' })).toHaveValue('FOO');
    expect(screen.getByRole('textbox', { name: 'Value 1' })).toHaveValue('bar=baz');
    expect(screen.getByRole('textbox', { name: 'Value 2' })).toHaveValue('C:\\Tools;D:\\bin');
    expect(screen.queryByRole('textbox', { name: 'Variable 3' })).not.toBeInTheDocument();
  });

  it('says which names cannot be used, beside the field it marks', () => {
    render(<Harness initial="" />);
    fireEvent.change(screen.getByRole('textbox', { name: 'Variable 1' }), {
      target: { value: '9BAD NAME' },
    });
    expect(screen.getByRole('textbox', { name: 'Variable 1' })).toHaveAttribute(
      'aria-invalid',
      'true',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('"9BAD NAME" contains a space.');
  });

  it('accepts a Windows name with parentheses', () => {
    render(<Harness initial="ProgramFiles(x86)=C:\\Program Files (x86)" />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});
