import { exec } from 'child_process';
import { promisify } from 'util';
import path from 'path';
import fs from 'fs';

const execPromise = promisify(exec);

export interface BackupFile {
  name: string;
  size: number;
  created: string;
}

const BACKUP_DIR = path.join(process.cwd(), 'backups');

export function getBackupFiles(): BackupFile[] {
  if (!fs.existsSync(BACKUP_DIR)) {
    return [];
  }

  const files = fs.readdirSync(BACKUP_DIR);
  return files
    .filter(file => file.endsWith('.sql'))
    .map(file => {
      const filePath = path.join(BACKUP_DIR, file);
      const stats = fs.statSync(filePath);
      return {
        name: file,
        size: stats.size,
        created: stats.birthtime.toISOString()
      };
    })
    .sort((a, b) => new Date(b.created).getTime() - new Date(a.created).getTime());
}

export async function performBackup(): Promise<string> {
  if (!fs.existsSync(BACKUP_DIR)) {
    fs.mkdirSync(BACKUP_DIR, { recursive: true });
  }

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'alon_pos';
  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `backup-${dbName}-${timestamp}.sql`;
  const filePath = path.join(BACKUP_DIR, filename);

  // Note: Using --column-statistics=0 to avoid issues with some MySQL versions
  // Also using password directly in command line (not ideal, but common for local/dev tools)
  const passwordArg = dbPass ? `-p${dbPass}` : '';
  const command = `mysqldump -h ${dbHost} -u ${dbUser} ${passwordArg} ${dbName} --column-statistics=0 > "${filePath}"`;

  try {
    await execPromise(command);
    return filename;
  } catch (error) {
    console.error('Backup command failed:', error);
    throw new Error('Failed to execute mysqldump');
  }
}

export async function restoreBackup(filename: string): Promise<void> {
  const filePath = path.join(BACKUP_DIR, filename);

  if (!fs.existsSync(filePath)) {
    throw new Error('Backup file not found');
  }

  const dbHost = process.env.DB_HOST || 'localhost';
  const dbUser = process.env.DB_USER || 'root';
  const dbPass = process.env.DB_PASSWORD || '';
  const dbName = process.env.DB_NAME || 'alon_pos';

  const passwordArg = dbPass ? `-p${dbPass}` : '';
  // Note: Using < to direct the SQL file into mysql command
  const command = `mysql -h ${dbHost} -u ${dbUser} ${passwordArg} ${dbName} < "${filePath}"`;

  try {
    await execPromise(command);
  } catch (error) {
    console.error('Restore command failed:', error);
    throw new Error('Failed to execute mysql restore');
  }
}
