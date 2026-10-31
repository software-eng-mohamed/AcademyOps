'use client';

import { cn } from '@academyops/ui';
import { Moon, Sun } from 'lucide-react';
import { useTheme } from 'next-themes';
import { type ComponentPropsWithoutRef, useCallback, useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

export type ThemeTransitionVariant =
  | 'circle'
  | 'square'
  | 'triangle'
  | 'diamond'
  | 'hexagon'
  | 'rectangle'
  | 'star';

type AnimatedThemeTogglerProps = Omit<ComponentPropsWithoutRef<'button'>, 'aria-label'> & {
  darkThemeLabel: string;
  duration?: number;
  fromCenter?: boolean;
  lightThemeLabel: string;
  variant?: ThemeTransitionVariant;
};

function collapsedPolygon(point: string, vertexCount: number) {
  return `polygon(${Array.from({ length: vertexCount }, () => point).join(', ')})`;
}

function getTransitionClipPaths(
  variant: ThemeTransitionVariant,
  centerX: number,
  centerY: number,
  maxRadius: number,
  viewportWidth: number,
  viewportHeight: number,
): [string, string] {
  const toX = (x: number) => `${(x / viewportWidth) * 100}%`;
  const toY = (y: number) => `${(y / viewportHeight) * 100}%`;
  const point = (x: number, y: number) => `${toX(x)} ${toY(y)}`;
  const radius = (value: number) =>
    `${(value / (Math.hypot(viewportWidth, viewportHeight) / Math.SQRT2)) * 100}%`;
  const center = point(centerX, centerY);

  switch (variant) {
    case 'square': {
      const halfSide =
        Math.max(centerX, viewportWidth - centerX, centerY, viewportHeight - centerY) * 1.05;
      const end = [
        point(centerX - halfSide, centerY - halfSide),
        point(centerX + halfSide, centerY - halfSide),
        point(centerX + halfSide, centerY + halfSide),
        point(centerX - halfSide, centerY + halfSide),
      ];
      return [collapsedPolygon(center, 4), `polygon(${end.join(', ')})`];
    }
    case 'triangle': {
      const scale = maxRadius * 2.2;
      const offsetX = (Math.sqrt(3) / 2) * scale;
      const end = [
        point(centerX, centerY - scale),
        point(centerX + offsetX, centerY + 0.5 * scale),
        point(centerX - offsetX, centerY + 0.5 * scale),
      ];
      return [collapsedPolygon(center, 3), `polygon(${end.join(', ')})`];
    }
    case 'diamond': {
      const outerRadius = maxRadius * Math.SQRT2;
      const end = [
        point(centerX, centerY - outerRadius),
        point(centerX + outerRadius, centerY),
        point(centerX, centerY + outerRadius),
        point(centerX - outerRadius, centerY),
      ];
      return [collapsedPolygon(center, 4), `polygon(${end.join(', ')})`];
    }
    case 'hexagon': {
      const outerRadius = maxRadius * Math.SQRT2;
      const end = Array.from({ length: 6 }, (_, index) => {
        const angle = -Math.PI / 2 + (index * Math.PI) / 3;
        return point(
          centerX + outerRadius * Math.cos(angle),
          centerY + outerRadius * Math.sin(angle),
        );
      });
      return [collapsedPolygon(center, 6), `polygon(${end.join(', ')})`];
    }
    case 'rectangle': {
      const halfWidth = Math.max(centerX, viewportWidth - centerX);
      const halfHeight = Math.max(centerY, viewportHeight - centerY);
      const end = [
        point(centerX - halfWidth, centerY - halfHeight),
        point(centerX + halfWidth, centerY - halfHeight),
        point(centerX + halfWidth, centerY + halfHeight),
        point(centerX - halfWidth, centerY + halfHeight),
      ];
      return [collapsedPolygon(center, 4), `polygon(${end.join(', ')})`];
    }
    case 'star': {
      const outerRadius = maxRadius * Math.SQRT2 * 1.03;
      const star = (value: number) => {
        const vertices: string[] = [];
        for (let index = 0; index < 5; index += 1) {
          const outerAngle = -Math.PI / 2 + (index * 2 * Math.PI) / 5;
          vertices.push(
            point(centerX + value * Math.cos(outerAngle), centerY + value * Math.sin(outerAngle)),
          );
          const innerAngle = outerAngle + Math.PI / 5;
          vertices.push(
            point(
              centerX + value * 0.42 * Math.cos(innerAngle),
              centerY + value * 0.42 * Math.sin(innerAngle),
            ),
          );
        }
        return `polygon(${vertices.join(', ')})`;
      };
      return [star(Math.max(2, outerRadius * 0.025)), star(outerRadius)];
    }
    default:
      return [`circle(0% at ${center})`, `circle(${radius(maxRadius)} at ${center})`];
  }
}

/**
 * Magic UI's Animated Theme Toggler adapted to the app's next-themes provider.
 * Source: https://magicui.design/docs/components/animated-theme-toggler
 */
export function AnimatedThemeToggler({
  className,
  darkThemeLabel,
  duration = 400,
  fromCenter = false,
  lightThemeLabel,
  onClick,
  variant = 'circle',
  ...props
}: AnimatedThemeTogglerProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const isDark = mounted && resolvedTheme === 'dark';
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isTransitioningRef = useRef(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    return () => {
      const root = document.documentElement;
      if (root.dataset.plgThemeTransition !== 'active') return;
      delete root.dataset.plgThemeTransition;
      root.style.removeProperty('--plg-theme-transition-duration');
      root.style.removeProperty('--plg-theme-transition-clip-from');
      root.style.removeProperty('--plg-theme-transition-clip-to');
      root.style.removeProperty('--plg-theme-transition-easing');
    };
  }, []);

  const toggleTheme = useCallback(() => {
    const button = buttonRef.current;
    const root = document.documentElement;
    if (!button || isTransitioningRef.current || root.dataset.plgThemeTransition === 'active') {
      return;
    }

    const nextTheme = isDark ? 'light' : 'dark';
    const applyTheme = () => {
      root.classList.toggle('dark', nextTheme === 'dark');
      setTheme(nextTheme);
    };

    if (
      typeof document.startViewTransition !== 'function' ||
      window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
    ) {
      applyTheme();
      return;
    }

    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const bounds = button.getBoundingClientRect();
    const centerX = fromCenter ? viewportWidth / 2 : bounds.left + bounds.width / 2;
    const centerY = fromCenter ? viewportHeight / 2 : bounds.top + bounds.height / 2;
    const maxRadius = Math.hypot(
      Math.max(centerX, viewportWidth - centerX),
      Math.max(centerY, viewportHeight - centerY),
    );
    const clipPath = getTransitionClipPaths(
      variant,
      centerX,
      centerY,
      maxRadius,
      viewportWidth,
      viewportHeight,
    );

    root.dataset.plgThemeTransition = 'active';
    root.style.setProperty('--plg-theme-transition-duration', `${duration}ms`);
    root.style.setProperty('--plg-theme-transition-clip-from', clipPath[0]);
    root.style.setProperty('--plg-theme-transition-clip-to', clipPath[1]);
    root.style.setProperty(
      '--plg-theme-transition-easing',
      variant === 'star' ? 'linear' : 'ease-in-out',
    );
    isTransitioningRef.current = true;

    const cleanup = () => {
      isTransitioningRef.current = false;
      delete root.dataset.plgThemeTransition;
      root.style.removeProperty('--plg-theme-transition-duration');
      root.style.removeProperty('--plg-theme-transition-clip-from');
      root.style.removeProperty('--plg-theme-transition-clip-to');
      root.style.removeProperty('--plg-theme-transition-easing');
    };

    const transition = document.startViewTransition(() => flushSync(applyTheme));
    transition.finished.finally(cleanup).catch(() => undefined);
  }, [duration, fromCenter, isDark, setTheme, variant]);

  return (
    <button
      aria-label={isDark ? lightThemeLabel : darkThemeLabel}
      aria-pressed={isDark}
      className={cn(className)}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) toggleTheme();
      }}
      ref={buttonRef}
      type="button"
      {...props}
    >
      {isDark ? <Sun aria-hidden className="size-5" /> : <Moon aria-hidden className="size-5" />}
    </button>
  );
}
