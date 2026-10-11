import fs from "node:fs";
import os from "node:os";
import path from "node:path";

// Small JSON persistence. Prefers ./.data, falls back to the OS temp dir (read-only hosts such as Vercel).
const g = globalThis as unknown as { __resolverDir?: string };

function dataDir(): string {
  if (g.__resolverDir) return g.__resolverDir;
  const candidates = [process.env.RESOLVER_DATA_DIR, path.join(/*turbopackIgnore: true*/ process.cwd(), ".data"), path.join(/*turbopackIgnore: true*/ os.tmpdir(), "merchant-ops-resolver")];
  for (const dir of candidates) {
    if (!dir) continue;
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.accessSync(dir, fs.constants.W_OK);
      g.__resolverDir = dir;
      return dir;
    } catch {
      // try the next candidate
    }
  }
  g.__resolverDir = os.tmpdir();
  return g.__resolverDir;
}

export function readJson<T>(name: string, fallback: T): T {
  try {
    return JSON.parse(fs.readFileSync(path.join(/*turbopackIgnore: true*/ dataDir(), name), "utf8")) as T;
  } catch {
    return fallback;
  }
}

export function writeJson(name: string, data: unknown) {
  try {
    const file = path.join(/*turbopackIgnore: true*/ dataDir(), name);
    const tmp = `${file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data));
    fs.renameSync(tmp, file);
  } catch {
    // Persistence is best effort. The in-memory copy stays authoritative.
  }
}
