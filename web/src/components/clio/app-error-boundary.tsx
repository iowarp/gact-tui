import { brand } from '@brand';
import { AlertTriangleIcon } from 'lucide-react';
import { RetryIcon } from '@/lib/icon-vocabulary';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface AppErrorBoundaryProps {
  children: ReactNode;
  /** A new value clears a caught failure without remounting healthy children. */
  resetKey?: string;
}

interface AppErrorBoundaryState {
  error?: Error;
  resetKey?: string;
}

/** Contains an unexpected render failure without replacing it with a blank page. */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  public state: AppErrorBoundaryState = { resetKey: this.props.resetKey };

  public static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  public static getDerivedStateFromProps(
    props: AppErrorBoundaryProps,
    state: AppErrorBoundaryState,
  ): Partial<AppErrorBoundaryState> | null {
    if (props.resetKey === state.resetKey) return null;
    return { error: undefined, resetKey: props.resetKey };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Workspace render failed', error, info.componentStack);
  }

  public render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <main className="grid h-full min-h-0 place-items-center bg-background p-6 text-foreground">
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
            <RetryIcon aria-hidden="true" />
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
