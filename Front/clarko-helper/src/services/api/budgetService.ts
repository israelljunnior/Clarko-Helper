import { BaseApiService } from './baseApiService'
import type { InterceptService } from './interceptService'
import type { BudgetResponse } from './contracts'

/** How much of the AI budget has been spent: GET /api/budget. */
export class BudgetService extends BaseApiService {
  constructor(http: InterceptService, apiBaseUrl: string) {
    super(http, apiBaseUrl, 'api/budget')
  }

  getBudget(signal?: AbortSignal): Promise<BudgetResponse> {
    return this.get<BudgetResponse>('', signal)
  }
}
