import type { GpuFact, ServerParameter } from '@clio/core/v3';
import { Checkbox } from '@/components/ui/checkbox';
import { FieldDescription, FieldLegend, FieldSet } from '@/components/ui/field';
import { formatDevices, gpuLabel, parseDevices } from './managed-service-gpus';

/**
 * A `*_devices` server parameter as a choice of the host's GPUs. No choice
 * ("All GPUs") leaves the parameter empty, so the engine sees every GPU.
 */
export function GpuDevicePicker({
  parameter,
  gpus,
  serviceLabel,
  value,
  onChange,
}: {
  parameter: ServerParameter;
  gpus: GpuFact[];
  serviceLabel: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const selected = parseDevices(value);
  const toggle = (index: number, checked: boolean) =>
    onChange(
      formatDevices(
        checked ? [...selected, index] : selected.filter((current) => current !== index),
      ),
    );
  return (
    <FieldSet aria-label={`${serviceLabel} ${parameter.label}`} className="gap-2 sm:col-span-2">
      <FieldLegend variant="label">{parameter.label}</FieldLegend>
      <label className="flex items-center gap-2 text-sm">
        <Checkbox
          checked={!selected.length}
          onCheckedChange={(checked) => {
            if (checked === true) onChange('');
          }}
        />
        All GPUs
      </label>
      {gpus.map((gpu) => (
        <label className="flex items-center gap-2 text-sm" key={gpu.uuid || gpu.index}>
          <Checkbox
            checked={selected.includes(gpu.index)}
            onCheckedChange={(checked) => toggle(gpu.index, checked === true)}
          />
          {gpuLabel(gpu)}
        </label>
      ))}
      <FieldDescription>
        {parameter.description} <span className="font-mono">{parameter.name}</span>
      </FieldDescription>
    </FieldSet>
  );
}
