import * as fs from 'fs';
import { isExcludedPath } from './path-matcher';

export interface GateConfig {
  exclusions: string[];
  baseline: Record<string, number>;
}

/**
 * Loads and validates the JSON configuration.
 * Throws clean, actionable errors if the configuration is missing or malformed.
 */
export function loadAndValidateConfig(configPath: string): GateConfig {
  if (!fs.existsSync(configPath)) {
    throw new Error(`Configuration file is missing: ${configPath}`);
  }

  let rawContent: string;
  try {
    rawContent = fs.readFileSync(configPath, 'utf8');
  } catch (error) {
    throw new Error(`Failed to read configuration file: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(rawContent);
  } catch (error) {
    throw new Error(`Configuration is malformed (invalid JSON): ${(error as Error).message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Configuration is malformed: Root must be a JSON object.');
  }

  const obj = parsed as Record<string, unknown>;

  if (!('exclusions' in obj) || !Array.isArray(obj.exclusions)) {
    throw new Error("Configuration is malformed: Missing or invalid 'exclusions' array.");
  }

  const exclusions: string[] = [];
  for (const item of obj.exclusions) {
    if (typeof item !== 'string') {
      throw new Error(
        `Configuration is malformed: Exclusion item must be a string. Got: ${String(item)}`,
      );
    }
    exclusions.push(item);
  }

  if (
    !('baseline' in obj) ||
    typeof obj.baseline !== 'object' ||
    obj.baseline === null ||
    Array.isArray(obj.baseline)
  ) {
    throw new Error("Configuration is malformed: Missing or invalid 'baseline' object.");
  }

  const baselineObj = obj.baseline as Record<string, unknown>;
  const baseline: Record<string, number> = {};

  for (const [key, value] of Object.entries(baselineObj)) {
    if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
      throw new Error(
        `Configuration is malformed: Baseline count for '${key}' must be a non-negative integer. Got: ${String(value)}`,
      );
    }
    baseline[key] = value;
  }

  // Validate that no baseline path matches exclusions (they should be mutually exclusive)
  for (const key of Object.keys(baseline)) {
    if (isExcludedPath(key, exclusions)) {
      throw new Error(
        `Configuration is malformed: Path '${key}' cannot be in both exclusions and baseline.`,
      );
    }
  }

  return { exclusions, baseline };
}
