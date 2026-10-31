'use client';
import { Checkbox, Field } from '@academyops/ui';
import { Button } from '@/components/base/buttons/button';
import { Input } from '@/components/base/input/input';
import { Select, SelectItem } from '@/components/base/select/select';
import { academyLabel } from '@/i18n/academy-copy';
import styles from './academy-form-styles';

import type { AcademyActionModel } from './use-academy-action';

export function AcademyContactsEditor({ model }: { model: AcademyActionModel }) {
  const { target, copy, formId, errors, contacts, setContacts, mutation } = model;
  return (
    <>
      {target.action === 'editContacts' ? (
        <div className={styles.editor}>
          {contacts.map((entry, index) => (
            <div key={entry.key} className={styles.editorRow}>
              <Field htmlFor={`${formId}-contact-type-${index}`} label={copy.type}>
                <Select
                  triggerId={`${formId}-contact-type-${index}`}
                  aria-label={copy.type}
                  selectedKey={entry.type}
                  renderValue={academyLabel(copy, entry.type)}
                  isDisabled={mutation.isPending}
                  onSelectionChange={(value) =>
                    setContacts((old) =>
                      old.map((item, i) =>
                        i === index
                          ? { ...item, type: value === 'EMAIL' ? 'EMAIL' : 'PHONE' }
                          : item,
                      ),
                    )
                  }
                >
                  {['EMAIL', 'PHONE'].map((value) => (
                    <SelectItem key={value} id={value} textValue={academyLabel(copy, value)}>
                      {academyLabel(copy, value)}
                    </SelectItem>
                  ))}
                </Select>
              </Field>
              <Input
                label={academyLabel(copy, entry.type)}
                type={entry.type === 'EMAIL' ? 'email' : 'tel'}
                value={entry.value}
                onChange={(value) =>
                  setContacts((old) =>
                    old.map((item, i) => (i === index ? { ...item, value } : item)),
                  )
                }
                inputClassName="text-left [direction:ltr]"
                isDisabled={mutation.isPending}
              />
              <div className={styles.inlineActions}>
                <Checkbox
                  label={copy.isPrimary}
                  checked={entry.isPrimary}
                  disabled={mutation.isPending}
                  onCheckedChange={(checked) =>
                    setContacts((old) =>
                      old.map((item, i) =>
                        i === index ? { ...item, isPrimary: checked === true } : item,
                      ),
                    )
                  }
                />
                <Button
                  type="button"
                  variant="ghost"
                  disabled={mutation.isPending}
                  onClick={() => setContacts((old) => old.filter((_, i) => i !== index))}
                >
                  {copy.removeContact}
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() =>
              setContacts((old) => [
                ...old,
                { key: crypto.randomUUID(), type: 'PHONE', value: '', isPrimary: false },
              ])
            }
          >
            {copy.addContact}
          </Button>
          {errors.contacts ? (
            <p className={styles.validation} role="alert">
              {errors.contacts}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
