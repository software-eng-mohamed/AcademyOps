'use client';

import { useGSAP } from '@gsap/react';
import gsap from 'gsap';
import type { RefObject } from 'react';

gsap.registerPlugin(useGSAP);

export function useLoginEntranceMotion(scope: RefObject<HTMLDivElement | null>) {
  useGSAP(
    () => {
      const root = scope.current;
      if (!root) return;
      root.dataset.loginMotionState = 'initializing';

      const controls = root.querySelector('[data-login-controls]');
      const panel = root.querySelector('[data-login-panel]');
      if (!controls || !panel) {
        root.dataset.loginMotionState = 'missing:login-shell';
        return;
      }
      const allTargets = [controls, panel];
      const isMobile = window.matchMedia('(max-width: 639px)').matches;
      const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
      root.dataset.loginMotionState = reduceMotion
        ? 'running:reduced'
        : isMobile
          ? 'running:mobile'
          : 'running:desktop';

      if (reduceMotion) {
        gsap.set(allTargets, { clearProps: 'all' });
        return;
      }

      gsap
        .timeline({ defaults: { ease: 'power1.out' } })
        .fromTo(controls, { autoAlpha: 0.9 }, { autoAlpha: 1, duration: isMobile ? 0.08 : 0.12 })
        .fromTo(
          panel,
          { autoAlpha: 0.9, y: isMobile ? 2 : 4 },
          { autoAlpha: 1, duration: isMobile ? 0.12 : 0.2, y: 0 },
          0,
        )
        .set(allTargets, { clearProps: 'all' });
    },
    { scope },
  );
}
