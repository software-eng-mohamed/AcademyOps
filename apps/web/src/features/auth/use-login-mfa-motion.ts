'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import { type RefObject, useRef } from 'react';

gsap.registerPlugin(useGSAP);

type LoginStep = 'credentials' | 'changePhone' | 'phoneOtp' | 'mfa';
type MfaMethod = 'totp' | 'recovery';

function motionPreferences() {
  return {
    isMobile: window.matchMedia('(max-width: 639px)').matches,
    reduceMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  };
}

export function useLoginStepMotion(scope: RefObject<HTMLDivElement | null>, step: LoginStep) {
  const previousStep = useRef<LoginStep | null>(null);

  useGSAP(
    () => {
      const priorStep = previousStep.current;
      previousStep.current = step;
      if (priorStep === null || priorStep === step) return;

      const root = scope.current;
      const panel = root?.querySelector('[data-login-panel]');
      const brand = panel?.querySelector('[data-login-brand]');
      const title = panel?.querySelector('h1');
      const description = title?.nextElementSibling;
      const formItems = panel ? [...panel.querySelectorAll('form > *')] : [];
      if (!root || !panel || !title || formItems.length === 0) return;

      const optionalTargets = [description].filter((target): target is Element => target != null);
      const animatedTargets = [panel, title, ...optionalTargets, ...formItems];
      const resetTargets = [brand, ...animatedTargets].filter(
        (target): target is Element => target != null,
      );
      const { isMobile, reduceMotion } = motionPreferences();

      // A fast API response can arrive while the page entrance is still
      // running. Normalise those shared targets before the MFA timeline owns
      // them so the entrance cleanup cannot cut this transition short.
      gsap.killTweensOf(resetTargets);
      gsap.set(resetTargets, { clearProps: 'all' });

      if (reduceMotion) {
        root.dataset.loginStepMotion = `complete:${step}:reduced`;
        return;
      }

      root.dataset.loginStepMotion = `running:${step}:${isMobile ? 'mobile' : 'desktop'}`;

      if (isMobile) {
        gsap
          .timeline({
            defaults: { ease: 'power1.out' },
            onComplete: () => {
              root.dataset.loginStepMotion = `complete:${step}:mobile`;
            },
          })
          .fromTo(
            [title, ...optionalTargets, ...formItems],
            { autoAlpha: 0.88, y: 2 },
            { autoAlpha: 1, duration: 0.1, y: 0 },
            0,
          )
          .set(animatedTargets, { clearProps: 'all' });
        return;
      }

      gsap
        .timeline({
          defaults: { ease: 'power1.out' },
          onComplete: () => {
            root.dataset.loginStepMotion = `complete:${step}:desktop`;
          },
        })
        .fromTo(
          [title, ...optionalTargets, ...formItems],
          { autoAlpha: 0.86, y: 4 },
          { autoAlpha: 1, duration: 0.16, y: 0 },
        )
        .set(animatedTargets, { clearProps: 'all' });
    },
    { dependencies: [step], revertOnUpdate: true, scope },
  );
}

export function useLoginMfaMethodMotion(
  scope: RefObject<HTMLFormElement | null>,
  step: LoginStep,
  method: MfaMethod,
) {
  const previousMethod = useRef<MfaMethod | null>(null);

  useGSAP(
    () => {
      if (step !== 'mfa') {
        previousMethod.current = null;
        return;
      }

      const priorMethod = previousMethod.current;
      previousMethod.current = method;
      if (priorMethod === null || priorMethod === method) return;

      const form = scope.current;
      const content = form?.querySelector('[data-login-mfa-method-content]');
      const active = form?.querySelector('[data-method-selected="true"]');
      const inactive = form?.querySelector('[data-method-selected="false"]');
      if (!form || !content || !active || !inactive) return;

      const targets = [content, active, inactive];
      const { isMobile, reduceMotion } = motionPreferences();
      gsap.killTweensOf(targets);
      gsap.set(targets, { clearProps: 'all' });

      if (reduceMotion) {
        form.dataset.loginMfaMethodMotion = `complete:${method}:reduced`;
        return;
      }

      const readingDirection = document.documentElement.dir === 'rtl' ? -1 : 1;
      const methodDirection = method === 'recovery' ? 1 : -1;
      const distance = methodDirection * readingDirection * (isMobile ? 2 : 5);
      form.dataset.loginMfaMethodMotion = `running:${method}:${isMobile ? 'mobile' : 'desktop'}`;

      gsap
        .timeline({
          defaults: { ease: 'power1.out' },
          onComplete: () => {
            form.dataset.loginMfaMethodMotion = `complete:${method}:${isMobile ? 'mobile' : 'desktop'}`;
          },
        })
        .fromTo(
          active,
          { scale: 0.98 },
          {
            duration: isMobile ? 0.08 : 0.12,
            scale: 1,
          },
        )
        .fromTo(
          content,
          {
            autoAlpha: 0.86,
            x: distance,
          },
          {
            autoAlpha: 1,
            duration: isMobile ? 0.1 : 0.16,
            x: 0,
          },
          0,
        )
        .set(targets, { clearProps: 'all' });
    },
    { dependencies: [step, method], revertOnUpdate: true, scope },
  );
}
