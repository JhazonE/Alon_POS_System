import { appendSessionUid } from '@/lib/session-uid';

export interface RecentSalesQueryParams {
  query?: string;
  dateFrom?: string;
  dateTo?: string;
}

// Builds a cache-busted query string for GET /pos/recent-sales, omitting empty filters.
export function buildRecentSalesQuery(params: RecentSalesQueryParams): string {
  const sp = new URLSearchParams();
  const q = params.query?.trim();
  if (q) sp.set('query', q);
  if (params.dateFrom) sp.set('dateFrom', params.dateFrom);
  if (params.dateTo) sp.set('dateTo', params.dateTo);
  appendSessionUid(sp);
  sp.set('_t', String(Date.now()));
  return `?${sp.toString()}`;
}
