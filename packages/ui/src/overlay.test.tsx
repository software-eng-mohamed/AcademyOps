// @vitest-environment jsdom
/// <reference types="node" />

import '@testing-library/jest-dom/vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  Drawer,
  DrawerCloseButton,
  DrawerContent,
  DrawerTitle,
  Modal,
  ModalContent,
  ModalTitle,
} from './overlay';

const theme = readFileSync(resolve(process.cwd(), '../design-tokens/src/motion.css'), 'utf8');

function rule(selector: string) {
  const start = theme.indexOf(selector);
  expect(start).toBeGreaterThanOrEqual(0);
  return theme.slice(theme.indexOf('{', start) + 1, theme.indexOf('}', start));
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function mockAnimationStyles() {
  const computedStyle = window.getComputedStyle;
  vi.spyOn(window, 'getComputedStyle').mockImplementation((element) => {
    const styles = computedStyle(element);
    const className = element.classList.contains('plg-dialog-overlay')
      ? '.plg-dialog-overlay'
      : element.classList.contains('plg-navigation-content')
        ? '.plg-navigation-content'
        : element.classList.contains('plg-sheet-content')
          ? '.plg-sheet-content'
          : undefined;
    if (!className) return styles;
    return new Proxy(styles, {
      get(target, property) {
        if (property === 'animationName') {
          const state = element.getAttribute('data-state');
          return rule(`${className}[data-state='${state}']`).match(/animation:\s*([\w-]+)/)?.[1];
        }
        return Reflect.get(target, property, target);
      },
    });
  });
  vi.stubGlobal('CSS', { escape: (value: string) => value });
}

describe('mobile navigation motion', () => {
  it('identifies only the navigation backdrop for its synchronized motion', () => {
    render(
      <Drawer open>
        <DrawerContent aria-describedby={undefined} variant="navigation">
          <DrawerTitle>Navigation</DrawerTitle>
        </DrawerContent>
      </Drawer>,
    );
    expect(screen.getByRole('dialog', { name: 'Navigation' })).toHaveAttribute(
      'data-plg-overlay-content',
      'navigation',
    );
    expect(document.querySelector('.plg-dialog-overlay')).toHaveAttribute(
      'data-plg-overlay',
      'navigation',
    );
  });

  it('does not apply navigation motion to ordinary modals', () => {
    render(
      <Modal open>
        <ModalContent aria-describedby={undefined}>
          <ModalTitle>Details</ModalTitle>
        </ModalContent>
      </Modal>,
    );
    expect(document.querySelector('.plg-dialog-overlay')).not.toHaveAttribute('data-plg-overlay');
  });

  it('keeps both the panel and backdrop mounted until their exit animations end', () => {
    mockAnimationStyles();
    const content = (
      <DrawerContent aria-describedby={undefined} variant="navigation">
        <DrawerTitle>Navigation</DrawerTitle>
      </DrawerContent>
    );
    const { rerender } = render(<Drawer open>{content}</Drawer>);
    const panel = screen.getByRole('dialog', { name: 'Navigation' });
    const backdrop = document.querySelector('.plg-dialog-overlay');

    rerender(<Drawer open={false}>{content}</Drawer>);

    expect(panel).toBeInTheDocument();
    expect(panel).toHaveAttribute('data-state', 'closed');
    expect(backdrop).toBeInTheDocument();
    expect(backdrop).toHaveAttribute('data-state', 'closed');

    for (const [element, animationName] of [
      [panel, 'plg-navigation-out'],
      [backdrop, 'plg-overlay-out'],
    ] as const) {
      const event = new Event('animationend', { bubbles: true });
      Object.defineProperty(event, 'animationName', { value: animationName });
      fireEvent(element as Element, event);
    }
    expect(panel).not.toBeInTheDocument();
    expect(backdrop).not.toBeInTheDocument();
  });

  it('defines separate entrance and exit animations so Radix can wait before unmounting', () => {
    expect(rule(".plg-navigation-content[data-state='open']")).toContain(
      'animation: plg-navigation-in 280ms',
    );
    expect(rule(".plg-navigation-content[data-state='closed']")).toContain(
      'animation: plg-navigation-out 240ms',
    );
    expect(rule('@keyframes plg-navigation-in')).toContain(
      'transform: translateX(var(--plg-navigation-offscreen))',
    );
    const exit = theme.slice(
      theme.indexOf('@keyframes plg-navigation-out'),
      theme.indexOf('@keyframes plg-search-in'),
    );
    expect(exit).toContain('transform: translateX(0)');
    expect(exit).toContain('transform: translateX(var(--plg-navigation-offscreen))');
  });

  it('slides toward the logical start edge in both languages', () => {
    expect(rule('.plg-navigation-content {')).toContain('--plg-navigation-offscreen: -100%');
    expect(rule('.plg-navigation-content:dir(rtl)')).toContain('--plg-navigation-offscreen: 100%');
  });

  it('keeps the navigation backdrop alive for the same duration as the panel', () => {
    for (const [state, duration] of [
      ['open', '280ms'],
      ['closed', '240ms'],
    ]) {
      expect(
        rule(`.plg-dialog-overlay[data-plg-overlay='navigation'][data-state='${state}']`),
      ).toContain(`animation-duration: ${duration}`);
    }
  });

  it('turns off both animations when reduced motion is requested', () => {
    const reducedMotion = theme.slice(theme.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(reducedMotion).toContain('.plg-navigation-content,');
    expect(reducedMotion).toContain('.plg-dialog-overlay,');
    expect(reducedMotion).toContain('animation: none !important');
  });
});

describe('side sheet motion', () => {
  it('defines entrance and exit animations sliding toward the logical end edge', () => {
    expect(rule(".plg-sheet-content[data-state='open']")).toContain(
      'animation: plg-sheet-in var(--plg-motion-sheet)',
    );
    expect(rule(".plg-sheet-content[data-state='closed']")).toContain(
      'animation: plg-sheet-out 220ms cubic-bezier(0.4, 0, 0.2, 1)',
    );
    expect(rule('@keyframes plg-sheet-in')).toContain(
      'transform: translateX(var(--plg-sheet-offscreen, calc(100% + 1rem)))',
    );
    const exit = theme.slice(
      theme.indexOf('@keyframes plg-sheet-out'),
      theme.indexOf('@keyframes plg-navigation-in'),
    );
    expect(exit).toContain('transform: translateX(0)');
    expect(exit).toContain('transform: translateX(var(--plg-sheet-offscreen, calc(100% + 1rem)))');
  });

  it('slides toward the logical end edge in both LTR and RTL', () => {
    expect(rule('.plg-sheet-content {')).toContain('--plg-sheet-offscreen: calc(100% + 1rem)');
    expect(rule('.plg-sheet-content:dir(rtl)')).toContain(
      '--plg-sheet-offscreen: calc(-100% - 1rem)',
    );
  });

  it('waits for sheet exit animation to finish before firing onOpenChange(false)', () => {
    mockAnimationStyles();
    const onOpenChange = vi.fn();
    render(
      <Drawer open onOpenChange={onOpenChange}>
        <DrawerContent aria-describedby={undefined}>
          <DrawerTitle>Side Sheet</DrawerTitle>
          <DrawerCloseButton aria-label="Close" />
        </DrawerContent>
      </Drawer>,
    );
    const panel = screen.getByRole('dialog', { name: 'Side Sheet' });
    expect(panel).toHaveAttribute('data-state', 'open');

    // Click close button
    const closeBtn = screen.getByRole('button', { name: 'Close' });
    fireEvent.click(closeBtn);

    // Should transition to closed state while waiting for exit animation
    expect(panel).toHaveAttribute('data-state', 'closed');
    expect(onOpenChange).not.toHaveBeenCalled();

    // Finish animation
    const event = new Event('animationend', { bubbles: true });
    Object.defineProperty(event, 'animationName', { value: 'plg-sheet-out' });
    fireEvent(panel, event);

    // Now onOpenChange should have been notified
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});
