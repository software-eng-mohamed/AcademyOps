type CategoryTick = { x: number; y: number; value: unknown };

export function CategoryAxisTick({ tick, isRtl }: { tick: CategoryTick; isRtl: boolean }) {
  return (
    <g transform={`translate(${tick.x},${tick.y})`}>
      <foreignObject x={isRtl ? 10 : -132} y={-18} width={122} height={36}>
        <div
          className="flex h-full items-center text-xs leading-[14px] text-[var(--owner-card-muted)]"
          dir={isRtl ? 'rtl' : 'ltr'}
          style={{ textAlign: isRtl ? 'left' : 'right' }}
        >
          <span className="w-full whitespace-normal break-words">{String(tick.value)}</span>
        </div>
      </foreignObject>
    </g>
  );
}
