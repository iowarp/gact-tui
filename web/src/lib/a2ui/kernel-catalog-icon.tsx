import { CommonSchemas } from '@a2ui/web_core/v0_9';
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
  TriangleAlertIcon,
  UploadIcon,
  UserIcon,
  Volume1Icon,
  Volume2Icon,
  VolumeIcon,
  VolumeXIcon,
  type LucideIcon,
} from 'lucide-react';
import { z } from 'zod';
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
 * It isn't only literal names: `Icon.name` also accepts a data binding
 * (`{ path: "..." }`), which the generic binder resolves to whatever raw
 * string the data holds at render time, bypassing any enum entirely. That's
 * exactly the QA session's wire payload for #26 (`alert-circle` /
 * `alert-triangle`). `kernel-catalog-icon.test.tsx` covers the literal, the
 * bound and the unmapped case.
 *
 * This does NOT reuse `IconApi` from `@a2ui/web_core` the way `Image`/
 * `Video`/`AudioPlayer` reuse their basic-catalog APIs: `IconApi.schema`
 * restricts `name` to a fixed enum, but the clio-schemas catalog JSON
 * (`catalogs/clio-workspace/v1/catalog.json`) declares it as
 * `oneOf [string, IconSvgPath, DataBinding]` -- any string is a valid literal
 * server-side. Reusing the enum schema meant a literal name outside it (the
 * adversarial review's `'alert-circle'` as a plain literal, not bound)
 * failed validation and replaced the WHOLE surface with a failure card
 * before this component ever got a chance to render its fallback. `iconName`
 * below mirrors the server's contract instead.
 */
const iconName = z.union([
  z.string(),
  z.object({ svgPath: z.string() }).strict(),
  CommonSchemas.DataBinding,
]);
const accessibility = CommonSchemas.AccessibilityAttributes.optional();
const weight = z.number().optional();

/**
 * Catalog icon names (plus the kebab-case/camelCase spellings agents have
 * actually emitted for names outside any enum -- #26's wire payload:
 * `alert-circle` / `alert-triangle`) mapped to lucide-react glyphs.
 *
 * A `Map`, not a plain object: `KERNEL_ICON_MAP[rawName]` for an
 * attacker-or-agent-controlled `rawName` of `'constructor'`, `'__proto__'`,
 * `'hasOwnProperty'` or `'valueOf'` reads a value off `Object.prototype`
 * instead of `undefined` -- a function, which the old lookup then rendered
 * as a React element and crashed the surface into the failure card
 * (adversarial review finding #1). `Map.prototype.get` has no such
 * collision: every key is looked up in the map's own storage, never the
 * prototype chain.
 *
 * Material semantics, not the slashed/filled guess: `volume_off` is the
 * CROSSED speaker (`VolumeXIcon`), `volume_mute` is the plain speaker with no
 * sound waves (`VolumeIcon`) -- the reverse of what shipped first.
 * `star_border`/`favorite_border` are OUTLINE variants of the base icon, not
 * a "crossed out" state, so `starOff`/`favoriteOff` reuse the same glyph as
 * `star`/`favorite` (lucide's default style is already an outline stroke).
 */
const KERNEL_ICON_MAP = new Map<string, LucideIcon>([
  ['accountCircle', CircleUserRoundIcon],
  ['add', AddIcon],
  ['arrowBack', ArrowLeftIcon],
  ['arrowForward', ArrowRightIcon],
  ['attachFile', PaperclipIcon],
  ['calendarToday', CalendarIcon],
  ['call', PhoneIcon],
  ['camera', CameraIcon],
  ['check', CheckIcon],
  ['close', CloseIcon],
  ['delete', DeleteIcon],
  ['download', DownloadIcon],
  ['edit', EditIcon],
  ['error', CircleAlertIcon],
  ['event', CalendarDaysIcon],
  ['fastForward', FastForwardIcon],
  ['favorite', HeartIcon],
  ['favoriteOff', HeartIcon],
  ['folder', FolderIcon],
  ['help', HelpIcon],
  ['home', HomeIcon],
  ['info', InfoIcon],
  ['locationOn', MapPinIcon],
  ['lock', LockIcon],
  ['lockOpen', LockOpenIcon],
  ['mail', MailIcon],
  ['menu', MenuIcon],
  ['moreHoriz', MoreIcon],
  ['moreVert', MoreIcon],
  ['notifications', BellIcon],
  ['notificationsOff', BellOffIcon],
  ['pause', PauseIcon],
  ['payment', CreditCardIcon],
  ['person', UserIcon],
  ['phone', PhoneIcon],
  ['photo', ImageIcon],
  ['play', PlayIcon],
  ['print', PrinterIcon],
  ['refresh', RefreshIcon],
  ['rewind', RewindIcon],
  ['search', SearchIcon],
  ['send', SendIcon],
  ['settings', SettingsIcon],
  ['share', Share2Icon],
  ['shoppingCart', ShoppingCartIcon],
  ['skipNext', SkipForwardIcon],
  ['skipPrevious', SkipBackIcon],
  ['star', StarIcon],
  ['starHalf', StarHalfIcon],
  ['starOff', StarIcon],
  ['stop', SquareIcon],
  ['upload', UploadIcon],
  ['visibility', EyeIcon],
  ['visibilityOff', EyeOffIcon],
  ['volumeDown', Volume1Icon],
  ['volumeMute', VolumeIcon],
  ['volumeOff', VolumeXIcon],
  ['volumeUp', Volume2Icon],
  ['warning', TriangleAlertIcon],
  // Outside any catalog enum, but confirmed on the wire (#26) -- see the
  // module comment above for how a bound name reaches this unchecked.
  ['alertCircle', CircleAlertIcon],
  ['alertTriangle', TriangleAlertIcon],
]);

/** `alert-circle` / `alert_circle` -> `alertCircle`, so one map entry covers every separator style. */
function normalizeIconKey(name: string): string {
  return name.replace(/[-_]+([a-zA-Z0-9])/gu, (_match, letter: string) => letter.toUpperCase());
}

/**
 * CLIO's kernel override of `Icon`: renders lucide glyphs instead of an
 * unloaded icon font, and never prints a name as text.
 */
export const KernelIcon = createComponentImplementation(
  { name: 'Icon', schema: z.object({ name: iconName, accessibility, weight }).strict() },
  ({ props }) => {
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
    const IconGlyph = KERNEL_ICON_MAP.get(rawName) ?? KERNEL_ICON_MAP.get(normalizeIconKey(rawName));

    // An unknown or still-unresolved name never prints as text (#26): a
    // visible neutral glyph instead. The accessible name stays a generic
    // "Icon" -- never the raw identifier as technical copy -- with the name
    // available for debugging only in the hover tooltip.
    if (!IconGlyph) {
      const title = rawName ? `Icon: ${rawName}` : 'Icon';
      return (
        <span
          {...a2uiAccessibilityProps(props.accessibility)}
          aria-label={label ?? 'Icon'}
          className="inline-flex"
          role="img"
          title={title}
        >
          <FallbackIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
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
  },
);
