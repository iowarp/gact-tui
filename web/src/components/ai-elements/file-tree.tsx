'use client';

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { ChevronRightIcon, FileIcon, FolderIcon, FolderOpenIcon } from 'lucide-react';
import type { HTMLAttributes, ReactNode } from 'react';
import { createContext, useCallback, useContext, useMemo, useState } from 'react';

interface FileTreeContextType {
  expandedPaths: Set<string>;
  togglePath: (path: string) => void;
  selectedPath?: string;
  onSelect?: (path: string) => void;
}

// Default noop for context default value
// oxlint-disable-next-line eslint(no-empty-function)
const noop = () => {};

const FileTreeContext = createContext<FileTreeContextType>({
  // oxlint-disable-next-line eslint-plugin-unicorn(no-new-builtin)
  expandedPaths: new Set(),
  togglePath: noop,
});

export type FileTreeProps = Omit<HTMLAttributes<HTMLDivElement>, 'onSelect'> & {
  expanded?: Set<string>;
  defaultExpanded?: Set<string>;
  selectedPath?: string;
  onSelect?: (path: string) => void;
  onExpandedChange?: (expanded: Set<string>) => void;
};

export const FileTree = ({
  expanded: controlledExpanded,
  defaultExpanded = new Set(),
  selectedPath,
  onSelect,
  onExpandedChange,
  className,
  children,
  ...props
}: FileTreeProps) => {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const expandedPaths = controlledExpanded ?? internalExpanded;

  const togglePath = useCallback(
    (path: string) => {
      const newExpanded = new Set(expandedPaths);
      if (newExpanded.has(path)) {
        newExpanded.delete(path);
      } else {
        newExpanded.add(path);
      }
      setInternalExpanded(newExpanded);
      onExpandedChange?.(newExpanded);
    },
    [expandedPaths, onExpandedChange],
  );

  const contextValue = useMemo(
    () => ({ expandedPaths, onSelect, selectedPath, togglePath }),
    [expandedPaths, onSelect, selectedPath, togglePath],
  );

  return (
    <FileTreeContext.Provider value={contextValue}>
      <div
        className={cn('min-w-0 rounded-lg border bg-background font-sans text-[12.5px]', className)}
        role="tree"
        {...props}
      >
        <div className="min-w-0 p-1">{children}</div>
      </div>
    </FileTreeContext.Provider>
  );
};

export type FileTreeIconProps = HTMLAttributes<HTMLSpanElement>;

export const FileTreeIcon = ({ className, children, ...props }: FileTreeIconProps) => (
  <span className={cn('shrink-0', className)} {...props}>
    {children}
  </span>
);

export type FileTreeNameProps = HTMLAttributes<HTMLSpanElement>;

export const FileTreeName = ({ className, children, ...props }: FileTreeNameProps) => (
  <span className={cn('min-w-0 flex-1 truncate', className)} {...props}>
    {children}
  </span>
);

interface FileTreeFolderContextType {
  path: string;
  name: string;
  isExpanded: boolean;
}

const FileTreeFolderContext = createContext<FileTreeFolderContextType>({
  isExpanded: false,
  name: '',
  path: '',
});

export type FileTreeFolderProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  name: string;
};

export const FileTreeFolder = ({
  path,
  name,
  className,
  children,
  ...props
}: FileTreeFolderProps) => {
  const { expandedPaths, togglePath } = useContext(FileTreeContext);
  const isExpanded = expandedPaths.has(path);

  const handleOpenChange = useCallback(() => {
    togglePath(path);
  }, [togglePath, path]);

  const folderContextValue = useMemo(() => ({ isExpanded, name, path }), [isExpanded, name, path]);

  return (
    <FileTreeFolderContext.Provider value={folderContextValue}>
      <Collapsible onOpenChange={handleOpenChange} open={isExpanded}>
        <div className={cn('', className)} role="treeitem" aria-expanded={isExpanded} {...props}>
          <CollapsibleTrigger asChild>
            <button
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} folder ${name}`}
              className="flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[6px] border-none bg-transparent px-2 text-left whitespace-nowrap transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              type="button"
            >
              <span aria-hidden="true" className="grid w-3 shrink-0 place-items-center text-faint">
                <ChevronRightIcon
                  className={cn('size-3 transition-transform', isExpanded && 'rotate-90')}
                />
              </span>
              <FileTreeIcon>
                {isExpanded ? (
                  <FolderOpenIcon className="size-3.5 text-muted-foreground" />
                ) : (
                  <FolderIcon className="size-3.5 text-muted-foreground" />
                )}
              </FileTreeIcon>
              <FileTreeName>{name}</FileTreeName>
            </button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="pl-5">{children}</div>
          </CollapsibleContent>
        </div>
      </Collapsible>
    </FileTreeFolderContext.Provider>
  );
};

interface FileTreeFileContextType {
  path: string;
  name: string;
}

const FileTreeFileContext = createContext<FileTreeFileContextType>({
  name: '',
  path: '',
});

export type FileTreeFileProps = HTMLAttributes<HTMLDivElement> & {
  path: string;
  name: string;
  icon?: ReactNode;
  alignWithFolders?: boolean;
};

export const FileTreeFile = ({
  path,
  name,
  icon,
  alignWithFolders = true,
  className,
  children,
  ...props
}: FileTreeFileProps) => {
  const { selectedPath, onSelect } = useContext(FileTreeContext);
  const isSelected = selectedPath === path;

  const handleClick = useCallback(() => {
    onSelect?.(path);
  }, [onSelect, path]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        onSelect?.(path);
      }
    },
    [onSelect, path],
  );

  const fileContextValue = useMemo(() => ({ name, path }), [name, path]);

  return (
    <FileTreeFileContext.Provider value={fileContextValue}>
      <div
        className={cn(
          'flex h-7 w-full min-w-0 cursor-pointer items-center gap-2 rounded-[6px] px-2 whitespace-nowrap transition-colors hover:bg-hover',
          isSelected && 'bg-accent text-accent-foreground hover:bg-accent',
          className,
        )}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        role="treeitem"
        tabIndex={0}
        {...props}
      >
        {children ?? (
          <>
            {alignWithFolders ? <span aria-hidden="true" className="w-3 shrink-0" /> : null}
            <FileTreeIcon>
              {icon ?? <FileIcon className="size-3.5 text-muted-foreground" />}
            </FileTreeIcon>
            <FileTreeName>{name}</FileTreeName>
          </>
        )}
      </div>
    </FileTreeFileContext.Provider>
  );
};
