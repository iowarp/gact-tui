import type { Connector, PluginEntry } from '@clio/core/v3';
import { PackageIcon, PlugIcon, SparklesIcon } from 'lucide-react';
import { connectorPluginParts } from '@/lib/connector-plugin';
import { formatList } from '@/lib/locale-format';
import { KeyValueGrid } from './primitives/key-value-grid';
import { SettingsGroupLabel } from './settings-row';
import { ph, plural, t } from '@lingui/core/macro';

/**
 * What a plugin that bundles a connector brings, at the top of its detail pane (PL-D1):
 * its skills by name (each opens in the plugin's own view) and the connector as its MCP
 * server, with the tool count once it has been listed. The needs, sign-in and settings
 * below are the connector's part of the plugin.
 */
export function ConnectorPluginContents({
  connector,
  plugin,
  onViewSkill,
}: {
  connector: Connector;
  plugin: PluginEntry;
  onViewSkill?: (plugin: PluginEntry, skill: string) => void;
}) {
  const parts = connectorPluginParts(connector, plugin);
  const kinds = formatList(parts, { and: true });
  const skills = plugin.skills;
  const tools = connector.tool_count;
  return (
    <section aria-label={t`What it brings`} data-slot="connector-plugin-contents">
      <SettingsGroupLabel>{t`What it brings`}</SettingsGroupLabel>
      <p className="text-xs leading-5 text-muted-foreground">
        {t`A plugin with ${ph({ kinds })}. Adding it to a conversation brings both.`}
      </p>
      <KeyValueGrid
        className="mt-2"
        items={[
          ...(skills.length
            ? [
                {
                  label: plural(skills.length, { one: 'Skill', other: 'Skills' }),
                  icon: <SparklesIcon aria-hidden="true" className="size-3.5" />,
                  wrap: true,
                  value: (
                    <span className="flex min-w-0 flex-wrap gap-x-3 gap-y-0.5">
                      {skills.map((skill) =>
                        onViewSkill ? (
                          <button
                            className="text-left underline-offset-2 hover:underline"
                            key={skill}
                            onClick={() => onViewSkill(plugin, skill)}
                            type="button"
                          >
                            {skill}
                          </button>
                        ) : (
                          <span key={skill}>{skill}</span>
                        ),
                      )}
                    </span>
                  ),
                },
              ]
            : []),
          {
            label: t`MCP server`,
            icon: <PlugIcon aria-hidden="true" className="size-3.5" />,
            value:
              tools === null
                ? connector.enabled
                  ? connector.name
                  : t`${ph({ name: connector.name })}, tools listed once enabled`
                : t`${ph({ name: connector.name })} (${ph({
                    count: plural(tools, { one: '# tool', other: '# tools' }),
                  })})`,
          },
          {
            label: t`Plugin`,
            icon: <PackageIcon aria-hidden="true" className="size-3.5" />,
            value: plugin.ref,
            mono: true,
          },
        ]}
      />
    </section>
  );
}
