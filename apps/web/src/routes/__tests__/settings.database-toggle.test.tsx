import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

const mockTheme = vi.fn()
const mockSetCodexMcpEnabled = vi.fn()
const mockUpsertSetting = vi.fn()
const mockUseProfileSetting = vi.fn()

vi.mock('next-themes', () => ({
  useTheme: () => ({
    theme: 'light',
    setTheme: mockTheme,
  }),
}))

vi.mock('@kombuse/ui/hooks', () => ({
  useProfileSetting: (...args: unknown[]) => mockUseProfileSetting(...args),
  useCodexMcpStatus: () => ({ data: { enabled: false }, isLoading: false }),
  useSetCodexMcpEnabled: () => ({
    mutate: mockSetCodexMcpEnabled,
    isPending: false,
  }),
  useUpsertProfileSetting: () => ({
    mutate: mockUpsertSetting,
  }),
  useAvailableBackends: () => ({ availableBackends: [], isAvailable: () => false, noneAvailable: true }),
  useClaudeCodeMcpStatus: () => ({ data: { enabled: false }, isLoading: false }),
  useSetClaudeCodeMcpEnabled: () => ({ mutate: vi.fn(), isPending: false }),
}))

vi.mock('@kombuse/ui/base', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  RadioGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  RadioGroupItem: (props: React.InputHTMLAttributes<HTMLInputElement>) => (
    <input type="radio" {...props} />
  ),
  Switch: ({
    checked,
    onCheckedChange,
    ...props
  }: {
    checked?: boolean
    onCheckedChange?: (checked: boolean) => void
  } & React.InputHTMLAttributes<HTMLInputElement>) => (
    <input
      type="checkbox"
      checked={Boolean(checked)}
      onChange={(event) => onCheckedChange?.(event.currentTarget.checked)}
      {...props}
    />
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Tabs: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  TabsContent: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  TabsList: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  TabsTrigger: ({ children, ...props }: any) => <button {...props}>{children}</button>,
  toast: {
    error: vi.fn(),
  },
}))

vi.mock('lucide-react', () => ({
  Sun: () => <span>sun</span>,
  Moon: () => <span>moon</span>,
  Monitor: () => <span>monitor</span>,
}))

vi.mock('@kombuse/ui/components', () => ({
  ModelSelector: () => <div data-testid="model-selector" />,
}))

vi.mock('@kombuse/ui/lib/backend-utils', () => ({
  backendLabel: (type: string) => type,
  normalizeBackendType: (value?: string) => value ?? 'claude_code',
}))

import { Settings } from '../settings'

function profileSetting(key: string, value?: string) {
  if (value === undefined) {
    return { data: undefined }
  }
  return { data: { setting_key: key, setting_value: value } }
}

describe('Settings database toggle', () => {
  it('is unchecked by default when sidebar.hidden.database is unset', () => {
    mockUseProfileSetting.mockImplementation((_profileId: string, key: string) => {
      if (key === 'sidebar.hidden.database') {
        return profileSetting(key)
      }
      return profileSetting(key, 'false')
    })

    const view = render(<Settings />)
    const checkbox = view.container.querySelector('#sidebar-database') as HTMLInputElement

    expect(checkbox.checked).toBe(false)
  })

  it('is checked when sidebar.hidden.database is set to false', () => {
    mockUseProfileSetting.mockImplementation((_profileId: string, key: string) => {
      if (key === 'sidebar.hidden.database') {
        return profileSetting(key, 'false')
      }
      return profileSetting(key, 'false')
    })

    const view = render(<Settings />)
    const checkbox = view.container.querySelector('#sidebar-database') as HTMLInputElement

    expect(checkbox.checked).toBe(true)
  })
})
