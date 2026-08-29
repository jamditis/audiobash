type KillProcess = (pid: number, signal: NodeJS.Signals) => unknown;

interface ProcessRecord {
  pid: number;
  parentPid: number;
  groupId: number;
}

function parseProcessSnapshot(snapshot: string): ProcessRecord[] {
  return snapshot
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [pid, parentPid, groupId] = line.trim().split(/\s+/).map(Number);
      if (
        !Number.isSafeInteger(pid) ||
        pid <= 0 ||
        !Number.isSafeInteger(parentPid) ||
        parentPid < 0 ||
        !Number.isSafeInteger(groupId) ||
        groupId <= 0
      ) {
        throw new Error(`Invalid packaged probe process record: ${line.trim()}`);
      }
      return { pid, parentPid, groupId };
    });
}

export function terminateDetachedProbeGroup(
  groupId: number,
  killProcess: KillProcess = process.kill.bind(process),
): void {
  if (!Number.isSafeInteger(groupId) || groupId <= 0) {
    throw new Error('A positive packaged probe process-group ID is required');
  }
  try {
    killProcess(-groupId, 'SIGKILL');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
  }
}

export function terminateReportedProbeGroups(
  rootPid: number,
  reportedGroupIds: ReadonlySet<number>,
  killProcess: KillProcess = process.kill.bind(process),
): void {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) {
    throw new Error('A positive packaged probe root PID is required');
  }

  const groupIds = [...reportedGroupIds];
  if (groupIds.some((groupId) => !Number.isSafeInteger(groupId) || groupId <= 0)) {
    throw new Error('Positive reported process-group IDs are required');
  }

  for (const groupId of [...new Set(groupIds)]
    .filter((id) => id !== rootPid)
    .sort((a, b) => b - a)) {
    terminateDetachedProbeGroup(groupId, killProcess);
  }
  terminateDetachedProbeGroup(rootPid, killProcess);
}

export function terminatePackagedProbeTree(
  rootPid: number,
  snapshot: string,
  killProcess: KillProcess = process.kill.bind(process),
): void {
  if (!Number.isSafeInteger(rootPid) || rootPid <= 0) {
    throw new Error('A positive packaged probe root PID is required');
  }

  const records = parseProcessSnapshot(snapshot);
  const root = records.find((record) => record.pid === rootPid);
  if (!root || root.groupId !== rootPid) {
    throw new Error('The packaged probe root is not a proved process-group leader');
  }

  const descendants = new Set([rootPid]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const record of records) {
      if (!descendants.has(record.pid) && descendants.has(record.parentPid)) {
        descendants.add(record.pid);
        changed = true;
      }
    }
  }

  const groupIds = new Set<number>();
  for (const record of records) {
    if (descendants.has(record.pid) && descendants.has(record.groupId)) {
      groupIds.add(record.groupId);
    }
  }
  const orderedGroups = [...groupIds]
    .filter((groupId) => groupId !== rootPid)
    .sort((left, right) => right - left);
  orderedGroups.push(rootPid);
  for (const groupId of orderedGroups) terminateDetachedProbeGroup(groupId, killProcess);
}
