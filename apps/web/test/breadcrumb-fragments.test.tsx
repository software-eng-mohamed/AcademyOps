import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import type { AnchorHTMLAttributes } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Breadcrumb, BreadcrumbItem } from '@/components/base/breadcrumb/breadcrumb';

vi.mock('next/link', () => ({
  default: ({
    onClick,
    href,
    children,
    ...props
  }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        event.preventDefault();
      }}
    >
      {children}
    </a>
  ),
}));

describe('Breadcrumb fragments and separators', () => {
  it('places a chevron separator between dashboard, category and page when using fragments', () => {
    const isFullPage = true;
    render(
      <Breadcrumb aria-label="Test Breadcrumb">
        <BreadcrumbItem href="/dashboard">لوحة التحكم</BreadcrumbItem>
        {isFullPage ? (
          <>
            <BreadcrumbItem href="/academic">الأكاديمية</BreadcrumbItem>
            <BreadcrumbItem current>الدورات</BreadcrumbItem>
          </>
        ) : null}
      </Breadcrumb>,
    );

    expect(screen.getByText('لوحة التحكم')).toBeInTheDocument();
    expect(screen.getByText('الأكاديمية')).toBeInTheDocument();
    expect(screen.getByText('الدورات')).toBeInTheDocument();

    const separators = document.querySelectorAll('li[aria-hidden="true"]');
    expect(separators.length).toBe(2);
  });

  afterEach(() => {
    cleanup();
  });

  it('calls onClick when BreadcrumbItem has both href and onClick', () => {
    const handleClick = vi.fn();
    render(
      <Breadcrumb aria-label="Test Breadcrumb">
        <BreadcrumbItem href="/ar/academic/cohorts" onClick={handleClick}>
          الدورات
        </BreadcrumbItem>
      </Breadcrumb>,
    );

    const link = screen.getByRole('link', { name: 'الدورات' });
    expect(link).toHaveAttribute('href', '/ar/academic/cohorts');
    fireEvent.click(link);
    expect(handleClick).toHaveBeenCalledTimes(1);
  });
});
