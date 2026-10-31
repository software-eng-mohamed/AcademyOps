import * as fs from 'fs';
import * as path from 'path';
import { loadAndValidateConfig } from './config-validator';
import type { GateConfig } from './config-validator';
import { getTrackedFiles, isBinaryFile } from './git-utils';
import { countFileLines } from './line-counter';
import { isExcludedPath } from './path-matcher';

export interface CheckResult {
  success: boolean;
  errors: string[];
  warnings: string[];
  info: string[];
  totalChecked: number;
}

/**
 * Performs the line limit and ratchet check across all tracked files.
 */
export function checkLineLimits(workspaceRoot: string, configPath: string): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const info: string[] = [];

  let config: GateConfig;
  try {
    config = loadAndValidateConfig(configPath);
  } catch (error) {
    return {
      success: false,
      errors: [`[MALFORMED CONFIG] ${(error as Error).message}`],
      warnings: [],
      info: [],
      totalChecked: 0,
    };
  }

  let trackedFiles: string[];
  try {
    trackedFiles = getTrackedFiles(workspaceRoot);
  } catch (error) {
    return {
      success: false,
      errors: [`[GIT ERROR] ${(error as Error).message}`],
      warnings: [],
      info: [],
      totalChecked: 0,
    };
  }

  const trackedSet = new Set(trackedFiles);
  let totalChecked = 0;

  // 1. Verify all baseline paths are tracked and exist on disk
  for (const baselinePath of Object.keys(config.baseline)) {
    const fullPath = path.join(workspaceRoot, baselinePath);
    if (!trackedSet.has(baselinePath)) {
      errors.push(`[STALE BASELINE] Baseline path '${baselinePath}' is not tracked by git.`);
    } else if (!fs.existsSync(fullPath)) {
      errors.push(`[MISSING FILE] Baseline path '${baselinePath}' does not exist on disk.`);
    }
  }

  // 2. Scan all tracked files
  for (const relPath of trackedFiles) {
    const fullPath = path.join(workspaceRoot, relPath);

    // Skip if it matches exclusions
    if (isExcludedPath(relPath, config.exclusions)) {
      continue;
    }

    // Skip if binary
    if (isBinaryFile(fullPath)) {
      continue;
    }

    // Ensure file exists (if it doesn't exist but is tracked, git status is dirty/deleted)
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    totalChecked++;
    const lines = countFileLines(fullPath);
    const inBaseline = Object.prototype.hasOwnProperty.call(config.baseline, relPath);

    if (inBaseline) {
      const allowed = config.baseline[relPath]!;
      if (lines > allowed) {
        errors.push(
          `[GROWTH VIOLATION] '${relPath}' grew to ${lines} lines (baseline limit: ${allowed}).`,
        );
      } else if (lines <= 300) {
        info.push(
          `[ACTION REQUIRED] '${relPath}' has reached ${lines} lines (<= 300). Remove it from the baseline.`,
        );
      } else {
        warnings.push(
          `[LEGACY WARNING] '${relPath}' is at ${lines} lines (baseline limit: ${allowed}).`,
        );
      }
    } else {
      if (lines > 300) {
        errors.push(
          `[LINE LIMIT VIOLATION] New/maintained file '${relPath}' has ${lines} lines, exceeding the 300-line maximum.`,
        );
      }
    }
  }

  return {
    success: errors.length === 0,
    errors,
    warnings,
    info,
    totalChecked,
  };
}
