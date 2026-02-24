import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { useAppContext } from '@kombuse/ui/hooks'
import { Puzzle, Package, Download, Upload, Trash2, Power, PowerOff, Settings, FolderOpen, Globe, Plus, Pencil } from 'lucide-react'
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
  usePluginSources,
  useUpdatePluginSources,
} from '@kombuse/ui/hooks'
import { Button, Input, Label, Checkbox, toast, Tooltip, TooltipTrigger, TooltipContent } from '@kombuse/ui/base'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import type { Plugin as PluginType, AvailablePlugin, PluginSourceConfig } from '@kombuse/types'

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
    if (!window.confirm(`Uninstall "${plugin.name}"?`)) {
      return
    }

    uninstallPlugin.mutate(
      { id: plugin.id, mode: 'orphan' },
      {
        onSuccess: () => {
          toast.success(`Plugin "${plugin.name}" uninstalled`)
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
            `Installed "${result.plugin_name}": ${result.agents_created} created, ${result.agents_updated} updated, ${result.labels_created} labels created, ${result.labels_merged} labels merged`
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
  const { data: agents = [], isLoading: isLoadingAgents } = useAgents({ project_id: projectId })
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
            {labels.map((label) => {
              const pill = (
                <span
                  className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border"
                >
                  <span
                    className="size-2 rounded-full"
                    style={{ backgroundColor: label.color }}
                  />
                  {label.name}
                </span>
              )

              if (label.description) {
                return (
                  <Tooltip key={label.id}>
                    <TooltipTrigger asChild>{pill}</TooltipTrigger>
                    <TooltipContent>{label.description}</TooltipContent>
                  </Tooltip>
                )
              }

              return <span key={label.id}>{pill}</span>
            })}
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

const SOURCE_TYPE_LABELS: Record<PluginSourceConfig['type'], string> = {
  filesystem: 'Filesystem',
  github: 'GitHub',
  http: 'HTTP',
}

const SOURCE_TYPE_ICONS: Record<PluginSourceConfig['type'], typeof FolderOpen> = {
  filesystem: FolderOpen,
  github: Globe,
  http: Globe,
}

function sourceIdentifier(source: PluginSourceConfig): string {
  switch (source.type) {
    case 'filesystem':
      return source.path
    case 'github':
      return source.repo
    case 'http':
      return source.base_url
  }
}

function tokenDisplay(source: PluginSourceConfig): string | null {
  if (source.type === 'filesystem') return null
  if (!source.token) return null
  return source.token.startsWith('$') ? `env: ${source.token}` : 'configured'
}

function SourceRow({
  source,
  isReadOnly,
  onEdit,
  onRemove,
}: {
  source: PluginSourceConfig
  isReadOnly?: boolean
  onEdit?: () => void
  onRemove?: () => void
}) {
  const Icon = SOURCE_TYPE_ICONS[source.type]
  const token = tokenDisplay(source)

  return (
    <div className="flex items-center gap-4 px-4 py-3">
      <Icon className="size-4 text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-xs bg-muted px-1.5 py-0.5 rounded">{SOURCE_TYPE_LABELS[source.type]}</span>
          {isReadOnly && <span className="text-xs text-muted-foreground">Global</span>}
        </div>
        <p className="text-sm font-medium truncate">{sourceIdentifier(source)}</p>
        {source.type === 'github' && source.package_name && (
          <p className="text-xs text-muted-foreground">package: {source.package_name}</p>
        )}
        {token && (
          <p className="text-xs text-muted-foreground">token: {token}</p>
        )}
      </div>
      {!isReadOnly && (
        <div className="flex items-center gap-1">
          <Button variant="ghost" size="sm" onClick={onEdit} title="Edit source">
            <Pencil className="size-4" />
          </Button>
          <Button variant="ghost" size="sm" onClick={onRemove} title="Remove source">
            <Trash2 className="size-4" />
          </Button>
        </div>
      )}
    </div>
  )
}

function SourceForm({
  source,
  onSave,
  onCancel,
  isPending,
}: {
  source?: PluginSourceConfig
  onSave: (source: PluginSourceConfig) => void
  onCancel: () => void
  isPending: boolean
}) {
  const [type, setType] = useState<PluginSourceConfig['type']>(source?.type ?? 'filesystem')
  const [path, setPath] = useState(source?.type === 'filesystem' ? source.path : '')
  const [repo, setRepo] = useState(source?.type === 'github' ? source.repo : '')
  const [packageName, setPackageName] = useState(source?.type === 'github' ? (source.package_name ?? '') : '')
  const [baseUrl, setBaseUrl] = useState(source?.type === 'http' ? source.base_url : '')
  const [token, setToken] = useState(
    source && source.type !== 'filesystem' ? (source.token ?? '') : ''
  )

  const handleTypeChange = (newType: PluginSourceConfig['type']) => {
    setType(newType)
    setPath('')
    setRepo('')
    setPackageName('')
    setBaseUrl('')
    setToken('')
  }

  const handleSubmit = () => {
    switch (type) {
      case 'filesystem':
        if (!path.trim()) {
          toast.error('Path is required')
          return
        }
        onSave({ type: 'filesystem', path: path.trim() })
        break
      case 'github':
        if (!repo.trim()) {
          toast.error('Repository is required')
          return
        }
        onSave({
          type: 'github',
          repo: repo.trim(),
          ...(packageName.trim() ? { package_name: packageName.trim() } : {}),
          ...(token.trim() ? { token: token.trim() } : {}),
        })
        break
      case 'http':
        if (!baseUrl.trim()) {
          toast.error('Base URL is required')
          return
        }
        onSave({
          type: 'http',
          base_url: baseUrl.trim(),
          ...(token.trim() ? { token: token.trim() } : {}),
        })
        break
    }
  }

  return (
    <div className="border rounded-md p-4 space-y-3">
      <div className="space-y-2">
        <Label htmlFor="source-type">Source Type</Label>
        <select
          id="source-type"
          value={type}
          onChange={(e) => handleTypeChange(e.target.value as PluginSourceConfig['type'])}
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
        >
          <option value="filesystem">Filesystem</option>
          <option value="github">GitHub</option>
          <option value="http">HTTP</option>
        </select>
      </div>

      {type === 'filesystem' && (
        <div className="space-y-2">
          <Label htmlFor="source-path">Path</Label>
          <Input
            id="source-path"
            value={path}
            onChange={(e) => setPath(e.target.value)}
            placeholder="/path/to/plugins"
          />
        </div>
      )}

      {type === 'github' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="source-repo">Repository</Label>
            <Input
              id="source-repo"
              value={repo}
              onChange={(e) => setRepo(e.target.value)}
              placeholder="owner/repo"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-package-name">Package Name (optional)</Label>
            <Input
              id="source-package-name"
              value={packageName}
              onChange={(e) => setPackageName(e.target.value)}
              placeholder="Defaults to repo name"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-token-gh">Token (optional)</Label>
            <Input
              id="source-token-gh"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="$GITHUB_TOKEN"
            />
            <p className="text-xs text-muted-foreground">
              Use <code>$ENV_VAR</code> to reference an environment variable
            </p>
          </div>
        </>
      )}

      {type === 'http' && (
        <>
          <div className="space-y-2">
            <Label htmlFor="source-base-url">Base URL</Label>
            <Input
              id="source-base-url"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://feed.example.com"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="source-token-http">Token (optional)</Label>
            <Input
              id="source-token-http"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="$API_TOKEN"
            />
            <p className="text-xs text-muted-foreground">
              Use <code>$ENV_VAR</code> to reference an environment variable
            </p>
          </div>
        </>
      )}

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={handleSubmit} disabled={isPending} size="sm">
          {isPending ? 'Saving...' : source ? 'Update' : 'Add'}
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  )
}

function SourcesSection({ projectId }: { projectId: string }) {
  const { data, isLoading } = usePluginSources(projectId)
  const updateSources = useUpdatePluginSources()
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [isAdding, setIsAdding] = useState(false)

  const globalSources = data?.global_sources ?? []
  const projectSources = data?.project_sources ?? []

  const handleRemove = (index: number) => {
    const source = projectSources[index]
    if (!source) return
    if (!window.confirm(`Remove ${SOURCE_TYPE_LABELS[source.type]} source "${sourceIdentifier(source)}"?`)) {
      return
    }
    const updated = projectSources.filter((_, i) => i !== index)
    updateSources.mutate(
      { projectId, sources: updated },
      {
        onSuccess: () => toast.success('Source removed'),
        onError: (error) => toast.error(error.message ?? 'Failed to remove source'),
      }
    )
  }

  const handleSave = (source: PluginSourceConfig, index?: number) => {
    let updated: PluginSourceConfig[]
    if (index !== undefined) {
      updated = projectSources.map((s, i) => (i === index ? source : s))
    } else {
      updated = [...projectSources, source]
    }
    updateSources.mutate(
      { projectId, sources: updated },
      {
        onSuccess: () => {
          toast.success(index !== undefined ? 'Source updated' : 'Source added')
          setEditingIndex(null)
          setIsAdding(false)
        },
        onError: (error) => toast.error(error.message ?? 'Failed to save source'),
      }
    )
  }

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading plugin sources...</p>
  }

  const hasSources = globalSources.length > 0 || projectSources.length > 0

  return (
    <div className="space-y-6">
      {!hasSources && !isAdding && (
        <p className="text-sm text-muted-foreground py-4">
          No plugin sources configured. Add a source to discover plugins from the filesystem, GitHub, or an HTTP feed.
        </p>
      )}

      {globalSources.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium text-muted-foreground">Global Sources</h3>
          <div className="border rounded-md divide-y">
            {globalSources.map((source, i) => (
              <SourceRow key={`global-${i}`} source={source} isReadOnly />
            ))}
          </div>
          <p className="text-xs text-muted-foreground">
            Global sources are defined in <code>~/.kombuse/config.json</code> and apply to all projects.
          </p>
        </div>
      )}

      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-medium">Project Sources</h3>
          {!isAdding && editingIndex === null && (
            <Button variant="outline" size="sm" onClick={() => setIsAdding(true)}>
              <Plus className="size-4 mr-1" />
              Add Source
            </Button>
          )}
        </div>

        {projectSources.length > 0 && (
          <div className="border rounded-md divide-y">
            {projectSources.map((source, i) =>
              editingIndex === i ? (
                <div key={`edit-${i}`} className="p-4">
                  <SourceForm
                    source={source}
                    onSave={(s) => handleSave(s, i)}
                    onCancel={() => setEditingIndex(null)}
                    isPending={updateSources.isPending}
                  />
                </div>
              ) : (
                <SourceRow
                  key={`project-${i}`}
                  source={source}
                  onEdit={() => {
                    setEditingIndex(i)
                    setIsAdding(false)
                  }}
                  onRemove={() => handleRemove(i)}
                />
              )
            )}
          </div>
        )}

        {projectSources.length === 0 && !isAdding && (
          <p className="text-sm text-muted-foreground">
            No project-level sources. Click "Add Source" to configure one.
          </p>
        )}
      </div>

      {isAdding && (
        <SourceForm
          onSave={(s) => handleSave(s)}
          onCancel={() => setIsAdding(false)}
          isPending={updateSources.isPending}
        />
      )}
    </div>
  )
}

export function PluginsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { currentProjectId } = useAppContext()
  const [activeTab, setActiveTab] = useState<'installed' | 'available' | 'export' | 'sources'>('installed')

  if (!projectId) {
    return <p className="p-6 text-muted-foreground">No project selected.</p>
  }

  const resolvedId = currentProjectId ?? projectId

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
          {(['installed', 'available', 'export', 'sources'] as const).map((tab) => (
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
              {tab === 'sources' && <span className="flex items-center gap-1.5"><Settings className="size-3.5" /> Sources</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl">
          {activeTab === 'installed' && <InstalledPlugins projectId={resolvedId} />}
          {activeTab === 'available' && <AvailablePluginsList projectId={resolvedId} />}
          {activeTab === 'export' && <ExportSection projectId={resolvedId} />}
          {activeTab === 'sources' && <SourcesSection projectId={resolvedId} />}
        </div>
      </div>
    </main>
  )
}
