'use client';

// beUI Tabs, MIT: https://beui.dev/r/tabs
// Original spring indicator / panel transition. theme token aliases and Radix
// semantics add keyboard navigation, RTL and tab-to-panel associations.
import {
  domMax,
  LazyMotion,
  MotionConfig,
  m as motion,
  type Transition,
  useReducedMotion,
} from 'motion/react';
import { Tabs as Primitive } from 'radix-ui';
import {
  type ComponentProps,
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useId,
  useMemo,
  useState,
} from 'react';
import { cn } from '../../lib/cn';

type Variant = 'pill' | 'underline' | 'segment';
type Context = { value: string; layoutId: string; variant: Variant };
const TabsContext = createContext<Context | null>(null);
function useTabs() {
  const context = useContext(TabsContext);
  if (!context) throw new Error('Tabs.* must be used inside <Tabs>');
  return context;
}
const transition: Transition = { type: 'spring', stiffness: 170, damping: 24, mass: 1.2 };

export function Tabs({
  defaultValue,
  value,
  onValueChange,
  variant = 'pill',
  children,
  className,
  dir,
}: {
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  variant?: Variant;
  children: ReactNode;
  className?: string;
  dir?: 'ltr' | 'rtl';
}) {
  const [internal, setInternal] = useState(defaultValue ?? '');
  const layoutId = useId();
  const reduce = useReducedMotion();
  const controlled = value !== undefined;
  const current = controlled ? value : internal;
  const setValue = useCallback(
    (next: string) => {
      if (!controlled) setInternal(next);
      onValueChange?.(next);
    },
    [controlled, onValueChange],
  );
  const context = useMemo(
    () => ({ value: current, layoutId, variant }),
    [current, layoutId, variant],
  );
  return (
    <LazyMotion features={domMax} strict>
      <MotionConfig reducedMotion="user" transition={reduce ? { duration: 0 } : transition}>
        <TabsContext.Provider value={context}>
          <Primitive.Root value={current} onValueChange={setValue} dir={dir} asChild>
            <motion.div layoutRoot className={className}>
              {children}
            </motion.div>
          </Primitive.Root>
        </TabsContext.Provider>
      </MotionConfig>
    </LazyMotion>
  );
}

const listClasses: Record<Variant, string> = {
  pill: 'inline-flex items-center gap-1 rounded-full bg-surface-subtle p-1',
  underline: 'inline-flex items-center gap-1 border-b border-border',
  segment: 'inline-flex items-center gap-0 rounded-lg bg-surface-subtle p-0.5',
};
export function TabsList({ children, className, ...props }: ComponentProps<typeof Primitive.List>) {
  const { variant } = useTabs();
  return (
    <Primitive.List className={cn(listClasses[variant], className)} {...props}>
      {children}
    </Primitive.List>
  );
}

export function TabsTrigger({
  value,
  children,
  className,
  indicatorClassName,
  ...props
}: ComponentProps<typeof Primitive.Trigger> & { indicatorClassName?: string }) {
  const { value: current, layoutId, variant } = useTabs();
  const active = current === value;
  const focus =
    'focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-offset-2 focus-visible:ring-offset-surface';
  if (variant === 'underline') {
    return (
      <Primitive.Trigger
        value={value}
        className={cn(
          'relative isolate -mb-px inline-flex min-h-11 items-center px-3 pt-1 pb-2.5 text-sm font-medium transition-colors outline-none',
          focus,
          active ? 'text-brand' : 'text-ink-muted hover:text-ink',
          className,
        )}
        {...props}
      >
        {children}
        {active ? (
          <motion.span
            aria-hidden
            layoutId={layoutId}
            layout="position"
            className={cn(
              'absolute -bottom-px start-0 end-0 h-0.5 rounded-full bg-brand',
              indicatorClassName,
            )}
          />
        ) : null}
      </Primitive.Trigger>
    );
  }
  const radius = variant === 'pill' ? 'rounded-full' : 'rounded-md';
  return (
    <div className="relative">
      {active ? (
        <motion.span
          aria-hidden
          layoutId={layoutId}
          layout="position"
          style={{ borderRadius: variant === 'pill' ? 9999 : 8 }}
          className={cn('absolute inset-0 bg-brand', radius, indicatorClassName)}
        />
      ) : null}
      <Primitive.Trigger
        value={value}
        className={cn(
          'relative z-10 inline-flex items-center justify-center whitespace-nowrap bg-transparent px-3.5 py-1.5 text-sm font-medium outline-none transition-colors',
          focus,
          active ? 'text-primary-foreground' : 'text-ink-muted hover:text-ink',
          radius,
          className,
        )}
        {...props}
      >
        {children}
      </Primitive.Trigger>
    </div>
  );
}

export function TabsContent({
  value,
  children,
  className,
  ...props
}: ComponentProps<typeof Primitive.Content>) {
  const reduce = useReducedMotion();
  return (
    <Primitive.Content value={value} {...props} asChild>
      <motion.div
        key={value}
        initial={reduce ? false : { opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: reduce ? 0 : 0.18, ease: [0.16, 1, 0.3, 1] }}
        className={cn('mt-4 outline-none', className)}
      >
        {children}
      </motion.div>
    </Primitive.Content>
  );
}
