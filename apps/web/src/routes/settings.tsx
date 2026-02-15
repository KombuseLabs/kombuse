import { useEffect, useState } from 'react'
import { useTheme } from 'next-themes'
import {
  useCodexMcpStatus,
  useProfileSetting,
  useSetCodexMcpEnabled,
  useUpsertProfileSetting,
} from '@kombuse/ui/hooks'
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
  toast,
} from '@kombuse/ui/base'
import { Sun, Moon, Monitor } from 'lucide-react'
import { BACKEND_TYPES, type BackendType } from '@kombuse/types'

const USER_PROFILE_ID = 'user-1'
const SIDEBAR_EVENTS_SETTING_KEY = 'sidebar.hidden.events'
const SIDEBAR_PERMISSIONS_SETTING_KEY = 'sidebar.hidden.permissions'
const SIDEBAR_DATABASE_SETTING_KEY = 'sidebar.hidden.database'
const CHAT_DEFAULT_BACKEND_SETTING_KEY = 'chat.default_backend_type'
const CHAT_DEFAULT_MODEL_SETTING_KEY = 'chat.default_model'

function normalizeBackendType(value?: string | null): BackendType {
  if (
    value === BACKEND_TYPES.CLAUDE_CODE
    || value === BACKEND_TYPES.CODEX
    || value === BACKEND_TYPES.MOCK
  ) {
    return value
  }
  return BACKEND_TYPES.CLAUDE_CODE
}

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { data: eventsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_EVENTS_SETTING_KEY)
  const { data: permissionsSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_PERMISSIONS_SETTING_KEY)
  const { data: databaseSetting } = useProfileSetting(USER_PROFILE_ID, SIDEBAR_DATABASE_SETTING_KEY)
  const { data: defaultBackendSetting } = useProfileSetting(USER_PROFILE_ID, CHAT_DEFAULT_BACKEND_SETTING_KEY)
  const { data: defaultModelSetting } = useProfileSetting(USER_PROFILE_ID, CHAT_DEFAULT_MODEL_SETTING_KEY)
  const { data: codexMcpStatus, isLoading: codexMcpStatusLoading } = useCodexMcpStatus()
  const setCodexMcpEnabled = useSetCodexMcpEnabled()
  const upsertSetting = useUpsertProfileSetting()
  const [defaultModelValue, setDefaultModelValue] = useState(defaultModelSetting?.setting_value ?? '')

  const showEvents = eventsSetting?.setting_value !== 'true'
  const showPermissions = permissionsSetting?.setting_value !== 'true'
  const showDatabase = databaseSetting?.setting_value === 'false'
  const defaultBackendType = normalizeBackendType(defaultBackendSetting?.setting_value)
  const codexMcpEnabled = codexMcpStatus?.enabled === true

  useEffect(() => {
    setDefaultModelValue(defaultModelSetting?.setting_value ?? '')
  }, [defaultModelSetting?.setting_value])

  const persistDefaultModel = () => {
    const normalizedValue = defaultModelValue.trim()
    const currentValue = (defaultModelSetting?.setting_value ?? '').trim()
    if (normalizedValue === currentValue) {
      return
    }
    upsertSetting.mutate({
      profile_id: USER_PROFILE_ID,
      setting_key: CHAT_DEFAULT_MODEL_SETTING_KEY,
      setting_value: normalizedValue,
    })
  }

  return (
    <main className="mx-auto max-w-2xl p-8">
      <h1 className="mb-8 text-2xl font-bold">Settings</h1>

      <div className="space-y-6">
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
          </CardContent>
        </Card>

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
                className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm"
              >
                <option value={BACKEND_TYPES.CLAUDE_CODE}>Claude Code</option>
                <option value={BACKEND_TYPES.CODEX}>Codex</option>
              </select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="chat-default-model" className="font-normal">Default Model Preference</Label>
              <Input
                id="chat-default-model"
                value={defaultModelValue}
                onChange={(event) => setDefaultModelValue(event.target.value)}
                onBlur={persistDefaultModel}
                placeholder="Leave empty to use backend default"
              />
              <p className="text-sm text-muted-foreground">
                Model preference may be stored even when a backend cannot enforce it yet.
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
      </div>
    </main>
  )
}
