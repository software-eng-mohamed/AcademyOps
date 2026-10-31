import { z } from 'zod';
import type { LoginCopy } from './login-copy';
import { isValidEgyptPhoneLocalInput } from './phone-identifier';

export function createLoginSchema(copy: LoginCopy) {
  return z
    .object({
      identifier: z.string().trim().min(3, copy.required).max(320),
      identifierType: z.enum(['EMAIL', 'PHONE']),
      password: z.string().max(256),
    })
    .superRefine((values, context) => {
      if (values.identifierType === 'EMAIL') {
        const emailResult = z.email().safeParse(values.identifier);
        if (!emailResult.success) {
          context.addIssue({ code: 'custom', message: copy.emailValidation, path: ['identifier'] });
        }
      } else if (!isValidEgyptPhoneLocalInput(values.identifier)) {
        context.addIssue({ code: 'custom', message: copy.phoneValidation, path: ['identifier'] });
      }
      if (values.password.length < 8) {
        context.addIssue({
          code: 'custom',
          message: copy.passwordValidation,
          path: ['password'],
        });
      }
    });
}

export type LoginFormValues = z.infer<ReturnType<typeof createLoginSchema>>;
