/** Read browser directory entries while preserving the selected folder structure. */
export async function readDroppedFolders(entries: FileSystemEntry[]): Promise<File[]> {
  const files: File[] = [];
  let visited = 0;
  const walk = async (entry: FileSystemEntry, parent: string): Promise<void> => {
    if (++visited > 10000) throw new Error('Choose a smaller folder (limit 10,000 entries)');
    const relative = `${parent}${entry.name}`;
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      Object.defineProperty(file, 'webkitRelativePath', { value: relative });
      files.push(file);
    } else if (entry.isDirectory) {
      const reader = (entry as FileSystemDirectoryEntry).createReader();
      for (;;) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
          reader.readEntries(resolve, reject),
        );
        if (!batch.length) break;
        for (const child of batch) await walk(child, `${relative}/`);
      }
    }
  };
  for (const entry of entries) await walk(entry, '');
  if (!files.length) throw new Error('This folder has no files to upload');
  return files;
}
