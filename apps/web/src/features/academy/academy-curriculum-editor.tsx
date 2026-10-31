'use client';
import { ArrowDown2, ArrowUp2, Trash } from 'iconsax-react';
import { record, records, textValue } from '@/api/academy/models';
import { Button } from '@/components/base/buttons/button';
import { Checkbox } from '@/components/base/checkbox/checkbox';
import styles from './academy-form-styles';
import { RemoteSelect } from './remote-select';

import type { AcademyActionModel } from './use-academy-action';

export function AcademyCurriculumEditor({ model }: { model: AcademyActionModel }) {
  const {
    target,
    userId,
    copy,
    formId,
    errors,
    curriculum,
    setCurriculum,
    mutation,
    isCurriculum,
  } = model;
  return (
    <>
      {isCurriculum ? (
        <div className={styles.editor}>
          {curriculum.map((entry, index) => (
            <div key={entry.key} className={styles.editorRow}>
              <RemoteSelect
                id={`${formId}-module-${index}`}
                label={`${copy.moduleId} ${index + 1}`}
                kind="modules"
                value={entry.moduleId}
                onChange={(moduleId) =>
                  setCurriculum((old) =>
                    old.map((item, i) => (i === index ? { ...item, moduleId } : item)),
                  )
                }
                copy={copy}
                userId={userId}
                disabled={mutation.isPending}
                initialLabel={textValue(
                  record(
                    records(target.row?.data.modules).find(
                      (item) => item.moduleId === entry.moduleId,
                    )?.module,
                  ).name,
                )}
              />
              <div className={styles.inlineActions}>
                <Checkbox
                  isSelected={entry.required}
                  onChange={(checked) =>
                    setCurriculum((old) =>
                      old.map((item, i) => (i === index ? { ...item, required: checked } : item)),
                    )
                  }
                  isDisabled={mutation.isPending}
                >
                  {copy.requiredModule}
                </Checkbox>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={copy.moveUp}
                  disabled={index === 0 || mutation.isPending}
                  onClick={() =>
                    setCurriculum((old) => {
                      const next = [...old];
                      const current = next[index];
                      const previous = next[index - 1];
                      if (current && previous) {
                        next[index - 1] = current;
                        next[index] = previous;
                      }
                      return next;
                    })
                  }
                >
                  <ArrowUp2 color="currentColor" size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={copy.moveDown}
                  disabled={index === curriculum.length - 1 || mutation.isPending}
                  onClick={() =>
                    setCurriculum((old) => {
                      const next = [...old];
                      const current = next[index];
                      const following = next[index + 1];
                      if (current && following) {
                        next[index] = following;
                        next[index + 1] = current;
                      }
                      return next;
                    })
                  }
                >
                  <ArrowDown2 color="currentColor" size={16} />
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  aria-label={copy.removeModule}
                  disabled={mutation.isPending}
                  onClick={() => setCurriculum((old) => old.filter((_, i) => i !== index))}
                >
                  <Trash color="currentColor" size={16} />
                </Button>
              </div>
            </div>
          ))}
          <Button
            type="button"
            variant="secondary"
            disabled={mutation.isPending}
            onClick={() =>
              setCurriculum((old) => [
                ...old,
                { key: crypto.randomUUID(), moduleId: '', required: true },
              ])
            }
          >
            {copy.addModule}
          </Button>
          {errors.curriculum ? (
            <p className={styles.validation} role="alert">
              {errors.curriculum}
            </p>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
