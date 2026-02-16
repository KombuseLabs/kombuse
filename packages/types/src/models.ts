import type { BackendType } from './agent'

export interface ModelOption {
  id: string
  name: string
  description?: string
  provider?: string
}

export interface ModelCatalogResponse {
  backend_type: BackendType
  supports_model_selection: boolean
  models: ModelOption[]
  default_model_id?: string
}
