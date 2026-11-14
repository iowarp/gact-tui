import { ph, plural, t } from '@lingui/core/macro';
import * as THREE from 'three';
import { EyeOffIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import type { MeshPart } from './mesh-viewport-mesh';

/**
 * The parts list: show or hide each part with its checkbox, select it by its name (as a
 * click on it in the view does). The selected and hidden parts say so in words.
 */
export function CadPartsList({
  parts,
  colors,
  hidden,
  selected,
  onToggle,
  onShowAll,
  onSelect,
}: {
  parts: readonly MeshPart[];
  colors: Float32Array;
  hidden: ReadonlySet<number>;
  selected: number | undefined;
  onToggle: (index: number) => void;
  onShowAll: () => void;
  onSelect: (index: number | undefined) => void;
}) {
  return (
    <section
      aria-label={t`Parts`}
      className="absolute top-2 left-2 max-h-[calc(100%-1rem)] w-56 max-w-[calc(100%-1rem)] overflow-auto rounded-md border bg-popover/95 p-1 text-sm text-popover-foreground shadow-sm"
      data-slot="cad-parts"
    >
      <div className="flex items-center justify-between gap-2 px-2 py-1">
        <h3 className="text-caption font-medium text-muted-foreground">
          {plural(parts.length, { one: '# part', other: '# parts' })}
        </h3>
        {hidden.size ? (
          <Button className="h-6 px-1.5 text-caption" onClick={onShowAll} size="sm" variant="ghost">
            {t`Show all`}
          </Button>
        ) : null}
      </div>
      <ul>
        {parts.map((part, index) => {
          const name = part.name || t`Part ${ph({ number: index + 1 })}`;
          const swatch = new THREE.Color(
            colors[part.vertexStart * 3],
            colors[part.vertexStart * 3 + 1],
            colors[part.vertexStart * 3 + 2],
          );
          const off = hidden.has(index);
          const isSelected = selected === index;
          return (
            <li
              className={cn('flex items-center gap-2 rounded-sm px-2 py-0.5', isSelected ? 'bg-accent' : 'hover:bg-accent')}
              key={`${index}-${name}`}
            >
              <Checkbox
                aria-label={off ? t`Show ${ph({ name })}` : t`Hide ${ph({ name })}`}
                checked={!off}
                onCheckedChange={() => onToggle(index)}
              />
              <span
                aria-hidden="true"
                className="size-3 shrink-0 rounded-sm border"
                style={{ backgroundColor: `#${swatch.getHexString()}` }}
              />
              <button
                aria-pressed={isSelected}
                className={cn(
                  'min-w-0 flex-1 truncate rounded-sm py-0.5 text-left focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none',
                  off && 'text-muted-foreground',
                  isSelected && 'font-medium',
                )}
                disabled={off}
                onClick={() => onSelect(isSelected ? undefined : index)}
                title={isSelected ? t`Clear the selection` : t`Select ${ph({ name })}`}
                type="button"
              >
                {name}
              </button>
              {off ? (
                <span className="ml-auto flex shrink-0 items-center gap-1 text-caption text-muted-foreground">
                  <EyeOffIcon aria-hidden="true" className="size-3" />
                  {t`Hidden`}
                </span>
              ) : isSelected ? (
                <span className="ml-auto shrink-0 text-caption text-muted-foreground">{t`Selected`}</span>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
