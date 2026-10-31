'use client';

import {
  RiBox3Line,
  RiChatSmile2Line,
  RiCoinsFill,
  RiGroupFill,
  RiGroupLine,
  RiRefund2Fill,
  RiShoppingBasket2Fill,
  RiShoppingBasketLine,
} from '@remixicon/react';

import type { Stat } from './stat-cards';
export const DEFAULT_STATS: Stat[] = [
  { icon: RiGroupLine, label: 'Customers', value: '14,592', delta: '+5.3%', deltaColor: 'lime' },
  { icon: RiBox3Line, label: 'Unit sold', value: '385', delta: '-2.1%', deltaColor: 'rose' },
  {
    icon: RiShoppingBasketLine,
    label: 'Orders',
    value: '1,394',
    delta: '0.00%',
    deltaColor: 'neutral',
  },
  {
    icon: RiChatSmile2Line,
    label: 'Support tickets',
    value: '708',
    delta: '+12.8%',
    deltaColor: 'lime',
  },
];

export const DEFAULT_FOOTER_STATS: Stat[] = [
  {
    icon: RiCoinsFill,
    label: 'Total revenue',
    value: '$152,313.92',
    delta: '16%',
    deltaColor: 'lime',
    tone: 'blue',
    hint: 'Gross revenue across all channels, before refunds.',
  },
  {
    icon: RiShoppingBasket2Fill,
    label: 'Total orders',
    value: '25,162',
    delta: '20%',
    deltaColor: 'lime',
    tone: 'orange',
    hint: 'Completed checkouts, including repeat purchases.',
  },
  {
    icon: RiGroupFill,
    label: 'New customers',
    value: '3,847',
    delta: '8.1%',
    deltaColor: 'lime',
    tone: 'purple',
    hint: 'First-time buyers in the period.',
  },
  {
    icon: RiRefund2Fill,
    label: 'Refunds',
    value: '$4,209.44',
    delta: '2.4%',
    deltaColor: 'rose',
    tone: 'pink',
    hint: 'Value of orders refunded in the period.',
  },
];
