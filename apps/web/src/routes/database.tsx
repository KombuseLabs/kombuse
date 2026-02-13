import { useEffect, useMemo, useState } from 'react'
import { useDatabaseTables, useDatabaseQuery } from '@kombuse/ui/hooks'
import {
  Button,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@kombuse/ui/base'
import { cn } from '@kombuse/ui/lib/utils'
import { Database, RefreshCw } from 'lucide-react'

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

function quoteIdentifier(name: string): string {
  return `"${name.replace(/"/g, '""')}"`
}

function formatCellValue(value: unknown): string {
  if (value === null) return 'null'
  if (value === undefined) return ''
  if (typeof value === 'object') {
    return JSON.stringify(value)
  }
  return String(value)
}

export function DatabasePage() {
  const [selectedTable, setSelectedTable] = useState('')
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const {
    data: tablesResponse,
    isLoading: isLoadingTables,
    error: tablesError,
    refetch: refetchTables,
    isFetching: isFetchingTables,
  } = useDatabaseTables()

  const tables = useMemo(() => tablesResponse?.tables ?? [], [tablesResponse])

  useEffect(() => {
    if (!tables.length) {
      if (selectedTable) setSelectedTable('')
      return
    }

    if (!selectedTable || !tables.some((table) => table.name === selectedTable)) {
      setSelectedTable(tables[0]?.name ?? '')
    }
  }, [tables, selectedTable])

  const queryInput = useMemo(
    () =>
      selectedTable
        ? {
            sql: `SELECT * FROM ${quoteIdentifier(selectedTable)} LIMIT ${limit}`,
          }
        : undefined,
    [selectedTable, limit]
  )

  const {
    data: queryResult,
    isLoading: isLoadingRows,
    error: rowsError,
    refetch: refetchRows,
    isFetching: isFetchingRows,
  } = useDatabaseQuery(queryInput)

  const rows = useMemo(() => queryResult?.rows ?? [], [queryResult])
  const columns = useMemo(() => {
    const keys = new Set<string>()
    for (const row of rows) {
      for (const key of Object.keys(row)) {
        keys.add(key)
      }
    }
    return [...keys]
  }, [rows])

  const isFetching = isFetchingTables || isFetchingRows

  const handleRefresh = () => {
    void refetchTables()
    if (selectedTable) {
      void refetchRows()
    }
  }

  return (
    <main className="flex flex-col h-[calc(100dvh-var(--header-height))]">
      <div className="flex items-center justify-between p-6 border-b">
        <div className="flex items-center gap-4">
          <Database className="size-6" />
          <h1 className="text-2xl font-bold">Database</h1>
          <span className="text-sm text-muted-foreground">Table browser</span>
        </div>
        <Button variant="outline" size="sm" onClick={handleRefresh} disabled={isFetching}>
          <RefreshCw className={cn('size-4 mr-2', isFetching && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      <div className="p-4 border-b bg-muted/30">
        <div className="flex flex-wrap gap-4 items-end">
          <div className="w-[280px]">
            <Label htmlFor="database-table" className="mb-2 block text-sm">
              Table
            </Label>
            <Select value={selectedTable || undefined} onValueChange={setSelectedTable}>
              <SelectTrigger id="database-table">
                <SelectValue placeholder="Select a table" />
              </SelectTrigger>
              <SelectContent>
                {tables.map((table) => (
                  <SelectItem key={table.name} value={table.name}>
                    {table.name} ({table.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[120px]">
            <Label htmlFor="database-limit" className="mb-2 block text-sm">
              Limit
            </Label>
            <Input
              id="database-limit"
              type="number"
              min={1}
              max={MAX_LIMIT}
              value={String(limit)}
              onChange={(event) => {
                const value = Number(event.target.value)
                if (!Number.isFinite(value)) return
                const normalized = Math.min(Math.max(Math.floor(value), 1), MAX_LIMIT)
                setLimit(normalized)
              }}
            />
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-6">
        {isLoadingTables && (
          <div className="text-center py-8 text-muted-foreground">Loading tables...</div>
        )}

        {tablesError && (
          <div className="text-center py-8 text-destructive">
            Error loading tables: {tablesError.message}
          </div>
        )}

        {!isLoadingTables && !tablesError && tables.length === 0 && (
          <div className="text-center py-8 text-muted-foreground">No tables found.</div>
        )}

        {!isLoadingTables && !tablesError && !!selectedTable && isLoadingRows && (
          <div className="text-center py-8 text-muted-foreground">Loading rows...</div>
        )}

        {rowsError && (
          <div className="text-center py-8 text-destructive">
            Error loading rows: {rowsError.message}
          </div>
        )}

        {!isLoadingRows && !rowsError && !!selectedTable && (
          <>
            <div className="mb-3 text-sm text-muted-foreground">
              Showing {rows.length} row{rows.length === 1 ? '' : 's'} from {selectedTable}
            </div>
            {rows.length === 0 ? (
              <div className="text-sm text-muted-foreground">
                No rows returned for this query.
              </div>
            ) : (
              <div className="overflow-auto border rounded-md">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      {columns.map((column) => (
                        <th
                          key={column}
                          className="text-left px-3 py-2 border-b font-medium whitespace-nowrap"
                        >
                          {column}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((row, rowIndex) => (
                      <tr key={rowIndex} className="border-b last:border-0">
                        {columns.map((column) => (
                          <td key={`${rowIndex}-${column}`} className="px-3 py-2 align-top">
                            <code className="text-xs">{formatCellValue(row[column])}</code>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  )
}
