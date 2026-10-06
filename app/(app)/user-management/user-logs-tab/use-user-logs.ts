'use client';

import { useState, useEffect, useCallback } from 'react';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { ActivityLog } from './user-logs-types';

export function useUserLogs() {
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');
  const [moduleFilter, setModuleFilter] = useState('ALL');
  const [actionFilter, setActionFilter] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');

  const fetchLogs = useCallback(async () => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams({
        limit: String(pageSize),
        offset: String((currentPage - 1) * pageSize),
      });
      if (moduleFilter !== 'ALL') params.set('module', moduleFilter);
      if (actionFilter !== 'ALL') params.set('action', actionFilter);
      if (activeSearch) params.set('search', activeSearch);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo) params.set('dateTo', dateTo);

      const res = await authFetch(getApiUrl(`/user-activity-logs?${params.toString()}`));
      if (!res.ok) throw new Error(`API error ${res.status}`);
      const data = await res.json();
      if (data.success) {
        setLogs(data.data);
        setTotal(data.total);
      }
    } catch (err) {
      console.error('Failed to fetch activity logs:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentPage, pageSize, moduleFilter, actionFilter, activeSearch, dateFrom, dateTo]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  const handleSearch = () => {
    setActiveSearch(searchQuery);
    setCurrentPage(1);
  };

  const clearFilters = () => {
    setSearchQuery('');
    setActiveSearch('');
    setModuleFilter('ALL');
    setActionFilter('ALL');
    setDateFrom('');
    setDateTo('');
    setCurrentPage(1);
  };

  const totalPages = Math.ceil(total / pageSize);
  const hasActiveFilters = !!(activeSearch || moduleFilter !== 'ALL' || actionFilter !== 'ALL' || dateFrom || dateTo);

  return {
    logs, total, isLoading,
    currentPage, setCurrentPage,
    pageSize, setPageSize,
    searchQuery, setSearchQuery,
    moduleFilter, setModuleFilter,
    actionFilter, setActionFilter,
    dateFrom, setDateFrom,
    dateTo, setDateTo,
    totalPages, hasActiveFilters,
    fetchLogs, handleSearch, clearFilters,
  };
}
