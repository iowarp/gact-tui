// Must stay first: records whether this device had app data before this launch.
import '@/lib/onboarding/install-snapshot';
import { bootstrapLocale } from '@/i18n/runtime';

// The interface language is active before any application module loads, so
// copy computed at module load is translated too. The language catalog is
// one small chunk; English needs no download.
void bootstrapLocale().then(() => {
  // The desktop host's menus and tray follow the same language.
  void import('@/tauri/native-copy').then(({ sendNativeCopy }) => sendNativeCopy());
  return import('./app-main');
});
