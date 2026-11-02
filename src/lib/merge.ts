import type { AppData, LogEntry } from "./types";

export type Snapshot = { data: AppData; updatedAt: number };

const MAX_TOMBSTONES = 5000;

/**
 * Combines two copies of a user's data (this device and the server, or two devices).
 * Records are never lost to an older copy: logs are the union of both, minus the ones deleted on either side.
 * Everything else (menus, timers, settings) comes from the newer copy.
 */
export function mergeSnapshots(a: Snapshot, b: Snapshot): Snapshot {
  const [older, newer] = a.updatedAt > b.updatedAt ? [b, a] : [a, b];
  const deletedLogs = [...new Set([...(older.data.deletedLogs ?? []), ...(newer.data.deletedLogs ?? [])])].slice(-MAX_TOMBSTONES);
  const gone = new Set(deletedLogs);
  const byId = new Map<string, LogEntry>();
  // The newer copy wins when both hold the same record.
  for (const log of [...(older.data.logs ?? []), ...(newer.data.logs ?? [])]) if (!gone.has(log.id)) byId.set(log.id, log);
  return {
    data: { ...newer.data, logs: [...byId.values()].sort((x, y) => y.at - x.at), deletedLogs },
    updatedAt: Math.max(a.updatedAt, b.updatedAt),
  };
}
