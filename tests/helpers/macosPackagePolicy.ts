export function assertExactPackageBytes(
  entryName: string,
  packagedBytes: Uint8Array,
  currentBytes: Uint8Array,
): void {
  if (Buffer.from(packagedBytes).equals(Buffer.from(currentBytes))) return;

  throw new Error(`${entryName} does not match the current source bytes`);
}

export interface MacOsDeploymentTargetRecord {
  path: string;
  targets: string[];
}

export function parseMacOsDeploymentTargets(vtoolOutput: string): string[] {
  const targets: string[] = [];
  let activeCommand = '';

  for (const line of vtoolOutput.split(/\r?\n/)) {
    const value = line.trim();

    if (value.startsWith('Load command ')) {
      activeCommand = '';
    } else if (value === 'cmd LC_BUILD_VERSION' || value === 'cmd LC_VERSION_MIN_MACOSX') {
      activeCommand = value.slice(4);
    } else if (activeCommand === 'LC_BUILD_VERSION' && value.startsWith('minos ')) {
      targets.push(value.slice(6));
    } else if (activeCommand === 'LC_VERSION_MIN_MACOSX' && value.startsWith('version ')) {
      targets.push(value.slice(8));
    }
  }

  return targets;
}

export function assertMaximumMacOsDeploymentTarget(
  records: MacOsDeploymentTargetRecord[],
  maximumTarget: string,
): void {
  for (const record of records) {
    if (record.targets.length === 0) {
      throw new Error(`${record.path} has no macOS deployment target`);
    }

    for (const target of record.targets) {
      if (compareVersions(target, maximumTarget) > 0) {
        throw new Error(`${record.path} requires macOS ${target}, later than ${maximumTarget}`);
      }
    }
  }
}

function compareVersions(left: string, right: string): number {
  const leftParts = parseVersion(left);
  const rightParts = parseVersion(right);
  const partCount = Math.max(leftParts.length, rightParts.length);

  for (let index = 0; index < partCount; index += 1) {
    const difference = (leftParts[index] || 0) - (rightParts[index] || 0);
    if (difference !== 0) return difference;
  }

  return 0;
}

function parseVersion(version: string): number[] {
  if (!/^\d+(?:\.\d+)*$/.test(version)) {
    throw new Error(`Invalid macOS version: ${version}`);
  }

  return version.split('.').map(Number);
}
