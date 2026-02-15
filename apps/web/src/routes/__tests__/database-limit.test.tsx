import { describe, expect, it, vi } from 'vitest'
import { render } from '@testing-library/react'

let capturedQueryInput: unknown = undefined

const mockUseDatabaseTables = vi.fn()
const mockUseDatabaseQuery = vi.fn()

vi.mock('@kombuse/ui/hooks', () => ({
  useDatabaseTables: (...args: unknown[]) => mockUseDatabaseTables(...args),
  useDatabaseQuery: (input: unknown) => {
    capturedQueryInput = input
    return mockUseDatabaseQuery(input)
  },
}))

vi.mock('@kombuse/ui/base', () => ({
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) => (
    <button {...props}>{children}</button>
  ),
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
  Label: ({ children, ...props }: React.LabelHTMLAttributes<HTMLLabelElement>) => (
    <label {...props}>{children}</label>
  ),
  Select: ({ children, value, onValueChange }: { children: React.ReactNode; value?: string; onValueChange?: (v: string) => void }) => (
    <select value={value} onChange={(e) => onValueChange?.(e.target.value)}>{children}</select>
  ),
  SelectContent: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectItem: ({ children, value }: { children: React.ReactNode; value: string }) => (
    <option value={value}>{children}</option>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}))

vi.mock('@kombuse/ui/lib/utils', () => ({
  cn: (...args: unknown[]) => args.filter(Boolean).join(' '),
}))

vi.mock('lucide-react', () => ({
  Database: () => <span>db-icon</span>,
  RefreshCw: () => <span>refresh-icon</span>,
}))

import { DatabasePage } from '../database'

describe('Database page limit forwarding', () => {
  it('includes limit property in query payload', () => {
    mockUseDatabaseTables.mockReturnValue({
      data: { tables: [{ name: 'tickets', type: 'table' }] },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    })

    mockUseDatabaseQuery.mockReturnValue({
      data: { rows: [{ id: 1 }], count: 1, sql: '' },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
      isFetching: false,
    })

    capturedQueryInput = undefined
    render(<DatabasePage />)

    expect(capturedQueryInput).toBeDefined()
    expect(capturedQueryInput).toHaveProperty('limit', 100)
    expect(capturedQueryInput).toHaveProperty('sql')
  })
})
