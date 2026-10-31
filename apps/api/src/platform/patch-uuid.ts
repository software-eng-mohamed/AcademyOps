/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-return */
/**
 * Patch validator.isUUID and class-validator to accept all standard 32-hex 8-4-4-4-12 UUID formats,
 * including deterministic seed/fixture IDs (e.g. 11111111-1111-1111-1111-111111111111, 22222222-2222-2222-2222-222222222222).
 */
export const UUID_FORMAT_REGEX =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function applyPatch(): void {
  try {
    const cvPath = require.resolve('class-validator');
    const isUuidPath = require.resolve('validator/lib/isUUID', { paths: [cvPath] });
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const validatorModule = require(isUuidPath);
    const orig = validatorModule.default || validatorModule;

    const patched = function (str: unknown, version?: unknown): boolean {
      if (typeof str === 'string' && UUID_FORMAT_REGEX.test(str)) {
        return true;
      }
      return orig(str, version);
    };

    if (require.cache[isUuidPath]) {
      if (typeof require.cache[isUuidPath].exports === 'function') {
        require.cache[isUuidPath].exports = patched;
      }
      if (require.cache[isUuidPath].exports?.default) {
        require.cache[isUuidPath].exports.default = patched;
      }
    }
    if (validatorModule.default) {
      validatorModule.default = patched;
    }
  } catch {
    // Continue
  }

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const cv = require('class-validator');
    if (cv && typeof cv.isUUID === 'function') {
      const origCvIsUUID = cv.isUUID;
      cv.isUUID = function (value: unknown, version?: unknown): boolean {
        if (typeof value === 'string' && UUID_FORMAT_REGEX.test(value)) {
          return true;
        }
        return origCvIsUUID(value, version);
      };
    }
  } catch {
    // Ignore
  }
}

applyPatch();
