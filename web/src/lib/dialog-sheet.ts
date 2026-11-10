/**
 * Below 600 px a dialog is a full-width bottom sheet (DialogFrame). Dialogs
 * that cannot use the frame yet put these on their content, with
 * `DialogSheetHandle` first, so every sheet is the same one.
 */
export const DIALOG_SHEET_CLASS =
  'max-[599px]:top-auto max-[599px]:bottom-0 max-[599px]:left-0 max-[599px]:w-full max-[599px]:max-w-full max-[599px]:translate-x-0 max-[599px]:translate-y-0 max-[599px]:rounded-t-[14px] max-[599px]:rounded-b-none';

/**
 * Spec connect-infrastructure "Dialogs … Under 600 px, full window": the same
 * full-window frame the Connect dialog (DialogFrame's browser frame) uses.
 * Pickers stay bottom sheets ({@link DIALOG_SHEET_CLASS}).
 */
export const DIALOG_FULL_WINDOW_CLASS =
  'max-[599px]:inset-0 max-[599px]:h-dvh max-[599px]:max-h-none max-[599px]:w-full max-[599px]:max-w-full max-[599px]:translate-x-0 max-[599px]:translate-y-0 max-[599px]:rounded-none';
