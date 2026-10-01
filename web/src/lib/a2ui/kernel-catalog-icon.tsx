import { IconApi } from '@a2ui/web_core/v0_9';
import { createComponentImplementation } from '@a2ui/react/v0_9';
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BellIcon,
  BellOffIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CameraIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleIcon as FallbackIcon,
  CircleUserRoundIcon,
  CreditCardIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FastForwardIcon,
  FolderIcon,
  HeartIcon,
  HeartOffIcon,
  HomeIcon,
  ImageIcon,
  LockIcon,
  LockOpenIcon,
  MailIcon,
  MapPinIcon,
  MenuIcon,
  PaperclipIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
  PrinterIcon,
  RewindIcon,
  SearchIcon,
  SendIcon,
  Share2Icon,
  ShoppingCartIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SquareIcon,
  StarHalfIcon,
  StarIcon,
  StarOffIcon,
  TriangleAlertIcon,
  UploadIcon,
  UserIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeIcon,
  VolumeXIcon,
  type LucideIcon,
} from 'lucide-react';
import {
  a2uiAccessibilityLabel,
  a2uiAccessibilityProps,
} from '@/components/clio/a2ui-accessibility';
import {
  AddIcon,
  CloseIcon,
  DeleteIcon,
  EditIcon,
  HelpIcon,
  InfoIcon,
  MoreIcon,
  RefreshIcon,
  SettingsIcon,
} from '@/lib/icon-vocabulary';

/**
 * CLIO's override of the basic catalog's `Icon` (#1549 G9 #26), split out of
 * `kernel-catalog.tsx` purely for file size (same reason as
 * `kernel-catalog-functions.ts`).
 *
 * Upstream `@a2ui/react`'s `Icon` renders a Material Symbols ligature span
 * (`material-symbols-outlined`) and CLIO never loads that font, so a plain
 * re-export shows the raw `name` string as visible text instead of a glyph.
 * It isn't only literal names: `IconApi`'s `name` union has a `{ path:
 * string }` member for data-bound icons, which the generic binder's
 * structural scan (`GenericBinder`'s `isDynamic` check in
 * `@a2ui/web_core`) also matches as a `DataBinding` -- so a bound name
 * resolves to whatever raw string the data holds, bypassing the enum
 * entirely. That's exactly the QA session's wire payload for #26
 * (`alert-circle` / `alert-triangle`, neither of which is in `IconApi`'s own
 * enum). `kernel-catalog-icon.test.tsx` covers both the literal and the
 * bound case.
 */
const KERNEL_ICON_MAP: Record<string, LucideIcon> = {
  accountCircle: CircleUserRoundIcon,
  add: AddIcon,
  arrowBack: ArrowLeftIcon,
  arrowForward: ArrowRightIcon,
  attachFile: PaperclipIcon,
  calendarToday: CalendarIcon,
  call: PhoneIcon,
  camera: CameraIcon,
  check: CheckIcon,
  close: CloseIcon,
  delete: DeleteIcon,
  download: DownloadIcon,
  edit: EditIcon,
  error: CircleAlertIcon,
  event: CalendarDaysIcon,
  fastForward: FastForwardIcon,
  favorite: HeartIcon,
  favoriteOff: HeartOffIcon,
  folder: FolderIcon,
  help: HelpIcon,
  home: HomeIcon,
  info: InfoIcon,
  locationOn: MapPinIcon,
  lock: LockIcon,
  lockOpen: LockOpenIcon,
  mail: MailIcon,
  menu: MenuIcon,
  moreHoriz: MoreIcon,
  moreVert: MoreIcon,
  notifications: BellIcon,
  notificationsOff: BellOffIcon,
  pause: PauseIcon,
  payment: CreditCardIcon,
  person: UserIcon,
  phone: PhoneIcon,
  photo: ImageIcon,
  play: PlayIcon,
  print: PrinterIcon,
  refresh: RefreshIcon,
  rewind: RewindIcon,
  search: SearchIcon,
  send: SendIcon,
  settings: SettingsIcon,
  share: Share2Icon,
  shoppingCart: ShoppingCartIcon,
  skipNext: SkipForwardIcon,
  skipPrevious: SkipBackIcon,
  star: StarIcon,
  starHalf: StarHalfIcon,
  starOff: StarOffIcon,
  stop: SquareIcon,
  upload: UploadIcon,
  visibility: EyeIcon,
  visibilityOff: EyeOffIcon,
  volumeDown: Volume1Icon,
  volumeMute: VolumeXIcon,
  volumeOff: VolumeIcon,
  volumeUp: Volume2Icon,
  warning: TriangleAlertIcon,
  // Outside `IconApi`'s own enum, but confirmed on the wire for a data-bound
  // name (#26) -- see the module comment above for how that bypasses it.
  alertCircle: CircleAlertIcon,
  alertTriangle: TriangleAlertIcon,
};

/** `alert-circle` / `alert_circle` -> `alertCircle`, so one map entry covers every separator style. */
function normalizeIconKey(name: string): string {
  return name.replace(/[-_]+([a-zA-Z0-9])/gu, (_match, letter: string) => letter.toUpperCase());
}

/** CLIO's kernel override: reuses `IconApi`'s own schema (same pattern as this file's `Image`/`Video`/`AudioPlayer`), but renders lucide glyphs instead of an unloaded icon font. */
export const KernelIcon = createComponentImplementation(IconApi, ({ props }) => {
  const label = a2uiAccessibilityLabel(props.accessibility);

  if (typeof props.name === 'object' && props.name !== null && 'svgPath' in props.name) {
    return (
      <svg
        {...a2uiAccessibilityProps(props.accessibility)}
        aria-hidden={label ? undefined : true}
        className="size-4 shrink-0"
        fill="currentColor"
        role={label ? 'img' : undefined}
        viewBox="0 0 24 24"
      >
        <path d={props.name.svgPath} />
      </svg>
    );
  }

  const rawName = typeof props.name === 'string' ? props.name : '';
  const IconGlyph = KERNEL_ICON_MAP[rawName] ?? KERNEL_ICON_MAP[normalizeIconKey(rawName)];

  // An unknown or still-unresolved name never prints as text (#26): a
  // visible neutral glyph instead, with the name only in the accessible
  // name/tooltip.
  if (!IconGlyph) {
    const fallbackLabel =
      label ?? (rawName ? `Unrecognized icon: ${rawName}` : 'Unrecognized icon');
    return (
      <span aria-label={fallbackLabel} className="inline-flex" role="img" title={fallbackLabel}>
        <FallbackIcon className="size-4 shrink-0 text-muted-foreground" />
      </span>
    );
  }

  return (
    <span
      {...a2uiAccessibilityProps(props.accessibility)}
      aria-hidden={label ? undefined : true}
      className="inline-flex"
      role={label ? 'img' : undefined}
    >
      <IconGlyph className="size-4 shrink-0" />
    </span>
  );
});
