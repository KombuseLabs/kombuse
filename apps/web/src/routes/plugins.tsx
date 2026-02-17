import { useState } from 'react'
import { useParams } from 'react-router-dom'
import { Puzzle, Package } from 'lucide-react'
import { useAgents, useAgentProfiles, useExportPlugin, useProjectLabels } from '@kombuse/ui/hooks'
import { Button, Input, Label, Checkbox, toast } from '@kombuse/ui/base'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'

const PACKAGE_NAME_REGEX = /^[a-z0-9]+(-[a-z0-9]+)*$/

export function PluginsPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: agents = [], isLoading: isLoadingAgents } = useAgents()
  const { data: profiles = [] } = useAgentProfiles()
  const { data: labels = [] } = useProjectLabels(projectId ?? '')
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

    if (!projectId) {
      toast.error('No project selected')
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
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Puzzle className="size-6" />
          <h1 className="text-2xl font-bold">Plugins</h1>
          <span className="text-sm text-muted-foreground">Export agents and labels as a plugin package</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
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
      </div>
    </main>
  )
}
