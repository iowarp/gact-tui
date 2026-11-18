import { useLocation, useNavigate } from 'react-router-dom';
import { SidebarMenuButton, SidebarMenuItem, useSidebar } from '@/components/ui/sidebar';
import { pluginPageRoute, usePluginPages } from '@/lib/a2ui/plugin-pages';
import { PluginTabIcon } from '@/lib/a2ui/plugin-tab-icons';
import { cn } from '@/lib/utils';
import { ph, t } from '@lingui/core/macro';

/**
 * The left bar's entries for plugins' own pages, under Search: each opens the
 * plugin's page in the main area, as Settings opens over it. Any plugin can add
 * one; the page is the plugin's.
 */
export function NavigationPluginPages() {
  const pages = usePluginPages();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isMobile, setOpenMobile } = useSidebar();
  return pages.map((page) => {
    const route = pluginPageRoute(page);
    const active = pathname === route;
    const title = page.title;
    return (
      <SidebarMenuItem key={page.id}>
        <SidebarMenuButton
          aria-current={active ? 'page' : undefined}
          className={cn('h-[30px] gap-2.5 text-ui', !page.available && 'text-muted-foreground')}
          data-plugin-page={page.id}
          isActive={active}
          onClick={() => {
            if (isMobile) setOpenMobile(false);
            navigate(route);
          }}
          tooltip={page.available ? title : t`${ph({ title })} is unavailable`}
          type="button"
        >
          <PluginTabIcon name={page.icon} />
          <span className="truncate">{page.available ? title : t`${title} (unavailable)`}</span>
        </SidebarMenuButton>
      </SidebarMenuItem>
    );
  });
}
