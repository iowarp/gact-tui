import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';

/** Keep old settings bookmarks useful without restoring the removed relay owner. */
export function RelaySettings() {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold">Remote tools</h2>
      <p className="text-sm text-muted-foreground">
        Manage remote tools through MCP server connections. Existing relay placement settings are
        not converted automatically.
      </p>
      <Button asChild variant="outline">
        <Link to="/infrastructure/tools">Open tool connections</Link>
      </Button>
    </section>
  );
}
