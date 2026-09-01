import { brand } from '@brand';
import { AlertTriangleIcon, RotateCcwIcon } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface AppErrorBoundaryProps {
  children: ReactNode;
}

interface AppErrorBoundaryState {
  error?: Error;
}

/** Contains an unexpected render failure without replacing it with a blank page. */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = {};

  public static getDerivedStateFromError(error: Error): AppErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Workspace render failed', error, info.componentStack);
  }

  public render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid min-h-dvh place-items-center bg-background p-6 text-foreground">
        <section
          aria-labelledby="workspace-error-title"
          className="w-full max-w-lg rounded-xl border border-destructive/40 bg-card p-6 shadow-lg"
          role="alert"
        >
          <AlertTriangleIcon aria-hidden="true" className="size-6 text-destructive" />
          <h1 className="mt-4 text-lg font-semibold" id="workspace-error-title">
            {brand.name} could not display this workspace
          </h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Your service and saved work were not changed. Reload the workspace to reconnect and try
            the view again.
          </p>
          <Button className="mt-5" onClick={() => window.location.reload()}>
            <RotateCcwIcon aria-hidden="true" />
            Reload workspace
          </Button>
          <details className="mt-5 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Error detail</summary>
            <p className="mt-2 break-words font-mono">{this.state.error.message}</p>
          </details>
        </section>
      </main>
    );
  }
}
