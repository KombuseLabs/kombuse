export type DatabaseObjectType = 'table' | 'view'
export type DatabaseQueryParam = string | number | null
export type DatabaseRow = Record<string, unknown>

export interface DatabaseTableInfo {
  name: string
  type: DatabaseObjectType
}

export interface DatabaseTablesResponse {
  tables: DatabaseTableInfo[]
}

export interface DatabaseQueryInput {
  sql: string
  params?: DatabaseQueryParam[]
  limit?: number
}

export interface DatabaseQueryResponse {
  rows: DatabaseRow[]
  count: number
  sql: string
}
