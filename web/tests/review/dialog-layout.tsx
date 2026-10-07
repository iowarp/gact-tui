import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, useTheme } from 'next-themes';
import '../../src/index.css';
import { Button } from '../../src/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '../../src/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '../../src/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '../../src/components/ui/select';

const filename = `sensor-field-review-${'calibration-records-'.repeat(7)}final.docx`;
const workspace =
  'Sensor field observations, calibration records and station comparisons for the quarterly team review';

export function DialogLayoutFixture() {
  const { setTheme, resolvedTheme } = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [destination, setDestination] = useState('');
  return (
    <main className="mx-auto max-w-3xl space-y-4 p-4">
      <h1 className="text-sm text-muted-foreground">Shared dialog browser fixture</h1>
      <p className="text-sm">
        Synthetic labels exercise real UI components. No files or accounts change.
      </p>
      <div className="flex gap-2" aria-label="Review theme">
        {(['light', 'dark'] as const).map((theme) => (
          <Button
            key={theme}
            variant="outline"
            aria-pressed={resolvedTheme === theme}
            onClick={() => setTheme(theme)}
          >
            {theme === 'light' ? 'Light' : 'Dark'}
          </Button>
        ))}
      </div>
      <Dialog>
        <DialogTrigger asChild>
          <Button>Open document dialog</Button>
        </DialogTrigger>
        <DialogContent className="flex min-w-0 flex-col overflow-hidden sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>{filename}</DialogTitle>
            <DialogDescription>Choose where to keep the reviewed document.</DialogDescription>
          </DialogHeader>
          <div
            role="region"
            aria-label="Document options"
            className="min-h-0 min-w-0 space-y-3 overflow-y-auto"
          >
            <Select value={destination} onValueChange={setDestination}>
              <SelectTrigger className="w-full" aria-label="Destination workspace">
                <SelectValue placeholder="Choose a workspace" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="sensor">{workspace}</SelectItem>
                <SelectItem value="archive">Review archive</SelectItem>
              </SelectContent>
            </Select>
            <Button
              variant="outline"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              Review details
            </Button>
            {expanded ? (
              <div className="space-y-3">
                {Array.from({ length: 16 }, (_, index) => (
                  <p className="text-sm" key={index}>
                    Recorded document detail {index + 1}
                  </p>
                ))}
              </div>
            ) : null}
          </div>
          <DialogFooter className="shrink-0">
            <DialogClose asChild>
              <Button variant="outline">Cancel</Button>
            </DialogClose>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <AlertDialog>
        <AlertDialogTrigger asChild>
          <Button variant="outline">Open confirmation</Button>
        </AlertDialogTrigger>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Keep this document in the review archive?</AlertDialogTitle>
            <AlertDialogDescription>{filename}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

createRoot(document.getElementById('root')!).render(
  <ThemeProvider
    attribute="class"
    defaultTheme="light"
    enableSystem={false}
    storageKey="clio.polish.theme"
  >
    <DialogLayoutFixture />
  </ThemeProvider>,
);
