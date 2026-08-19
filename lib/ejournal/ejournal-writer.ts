import { promises as fs } from 'fs';
import path from 'path';
import { fetchEJournalData } from './ejournal-data';
import { buildFiles } from './ejournal-build';

export function ejournalRoot(): string {
  return process.env.ALON_EJOURNAL_DIR || path.join(process.cwd(), 'EJournals');
}

export async function saveEJournalFiles(
  date: string, terminalId?: string
): Promise<{ dir: string; files: string[] }> {
  const data = await fetchEJournalData(date, terminalId);
  const files = buildFiles(data);
  const termFolder = `Terminal-${terminalId && terminalId !== 'all' ? terminalId : 'all'}`;
  const dir = path.join(ejournalRoot(), date, termFolder);
  await fs.mkdir(dir, { recursive: true });
  const written: string[] = [];
  for (const [name, content] of Object.entries(files)) {
    const file = path.join(dir, `${name}_${date}.txt`);
    await fs.writeFile(file, content, 'utf8');
    written.push(file);
  }
  return { dir, files: written };
}
