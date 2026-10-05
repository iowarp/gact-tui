import { Input } from '@/components/ui/input';

type Box = { x: number; y: number; width: number; height: number };

/** Keyboard and touch editing share the same normalized region as pointer capture. */
export function RegionCoordinateInputs({
  box,
  onChange,
}: {
  box: Box;
  onChange: (box: Box) => void;
}) {
  return (
    <fieldset className="mb-2 grid grid-cols-4 gap-2">
      <legend className="mb-1 text-xs text-muted-foreground">Region (% of view)</legend>
      {(['x', 'y', 'width', 'height'] as const).map((field) => (
        <label className="text-xs" key={field}>
          {{ x: 'Left', y: 'Top', width: 'Width', height: 'Height' }[field]}
          <Input
            aria-label={`Region ${field} percent`}
            type="number"
            min={field === 'x' || field === 'y' ? 0 : 1}
            max={100}
            step={1}
            key={`${field}:${box[field]}`}
            defaultValue={Math.round(box[field] * 100)}
            onBlur={(event) => {
              const value = event.currentTarget.valueAsNumber;
              if (!Number.isFinite(value)) return;
              const next = {
                ...box,
                [field]: Math.min(
                  1,
                  Math.max(field === 'x' || field === 'y' ? 0 : 0.01, value / 100),
                ),
              };
              next.x = Math.min(next.x, 1 - next.width);
              next.y = Math.min(next.y, 1 - next.height);
              onChange(next);
            }}
          />
        </label>
      ))}
    </fieldset>
  );
}
