import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Puzzle, Package, Download, Upload, Trash2, Power, PowerOff } from 'lucide-react'
import {
  useAgents,
  useAgentProfiles,
  useExportPlugin,
  useProjectLabels,
  useInstalledPlugins,
  useAvailablePlugins,
  useInstallPlugin,
  useUpdatePlugin,
  useUninstallPlugin,
} from '@kombuse/ui/hooks'
import { Button, Input, Label, Checkbox, toast } from '@kombuse/ui/base'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import type { Plugin as PluginType, AvailablePlugin } from '@kombuse/types'

const PACKAGE_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

function InstalledPlugins({ projectId }: { projectId: string }) {
  const { data: plugins = [], isLoading } = useInstalledPlugins(projectId)
  const updatePlugin = useUpdatePlugin()
  const uninstallPlugin = useUninstallPlugin()

  const handleToggleEnabled = (plugin: PluginType) => {
    updatePlugin.mutate(
      { id: plugin.id, input: { is_enabled: !plugin.is_enabled } },
      {
        onSuccess: (updated) => {
          toast.success(
            `Plugin "${updated.name}" ${updated.is_enabled ? 'enabled' : 'disabled'}`
          )
        },
        onError: (error) => {
          toast.error(error.message ?? 'Failed to update plugin')
        },
      }
    )
  }

  const handleUninstall = (plugin: PluginType) => {
    const mode = window.confirm(
      `Uninstall "${plugin.name}"?\n\nClick OK to remove all plugin entities (agents, triggers, labels).\nClick Cancel to keep entities but unlink them from the plugin.`
    )
      ? 'delete'
      : 'orphan'

    // Double-confirm for delete mode
    if (mode === 'delete') {
      if (!window.confirm(`Are you sure? This will permanently delete all agents, triggers, and labels from "${plugin.name}".`)) {
        return
      }
    }

    uninstallPlugin.mutate(
      { id: plugin.id, mode },
      {
        onSuccess: () => {
          toast.success(`Plugin "${plugin.name}" uninstalled (${mode})`)
        },
        onError: (error) => {
          toast.error(error.message ?? 'Failed to uninstall plugin')
        },
      }
    )
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading installed plugins...</p>
  }

  if (plugins.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No plugins installed yet. Install one from the Available section below, or export agents as a new plugin.
      </p>
    )
  }

  return (
    <div className="border rounded-md divide-y">
      {plugins.map((plugin) => (
        <div key={plugin.id} className="flex items-center gap-4 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{plugin.name}</span>
              <span className="text-xs text-muted-foreground">v{plugin.version}</span>
              {!plugin.is_enabled && (
                <span className="text-xs bg-muted px-1.5 py-0.5 rounded">disabled</span>
              )}
            </div>
            {plugin.description && (
              <p className="text-sm text-muted-foreground truncate">{plugin.description}</p>
            )}
            <p className="text-xs text-muted-foreground">
              Installed {new Date(plugin.installed_at).toLocaleDateString()}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleToggleEnabled(plugin)}
              disabled={updatePlugin.isPending}
              title={plugin.is_enabled ? 'Disable plugin' : 'Enable plugin'}
            >
              {plugin.is_enabled ? (
                <PowerOff className="size-4" />
              ) : (
                <Power className="size-4" />
              )}
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleUninstall(plugin)}
              disabled={uninstallPlugin.isPending}
              title="Uninstall plugin"
            >
              <Trash2 className="size-4" />
            </Button>
          </div>
        </div>
      ))}
    </div>
  )
}

function AvailablePluginsList({ projectId }: { projectId: string }) {
  const { data: available = [], isLoading } = useAvailablePlugins(projectId)
  const installPlugin = useInstallPlugin()

  const handleInstall = (plugin: AvailablePlugin, overwrite?: boolean) => {
    installPlugin.mutate(
      {
        package_path: plugin.directory,
        project_id: projectId,
        overwrite,
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Installed "${result.plugin_name}": ${result.agents_created} agents, ${result.labels_created} labels created, ${result.labels_merged} labels merged`
          )
        },
        onError: (error) => {
          if (error.message === 'plugin_already_installed') {
            const confirmed = window.confirm(
              `Plugin "${plugin.name}" is already installed. Reinstall it?`
            )
            if (confirmed) {
              handleInstall(plugin, true)
            }
          } else {
            toast.error(error.message ?? 'Install failed')
          }
        },
      }
    )
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Scanning for available plugins...</p>
  }

  if (available.length === 0) {
    return (
      <p className="text-sm text-muted-foreground py-4">
        No available plugins found. Export agents as a plugin first, then they'll appear here.
      </p>
    )
  }

  return (
    <div className="border rounded-md divide-y">
      {available.map((plugin) => (
        <div key={plugin.directory} className="flex items-center gap-4 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-medium">{plugin.name}</span>
              <span className="text-xs text-muted-foreground">v{plugin.version}</span>
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{plugin.source}</span>
              {plugin.installed && (
                <span className="text-xs bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 px-1.5 py-0.5 rounded">
                  installed
                </span>
              )}
            </div>
            {plugin.description && (
              <p className="text-sm text-muted-foreground truncate">{plugin.description}</p>
            )}
            <p className="text-xs text-muted-foreground truncate">{plugin.directory}</p>
          </div>
          <Button
            size="sm"
            onClick={() => handleInstall(plugin)}
            disabled={installPlugin.isPending}
          >
            <Download className="size-4 mr-1" />
            {plugin.installed ? 'Reinstall' : 'Install'}
          </Button>
        </div>
      ))}
    </div>
  )
}

function ExportSection({ projectId }: { projectId: string }) {
  const { data: agents = [], isLoading: isLoadingAgents } = useAgents()
  const { data: profiles = [] } = useAgentProfiles()
  const { data: labels = [] } = useProjectLabels(projectId)
  const exportPlugin = useExportPlugin()

  const [packageName, setPackageName] = useState('')
  const [description, setDescription] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

  const profileNameById = new Map(profiles.map((p) => [p.id, p.name]))
  const exportableAgents = agents.filter((a) => a.id !== ANONYMOUS_AGENT_ID)

  const allSelected =
    exportableAgents.length > 0 &&
    exportableAgents.every((a) => selectedIds.has(a.id))

  const handleToggleAll = () => {
    if (allSelected) {
      setSelectedIds(new Set())
    } else {
      setSelectedIds(new Set(exportableAgents.map((a) => a.id)))
    }
  }

  const handleToggle = (agentId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev)
      if (next.has(agentId)) {
        next.delete(agentId)
      } else {
        next.add(agentId)
      }
      return next
    })
  }

  const handleExport = (overwrite?: boolean) => {
    const trimmedName = packageName.trim()
    if (!trimmedName) {
      toast.error('Please enter a package name')
      return
    }

    if (!PACKAGE_NAME_REGEX.test(trimmedName)) {
      toast.error('Package name must be lowercase kebab-case (e.g. "my-plugin")')
      return
    }

    const agentIds = selectedIds.size > 0 ? [...selectedIds] : undefined

    exportPlugin.mutate(
      {
        package_name: trimmedName,
        project_id: projectId,
        agent_ids: agentIds,
        description: description.trim() || undefined,
        overwrite,
      },
      {
        onSuccess: (result) => {
          toast.success(
            `Exported ${result.agent_count} agent${result.agent_count === 1 ? '' : 's'} and ${result.label_count} label${result.label_count === 1 ? '' : 's'} to ${result.directory}`
          )
        },
        onError: (error) => {
          if (error.message === 'package_exists') {
            const confirmed = window.confirm(
              `Package "${trimmedName}" already exists. Overwrite it?`
            )
            if (confirmed) {
              handleExport(true)
            }
          } else {
            toast.error(error.message ?? 'Export failed')
          }
        },
      }
    )
  }

  const exportLabel =
    selectedIds.size === 0
      ? `Export All (${exportableAgents.length})`
      : `Export Selected (${selectedIds.size})`

  const isValid = packageName.trim() && PACKAGE_NAME_REGEX.test(packageName.trim())

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="plugins-package-name">Package Name</Label>
        <div className="flex items-center gap-2">
          <Package className="size-4 text-muted-foreground" />
          <Input
            id="plugins-package-name"
            value={packageName}
            onChange={(e) => setPackageName(e.target.value)}
            placeholder="my-plugin"
            className="flex-1"
          />
        </div>
        <p className="text-sm text-muted-foreground">
          Lowercase kebab-case name. Exported to{' '}
          <code>.kombuse/plugins/{packageName.trim() || '<name>'}/</code>
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="plugins-description">Description (optional)</Label>
        <Input
          id="plugins-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="A brief description of the plugin"
        />
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <Label>Agents</Label>
          <span className="text-sm text-muted-foreground">
            {selectedIds.size === 0
              ? 'All agents will be exported'
              : `${selectedIds.size} of ${exportableAgents.length} selected`}
          </span>
        </div>

        {isLoadingAgents ? (
          <p className="text-sm text-muted-foreground py-4">Loading agents...</p>
        ) : exportableAgents.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4">No agents found.</p>
        ) : (
          <div className="border rounded-md divide-y">
            <div className="flex items-center gap-3 px-4 py-3 bg-muted/30">
              <Checkbox
                id="plugins-select-all"
                checked={allSelected}
                onCheckedChange={handleToggleAll}
              />
              <Label
                htmlFor="plugins-select-all"
                className="font-medium cursor-pointer"
              >
                Select all
              </Label>
            </div>

            {exportableAgents.map((agent) => {
              const name = profileNameById.get(agent.id) ?? agent.id
              return (
                <div
                  key={agent.id}
                  className="flex items-center gap-3 px-4 py-3"
                >
                  <Checkbox
                    id={`plugins-agent-${agent.id}`}
                    checked={selectedIds.has(agent.id)}
                    onCheckedChange={() => handleToggle(agent.id)}
                  />
                  <div className="flex-1 min-w-0">
                    <Label
                      htmlFor={`plugins-agent-${agent.id}`}
                      className="font-normal cursor-pointer truncate block"
                    >
                      {name}
                    </Label>
                    <p className="text-xs text-muted-foreground truncate">{agent.slug ?? agent.id}</p>
                  </div>
                  {!agent.is_enabled && (
                    <span className="text-xs text-muted-foreground">disabled</span>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {labels.length > 0 && (
        <div className="space-y-2">
          <Label>Labels ({labels.length})</Label>
          <p className="text-sm text-muted-foreground">
            All project labels will be included in the plugin manifest.
          </p>
          <div className="flex flex-wrap gap-2">
            {labels.map((label) => (
              <span
                key={label.id}
                className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
              >
                <span
                  className="size-2 rounded-full"
                  style={{ backgroundColor: label.color }}
                />
                {label.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <Button
        onClick={() => handleExport()}
        disabled={exportPlugin.isPending || !isValid}
      >
        {exportPlugin.isPending ? 'Exporting...' : exportLabel}
      </Button>
    </div>
  )
}

export function PluginsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const [activeTab, setActiveTab] = useState<'installed' | 'available' | 'export'>('installed')

  if (!projectId) {
    return <p className="p-6 text-muted-foreground">No project selected.</p>
  }

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Puzzle className="size-6" />
          <h1 className="text-2xl font-bold">Plugins</h1>
          <span className="text-sm text-muted-foreground">Manage plugin packages</span>
        </div>
      </div>

      <div className="border-b px-6">
        <div className="flex gap-1">
          {(['installed', 'available', 'export'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
                activeTab === tab
                  ? 'border-foreground text-foreground'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              {tab === 'installed' && <span className="flex items-center gap-1.5"><Puzzle className="size-3.5" /> Installed</span>}
              {tab === 'available' && <span className="flex items-center gap-1.5"><Download className="size-3.5" /> Available</span>}
              {tab === 'export' && <span className="flex items-center gap-1.5"><Upload className="size-3.5" /> Export</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          {activeTab === 'installed' && <InstalledPlugins projectId={projectId} />}
          {activeTab === 'available' && <AvailablePluginsList projectId={projectId} />}
          {activeTab === 'export' && <ExportSection projectId={projectId} />}
        </div>
      </div>
    </main>
  )
}
