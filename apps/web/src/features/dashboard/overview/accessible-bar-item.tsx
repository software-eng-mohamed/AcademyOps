'use client';

import { type BarDatum, BarItem, type BarItemProps } from '@nivo/bar';

function nameBar(element: SVGGElement | null) {
  // Nivo 0.99 emits aria-label on its focusable rect without a naming role.
  // Keep its animation and keyboard tooltip behavior, adding the missing role.
  element?.querySelector('rect')?.setAttribute('role', 'img');
}

export function AccessibleBarItem<Datum extends BarDatum>(props: BarItemProps<Datum>) {
  return (
    <g ref={nameBar}>
      <BarItem {...props} />
    </g>
  );
}
