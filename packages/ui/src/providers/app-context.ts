'use client'

import { createContext } from 'react'
import type { AppContextValue } from '@kombuse/types'

export const AppCtx = createContext<AppContextValue | null>(null)
