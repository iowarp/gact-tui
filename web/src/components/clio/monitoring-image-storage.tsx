import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { InfoTip } from './info-tip';

/** Image storage is separate from database volumes; only Podman can scope both per deployment. */
export function MonitoringImageStorage({
  configuration,
  runtime,
  owned,
  hostLabel,
  onChange,
}: {
  configuration: Record<string, string>;
  runtime: string;
  owned: boolean;
  hostLabel: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field>
      <div className="flex items-center gap-2">
        <FieldLabel>Container images on {hostLabel}</FieldLabel>
        <InfoTip label="About container image storage">
          Choose Service folder with Podman to keep images and downloads beside your service data,
          including on another disk. Engine storage uses the host’s existing image directory. This
          choice stays fixed for the deployment. Removing its runtime retains images and evidence;
          deleting retained data is separate.
        </InfoTip>
      </div>
      <Select
        value={configuration.image_storage || 'engine'}
        onValueChange={onChange}
        disabled={owned}
      >
        <SelectTrigger aria-label="Container image storage">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="engine">Engine storage</SelectItem>
          <SelectItem value="service" disabled={runtime !== 'podman'}>
            Service folder · Podman
          </SelectItem>
        </SelectContent>
      </Select>
    </Field>
  );
}
