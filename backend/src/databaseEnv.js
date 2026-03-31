/**
 * Явная диагностика и защита от «тихого» подключения к пустому/чужому SQLite после смены cwd/путей.
 * Относительные file: URL в Prisma разрешаются относительно каталога prisma/ (где schema.prisma).
 */

import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BACKEND_ROOT = path.resolve(__dirname, '..');
const PRISMA_DIR = path.join(BACKEND_ROOT, 'prisma');

/**
 * Абсолютный путь к файлу SQLite по DATABASE_URL (как в Prisma для file:./… относительно prisma/).
 * @returns {string | null}
 */
export function getSqliteAbsolutePathFromDatabaseUrl() {
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw || !/^file:/i.test(raw)) return null;
  try {
    const url = new URL(raw);
    if (url.protocol !== 'file:') return null;
    let p = url.pathname;
    if (process.platform === 'win32' && p.startsWith('/') && /^\/[A-Za-z]:/.test(p)) {
      p = p.slice(1);
    }
    p = decodeURIComponent(p);
    if (path.isAbsolute(p)) return path.normalize(p);
    const rel = p.replace(/^\.\/+/, '');
    return path.normalize(path.resolve(PRISMA_DIR, rel));
  } catch {
    const stripped = raw
      .replace(/^file:/i, '')
      .replace(/^\/\//, '')
      .replace(/^\.\//, '');
    return path.normalize(path.resolve(PRISMA_DIR, stripped));
  }
}

export function logDatabaseEnvAtStartup() {
  const raw = process.env.DATABASE_URL;
  const cwd = process.cwd();
  const sqlitePath = getSqliteAbsolutePathFromDatabaseUrl();

  console.log(`[polden] process.cwd=${cwd}`);
  console.log(`[polden] backendRoot=${BACKEND_ROOT} prismaDir=${PRISMA_DIR}`);

  if (sqlitePath) {
    const exists = fs.existsSync(sqlitePath);
    const size = exists ? fs.statSync(sqlitePath).size : -1;
    console.log(`[polden] DATABASE_URL kind=sqlite resolvedFile=${sqlitePath}`);
    const dir = path.dirname(sqlitePath);
    const base = path.basename(sqlitePath);
    if (
      base === 'dev.db' &&
      (dir === '/' || dir === '\\' || /^[A-Za-z]:\\?$/.test(dir))
    ) {
      console.warn(
        '[polden] WARN: SQLite путь похож на корневой /dev.db — часто это ошибка DATABASE_URL. Ожидается file:./имя.db относительно prisma/ или абсолютный file:/path/app.db.'
      );
    }
    if (!exists) {
      console.warn('[polden] WARN: SQLite file missing (migrate may create it).');
    } else if (size === 0) {
      console.warn('[polden] WARN: SQLite file is 0 bytes — check path and DATABASE_URL.');
    }
  } else if (raw && (/^postgres(ql)?:/i.test(raw) || raw.startsWith('mysql:'))) {
    console.log('[polden] DATABASE_URL kind=relational (credentials not logged)');
  } else {
    console.log('[polden] DATABASE_URL kind=unknown_or_unset');
  }
}

/**
 * В production или при POLDEN_STRICT_DB_CHECK=1 — не стартовать с пустой Branch без явного override.
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function assertProductionDatabaseHasBranches(prisma) {
  const strict =
    process.env.NODE_ENV === 'production' || process.env.POLDEN_STRICT_DB_CHECK === '1';
  if (!strict) return;
  if (process.env.POLDEN_ALLOW_EMPTY_DB === '1') return;
  const n = await prisma.branch.count();
  if (n === 0) {
    throw new Error(
      '[polden] FATAL: Branch table empty — likely wrong DATABASE_URL or empty DB. Set POLDEN_ALLOW_EMPTY_DB=1 to override (first boot only).'
    );
  }
}

/**
 * @param {import('@prisma/client').PrismaClient} prisma
 */
export async function getHealthDbExtras(prisma) {
  if (process.env.POLDEN_HEALTH_DETAIL !== '1') return {};
  const out = {};
  const sqlite = getSqliteAbsolutePathFromDatabaseUrl();
  if (sqlite) out.sqliteAbsPath = sqlite;
  try {
    out.branchCount = await prisma.branch.count();
  } catch {
    out.branchCount = null;
  }
  return out;
}
