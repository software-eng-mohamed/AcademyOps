import { HttpException } from '@nestjs/common';
import { expect } from 'vitest';

export async function expectHttpErrorCode(
  work: () => Promise<unknown>,
  expectedCode: string,
): Promise<void> {
  try {
    await work();
    expect.fail(`Expected exception with code "${expectedCode}" was not thrown`);
  } catch (err: unknown) {
    if (err instanceof HttpException) {
      const response = err.getResponse();
      if (typeof response === 'object' && response !== null && 'code' in response) {
        expect((response as { code: string }).code).toBe(expectedCode);
      } else {
        expect(err.message).toBe(expectedCode);
      }
    } else {
      throw err;
    }
  }
}
