import { useId, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface ArchiveFile {
  archive_path: string;
  bytes: number;
}

const PAGE_SIZE = 100;

/** Keep large workspace snapshots navigable without rendering every file. */
export function ArchiveFileList({ files }: { files: ArchiveFile[] }) {
  const searchId = useId();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const matches = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return query
      ? files.filter((file) => file.archive_path.toLocaleLowerCase().includes(query))
      : files;
  }, [files, search]);
  const pages = Math.max(1, Math.ceil(matches.length / PAGE_SIZE));
  const current = Math.min(page, pages - 1);
  return (
    <div className="mt-3 space-y-4">
      <div className="max-w-lg space-y-2">
        <Label htmlFor={searchId}>Search included files</Label>
        <Input
          id={searchId}
          type="search"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setPage(0);
          }}
          placeholder="Search by file or folder name"
        />
      </div>
      <p role="status" className="text-sm text-muted-foreground">
        {matches.length.toLocaleString()} of {files.length.toLocaleString()} files · Page{' '}
        {current + 1} of {pages.toLocaleString()}
      </p>
      <ul className="space-y-2">
        {matches.slice(current * PAGE_SIZE, (current + 1) * PAGE_SIZE).map((file) => (
          <li key={file.archive_path} className="break-words">
            <a
              className="underline"
              href={file.archive_path.split('/').map(encodeURIComponent).join('/')}
            >
              {file.archive_path}
            </a>{' '}
            ({file.bytes.toLocaleString()} bytes)
          </li>
        ))}
      </ul>
      {!matches.length && <p>No files match your search.</p>}
      {pages > 1 && (
        <nav aria-label="Included file pages" className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={current === 0}
            onClick={() => setPage(current - 1)}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={current === pages - 1}
            onClick={() => setPage(current + 1)}
          >
            Next
          </Button>
        </nav>
      )}
    </div>
  );
}
