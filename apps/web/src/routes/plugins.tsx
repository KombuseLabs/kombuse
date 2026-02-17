import { useState } from 'react'
import { Puzzle, FolderOpen } from 'lucide-react'
import { useAgents, useAgentProfiles, useExportAgents, useDesktop } from '@kombuse/ui/hooks'
import { Button, Input, Label, Checkbox, toast } from '@kombuse/ui/base'
import { ANONYMOUS_AGENT_ID } from '@kombuse/types'

export function PluginsPage() {
  const { data: agents = [], isLoading: isLoadingAgents } = useAgents()
  const { data: profiles = [] } = useAgentProfiles()
  const exportAgents = useExportAgents()
  const { isDesktop, selectDirectory } = useDesktop()

  const [directory, setDirectory] = useState('')
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

  const handleBrowse = async () => {
    const dir = await selectDirectory()
    if (dir) setDirectory(dir)
  }

  const handleExport = () => {
    const trimmedDirectory = directory.trim()
    if (!trimmedDirectory) {
      toast.error('Please enter a directory path')
      return
    }

    const agentIds = selectedIds.size > 0 ? [...selectedIds] : undefined

    exportAgents.mutate(
      { directory: trimmedDirectory, agent_ids: agentIds },
      {
        onSuccess: (result) => {
          toast.success(
            `Exported ${result.count} agent${result.count === 1 ? '' : 's'} to ${result.directory}`
          )
        },
        onError: (error) => {
          toast.error(error.message ?? 'Export failed')
        },
      }
    )
  }

  const exportLabel =
    selectedIds.size === 0
      ? `Export All (${exportableAgents.length})`
      : `Export Selected (${selectedIds.size})`

  return (
    <main className="flex flex-col h-full">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Puzzle className="size-6" />
          <h1 className="text-2xl font-bold">Plugins</h1>
          <span className="text-sm text-muted-foreground">Export agents as markdown files</span>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl space-y-6">
          <div className="space-y-2">
            <Label htmlFor="plugins-directory">Export Directory</Label>
            <div className="flex gap-2">
              <Input
                id="plugins-directory"
                value={directory}
                onChange={(e) => setDirectory(e.target.value)}
                placeholder="/path/to/export/directory"
                className="flex-1"
              />
              {isDesktop && (
                <Button variant="outline" onClick={handleBrowse}>
                  <FolderOpen className="size-4 mr-2" />
                  Browse
                </Button>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              Agent definitions will be written as <code>.md</code> files.
              The directory will be created if it does not exist.
            </p>
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
                        <p className="text-xs text-muted-foreground truncate">{agent.id}</p>
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

          <Button
            onClick={handleExport}
            disabled={exportAgents.isPending || !directory.trim()}
          >
            {exportAgents.isPending ? 'Exporting...' : exportLabel}
          </Button>
        </div>
      </div>
    </main>
  )
}
