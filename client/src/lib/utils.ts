import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatNumber(num: number): string {
  return new Intl.NumberFormat('en-US').format(num);
}

export function formatCompactCurrency(amount: number): string {
  const absAmount = Math.abs(amount);
  const sign = amount < 0 ? '-' : '';
  
  if (absAmount < 1000) {
    return `${sign}$${absAmount.toFixed(0)}`;
  } else if (absAmount < 999500) {
    const k = absAmount / 1000;
    if (k < 10) {
      return `${sign}$${k.toFixed(1)}K`;
    } else if (k < 100) {
      return `${sign}$${k.toFixed(0)}K`;
    } else {
      return `${sign}$${k.toFixed(0)}K`;
    }
  } else if (absAmount < 999500000) {
    const m = absAmount / 1000000;
    if (m < 10) {
      return `${sign}$${m.toFixed(1)}M`;
    } else if (m < 100) {
      return `${sign}$${m.toFixed(0)}M`;
    } else {
      return `${sign}$${m.toFixed(0)}M`;
    }
  } else {
    const b = absAmount / 1000000000;
    if (b < 10) {
      return `${sign}$${b.toFixed(1)}B`;
    } else if (b < 100) {
      return `${sign}$${b.toFixed(0)}B`;
    } else {
      return `${sign}$${b.toFixed(0)}B`;
    }
  }
}
