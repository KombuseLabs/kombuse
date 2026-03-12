import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  useAvailableBackends,
  useClaudeCodeMcpStatus,
  useCodexMcpStatus,
  useProfileSetting,
  useProjects,
  useSetClaudeCodeMcpEnabled,
  useSetCodexMcpEnabled,
  useUpsertProfileSetting,
} from '@kombuse/ui/hooks'
import { backendLabel, normalizeBackendType } from '@kombuse/ui/lib/backend-utils'
import { ModelSelector } from '@kombuse/ui/components'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Label,
  RadioGroup,
  RadioGroupItem,
  Switch,
  Input,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  toast,
} from '@kombuse/ui/base'
import { Sun, Moon, Monitor } from 'lucide-react'
import { setSentryEnabled } from '../sentry-gate'

const USER_PROFILE_ID = 'user-1'
const SIDEBAR_EVENTS_SETTING_KEY = 'sidebar.hidden.events'
const SIDEBAR_PERMISSIONS_SETTING_KEY = 'sidebar.hidden.permissions'
const SIDEBAR_DATABASE_SETTING_KEY = 'sidebar.hidden.database'
const SIDEBAR_PLUGINS_SETTING_KEY = 'sidebar.hidden.plugins'
const SIDEBAR_ANALYTICS_SETTING_KEY = 'sidebar.hidden.analytics'
const CHAT_DEFAULT_BACKEND_SETTING_KEY = 'chat.default_backend_type'
const CHAT_DEFAULT_MODEL_SETTING_KEY = 'chat.default_model'
const AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY = 'agent.default_max_chain_depth'
const CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY = 'chat.backend_idle_timeout_minutes'
const NOTIFICATIONS_SCOPE_SETTING_KEY = 'notifications.scope_to_project'
const MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY = 'mcp.anonymous_write_access'
const LIST_PANEL_HIDDEN_SETTING_KEY = 'layout.listPanelHidden'
const FILE_LOGGING_ENABLED_SETTING_KEY = 'logging.file_enabled'
const CRASH_REPORTING_ENABLED_SETTING_KEY = 'telemetry.crash_reporting_enabled'
const BINARIES_CLAUDE_SETTING_KEY = 'binaries.claude'
const BINARIES_CODEX_SETTING_KEY = 'binaries.codex'

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { data: eventsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_EVENTS_SETTING_KEY)
  const { data: permissionsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_PERMISSIONS_SETTING_KEY)
  const { data: databaseSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_DATABASE_SETTING_KEY)
  const { data: pluginsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_PLUGINS_SETTING_KEY)
  const { data: analyticsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_ANALYTICS_SETTING_KEY)
  const { data: defaultBackendSetting } = useProfileSetting(USER_PROFILE_ID, CHAT_DEFAULT_BACKEND_SETTING_KEY)
  const { data: defaultModelSetting } = useProfileSetting(USER_PROFILE_ID, CHAT_DEFAULT_MODEL_SETTING_KEY)
  const { data: maxChainDepthSetting } = useProfileSetting(USER_PROFILE_ID, AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY)
  const { data: backendTimeoutSetting } = useProfileSetting(USER_PROFILE_ID, CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY)
  const { data: notificationScopeSetting } = useProfileSetting(USER_PROFILE_ID, NOTIFICATIONS_SCOPE_SETTING_KEY)
  const { data: mcpAnonWriteSetting } = useProfileSetting(USER_PROFILE_ID, MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY)
  const { data: listPanelSetting } = useProfileSetting(USER_PROFILE_ID, LIST_PANEL_HIDDEN_SETTING_KEY)
  const { data: fileLoggingSetting } = useProfileSetting(USER_PROFILE_ID, FILE_LOGGING_ENABLED_SETTING_KEY)
  const { data: crashReportingSetting } = useProfileSetting(USER_PROFILE_ID, CRASH_REPORTING_ENABLED_SETTING_KEY)
  const { data: codexMcpStatus, isLoading: codexMcpStatusLoading } = useCodexMcpStatus()
  const setCodexMcpEnabled = useSetCodexMcpEnabled()
  const { data: claudeCodeMcpStatus, isLoading: claudeCodeMcpStatusLoading } = useClaudeCodeMcpStatus()
  const setClaudeCodeMcpEnabled = useSetClaudeCodeMcpEnabled()
  const { data: claudePathSetting } = useProfileSetting(USER_PROFILE_ID, BINARIES_CLAUDE_SETTING_KEY)
  const { data: codexPathSetting } = useProfileSetting(USER_PROFILE_ID, BINARIES_CODEX_SETTING_KEY)
  const { data: projects } = useProjects()
  const upsertSetting = useUpsertProfileSetting()
  const [maxChainDepthValue, setMaxChainDepthValue] = useState(maxChainDepthSetting?.setting_value ?? '')
  const [backendTimeoutValue, setBackendTimeoutValue] = useState(backendTimeoutSetting?.setting_value ?? '30')
  const [claudePathValue, setClaudePathValue] = useState('')
  const [codexPathValue, setCodexPathValue] = useState('')
  const [selectedProjectId, setSelectedProjectId] = useState('')
  const [projectClaudePathValue, setProjectClaudePathValue] = useState('')
  const [projectCodexPathValue, setProjectCodexPathValue] = useState('')

  const projectClaudeKey = selectedProjectId ? `${BINARIES_CLAUDE_SETTING_KEY}.${selectedProjectId}` : ''
  const projectCodexKey = selectedProjectId ? `${BINARIES_CODEX_SETTING_KEY}.${selectedProjectId}` : ''
  const { data: projectClaudePathSetting } = useProfileSetting(USER_PROFILE_ID, projectClaudeKey)
  const { data: projectCodexPathSetting } = useProfileSetting(USER_PROFILE_ID, projectCodexKey)

  const showEvents = eventsSetting?.setting_value === 'false'
  const showPermissions = permissionsSetting?.setting_value === 'false'
  const showDatabase = databaseSetting?.setting_value === 'false'
  const showPlugins = pluginsSetting?.setting_value === 'false'
  const showAnalytics = analyticsSetting?.setting_value === 'false'
  const scopeToProject = notificationScopeSetting?.setting_value !== 'all'
  const defaultBackendType = normalizeBackendType(defaultBackendSetting?.setting_value)
  const { availableBackends, isAvailable, noneAvailable } = useAvailableBackends()
  const codexMcpEnabled = codexMcpStatus?.enabled === true
  const claudeCodeMcpEnabled = claudeCodeMcpStatus?.enabled === true
  const mcpAnonymousWriteAllowed = mcpAnonWriteSetting?.setting_value === 'allowed'
  const showListPanel = listPanelSetting?.setting_value !== 'true'
  const fileLoggingEnabled = fileLoggingSetting?.setting_value === 'true'
  const crashReportingEnabled = crashReportingSetting?.setting_value !== 'false'

  useEffect(() => {
    setMaxChainDepthValue(maxChainDepthSetting?.setting_value ?? '')
  }, [maxChainDepthSetting?.setting_value])

  useEffect(() => {
    setBackendTimeoutValue(backendTimeoutSetting?.setting_value ?? '30')
  }, [backendTimeoutSetting?.setting_value])

  useEffect(() => {
    setClaudePathValue(claudePathSetting?.setting_value ?? '')
  }, [claudePathSetting?.setting_value])

  useEffect(() => {
    setCodexPathValue(codexPathSetting?.setting_value ?? '')
  }, [codexPathSetting?.setting_value])

  useEffect(() => {
    setProjectClaudePathValue(projectClaudePathSetting?.setting_value ?? '')
  }, [projectClaudePathSetting?.setting_value])

  useEffect(() => {
    setProjectCodexPathValue(projectCodexPathSetting?.setting_value ?? '')
  }, [projectCodexPathSetting?.setting_value])

  const persistMaxChainDepth = () => {
    const normalizedValue = maxChainDepthValue.trim()
    const currentValue = (maxChainDepthSetting?.setting_value ?? '').trim()
    if (normalizedValue === currentValue) {
      return
    }
    upsertSetting.mutate({
      profile_id: USER_PROFILE_ID,
      setting_key: AGENT_DEFAULT_MAX_CHAIN_DEPTH_SETTING_KEY,
      setting_value: normalizedValue,
    })
  }

  const persistBackendTimeout = () => {
    const normalizedValue = backendTimeoutValue.trim()
    const currentValue = (backendTimeoutSetting?.setting_value ?? '').trim()
    if (normalizedValue === currentValue) {
      return
    }
    upsertSetting.mutate({
      profile_id: USER_PROFILE_ID,
      setting_key: CHAT_BACKEND_IDLE_TIMEOUT_MINUTES_SETTING_KEY,
      setting_value: normalizedValue,
    })
  }

  const persistClaudePath = () => {
    const normalizedValue = claudePathValue.trim()
    const currentValue = (claudePathSetting?.setting_value ?? '').trim()
    if (normalizedValue === currentValue) return
    upsertSetting.mutate({
      profile_id: USER_PROFILE_ID,
      setting_key: BINARIES_CLAUDE_SETTING_KEY,
      setting_value: normalizedValue,
    })
  }

  const persistCodexPath = () => {
    const normalizedValue = codexPathValue.trim()
    const currentValue = (codexPathSetting?.setting_value ?? '').trim()
    if (normalizedValue === currentValue) return
    upsertSetting.mutate({
      profile_id: USER_PROFILE_ID,
      setting_key: BINARIES_CODEX_SETTING_KEY,
      setting_value: normalizedValue,
    })
  }

  const persistProjectClaudePath = () => {
    if (!projectClaudeKey) return
    const normalizedValue = projectClaudePathValue.trim()
    const currentValue = (projectClaudePathSetting?.setting_value ?? '').trim()
    if (normalizedValue === currentValue) return
    upsertSetting.mutate({
      profile_id: USER_PROFILE_ID,
      setting_key: projectClaudeKey,
      setting_value: normalizedValue,
    })
  }

  const persistProjectCodexPath = () => {
    if (!projectCodexKey) return
    const normalizedValue = projectCodexPathValue.trim()
    const currentValue = (projectCodexPathSetting?.setting_value ?? '').trim()
    if (normalizedValue === currentValue) return
    upsertSetting.mutate({
      profile_id: USER_PROFILE_ID,
      setting_key: projectCodexKey,
      setting_value: normalizedValue,
    })
  }

  const currentModelValue = defaultModelSetting?.setting_value?.trim() ?? ''

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-bold">Settings</h1>

      <Tabs defaultValue="general">
        <TabsList>
          <TabsTrigger value="general">General</TabsTrigger>
          <TabsTrigger value="chat">Chat</TabsTrigger>
          <TabsTrigger value="agent">Agent</TabsTrigger>
        </TabsList>

        <TabsContent value="general" className="space-y-6">
        {/* Appearance */}
        <Card>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Choose how Kombuse looks to you.</CardDescription>
          </CardHeader>
          <CardContent>
            <RadioGroup value={theme} onValueChange={setTheme} className="grid gap-4">
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="light" id="theme-light" />
                <Label htmlFor="theme-light" className="flex items-center gap-2 font-normal">
                  <Sun className="size-4" />
                  Light
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="dark" id="theme-dark" />
                <Label htmlFor="theme-dark" className="flex items-center gap-2 font-normal">
                  <Moon className="size-4" />
                  Dark
                </Label>
              </div>
              <div className="flex items-center space-x-3">
                <RadioGroupItem value="system" id="theme-system" />
                <Label htmlFor="theme-system" className="flex items-center gap-2 font-normal">
                  <Monitor className="size-4" />
                  System
                </Label>
              </div>
            </RadioGroup>
          </CardContent>
        </Card>

        {/* Sidebar */}
        <Card>
          <CardHeader>
            <CardTitle>Sidebar</CardTitle>
            <CardDescription>Toggle optional sections in the project sidebar.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="sidebar-events" className="font-normal">Show Events</Label>
              <Switch
                id="sidebar-events"
                checked={showEvents}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: SIDEBAR_EVENTS_SETTING_KEY,
                    setting_value: checked ? 'false' : 'true',
                  })
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sidebar-permissions" className="font-normal">Show Permissions</Label>
              <Switch
                id="sidebar-permissions"
                checked={showPermissions}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: SIDEBAR_PERMISSIONS_SETTING_KEY,
                    setting_value: checked ? 'false' : 'true',
                  })
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sidebar-database" className="font-normal">Show Database</Label>
              <Switch
                id="sidebar-database"
                checked={showDatabase}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: SIDEBAR_DATABASE_SETTING_KEY,
                    setting_value: checked ? 'false' : 'true',
                  })
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sidebar-plugins" className="font-normal">Show Plugins</Label>
              <Switch
                id="sidebar-plugins"
                checked={showPlugins}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: SIDEBAR_PLUGINS_SETTING_KEY,
                    setting_value: checked ? 'false' : 'true',
                  })
                }}
              />
            </div>
            <div className="flex items-center justify-between">
              <Label htmlFor="sidebar-analytics" className="font-normal">Show Analytics</Label>
              <Switch
                id="sidebar-analytics"
                checked={showAnalytics}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: SIDEBAR_ANALYTICS_SETTING_KEY,
                    setting_value: checked ? 'false' : 'true',
                  })
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Layout */}
        <Card>
          <CardHeader>
            <CardTitle>Layout</CardTitle>
            <CardDescription>Control panel visibility in master-detail views.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <Label htmlFor="layout-list-panel" className="font-normal">Show List Panel</Label>
              <Switch
                id="layout-list-panel"
                checked={showListPanel}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: LIST_PANEL_HIDDEN_SETTING_KEY,
                    setting_value: checked ? 'false' : 'true',
                  })
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Notifications */}
        <Card>
          <CardHeader>
            <CardTitle>Notifications</CardTitle>
            <CardDescription>Control which notifications and active agents are shown.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="notifications-scope" className="font-normal">Scope to current project</Label>
                <p className="text-sm text-muted-foreground">
                  Only show notifications and active agents for the project open in this window.
                </p>
              </div>
              <Switch
                id="notifications-scope"
                checked={scopeToProject}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: NOTIFICATIONS_SCOPE_SETTING_KEY,
                    setting_value: checked ? 'project' : 'all',
                  })
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Logging */}
        <Card>
          <CardHeader>
            <CardTitle>Logging</CardTitle>
            <CardDescription>Configure diagnostic logging.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="file-logging-enabled" className="font-normal">Enable file logging</Label>
                <p className="text-sm text-muted-foreground">
                  Write diagnostic logs to <code>~/.kombuse/logs/</code> for troubleshooting.
                  Logs are automatically pruned after 7 days.
                </p>
              </div>
              <Switch
                id="file-logging-enabled"
                checked={fileLoggingEnabled}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: FILE_LOGGING_ENABLED_SETTING_KEY,
                    setting_value: checked ? 'true' : 'false',
                  })
                }}
              />
            </div>
          </CardContent>
        </Card>

        {/* Privacy */}
        <Card>
          <CardHeader>
            <CardTitle>Privacy</CardTitle>
            <CardDescription>Control what data is shared with external services.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <Label htmlFor="crash-reporting-enabled" className="font-normal">Send crash reports</Label>
                <p className="text-sm text-muted-foreground">
                  Automatically send error and crash reports to help improve Kombuse.
                  No personal data or project content is included.
                </p>
              </div>
              <Switch
                id="crash-reporting-enabled"
                checked={crashReportingEnabled}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: CRASH_REPORTING_ENABLED_SETTING_KEY,
                    setting_value: checked ? 'true' : 'false',
                  })
                  setSentryEnabled(checked)
                }}
              />
            </div>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="chat" className="space-y-6">
        {/* Chat Defaults */}
        <Card>
          <CardHeader>
            <CardTitle>Chat Defaults</CardTitle>
            <CardDescription>Set global backend and model preferences for new sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="chat-default-backend" className="font-normal">Default Backend</Label>
              <select
                id="chat-default-backend"
                value={defaultBackendType}
                onChange={(event) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: CHAT_DEFAULT_BACKEND_SETTING_KEY,
                    setting_value: event.target.value,
                  })
                }}
                disabled={noneAvailable}
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                {noneAvailable && (
                  <option value="" disabled>No backends available</option>
                )}
                {availableBackends.map((bt) => (
                  <option key={bt} value={bt}>{backendLabel(bt)}</option>
                ))}
                {!isAvailable(defaultBackendType) && !noneAvailable && (
                  <option value={defaultBackendType} disabled>
                    {backendLabel(defaultBackendType)} (not installed)
                  </option>
                )}
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chat-default-model" className="font-normal">Default Model Preference</Label>
              <ModelSelector
                id="chat-default-model"
                backendType={defaultBackendType}
                value={currentModelValue}
                onChange={(modelId) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: CHAT_DEFAULT_MODEL_SETTING_KEY,
                    setting_value: modelId,
                  })
                }}
                showDefaultHint
              />
            </div>
          </CardContent>
        </Card>

        {/* Backend */}
        <Card>
          <CardHeader>
            <CardTitle>Backend</CardTitle>
            <CardDescription>Configure agent backend lifecycle.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="backend-idle-timeout" className="font-normal">
                Idle Timeout (minutes)
              </Label>
              <Input
                id="backend-idle-timeout"
                type="number"
                min="1"
                value={backendTimeoutValue}
                onChange={(event) => setBackendTimeoutValue(event.target.value)}
                onBlur={persistBackendTimeout}
                placeholder="30"
              />
              <p className="text-sm text-muted-foreground">
                Time before idle backends are automatically removed. Clear to disable
                automatic removal. This value should be short for lots of parallel
                tasks and can be large for occasional chats.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Codex */}
        <Card>
          <CardHeader>
            <CardTitle>Codex</CardTitle>
            <CardDescription>Configure Codex backend behavior for chat sessions.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="codex-mcp-enabled" className="font-normal">Enable MCP for Codex</Label>
              <Switch
                id="codex-mcp-enabled"
                checked={codexMcpEnabled}
                disabled={codexMcpStatusLoading || setCodexMcpEnabled.isPending}
                onCheckedChange={(checked) => {
                  setCodexMcpEnabled.mutate(checked, {
                    onError: (error) => {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : 'Failed to update Codex MCP setting'
                      )
                    },
                  })
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Writes to your local Codex config at{' '}
              <code>{codexMcpStatus?.config_path ?? '~/.codex/config.toml'}</code>.
            </p>
          </CardContent>
        </Card>

        {/* Claude Code */}
        <Card>
          <CardHeader>
            <CardTitle>Claude Code</CardTitle>
            <CardDescription>Configure Claude Code MCP access.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="claude-code-mcp-enabled" className="font-normal">Enable MCP for Claude Code</Label>
              <Switch
                id="claude-code-mcp-enabled"
                checked={claudeCodeMcpEnabled}
                disabled={claudeCodeMcpStatusLoading || setClaudeCodeMcpEnabled.isPending}
                onCheckedChange={(checked) => {
                  setClaudeCodeMcpEnabled.mutate(checked, {
                    onError: (error) => {
                      toast.error(
                        error instanceof Error
                          ? error.message
                          : 'Failed to update Claude Code MCP setting'
                      )
                    },
                  })
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              Writes to{' '}
              <code>{claudeCodeMcpStatus?.config_path ?? '~/.claude/settings.json'}</code>.
            </p>
          </CardContent>
        </Card>

        {/* MCP Security */}
        <Card>
          <CardHeader>
            <CardTitle>MCP Security</CardTitle>
            <CardDescription>Control access for external MCP connections.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="mcp-anonymous-write" className="font-normal">Allow anonymous write access</Label>
              <Switch
                id="mcp-anonymous-write"
                checked={mcpAnonymousWriteAllowed}
                onCheckedChange={(checked) => {
                  upsertSetting.mutate({
                    profile_id: USER_PROFILE_ID,
                    setting_key: MCP_ANONYMOUS_WRITE_ACCESS_SETTING_KEY,
                    setting_value: checked ? 'allowed' : 'denied',
                  })
                }}
              />
            </div>
            <p className="text-sm text-muted-foreground">
              When enabled, external tools connected via MCP can create and modify tickets, comments, and agents without authentication. When disabled, MCP connections are read-only.
            </p>
          </CardContent>
        </Card>
        </TabsContent>

        <TabsContent value="agent" className="space-y-6">
        {/* Agent */}
        <Card>
          <CardHeader>
            <CardTitle>Agent</CardTitle>
            <CardDescription>Configure agent execution defaults.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="agent-max-chain-depth" className="font-normal">Default Loop Depth</Label>
              <Input
                id="agent-max-chain-depth"
                type="number"
                min="1"
                max="100"
                value={maxChainDepthValue}
                onChange={(event) => setMaxChainDepthValue(event.target.value)}
                onBlur={persistMaxChainDepth}
                placeholder="15"
              />
              <p className="text-sm text-muted-foreground">
                Maximum agent invocations per ticket per hour before loop protection triggers.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Binary Paths */}
        <Card>
          <CardHeader>
            <CardTitle>Binary Paths</CardTitle>
            <CardDescription>
              Override auto-detected paths for Claude and Codex CLI binaries. Leave empty to use auto-detection.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="binary-claude-path" className="font-normal">Claude CLI Path</Label>
              <Input
                id="binary-claude-path"
                value={claudePathValue}
                onChange={(event) => setClaudePathValue(event.target.value)}
                onBlur={persistClaudePath}
                placeholder="/usr/local/bin/claude (auto-detect)"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="binary-codex-path" className="font-normal">Codex CLI Path</Label>
              <Input
                id="binary-codex-path"
                value={codexPathValue}
                onChange={(event) => setCodexPathValue(event.target.value)}
                onBlur={persistCodexPath}
                placeholder="/usr/local/bin/codex (auto-detect)"
              />
            </div>

            {projects && projects.length > 0 && (
              <>
                <div className="border-t pt-4">
                  <Label htmlFor="binary-project-select" className="font-normal">Per-Project Overrides</Label>
                  <p className="mb-2 text-sm text-muted-foreground">
                    Override binary paths for a specific project. These take precedence over the global paths above.
                  </p>
                  <select
                    id="binary-project-select"
                    value={selectedProjectId}
                    onChange={(event) => setSelectedProjectId(event.target.value)}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="">Select a project...</option>
                    {projects.map((project) => (
                      <option key={project.id} value={project.id}>{project.name}</option>
                    ))}
                  </select>
                </div>
                {selectedProjectId && (
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="binary-project-claude-path" className="font-normal">Claude CLI Path (project)</Label>
                      <Input
                        id="binary-project-claude-path"
                        value={projectClaudePathValue}
                        onChange={(event) => setProjectClaudePathValue(event.target.value)}
                        onBlur={persistProjectClaudePath}
                        placeholder="Use global path"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="binary-project-codex-path" className="font-normal">Codex CLI Path (project)</Label>
                      <Input
                        id="binary-project-codex-path"
                        value={projectCodexPathValue}
                        onChange={(event) => setProjectCodexPathValue(event.target.value)}
                        onBlur={persistProjectCodexPath}
                        placeholder="Use global path"
                      />
                    </div>
                  </div>
                )}
              </>
            )}
          </CardContent>
        </Card>
        </TabsContent>
      </Tabs>
    </main>
  )
}
