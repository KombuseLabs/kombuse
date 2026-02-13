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
const NO_SORT_VALUE = '__kombuse_no_sort__'

type SortDirection = 'asc' | 'desc'

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
  const [page, setPage] = useState(1)
  const [sortColumn, setSortColumn] = useState('')
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc')
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
      setPage(1)
      setSortColumn('')
      setSortDirection('asc')
    }
  }, [tables, selectedTable])

  const offset = (page - 1) * limit
  const orderByClause = sortColumn
    ? ` ORDER BY ${quoteIdentifier(sortColumn)} ${sortDirection.toUpperCase()}`
    : ''

  const queryInput = useMemo(
    () =>
      selectedTable
        ? {
            sql: `SELECT * FROM ${quoteIdentifier(selectedTable)}${orderByClause} LIMIT ${limit} OFFSET ${offset}`,
          }
        : undefined,
    [selectedTable, orderByClause, limit, offset]
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

  useEffect(() => {
    if (sortColumn && !columns.includes(sortColumn)) {
      setSortColumn('')
    }
  }, [columns, sortColumn])

  const isFetching = isFetchingTables || isFetchingRows
  const canGoPreviousPage = page > 1
  const canGoNextPage = rows.length === limit

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
            <Select
              value={selectedTable || undefined}
              onValueChange={(value) => {
                setSelectedTable(value)
                setPage(1)
                setSortColumn('')
                setSortDirection('asc')
              }}
            >
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
                setPage(1)
              }}
            />
          </div>

          <div className="w-[220px]">
            <Label htmlFor="database-sort-column" className="mb-2 block text-sm">
              Sort Column
            </Label>
            <Select
              value={sortColumn || NO_SORT_VALUE}
              onValueChange={(value) => {
                setSortColumn(value === NO_SORT_VALUE ? '' : value)
                setPage(1)
              }}
              disabled={columns.length === 0}
            >
              <SelectTrigger id="database-sort-column">
                <SelectValue placeholder="No sorting" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SORT_VALUE}>No sorting</SelectItem>
                {columns.map((column) => (
                  <SelectItem key={column} value={column}>
                    {column}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-[160px]">
            <Label htmlFor="database-sort-direction" className="mb-2 block text-sm">
              Sort Direction
            </Label>
            <Select
              value={sortDirection}
              onValueChange={(value) => {
                setSortDirection(value as SortDirection)
                setPage(1)
              }}
              disabled={columns.length === 0 || !sortColumn}
            >
              <SelectTrigger id="database-sort-direction">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
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
              {' · '}Page {page}
              {' · '}Offset {offset}
              {sortColumn ? ` · Sorted by ${sortColumn} (${sortDirection})` : ''}
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
            <div className="mt-4 flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                Page {page}
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => Math.max(current - 1, 1))}
                  disabled={!canGoPreviousPage || isFetchingRows}
                >
                  Previous
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((current) => current + 1)}
                  disabled={!canGoNextPage || isFetchingRows}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </main>
  )
}
