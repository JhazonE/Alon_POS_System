'use client';

import { useState, useEffect, useCallback } from 'react';
import { getApiUrl, authFetch } from '@/lib/api-config';
import { User } from './user-row/user-row-types';

export function useUserManagement() {
  const [users, setUsers] = useState<User[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeSearch, setActiveSearch] = useState('');

  const fetchUsers = useCallback(async () => {
    setIsLoading(true);
    try {
      const response = await authFetch(getApiUrl('/users'));
      if (!response.ok) throw new Error('Failed to fetch users');
      const data = await response.json();
      setUsers(data);
      setError(null);
    } catch {
      setError('Failed to load users');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { fetchUsers(); }, [fetchUsers]);

  const handleEdit = (user: User) => {
    setEditingUser(user);
    setIsEditDialogOpen(true);
  };

  const handleOpenChange = (open: boolean) => {
    setIsEditDialogOpen(open);
    if (!open) setTimeout(() => setEditingUser(null), 300);
  };

  const handleSearch = () => {
    setActiveSearch(searchQuery);
    setCurrentPage(1);
  };

  const clearSearch = () => {
    setSearchQuery('');
    setActiveSearch('');
    setCurrentPage(1);
  };

  const filteredUsers = users.filter(user => {
    if (!activeSearch) return true;
    const search = activeSearch.toLowerCase();
    return (
      user.displayName?.toLowerCase().includes(search) ||
      user.username?.toLowerCase().includes(search)
    );
  });

  const totalItems = filteredUsers.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedUsers = filteredUsers.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  return {
    users, isLoading, error,
    editingUser, isEditDialogOpen,
    currentPage, setCurrentPage,
    pageSize, setPageSize,
    searchQuery, setSearchQuery,
    filteredUsers, paginatedUsers, totalItems, totalPages,
    fetchUsers, handleEdit, handleOpenChange, handleSearch, clearSearch,
  };
}
