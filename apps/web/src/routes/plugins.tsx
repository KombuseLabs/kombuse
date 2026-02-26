import { useState, useCallback, useMemo } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Badge,
  Button,
  Input,
  Label,
  Checkbox,
  Switch,
  toast,
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  ResizableCardHandle,
  ResizableCardPanel,
  ResizablePanelGroup,
  ResizablePanel,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@kombuse/ui/base'
import { MobileListDetail } from '@kombuse/ui/components'
import {
  useAgents,
  useAgentProfiles,
  useExportPlugin,
  useProjectLabels,
  useInstalledPlugins,
  useAvailablePlugins,
  useInstallPlugin,
  useInstallRemotePlugin,
  useUpdatePlugin,
  useUninstallPlugin,
  usePluginSources,
  useUpdatePluginSources,
  useAppContext,
  useIsMobile,
} from '@kombuse/ui/hooks'
import { cn } from '@kombuse/ui/lib/utils'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'
import type { Plugin as PluginType, AvailablePlugin, PluginSourceConfig } from '@kombuse/types'
import {
  Package,
  Download,
  Upload,
  Trash2,
  Settings,
  FolderOpen,
  Globe,
  Plus,
  Pencil,
  X,
} from 'lucide-react'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PACKAGE_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/
const PLUGINS_PANEL_LAYOUT_KEY = 'plugins-panel-layout'

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface UnifiedPlugin {
  name: string
  version: string
  description?: string | null
  source?: AvailablePlugin['source']
  directory?: string
  installed: boolean
  installedPlugin?: PluginType
  availablePlugin?: AvailablePlugin
  has_update?: boolean
}

// ---------------------------------------------------------------------------
// ExportSection (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Source components (unchanged)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// New: PluginListItem
// ---------------------------------------------------------------------------

function PluginListItem({
  plugin,
  isSelected,
  onClick,
}: {
  plugin: UnifiedPlugin
  isSelected: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full text-left px-3 py-2.5 rounded-lg transition-colors',
        isSelected ? 'bg-accent' : 'hover:bg-muted/50',
      )}
    >
      <div className="flex items-center gap-2">
        <span className="font-medium truncate">{plugin.name}</span>
        <span className="text-xs text-muted-foreground shrink-0">v{plugin.version}</span>
        {plugin.source && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            {plugin.source}
          </Badge>
        )}
        {plugin.installed && !plugin.has_update && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 shrink-0 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200"
          >
            installed
          </Badge>
        )}
        {plugin.has_update && (
          <Badge
            variant="secondary"
            className="text-[10px] px-1.5 py-0 shrink-0 bg-amber-100 dark:bg-amber-900 text-amber-800 dark:text-amber-200"
          >
            update
          </Badge>
        )}
        {plugin.installedPlugin && !plugin.installedPlugin.is_enabled && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
            disabled
          </Badge>
        )}
      </div>
      {plugin.description && (
        <p className="text-sm text-muted-foreground truncate mt-0.5">{plugin.description}</p>
      )}
    </button>
  )
}

// ---------------------------------------------------------------------------
// New: PluginDetail
// ---------------------------------------------------------------------------

function PluginDetail({
  plugin,
  projectId,
  onClose,
}: {
  plugin: UnifiedPlugin
  projectId: string
  onClose: () => void
}) {
  const navigate = useNavigate()
  const { data: agents = [] } = useAgents({ project_id: projectId })
  const { data: profiles = [] } = useAgentProfiles()
  const updatePlugin = useUpdatePlugin()
  const uninstallPlugin = useUninstallPlugin()
  const installPlugin = useInstallPlugin()
  const installRemotePlugin = useInstallRemotePlugin()

  const ip = plugin.installedPlugin
  const ap = plugin.availablePlugin

  const pluginAgents = ip ? agents.filter((a) => a.plugin_id === ip.id) : []
  const profileMap = new Map(profiles.map((p) => [p.id, p]))

  const manifestLabels = (ip?.manifest as { kombuse?: { labels?: Array<{ name: string; color: string; description?: string | null }> } })?.kombuse?.labels ?? []

  const handleInstall = (target: AvailablePlugin, overwrite?: boolean) => {
    const callbacks = {
      onSuccess: (result: { plugin_name: string; agents_created: number; agents_updated: number; labels_created: number; labels_merged: number }) => {
        toast.success(
          `Installed "${result.plugin_name}": ${result.agents_created} created, ${result.agents_updated} updated, ${result.labels_created} labels created, ${result.labels_merged} labels merged`,
        )
      },
      onError: (error: Error) => {
        if (error.message === 'plugin_already_installed') {
          const confirmed = window.confirm(
            `Plugin "${target.name}" is already installed. ${target.has_update ? 'Update' : 'Reinstall'} it?`,
          )
          if (confirmed) {
            handleInstall(target, true)
          }
        } else {
          toast.error(error.message ?? 'Install failed')
        }
      },
    }

    if (target.directory) {
      installPlugin.mutate(
        { package_path: target.directory, project_id: projectId, overwrite },
        callbacks,
      )
    } else {
      installRemotePlugin.mutate(
        { name: target.name, version: target.version, project_id: projectId, overwrite },
        callbacks,
      )
    }
  }

  const handleUninstall = () => {
    if (!ip) return
    if (!window.confirm(`Uninstall "${ip.name}"?`)) return

    uninstallPlugin.mutate(
      { id: ip.id, mode: 'orphan' },
      {
        onSuccess: () => {
          toast.success(`Plugin "${ip.name}" uninstalled`)
          navigate(`/projects/${projectId}/plugins`)
        },
        onError: (error) => {
          toast.error(error.message ?? 'Failed to uninstall plugin')
        },
      },
    )
  }

  const handleToggleEnabled = () => {
    if (!ip) return
    updatePlugin.mutate(
      { id: ip.id, input: { is_enabled: !ip.is_enabled } },
      {
        onSuccess: (updated) => {
          toast.success(`Plugin "${updated.name}" ${updated.is_enabled ? 'enabled' : 'disabled'}`)
        },
        onError: (error) => {
          toast.error(error.message ?? 'Failed to update plugin')
        },
      },
    )
  }

  const isInstalling = installPlugin.isPending || installRemotePlugin.isPending

  return (
    <div className="flex h-full flex-col">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 border-b p-4 shrink-0">
        <div className="min-w-0">
          <h2 className="text-xl font-bold truncate">{plugin.name}</h2>
          <p className="text-sm text-muted-foreground">v{plugin.version}</p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {ip && (
            <Switch
              checked={ip.is_enabled}
              onCheckedChange={handleToggleEnabled}
              disabled={updatePlugin.isPending}
            />
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="size-4" />
          </Button>
        </div>
      </div>

      {/* Scrollable body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-6">
        {/* Description */}
        {plugin.description && <p className="text-sm">{plugin.description}</p>}

        {/* Source info */}
        <div className="space-y-1 text-sm">
          {plugin.source && (
            <p className="flex items-center gap-2">
              Source: <Badge variant="outline">{plugin.source}</Badge>
            </p>
          )}
          {plugin.directory && (
            <p className="text-muted-foreground truncate">Path: {plugin.directory}</p>
          )}
          {ip && (
            <p className="text-muted-foreground">
              Installed {new Date(ip.installed_at).toLocaleDateString()}
            </p>
          )}
          {plugin.has_update && ap?.latest_version && (
            <p className="text-amber-600 dark:text-amber-400">
              Update available: v{ip?.version ?? plugin.version} → v{ap.latest_version}
            </p>
          )}
        </div>

        {/* Actions */}
        <div className="flex flex-wrap gap-2">
          {!plugin.installed && ap && (
            <Button onClick={() => handleInstall(ap)} disabled={isInstalling}>
              <Download className="size-4 mr-1" />
              {isInstalling ? 'Installing...' : 'Install'}
            </Button>
          )}
          {plugin.has_update && ap && (
            <Button onClick={() => handleInstall(ap, true)} disabled={isInstalling}>
              <Download className="size-4 mr-1" />
              {isInstalling ? 'Updating...' : 'Update'}
            </Button>
          )}
          {plugin.installed && !plugin.has_update && ap && (
            <Button variant="outline" onClick={() => handleInstall(ap, true)} disabled={isInstalling}>
              {isInstalling ? 'Reinstalling...' : 'Reinstall'}
            </Button>
          )}
          {ip && (
            <Button
              variant="ghost"
              onClick={handleUninstall}
              disabled={uninstallPlugin.isPending}
              className="text-destructive hover:text-destructive"
            >
              <Trash2 className="size-4 mr-1" />
              Uninstall
            </Button>
          )}
        </div>

        {/* Agents */}
        {pluginAgents.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Agents ({pluginAgents.length})</h3>
            <div className="border rounded-md divide-y">
              {pluginAgents.map((agent) => {
                const profile = profileMap.get(agent.id)
                return (
                  <div key={agent.id} className="flex items-center gap-3 px-4 py-2">
                    <span className="font-medium text-sm truncate">
                      {profile?.name ?? agent.slug ?? agent.id}
                    </span>
                    {!agent.is_enabled && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 shrink-0">
                        disabled
                      </Badge>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* Labels */}
        {manifestLabels.length > 0 && (
          <div className="space-y-2">
            <h3 className="text-sm font-medium">Labels ({manifestLabels.length})</h3>
            <div className="flex flex-wrap gap-2">
              {manifestLabels.map((label) => {
                const pill = (
                  <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-medium border">
                    <span
                      className="size-2 rounded-full"
                      style={{ backgroundColor: label.color }}
                    />
                    {label.name}
                  </span>
                )
                if (label.description) {
                  return (
                    <Tooltip key={label.name}>
                      <TooltipTrigger asChild>{pill}</TooltipTrigger>
                      <TooltipContent>{label.description}</TooltipContent>
                    </Tooltip>
                  )
                }
                return <span key={label.name}>{pill}</span>
              })}
            </div>
          </div>
        )}

        {/* Placeholder for uninstalled plugins */}
        {!ip && pluginAgents.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Install this plugin to see included agents and labels.
          </p>
        )}
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// New: SourcesPopover
// ---------------------------------------------------------------------------

function SourcesPopover({
  projectId,
  onManage,
}: {
  projectId: string
  onManage: () => void
}) {
  const { data } = usePluginSources(projectId)
  const defaultSources = data?.default_sources ?? []
  const globalSources = data?.global_sources ?? []
  const projectSources = data?.project_sources ?? []
  const totalCount = defaultSources.length + globalSources.length + projectSources.length

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <Settings className="size-4" />
          Sources ({totalCount})
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80" align="end">
        <div className="space-y-3">
          <h4 className="font-medium text-sm">Plugin Sources</h4>

          {defaultSources.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">Default</p>
              {defaultSources.map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground truncate">
                  {s.label}: {s.path ?? s.base_url}
                </p>
              ))}
            </div>
          )}

          {globalSources.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">
                Global ({globalSources.length})
              </p>
              {globalSources.map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground truncate">
                  {sourceIdentifier(s)}
                </p>
              ))}
            </div>
          )}

          {projectSources.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs text-muted-foreground font-medium">
                Project ({projectSources.length})
              </p>
              {projectSources.map((s, i) => (
                <p key={i} className="text-xs text-muted-foreground truncate">
                  {sourceIdentifier(s)}
                </p>
              ))}
            </div>
          )}

          <Button variant="link" size="sm" className="px-0 h-auto" onClick={onManage}>
            Manage sources...
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------
// Main: PluginsPage
// ---------------------------------------------------------------------------

export function PluginsPage() {
  const { projectId, pluginName: rawPluginName } = useParams<{
    projectId: string
    pluginName?: string
  }>()
  const { currentProjectId } = useAppContext()
  const navigate = useNavigate()
  const isMobile = useIsMobile()

  const [exportOpen, setExportOpen] = useState(false)
  const [sourcesDialogOpen, setSourcesDialogOpen] = useState(false)

  if (!projectId) {
    return <p className="p-6 text-muted-foreground">No project selected.</p>
  }

  const resolvedId = currentProjectId ?? projectId
  const pluginName = rawPluginName ? decodeURIComponent(rawPluginName) : undefined
  const basePath = `/projects/${projectId}/plugins`
  const showDetailPanel = pluginName !== undefined

  // Data hooks
  const { data: installed = [], isLoading: isLoadingInstalled } = useInstalledPlugins(resolvedId)
  const { data: available = [], isLoading: isLoadingAvailable } = useAvailablePlugins(resolvedId)

  // Unified plugin list
  const unifiedPlugins = useMemo(() => {
    const map = new Map<string, UnifiedPlugin>()

    for (const ap of available) {
      map.set(ap.name, {
        name: ap.name,
        version: ap.version,
        description: ap.description,
        source: ap.source,
        directory: ap.directory,
        installed: ap.installed,
        availablePlugin: ap,
        has_update: ap.has_update,
      })
    }

    for (const ip of installed) {
      const existing = map.get(ip.name)
      if (existing) {
        existing.installedPlugin = ip
        existing.installed = true
      } else {
        map.set(ip.name, {
          name: ip.name,
          version: ip.version,
          description: ip.description,
          installed: true,
          installedPlugin: ip,
        })
      }
    }

    return [...map.values()].sort((a, b) => {
      if (a.installed !== b.installed) return a.installed ? -1 : 1
      return a.name.localeCompare(b.name)
    })
  }, [available, installed])

  const selectedPlugin = pluginName
    ? unifiedPlugins.find((p) => p.name === pluginName)
    : undefined

  // Panel layout persistence
  const [defaultLayout] = useState<Record<string, number> | undefined>(() => {
    const stored = localStorage.getItem(PLUGINS_PANEL_LAYOUT_KEY)
    if (stored) {
      try { return JSON.parse(stored) } catch { return undefined }
    }
    return undefined
  })

  const handleLayoutChanged = useCallback((layout: Record<string, number>) => {
    localStorage.setItem(PLUGINS_PANEL_LAYOUT_KEY, JSON.stringify(layout))
  }, [])

  // Navigation
  const handlePluginClick = (plugin: UnifiedPlugin) => {
    navigate(`${basePath}/${encodeURIComponent(plugin.name)}`)
  }

  const handleCloseDetail = () => {
    navigate(basePath)
  }

  const isLoading = isLoadingInstalled || isLoadingAvailable

  // ---------------------------------------------------------------------------
  // List content
  // ---------------------------------------------------------------------------
  const pluginListContent = (
    <div className="flex h-full min-h-0 flex-col overflow-hidden rounded-2xl border bg-card shadow-sm">
      {/* Header */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b p-4">
        <h1 className="text-2xl font-bold">Plugins</h1>
        <div className="flex items-center gap-2">
          <SourcesPopover projectId={resolvedId} onManage={() => setSourcesDialogOpen(true)} />
          <Button onClick={() => setExportOpen(true)}>
            <Upload className="size-4" />
            Export
          </Button>
        </div>
      </div>

      {/* Plugin list */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading plugins...</div>
      ) : unifiedPlugins.length === 0 ? (
        <div className="text-center py-8 text-muted-foreground">
          No plugins found. Export agents as a plugin or configure a source to get started.
        </div>
      ) : (
        <div className="min-h-0 flex-1 overflow-y-auto p-2">
          <div className="space-y-1">
            {unifiedPlugins.map((plugin) => (
              <PluginListItem
                key={plugin.name}
                plugin={plugin}
                isSelected={plugin.name === pluginName}
                onClick={() => handlePluginClick(plugin)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  )

  // ---------------------------------------------------------------------------
  // Detail content
  // ---------------------------------------------------------------------------
  const pluginDetailContent = selectedPlugin ? (
    <PluginDetail
      plugin={selectedPlugin}
      projectId={resolvedId}
      onClose={handleCloseDetail}
    />
  ) : (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      Plugin not found
    </div>
  )

  // ---------------------------------------------------------------------------
  // Dialogs
  // ---------------------------------------------------------------------------
  const dialogs = (
    <>
      <Dialog open={exportOpen} onOpenChange={setExportOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Export Plugin</DialogTitle>
            <DialogDescription>
              Export agents and labels as a reusable plugin package.
            </DialogDescription>
          </DialogHeader>
          <ExportSection projectId={resolvedId} />
        </DialogContent>
      </Dialog>

      <Dialog open={sourcesDialogOpen} onOpenChange={setSourcesDialogOpen}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Plugin Sources</DialogTitle>
            <DialogDescription>
              Configure where to discover and install plugins from.
            </DialogDescription>
          </DialogHeader>
          <SourcesSection projectId={resolvedId} />
        </DialogContent>
      </Dialog>
    </>
  )

  // ---------------------------------------------------------------------------
  // Mobile layout
  // ---------------------------------------------------------------------------
  if (isMobile) {
    return (
      <>
        <MobileListDetail
          hasSelection={showDetailPanel}
          onBack={handleCloseDetail}
          backLabel="Plugins"
          list={
            <div className="h-full min-h-0 px-3 pt-2 pb-2">
              {pluginListContent}
            </div>
          }
          detail={pluginDetailContent}
        />
        {dialogs}
      </>
    )
  }

  // ---------------------------------------------------------------------------
  // Desktop layout
  // ---------------------------------------------------------------------------
  return (
    <>
      <div className="flex h-full min-h-0">
        <div className="flex flex-1 min-h-0 overflow-hidden">
          {showDetailPanel ? (
            <ResizablePanelGroup
              orientation="horizontal"
              defaultLayout={defaultLayout}
              onLayoutChanged={handleLayoutChanged}
            >
              <ResizablePanel id="list" defaultSize={50} minSize={25}>
                <ResizableCardPanel side="list">
                  {pluginListContent}
                </ResizableCardPanel>
              </ResizablePanel>

              <ResizableCardHandle />

              <ResizablePanel id="detail" defaultSize={50} minSize={25}>
                <ResizableCardPanel side="detail">
                  {pluginDetailContent}
                </ResizableCardPanel>
              </ResizablePanel>
            </ResizablePanelGroup>
          ) : (
            <div className="w-full h-full min-h-0 pt-3 px-6 pb-6">
              {pluginListContent}
            </div>
          )}
        </div>
      </div>
      {dialogs}
    </>
  )
}
