'use client';

import { useCallback, useEffect, useState } from 'react';
import { useToast } from '@/hooks/use-toast';
import { getApiUrl } from '@/lib/api-config';
import { appendSessionUid, getSessionUid } from '@/lib/session-uid';
import {
  type ActionResult, type Branch, type BranchFormValues, type BranchMembers,
  type FailureKind, type ReassignKind,
} from './branches-types';

export type Notice = { kind: FailureKind; message: string };

const clean = (v: string) => v.trim();

/**
 * Every write goes through here so the session uid is attached in exactly one
 * place. The server reads it from the body (POST/PATCH); a missing uid is an
 * honest 403, never a guessed scope.
 */
async function send(method: 'POST' | 'PATCH', path: string, body: Record<string, unknown>): Promise<ActionResult> {
  try {
    const res = await fetch(getApiUrl(path), {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uid: getSessionUid(), ...body }),
    });
    const result = await res.json().catch(() => null);
    if (res.ok && result?.success) return { ok: true };
    const message: string = result?.error || `Request failed (${res.status})`;
    // 403 = not permitted (no all_branches grant). 409 = refused because of
    // state; its message names the counts, so it is shown verbatim.
    const kind: FailureKind = res.status === 403 ? 'forbidden' : res.status === 409 ? 'refused' : 'error';
    return { ok: false, kind, message };
  } catch {
    return { ok: false, kind: 'error', message: 'Could not reach the server. Please try again.' };
  }
}

export function useBranches() {
  const { toast } = useToast();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [members, setMembers] = useState<BranchMembers | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [notice, setNotice] = useState<Notice | null>(null);

  const fetchAll = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await fetch(getApiUrl('/branches'));
      if (!res.ok) throw new Error();
      const result = await res.json();
      if (result.success) setBranches(result.data);
    } catch {
      toast({ variant: 'destructive', title: 'Error', description: 'Failed to load branches' });
    }

    try {
      const params = new URLSearchParams();
      appendSessionUid(params);
      const res = await fetch(getApiUrl(`/branches/members?${params.toString()}`));
      const result = await res.json().catch(() => null);
      if (res.ok && result?.success) {
        setMembers(result.data);
      } else {
        setMembers(null);
        if (res.status === 403) {
          setNotice({
            kind: 'forbidden',
            message: result?.error || 'You are not permitted to administer branches.',
          });
        }
      }
    } catch {
      setMembers(null);
    } finally {
      setIsLoading(false);
    }
  }, [toast]);

  useEffect(() => { fetchAll(); }, [fetchAll]);

  const finish = async (result: ActionResult, success: string): Promise<ActionResult> => {
    if (result.ok) {
      setNotice(null);
      toast({ title: 'Saved', description: success });
      await fetchAll();
    }
    return result;
  };

  const createBranch = async (v: BranchFormValues) =>
    finish(
      await send('POST', '/branches', {
        code: clean(v.code),
        name: clean(v.name),
        businessName: clean(v.businessName) || undefined,
        address: clean(v.address) || undefined,
        tin: clean(v.tin) || undefined,
        contactNumber: clean(v.contactNumber) || undefined,
        permitNo: clean(v.permitNo) || undefined,
        minNumber: clean(v.minNumber) || undefined,
        serialNumber: clean(v.serialNumber) || undefined,
        operatedBy: clean(v.operatedBy) || undefined,
      }),
      `Branch ${clean(v.code)} created.`
    );

  // PATCH is snake_case (POST is camelCase). The route ignores unknown keys,
  // so a wrong spelling here would silently change nothing.
  const updateBranch = async (id: string, v: BranchFormValues) =>
    finish(
      await send('PATCH', `/branches/${encodeURIComponent(id)}`, {
        name: clean(v.name),
        business_name: clean(v.businessName) || null,
        address: clean(v.address) || null,
        tin: clean(v.tin) || null,
        contact_number: clean(v.contactNumber) || null,
        permit_no: clean(v.permitNo) || null,
        min_number: clean(v.minNumber) || null,
        serial_number: clean(v.serialNumber) || null,
        operated_by: clean(v.operatedBy) || null,
      }),
      'Branch updated.'
    );

  const setActive = async (branch: Branch, active: boolean): Promise<ActionResult> => {
    const result = await send('PATCH', `/branches/${encodeURIComponent(branch.id)}`, {
      is_active: active ? 1 : 0,
    });
    if (!result.ok) {
      setNotice({ kind: result.kind, message: result.message });
      return result;
    }
    return finish(result, `Branch ${branch.code} ${active ? 'activated' : 'deactivated'}.`);
  };

  const reassign = async (kind: ReassignKind, id: string, branchId: string) =>
    finish(await send('POST', '/branches/reassign', { kind, id, branchId }), `The ${kind} was moved.`);

  return {
    branches, members, isLoading, notice, setNotice,
    createBranch, updateBranch, setActive, reassign,
  };
}
