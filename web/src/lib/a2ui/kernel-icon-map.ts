/**
 * The catalog's icon names mapped to lucide glyphs, shared by the `Icon`
 * component and every component that takes an icon name (the choice table's
 * rows and options). Split from `kernel-catalog-icon.tsx` so a component file
 * can import it without exporting a non-component.
 */
import {
  ArrowLeftIcon,
  ArrowRightIcon,
  BellIcon,
  BellOffIcon,
  BookIcon,
  BookmarkIcon,
  CalendarDaysIcon,
  CalendarIcon,
  CameraIcon,
  CheckIcon,
  CircleAlertIcon,
  CircleCheckIcon,
  CircleXIcon,
  CloudIcon,
  CpuIcon,
  CircleUserRoundIcon,
  CreditCardIcon,
  DownloadIcon,
  EyeIcon,
  EyeOffIcon,
  FastForwardIcon,
  FolderIcon,
  HeartIcon,
  GlobeIcon,
  HardDriveIcon,
  HomeIcon,
  KeyRoundIcon,
  LaptopIcon,
  ImageIcon,
  LinkIcon,
  LockIcon,
  LockOpenIcon,
  MailIcon,
  MapPinIcon,
  MenuIcon,
  NetworkIcon,
  PaperclipIcon,
  PauseIcon,
  PhoneIcon,
  PlayIcon,
  PlugIcon,
  PrinterIcon,
  RewindIcon,
  SearchIcon,
  ServerIcon,
  ShieldCheckIcon,
  ShieldIcon,
  SendIcon,
  Share2Icon,
  ShoppingCartIcon,
  SkipBackIcon,
  SkipForwardIcon,
  SquareIcon,
  StarHalfIcon,
  StarIcon,
  TerminalIcon,
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
  // Material names for compute and network resources (a plugin's endpoints table).
  ['checkCircle', CircleCheckIcon],
  ['cancel', CircleXIcon],
  ['cloud', CloudIcon],
  ['computer', LaptopIcon],
  ['dns', ServerIcon],
  ['hub', NetworkIcon],
  ['key', KeyRoundIcon],
  ['lan', NetworkIcon],
  ['memory', CpuIcon],
  ['public', GlobeIcon],
  ['security', ShieldIcon],
  ['shield', ShieldIcon],
  ['storage', HardDriveIcon],
  ['terminal', TerminalIcon],
  ['verifiedUser', ShieldCheckIcon],
  ['alertTriangle', TriangleAlertIcon],
  // Dialog tab and footer glyphs (a plugin's add-endpoint dialog).
  ['book', BookIcon],
  ['bookmark', BookmarkIcon],
  ['link', LinkIcon],
  ['plug', PlugIcon],
]);

/** `alert-circle` / `alert_circle` -> `alertCircle`, so one map entry covers every separator style. */
function normalizeIconKey(name: string): string {
  return name.replace(/[-_]+([a-zA-Z0-9])/gu, (_match, letter: string) => letter.toUpperCase());
}

/** The glyph for a catalog icon name in any separator style, or undefined when unknown. */
export function kernelIconGlyph(name: string): LucideIcon | undefined {
  return KERNEL_ICON_MAP.get(name) ?? KERNEL_ICON_MAP.get(normalizeIconKey(name));
}
