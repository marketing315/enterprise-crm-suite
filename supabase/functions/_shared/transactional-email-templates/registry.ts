/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as salesRouteIndividual } from './sales-route-individual.tsx'
import { template as salesRouteAggregate } from './sales-route-aggregate.tsx'
import { template as accountLocked } from './account-locked.tsx'
import { template as cronHealthAlert } from './cron-health-alert.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'sales-route-individual': salesRouteIndividual,
  'sales-route-aggregate': salesRouteAggregate,
  'account-locked': accountLocked,
  'cron-health-alert': cronHealthAlert,
}
