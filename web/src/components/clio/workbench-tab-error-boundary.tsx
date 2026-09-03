import { AlertTriangleIcon } from 'lucide-react';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';

interface WorkbenchTabErrorBoundaryProps {
  children: ReactNode;
  label: string;
  onClose: () => void;
}

interface WorkbenchTabErrorBoundaryState {
  error?: Error;
}

/** Contains a broken canvas item so one source or artifact cannot replace the workspace. */
export class WorkbenchTabErrorBoundary extends Component<
  WorkbenchTabErrorBoundaryProps,
  WorkbenchTabErrorBoundaryState
> {
  public state: WorkbenchTabErrorBoundaryState = {};

  public static getDerivedStateFromError(error: Error): WorkbenchTabErrorBoundaryState {
    return { error };
  }

  public componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('Canvas tab render failed', error, info.componentStack);
  }

  public render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <section className="grid h-full place-items-center p-6" role="alert">
        <div className="w-full max-w-md rounded-xl border border-destructive/40 bg-card p-5 shadow-sm">
          <AlertTriangleIcon aria-hidden="true" className="size-5 text-destructive" />
          <h3 className="mt-3 text-sm font-semibold">Could not open {this.props.label}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            This canvas item failed to render. The workspace and your draft are still available.
          </p>
          <div className="mt-4 flex gap-2">
            <Button onClick={() => this.setState({})} size="sm">
              Try again
            </Button>
            <Button onClick={this.props.onClose} size="sm" variant="outline">
              Close tab
            </Button>
          </div>
          <details className="mt-4 text-xs text-muted-foreground">
            <summary className="cursor-pointer">Error detail</summary>
            <p className="mt-2 break-words font-mono">{this.state.error.message}</p>
          </details>
        </div>
      </section>
    );
  }
}
