import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ActionDialog } from '@/features/academy/action-dialog';
import { DetailDrawer } from '@/features/academy/detail-drawer';
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

describe('academy detail navigation', () => {
  it.each(['en', 'ar'] as const)(
    'renders an accessible icon-only back button in %s',
    async (locale) => {
      const copy = getAcademyCopy(locale);
      const onBack = vi.fn();
      mount(
        <DetailDrawer
          selection={{
            resource: 'rooms',
            row: {
              id: 'room-1',
              name: 'Room A',
              code: 'A',
              status: 'ACTIVE',
              version: 1,
              data: {},
            },
          }}
          user={{
            id: 'owner-1',
            name: 'Owner',
            branches: [],
            organization: { name: 'Academy' },
            permissions: [],
            roles: [{ code: 'OWNER', name: 'Owner' }],
          }}
          locale={locale}
          copy={copy}
          canGoBack
          onBack={onBack}
          onClose={vi.fn()}
          onInspect={vi.fn()}
          onAction={vi.fn()}
        />,
      );
      await screen.findByRole('heading', { name: copy.details });
      const back = screen.getByRole('button', { name: copy.previous });
      expect(back.textContent).toBe('');
      expect(back.querySelector('svg')).not.toBeNull();
      expect(back.classList.contains('-ms-1.5')).toBe(true);
      expect(back.classList.contains('[&_svg]:rtl:rotate-180')).toBe(true);
      fireEvent.click(back);
      expect(onBack).toHaveBeenCalledOnce();
    },
  );
});

describe('academy action forms', () => {
  it('preserves existing contact values when opening and saving the contact editor', async () => {
    const fetchMock = vi.fn(async (_url: string, _init: RequestInit) =>
      json({ id: 'student-1', version: 2 }),
    );
    vi.stubGlobal('fetch', fetchMock);
    const onSaved = vi.fn().mockResolvedValue(undefined);
    mount(
      <ActionDialog
        target={{
          resource: 'students',
          action: 'editContacts',
          row: {
            id: 'student-1',
            name: 'Contact test',
            status: '',
            version: 1,
            code: '',
            data: {
              contacts: [
                {
                  id: 'email-1',
                  type: 'EMAIL',
                  rawValue: 'existing@example.test',
                  isPrimary: true,
                },
              ],
            },
          },
        }}
        userId="reception-1"
        locale="en"
        copy={getAcademyCopy('en')}
        onClose={vi.fn()}
        onSaved={onSaved}
      />,
    );
    expect(screen.getByRole('textbox', { name: 'Email' })).toHaveValue('existing@example.test');
    fireEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const init = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    expect(JSON.parse(String(init?.body))).toEqual({
      contacts: [{ type: 'EMAIL', value: 'existing@example.test', isPrimary: true }],
    });
  });
  it.each(['students', 'leads'] as const)(
    'requires explicit match review for %s',
    async (resource) => {
      const fetchMock = vi.fn(async (url: string, _init: RequestInit) =>
        json(
          url.split('?')[0]?.endsWith('/match-candidates')
            ? [
                {
                  personId: 'person-match',
                  publicId: 'ST-001',
                  name: 'Existing Person',
                  reasons: ['EXACT_NAME'],
                },
              ]
            : { id: 'created-record', version: 1 },
        ),
      );
      const onSaved = vi.fn().mockResolvedValue(undefined);
      vi.stubGlobal('fetch', fetchMock);
      mount(
        <ActionDialog
          target={{ resource, action: 'create' }}
          userId="owner-1"
          branchId="branch-1"
          locale="en"
          copy={getAcademyCopy('en')}
          onClose={vi.fn()}
          onSaved={onSaved}
        />,
      );
      fireEvent.change(screen.getByRole('textbox', { name: 'Full name *' }), {
        target: { value: 'Existing Person' },
      });
      await screen.findByText('Possible matching people');
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      expect(onSaved).not.toHaveBeenCalled();
      expect(fetchMock).toHaveBeenCalledTimes(1);
      if (resource === 'leads') {
        fireEvent.click(screen.getByRole('button', { name: 'Use this existing person' }));
      } else {
        fireEvent.click(
          screen.getByRole('checkbox', {
            name: 'I reviewed these records and confirm this is a different person.',
          }),
        );
      }
      fireEvent.click(screen.getByRole('button', { name: 'Create' }));
      await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
      const body = JSON.parse(String(fetchMock.mock.calls.at(-1)?.[1].body));
      if (resource === 'leads') {
        expect(body.personId).toBe('person-match');
        expect(body.newPerson).toBeUndefined();
      } else {
        expect(body.confirmDistinctFromPersonIds).toEqual(['person-match']);
      }
    },
  );

  it('validates before sending and saves through the API with the entered values', async () => {
    const fetchMock = vi.fn(async () => json({ id: 'program-1', version: 1 }, 201));
    const onSaved = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    mount(
      <ActionDialog
        target={{ resource: 'programs', action: 'create' }}
        userId="owner-1"
        locale="en"
        copy={getAcademyCopy('en')}
        onClose={onClose}
        onSaved={onSaved}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getAllByText('This field is required.')).toHaveLength(2);
    expect(screen.getByRole('textbox', { name: 'Code *' })).toHaveFocus();
    fireEvent.change(screen.getByRole('textbox', { name: 'Code *' }), {
      target: { value: 'HR-2026' },
    });
    fireEvent.change(screen.getByRole('textbox', { name: 'Name (English) *' }), {
      target: { value: 'Human Resources' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ id: 'program-1', version: 1 }));
    expect(onClose).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/v1/programs',
      expect.objectContaining({
        body: JSON.stringify({ name: 'Human Resources', code: 'HR-2026' }),
      }),
    );
  });

  it('toggles required module checkbox in curriculum editor', () => {
    mount(
      <ActionDialog
        target={{
          resource: 'programs',
          action: 'createVersion',
          row: {
            id: 'program-1',
            name: 'HR Program',
            status: 'ACTIVE',
            version: 1,
            code: 'HR',
            data: {
              modules: [
                {
                  id: 'mod-1',
                  moduleId: 'module-hr',
                  required: true,
                  module: { name: 'HR Fundamentals' },
                },
              ],
            },
          },
        }}
        userId="owner-1"
        locale="en"
        copy={getAcademyCopy('en')}
        onClose={vi.fn()}
        onSaved={vi.fn()}
      />,
    );

    const checkbox = screen.getByRole('checkbox', { name: 'Required module' });
    expect(checkbox).toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).not.toBeChecked();

    fireEvent.click(checkbox);
    expect(checkbox).toBeChecked();
  });
});
