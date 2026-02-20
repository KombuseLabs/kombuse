import { useState, useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useProject, useUpdateProject, useDesktop } from '@kombuse/ui/hooks'
import {
  Button, Input, Label, Textarea,
  Card, CardContent, CardHeader, CardTitle,
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
  toast,
} from '@kombuse/ui/base'
import { Save, Loader2, FolderOpen, FolderSync } from 'lucide-react'
import type { RepoSource } from '@kombuse/types'

export function ProjectPage() {
  const { projectId } = useParams<{ projectId: string }>()
  const { data: project, isLoading } = useProject(projectId!)
  const updateProject = useUpdateProject()
  const { isDesktop, selectDirectory } = useDesktop()

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [localPath, setLocalPath] = useState('')
  const [repoSource, setRepoSource] = useState('')
  const [repoOwner, setRepoOwner] = useState('')
  const [repoName, setRepoName] = useState('')

  useEffect(() => {
    if (project) {
      setName(project.name)
      setDescription(project.description ?? '')
      setLocalPath(project.local_path ?? '')
      setRepoSource(project.repo_source ?? '')
      setRepoOwner(project.repo_owner ?? '')
      setRepoName(project.repo_name ?? '')
    }
  }, [project])

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-16">
        <Loader2 className="size-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!project) {
    return (
      <div className="flex items-center justify-center p-16 text-muted-foreground">
        Project not found
      </div>
    )
  }

  const hasChanges =
    name !== project.name ||
    description !== (project.description ?? '') ||
    localPath !== (project.local_path ?? '') ||
    repoSource !== (project.repo_source ?? '') ||
    repoOwner !== (project.repo_owner ?? '') ||
    repoName !== (project.repo_name ?? '')

  const handleSave = () => {
    updateProject.mutate(
      {
        id: project.id,
        input: {
          name: name.trim(),
          description: description.trim() || undefined,
          local_path: localPath.trim() || undefined,
          repo_source: (repoSource as RepoSource) || undefined,
          repo_owner: repoOwner.trim() || undefined,
          repo_name: repoName.trim() || undefined,
        },
      },
      {
        onSuccess: () => {
          toast.success('Project updated')
        },
      }
    )
  }

  async function handleSelectDirectory() {
    const selectedPath = await selectDirectory()
    if (selectedPath) {
      setLocalPath(selectedPath)
    }
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-bold">Project Settings</h1>

      <div className="space-y-6">
        {/* General */}
        <Card>
          <CardHeader>
            <CardTitle>General</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Name</Label>
              <Input
                id="project-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Project name"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-description">Description</Label>
              <Textarea
                id="project-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="A short description..."
                rows={3}
              />
            </div>
          </CardContent>
        </Card>

        {/* Local Path */}
        <Card>
          <CardHeader>
            <CardTitle>Local Path</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Label htmlFor="project-local-path">Directory</Label>
            <div className="flex gap-2">
              <Input
                id="project-local-path"
                value={localPath}
                onChange={(e) => setLocalPath(e.target.value)}
                placeholder={isDesktop ? 'Select a directory' : '/path/to/project'}
                className="flex-1"
              />
              {isDesktop && (
                <Button type="button" variant="outline" onClick={handleSelectDirectory}>
                  <FolderOpen className="mr-2 size-4" />
                  Browse
                </Button>
              )}
            </div>
            {!isDesktop && (
              <p className="text-xs text-muted-foreground">
                Browser mode does not support a native directory picker.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Repository */}
        <Card>
          <CardHeader>
            <CardTitle>Repository</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label>Source</Label>
              <Select value={repoSource} onValueChange={setRepoSource}>
                <SelectTrigger>
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">None</SelectItem>
                  <SelectItem value="github">GitHub</SelectItem>
                  <SelectItem value="gitlab">GitLab</SelectItem>
                  <SelectItem value="bitbucket">Bitbucket</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-repo-owner">Owner</Label>
              <Input
                id="project-repo-owner"
                value={repoOwner}
                onChange={(e) => setRepoOwner(e.target.value)}
                placeholder="owner"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="project-repo-name">Repository</Label>
              <Input
                id="project-repo-name"
                value={repoName}
                onChange={(e) => setRepoName(e.target.value)}
                placeholder="repo-name"
              />
            </div>
          </CardContent>
        </Card>

        {/* Initialize */}
        <Card>
          <CardContent className="pt-6">
            <Button
              variant="outline"
              disabled
              title="Requires project initialization setup"
            >
              <FolderSync className="mr-2 size-4" />
              Initialize Project
            </Button>
            <p className="mt-2 text-xs text-muted-foreground">
              Set up AGENTS.md, MCP config, and .kombuse directory for this project.
            </p>
          </CardContent>
        </Card>

        {/* Metadata */}
        <Card>
          <CardHeader>
            <CardTitle>Info</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm text-muted-foreground">
            <p>Created {new Date(project.created_at).toLocaleDateString()}</p>
            <p>Updated {new Date(project.updated_at).toLocaleDateString()}</p>
          </CardContent>
        </Card>

        {/* Save */}
        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateProject.isPending || !name.trim()}
        >
          {updateProject.isPending ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          Save Changes
        </Button>
      </div>
    </main>
  )
}
