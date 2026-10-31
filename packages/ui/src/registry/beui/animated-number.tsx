'use client';

// beUI AnimatedNumber, MIT: https://beui.dev/r/number
// Local imports; stable assistive text and SSR value instead of announcing each frame.
import { animate, useInView, useReducedMotion } from 'motion/react';
import { useEffect, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

export interface AnimatedNumberProps {
  value: number;
  duration?: number;
  format?: (number: number) => string;
  className?: string;
  startOnView?: boolean;
}

export function AnimatedNumber({
  value,
  duration = 0.65,
  format = (number) => Math.round(number).toLocaleString(),
  className,
  startOnView = true,
}: AnimatedNumberProps) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(0);
  useEffect(() => {
    if (startOnView && !inView) return;
    if (reduce) {
      fromRef.current = value;
      setDisplay(value);
      return;
    }
    const controls = animate(fromRef.current, value, {
      duration,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (next) => {
        fromRef.current = next;
        setDisplay(next);
      },
    });
    return () => controls.stop();
  }, [value, duration, inView, startOnView, reduce]);
  return (
    <span ref={ref} className={cn('tabular-nums', className)}>
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(display)}</span>
    </span>
  );
}
