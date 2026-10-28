import type { GpuFact, ServerParameter } from '@clio/core/v3';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ServerParametersForm } from './managed-service-parameters';

afterEach(cleanup);

const parameter = (
  row: Partial<ServerParameter> & Pick<ServerParameter, 'id' | 'label' | 'name'>,
) =>
  ({
    description: `${row.label} description`,
    kind: 'integer',
    delivery: 'flag',
    options: [],
    variants: [],
    default_behavior: 'Engine default',
    effective_key: row.id,
    ...row,
  }) as ServerParameter;

const cudaDevices = parameter({
  id: 'cuda_devices',
  label: 'NVIDIA GPU devices',
  name: 'CUDA_VISIBLE_DEVICES',
  kind: 'text',
  delivery: 'env',
  variants: ['cuda'],
});
const vllmParameters = [
  parameter({ id: 'tensor_parallel_size', label: 'Tensor parallel size', name: '--tp' }),
  parameter({ id: 'pipeline_parallel_size', label: 'Pipeline parallel size', name: '--pp' }),
  cudaDevices,
];
const llamaParameters = [
  cudaDevices,
  parameter({ id: 'n_gpu_layers', label: 'GPU layers', name: '--n-gpu-layers' }),
  parameter({
    id: 'split_mode',
    label: 'Split mode',
    name: '--split-mode',
    kind: 'choice',
    options: ['none', 'layer', 'row'],
  }),
  parameter({ id: 'tensor_split', label: 'Tensor split', name: '--tensor-split', kind: 'text' }),
  parameter({ id: 'main_gpu', label: 'Main GPU', name: '--main-gpu' }),
];

const gpus: GpuFact[] = [0, 1, 2, 3].map((index) => ({
  index,
  name: 'A100-SXM4-40GB',
  vendor: 'nvidia',
  memory_total_mib: 40960,
  uuid: `GPU-${index}`,
}));

function Harness({
  parameters,
  hostGpus,
  initial = {},
  onChange,
}: {
  parameters: ServerParameter[];
  hostGpus?: GpuFact[];
  initial?: Record<string, string>;
  onChange: (key: string, value: string) => void;
}) {
  const [values, setValues] = useState(initial);
  return (
    <ServerParametersForm
      gpus={hostGpus}
      onChange={(key, value) => {
        onChange(key, value);
        setValues((current) => ({ ...current, [key]: value }));
      }}
      parameters={parameters}
      serviceLabel="vLLM"
      values={values}
      variant="cuda"
    />
  );
}

function mount(props: Omit<Parameters<typeof Harness>[0], 'onChange'>) {
  const onChange = vi.fn();
  render(<Harness {...props} onChange={onChange} />);
  return { onChange, picker: () => screen.getByRole('group', { name: 'vLLM NVIDIA GPU devices' }) };
}

describe('GPU device picker', () => {
  it('lists the host’s GPUs with All GPUs chosen by default and writes the CSV', async () => {
    const user = userEvent.setup();
    const { onChange, picker } = mount({ parameters: vllmParameters, hostGpus: gpus });

    const all = within(picker()).getByRole('checkbox', { name: 'All GPUs' });
    expect(all).toBeChecked();
    expect(
      within(picker()).getByRole('checkbox', { name: 'GPU 1 · A100-SXM4-40GB · 40 GB' }),
    ).not.toBeChecked();
    // The device parameter is a choice, not a text field, when GPUs are known.
    expect(screen.queryByLabelText('vLLM NVIDIA GPU devices', { selector: 'input' })).toBeNull();

    await user.click(within(picker()).getByRole('checkbox', { name: /^GPU 3 ·/u }));
    await user.click(within(picker()).getByRole('checkbox', { name: /^GPU 2 ·/u }));
    expect(onChange).toHaveBeenCalledWith('param.cuda_devices', '2,3');
    expect(all).not.toBeChecked();

    await user.click(all);
    expect(onChange).toHaveBeenLastCalledWith('param.tensor_parallel_size', '');
    expect(onChange).toHaveBeenCalledWith('param.cuda_devices', '');
    expect(all).toBeChecked();
  });

  it('keeps the plain text field when the host reported no GPUs', async () => {
    const user = userEvent.setup();
    mount({ parameters: vllmParameters, hostGpus: [] });

    expect(screen.queryByRole('group', { name: 'vLLM NVIDIA GPU devices' })).toBeNull();
    await user.click(screen.getByText('Server parameters'));
    expect(screen.getByLabelText('vLLM NVIDIA GPU devices')).toHaveAttribute('type', 'text');
  });

  it('prefills the tensor parallel size from the GPU count until the person types one', async () => {
    const user = userEvent.setup();
    const { onChange, picker } = mount({ parameters: vllmParameters, hostGpus: gpus });

    await user.click(within(picker()).getByRole('checkbox', { name: /^GPU 2 ·/u }));
    expect(onChange).toHaveBeenLastCalledWith('param.tensor_parallel_size', '1');
    await user.click(within(picker()).getByRole('checkbox', { name: /^GPU 3 ·/u }));
    expect(onChange).toHaveBeenLastCalledWith('param.tensor_parallel_size', '2');
    expect(screen.queryByRole('status')).toBeNull();

    await user.click(screen.getByText('Server parameters'));
    const tp = screen.getByLabelText('vLLM Tensor parallel size');
    expect(tp).toHaveValue(2);
    await user.clear(tp);
    await user.type(tp, '4');
    onChange.mockClear();
    await user.click(within(picker()).getByRole('checkbox', { name: /^GPU 1 ·/u }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith('param.cuda_devices', '1,2,3');
    expect(tp).toHaveValue(4);
    expect(screen.getByRole('status')).toHaveTextContent(
      'Tensor parallel size × pipeline parallel size is 4 × 1 = 4, but 3 GPUs are selected.',
    );
  });

  it('leaves a saved tensor parallel size alone and notes the mismatch', async () => {
    const user = userEvent.setup();
    const { onChange, picker } = mount({
      parameters: vllmParameters,
      hostGpus: gpus,
      initial: { 'param.tensor_parallel_size': '2', 'param.pipeline_parallel_size': '2' },
    });

    await user.click(within(picker()).getByRole('checkbox', { name: /^GPU 0 ·/u }));
    expect(onChange).not.toHaveBeenCalledWith('param.tensor_parallel_size', expect.anything());
    expect(screen.getByRole('status')).toHaveTextContent('2 × 2 = 4, but 1 GPU is selected');
  });

  it('hides llama.cpp’s multi-GPU controls while it can see only one GPU', async () => {
    const user = userEvent.setup();
    const { picker } = mount({ parameters: llamaParameters, hostGpus: gpus });

    await user.click(screen.getByText('Server parameters'));
    expect(screen.getByLabelText('vLLM Tensor split')).toBeInTheDocument();

    await user.click(within(picker()).getByRole('checkbox', { name: /^GPU 1 ·/u }));
    expect(screen.queryByLabelText('vLLM Tensor split')).toBeNull();
    expect(screen.queryByLabelText('vLLM Main GPU')).toBeNull();
    expect(screen.queryByLabelText('vLLM Split mode')).toBeNull();

    await user.click(within(picker()).getByRole('checkbox', { name: /^GPU 2 ·/u }));
    expect(screen.getByLabelText('vLLM Tensor split')).toBeInTheDocument();
  });
});
