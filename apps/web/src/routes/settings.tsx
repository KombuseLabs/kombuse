import { useTheme } from 'next-themes'
import { useProfileSetting, useUpsertProfileSetting } from '@kombuse/ui/hooks'
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
} from '@kombuse/ui/base'
import { Sun, Moon, Monitor } from 'lucide-react'

export function Settings() {
  const { theme, setTheme } = useTheme()
  const { data: eventsSetting } = useProfileSetting('user-1', 'sidebar.hidden.events')
  const { data: permissionsSetting } = useProfileSetting('user-1', 'sidebar.hidden.permissions')
  const upsertSetting = useUpsertProfileSetting()

  const showEvents = eventsSetting?.setting_value !== 'true'
  const showPermissions = permissionsSetting?.setting_value !== 'true'

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
                    profile_id: 'user-1',
                    setting_key: 'sidebar.hidden.events',
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
                    profile_id: 'user-1',
                    setting_key: 'sidebar.hidden.permissions',
                    setting_value: checked ? 'false' : 'true',
                  })
                }}
              />
            </div>
          </CardContent>
        </Card>
      </div>
    </main>
  )
}
