import { CATEGORY_ICONS, type PackageItem } from './agent-package-items';
import { ItemRow } from './primitives/item-row';

/**
 * One thing a package brings, as a line that opens its own details. Package
 * contents and the Agent tab's Subagents and Skills views share it, and the
 * host returns focus to it by `data-package-item` and `data-package-category`.
 */
export function PackageItemRow({
  item,
  onOpen,
}: {
  item: PackageItem;
  onOpen: (item: PackageItem) => void;
}) {
  const Icon = CATEGORY_ICONS[item.category];
  return (
    <ItemRow
      aria-label={item.id}
      className="cursor-pointer"
      data-package-category={item.category}
      data-package-item={item.id}
      icon={<Icon />}
      meta={item.note ? `${item.note}. ${item.description}` : item.description}
      onClick={() => onOpen(item)}
      onKeyDown={(event) => {
        if (event.key !== 'Enter' && event.key !== ' ') return;
        event.preventDefault();
        onOpen(item);
      }}
      role="button"
      size="line"
      tabIndex={0}
      title={item.id}
    />
  );
}
