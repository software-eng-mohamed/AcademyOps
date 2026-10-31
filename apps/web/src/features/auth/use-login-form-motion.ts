'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { type RefObject, useRef } from 'react';
import type { LoginFormValues } from './login-schema';

type IdentifierType = LoginFormValues['identifierType'];

export function useLoginFormMotion(
  scope: RefObject<HTMLFormElement | null>,
  identifierType: IdentifierType,
  userInitiatedChange: RefObject<boolean>,
) {
  const previousType = useRef<IdentifierType | null>(null);

  useGSAP(
    () => {
      const previousIdentifierType = previousType.current;
      previousType.current = identifierType;
      const shouldAnimate = userInitiatedChange.current;
      userInitiatedChange.current = false;

      if (
        previousIdentifierType === null ||
        previousIdentifierType === identifierType ||
        !shouldAnimate
      ) {
        return;
      }

      const field = scope.current?.querySelector('[data-login-identifier-field]');
      const active = scope.current?.querySelector('[data-method-selected="true"]');
      const inactive = scope.current?.querySelector('[data-method-selected="false"]');
      if (!field || !active || !inactive) return;

      const isMobile = window.matchMedia('(max-width: 639px)').matches;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      if (reduceMotion) {
        gsap.set([field, active, inactive], { clearProps: 'all' });
        return;
      }

      gsap.killTweensOf([field, active, inactive]);
      gsap
        .timeline({ defaults: { ease: 'power1.out' } })
        .fromTo(
          active,
          { scale: 0.98 },
          {
            clearProps: 'transform',
            duration: isMobile ? 0.08 : 0.12,
            scale: 1,
          },
        )
        .fromTo(
          field,
          {
            autoAlpha: 0.88,
            x: identifierType === 'PHONE' ? (isMobile ? 2 : 5) : isMobile ? -2 : -5,
          },
          {
            autoAlpha: 1,
            clearProps: 'all',
            duration: isMobile ? 0.1 : 0.16,
            x: 0,
          },
          0,
        );
    },
    { dependencies: [identifierType], revertOnUpdate: true, scope },
  );
}
