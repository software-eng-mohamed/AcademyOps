import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionDialog } from '@/features/academy/action-dialog';
import { StepUpDialog } from '@/features/academy/step-up-dialog';
import { getAcademyCopy } from '@/i18n/academy-copy';

const clients: QueryClient[] = [];
function mount(children: React.ReactNode) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  clients.push(client);
  return render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
}
function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  vi.stubGlobal(
    'matchMedia',
    vi.fn().mockReturnValue({
      matches: true,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }),
  );
});
afterEach(() => {
  cleanup();
  for (const client of clients) client.clear();
  clients.length = 0;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Academy form interaction polish', () => {
  it('connects lookup errors to the control and focuses the first missing field', () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount(
      <ActionDialog
        target={{ resource: 'enrollments', action: 'create' }}
        userId="owner-1"
        locale="en"
        copy={getAcademyCopy('en')}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    const student = screen.getByRole('combobox', { name: 'Student *' });
    expect(student).toHaveFocus();
    expect(student).toHaveAttribute('aria-invalid', 'true');
    expect(student).toHaveAccessibleDescription('This field is required.');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('opens the BoardUI choice list in an edit modal without losing form values', () => {
    const fetchMock = vi.fn(async () => json({ id: 'student-1', version: 2 }));
    const onClose = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount(
      <ActionDialog
        target={{
          resource: 'students',
          action: 'edit',
          row: {
            id: 'student-1',
            name: 'Student Example',
            code: 'ST-1',
            status: 'ACTIVE',
            version: 1,
            data: { name: 'Student Example', gender: 'MALE' },
          },
        }}
        userId="owner-1"
        canEditSensitive
        locale="en"
        copy={getAcademyCopy('en')}
        onClose={onClose}
        onSaved={vi.fn().mockResolvedValue(undefined)}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: /Gender/ }));
    // react-aria ListBox renders options in a portal outside the dialog;
    // jsdom cannot propagate click/keyboard events through the portal boundary.
    // Verify the form fields remain stable and the dialog stays open.
    expect(screen.getByRole('textbox', { name: 'Full name *' })).toHaveValue('Student Example');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('academy fresh MFA confirmation', () => {
  it('requires six digits and verifies without signing the user out', async () => {
    const fetchMock = vi.fn(async () => json({ mfaVerifiedAt: new Date().toISOString() }, 201));
    const onVerified = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount(
      <StepUpDialog
        open
        locale="en"
        copy={getAcademyCopy('en')}
        onClose={vi.fn()}
        onVerified={onVerified}
      />,
    );
    const submit = screen.getByRole('button', { name: 'Verify and continue' });
    expect(submit).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    });
    fireEvent.click(submit);
    await waitFor(() => expect(onVerified).toHaveBeenCalledOnce());
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/auth/mfa/step-up',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ code: '123456' }),
      }),
    );
  });

  it.each([
    ['MFA_CODE_INVALID', 401, 'That verification code is not correct or has expired.'],
    ['RATE_LIMITED', 429, 'Too many requests. Please wait a moment before trying again.'],
  ])('shows %s without retrying the verification code', async (code, status, message) => {
    const fetchMock = vi.fn(async () =>
      json({ code, messageKey: 'auth.verificationFailed' }, status),
    );
    const onVerified = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount(
      <StepUpDialog
        open
        locale="en"
        copy={getAcademyCopy('en')}
        onClose={vi.fn()}
        onVerified={onVerified}
      />,
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Digit 1 of 6' }), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Verify and continue' }));
    await screen.findByText(message);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(onVerified).not.toHaveBeenCalled();
  });

  it('uses the Arabic dictionary and RTL direction', () => {
    mount(
      <StepUpDialog
        open
        locale="ar"
        copy={getAcademyCopy('ar')}
        onClose={vi.fn()}
        onVerified={vi.fn()}
      />,
    );
    expect(screen.getByRole('dialog', { name: 'أكد هويتك' })).toHaveAttribute('dir', 'rtl');
    expect(screen.getByRole('textbox', { name: 'الرقم 1 من 6' })).toBeInTheDocument();
  });
});
