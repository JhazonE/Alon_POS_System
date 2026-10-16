'use client';

import { useMemo, useState } from 'react';
import { getApiUrl } from '@/lib/api-config';
import { getSessionUid } from '@/lib/session-uid';
import { ENTITY_SCHEMAS, type EntityKey } from '@/lib/import/entity-schemas';
import { parseFile, type ParsedFile } from '@/lib/import/parse-file';
import { autoMapColumns } from '@/lib/import/auto-map';
import { classifyRows, type ClassifiedRow } from '@/lib/import/classify';
import { buildTemplateCsv, buildSkippedCsv } from '@/lib/import/csv-out';

type Step = 'upload' | 'map' | 'preview' | 'result';
const BATCH = 500;

function downloadText(filename: string, text: string) {
  const blob = new Blob(['﻿' + text], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  URL.revokeObjectURL(url); document.body.removeChild(a);
}

export function useImportWizard(entity: EntityKey) {
  const schema = ENTITY_SCHEMAS[entity];
  const [step, setStep] = useState<Step>('upload');
  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<Record<string, string | null>>({});
  const [existingKeys, setExistingKeys] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<{ added: number; updated: number; skipped: number } | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const classified: ClassifiedRow[] = useMemo(() => {
    if (!parsed) return [];
    return classifyRows(parsed.rows, mapping, schema, existingKeys);
  }, [parsed, mapping, schema, existingKeys]);

  const counts = useMemo(() => ({
    new: classified.filter((r) => r.status === 'new').length,
    update: classified.filter((r) => r.status === 'update').length,
    error: classified.filter((r) => r.status === 'error').length,
  }), [classified]);

  async function pickFile(file: File) {
    setError(null);
    try {
      const pf = await parseFile(file);
      if (pf.rows.length === 0) { setError('No rows found in the file.'); return; }
      setParsed(pf);
      setMapping(autoMapColumns(pf.headers, schema.fields));
      const res = await fetch(getApiUrl(`/data-management/import/${entity}/keys`));
      const data = res.ok ? await res.json() : { keys: [] };
      setExistingKeys(new Set<string>(data.keys ?? []));
      setStep('map');
    } catch (e: any) {
      setError(e?.message || 'Could not read the file.');
    }
  }

  const requiredMapped = schema.fields.filter((f) => f.required).every((f) => mapping[f.key]);

  function toPreview() { if (requiredMapped) setStep('preview'); }
  function back() { setStep((s) => (s === 'preview' ? 'map' : s === 'map' ? 'upload' : s)); }

  async function confirm() {
    setLoading(true); setError(null);
    const valid = classified.filter((r) => r.status !== 'error').map((r) => r.values);
    let added = 0, updated = 0, skipped = counts.error;
    try {
      for (let i = 0; i < valid.length; i += BATCH) {
        const chunk = valid.slice(i, i + BATCH);
        const res = await fetch(getApiUrl(`/data-management/import/${entity}`), {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ uid: getSessionUid(), rows: chunk }),
        });
        if (!res.ok) throw new Error('Import request failed');
        const data = await res.json();
        added += data.added ?? 0; updated += data.updated ?? 0; skipped += data.skipped ?? 0;
      }
      setResult({ added, updated, skipped });
      setStep('result');
    } catch (e: any) {
      setError(e?.message || 'Import failed.');
    } finally {
      setLoading(false);
    }
  }

  function downloadTemplate() { downloadText(`${entity}-template.csv`, buildTemplateCsv(schema)); }
  function downloadSkipped() {
    const csv = buildSkippedCsv(classified);
    if (csv) downloadText(`${entity}-skipped-rows.csv`, csv);
  }
  function reset() {
    setStep('upload'); setParsed(null); setMapping({}); setExistingKeys(new Set());
    setResult(null); setError(null);
  }

  return {
    step, schema, parsed, mapping, setMapping, classified, counts, result, loading, error, requiredMapped,
    actions: { pickFile, back, toPreview, confirm, downloadTemplate, downloadSkipped, reset },
  };
}
