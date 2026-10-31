import { z } from 'zod';
import type { PasswordRecoveryCopy } from './password-recovery-copy';

export function createPasswordResetSchema(copy: PasswordRecoveryCopy) {
  return z
    .object({
      confirmation: z.string().min(1, copy.required).max(128, copy.passwordTooLong),
      password: z.string().min(12, copy.passwordHint).max(128, copy.passwordTooLong),
    })
    .superRefine((values, context) => {
      if (values.password !== values.confirmation) {
        context.addIssue({
          code: 'custom',
          message: copy.passwordMismatch,
          path: ['confirmation'],
        });
      }
    });
}

export type PasswordResetFormValues = z.infer<ReturnType<typeof createPasswordResetSchema>>;
