import { ConflictException, Injectable } from '@nestjs/common';
import { normalizeEgyptPhone, normalizeEmail } from '../imports/normalization';
import type { ReplaceStudentContactsDto } from './students.dto';

export type PreparedContact = {
  type: 'PHONE' | 'EMAIL';
  rawValue: string;
  normalizedValue: string | null;
  isPrimary: boolean;
};

@Injectable()
export class StudentContactsService {
  normalizeContact(type: 'PHONE' | 'EMAIL', value?: string): string | null {
    if (!value) return null;
    const normalized = type === 'PHONE' ? normalizeEgyptPhone(value) : normalizeEmail(value);
    if (!normalized)
      throw new ConflictException({
        code: type === 'PHONE' ? 'PHONE_INVALID' : 'EMAIL_INVALID',
        messageKey: type === 'PHONE' ? 'students.phoneInvalid' : 'students.emailInvalid',
      });
    return normalized;
  }

  prepareContacts(input: ReplaceStudentContactsDto): PreparedContact[] {
    const seen = new Set<string>();
    const contacts = input.contacts.map((contact) => {
      const normalizedValue = this.normalizeContact(contact.type, contact.value);
      const key = `${contact.type}:${normalizedValue}`;
      if (seen.has(key))
        throw new ConflictException({
          code: 'CONTACT_DUPLICATE',
          messageKey: 'students.contactDuplicate',
        });
      seen.add(key);
      return {
        type: contact.type,
        rawValue: contact.value.trim(),
        normalizedValue,
        isPrimary: contact.isPrimary ?? false,
      };
    });
    for (const type of ['PHONE', 'EMAIL'] as const) {
      const matches = contacts.filter((contact) => contact.type === type);
      if (!matches.length) continue;
      const primaryCount = matches.filter(({ isPrimary }) => isPrimary).length;
      if (primaryCount > 1)
        throw new ConflictException({
          code: 'CONTACT_PRIMARY_DUPLICATE',
          messageKey: 'students.contactPrimaryDuplicate',
        });
      if (primaryCount === 0) matches[0]!.isPrimary = true;
    }
    return contacts;
  }
}
