import { verify } from 'argon2';

const dummyPasswordHash =
  '$argon2id$v=19$m=19456,t=2,p=1$yt5P44MJ6/67icSAJYlIUA$R8CK6rRAT/hjI64sFksBU/6EWBNZQRr4QOXMkNzr65U';

export function verifyPasswordHash(
  passwordHash: string | null | undefined,
  password: string,
): Promise<boolean> {
  return verify(passwordHash ?? dummyPasswordHash, password);
}
