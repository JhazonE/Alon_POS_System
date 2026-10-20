/**
 * Signed session cookie primitives (zero external deps).
 * Token layout: base64url(JSON payload) + '.' + base64url(HMAC-SHA256(payload)).
 * Payload: { uid, iat }. verifySession never throws — it returns null for any
 * malformed, unsigned, tampered, expired or future-dated token, matching
 * lib/crypto/aes-gcm.ts.
 */
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const SESSION_COOKIE_NAME = 'alon-session';

/**
 * Maximum session age: 12 hours. Sized to one POS shift (a single long shift,
 * not days or weeks) so a copied cookie stops working by the end of the shift.
 * Task 3 uses this for the cookie's maxAge (seconds = ms / 1000).
 */
export const SESSION_MAX_AGE_MS = 12 * 60 * 60 * 1000;

const SECRET_ENV_KEY = 'SESSION_SECRET';
const SECRET_FILE_NAME = 'session-secret';

let cachedSecret: string | null = null;
let warnedPersistFailure = false;

function sign(payload: string, secret: string): Buffer {
  return crypto.createHmac('sha256', secret).update(payload).digest();
}

export function signSession(uid: string, secret: string): string {
  const payload = Buffer.from(JSON.stringify({ uid, iat: Date.now() })).toString('base64url');
  return `${payload}.${sign(payload, secret).toString('base64url')}`;
}

export function verifySession(token: string, secret: string): string | null {
  try {
    if (typeof token !== 'string') return null;
    const parts = token.split('.');
    if (parts.length !== 2) return null;
    const [payload, sigPart] = parts;
    if (!payload || !sigPart) return null;

    const expected = sign(payload, secret);
    const given = Buffer.from(sigPart, 'base64url');
    if (given.length !== expected.length) return null;
    if (!crypto.timingSafeEqual(given, expected)) return null;

    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.uid !== 'string' || data.uid.length === 0) return null;

    // A missing, non-numeric or future-dated iat is invalid: a token without a
    // usable issue time must never be accepted as "never expires".
    const iat = data.iat;
    if (typeof iat !== 'number' || !Number.isFinite(iat)) return null;
    const age = Date.now() - iat;
    if (age < 0 || age > SESSION_MAX_AGE_MS) return null;

    return data.uid;
  } catch {
    return null;
  }
}

/** Electron's userData dir, or null outside the Electron main process. */
function electronUserDataDir(): string | null {
  try {
    // Indirect require keeps bundlers from resolving 'electron' and the
    // import never runs at module top level, so Next server code is safe.
    const req = eval('require') as NodeRequire;
    const { app } = req('electron') as { app?: { getPath: (name: string) => string } };
    return app ? app.getPath('userData') : null;
  } catch {
    return null;
  }
}

function readSecretFile(file: string): string | null {
  try {
    const value = fs.readFileSync(file, 'utf8').trim();
    return value.length > 0 ? value : null;
  } catch {
    return null;
  }
}

function persistSecret(secret: string, userDataDir: string | null): boolean {
  try {
    if (userDataDir) {
      fs.mkdirSync(userDataDir, { recursive: true });
      fs.writeFileSync(path.join(userDataDir, SECRET_FILE_NAME), secret, { mode: 0o600 });
      return true;
    }
    const envFile = path.join(process.cwd(), '.env');
    const existing = fs.existsSync(envFile) ? fs.readFileSync(envFile, 'utf8') : '';
    const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
    fs.appendFileSync(envFile, `${separator}${SECRET_ENV_KEY}=${secret}\n`);
    return true;
  } catch {
    return false;
  }
}

/**
 * Resolution order: SESSION_SECRET env var; a secret persisted in the Electron
 * userData dir; a SESSION_SECRET line in .env; otherwise generate 32 random
 * bytes and persist them. If persistence fails the in-memory value is returned
 * (warned once) so the server never refuses to start.
 */
export function sessionSecret(): string {
  if (cachedSecret) return cachedSecret;

  const fromEnv = process.env[SECRET_ENV_KEY];
  if (fromEnv && fromEnv.length > 0) {
    cachedSecret = fromEnv;
    return cachedSecret;
  }

  const userDataDir = electronUserDataDir();
  if (userDataDir) {
    const stored = readSecretFile(path.join(userDataDir, SECRET_FILE_NAME));
    if (stored) {
      cachedSecret = stored;
      return cachedSecret;
    }
  } else {
    const envFile = path.join(process.cwd(), '.env');
    const match = fs.existsSync(envFile)
      ? fs.readFileSync(envFile, 'utf8').match(/^SESSION_SECRET=(.+)$/m)
      : null;
    if (match && match[1].trim().length > 0) {
      cachedSecret = match[1].trim();
      return cachedSecret;
    }
  }

  const generated = crypto.randomBytes(32).toString('base64url');
  if (!persistSecret(generated, userDataDir) && !warnedPersistFailure) {
    warnedPersistFailure = true;
    console.warn('[session-cookie] could not persist SESSION_SECRET; sessions will not survive a restart');
  }
  cachedSecret = generated;
  return cachedSecret;
}
