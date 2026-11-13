// PO catalogs are compiled to message modules by @lingui/vite-plugin.
declare module '*.po' {
  import type { Messages } from '@lingui/core';
  export const messages: Messages;
}
