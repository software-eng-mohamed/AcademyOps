import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { PermissionGrantDto } from '@/api/generated/models/permissionGrantDto';
import { PermissionGrantDtoPermissionCode } from '@/api/generated/models/permissionGrantDtoPermissionCode';
import type { DashboardUser } from '@/features/dashboard/dashboard-user';
import { RoleGrantsEditor } from '@/features/system/role-grants-editor';

const mockUser: DashboardUser = {
  id: 'owner-1',
  name: 'Owner User',
  branches: [],
  organization: { name: 'AcademyOps' },
  roles: [{ code: 'OWNER', name: 'Owner' }],
  permissions: Object.values(PermissionGrantDtoPermissionCode).map((code) => ({
    code: code as never,
    scopes: ['O', 'B'],
  })),
};

describe('RoleGrantsEditor categorized multi-select', () => {
  afterEach(() => {
    cleanup();
  });
  it('renders categorized permission pills and human-readable names in Arabic', () => {
    const onChange = vi.fn();
    render(<RoleGrantsEditor grants={[]} onChange={onChange} user={mockUser} locale="ar" />);

    expect(screen.getByText('الطلاب')).toBeInTheDocument();
    expect(screen.getByText('المجموعات والدورات')).toBeInTheDocument();
    expect(screen.getByText('المالية والمدفوعات')).toBeInTheDocument();
    expect(screen.getByText('إضافة دارس جديد')).toBeInTheDocument();
    expect(screen.getByText('students.create')).toBeInTheDocument();
  });

  it('selects multiple permissions via checkboxes', () => {
    let currentGrants: PermissionGrantDto[] = [];
    const onChange = vi.fn((newGrants: PermissionGrantDto[]) => {
      currentGrants = newGrants;
    });

    const { rerender } = render(
      <RoleGrantsEditor grants={currentGrants} onChange={onChange} user={mockUser} locale="ar" />,
    );

    const firstCheckbox = screen.getByRole('checkbox', {
      name: /عرض ملفات الطلاب الأساسية/,
    });
    fireEvent.click(firstCheckbox);

    expect(onChange).toHaveBeenCalledWith([{ permissionCode: 'students.read_basic', scope: 'O' }]);

    rerender(
      <RoleGrantsEditor
        grants={[{ permissionCode: 'students.read_basic' as never, scope: 'O' }]}
        onChange={onChange}
        user={mockUser}
        locale="ar"
      />,
    );

    const secondCheckbox = screen.getByRole('checkbox', { name: /إضافة دارس جديد/ });
    fireEvent.click(secondCheckbox);

    expect(onChange).toHaveBeenLastCalledWith([
      { permissionCode: 'students.read_basic', scope: 'O' },
      { permissionCode: 'students.create', scope: 'O' },
    ]);
  });

  it('supports category-level Select All and Deselect All', () => {
    const onChange = vi.fn();
    render(<RoleGrantsEditor grants={[]} onChange={onChange} user={mockUser} locale="ar" />);

    const selectCategoryBtn = screen.getByRole('button', {
      name: 'تحديد كل صلاحيات هذا القسم',
    });
    fireEvent.click(selectCategoryBtn);

    expect(onChange).toHaveBeenCalled();
    const passedGrants = (onChange.mock.calls[0]?.[0] ?? []) as PermissionGrantDto[];
    expect(passedGrants.length).toBe(7); // All 7 students.* permissions
    expect(passedGrants.every((g) => g.permissionCode.startsWith('students.'))).toBe(true);
  });

  it('filters permissions in real time using the search input', () => {
    render(<RoleGrantsEditor grants={[]} onChange={vi.fn()} user={mockUser} locale="en" />);

    const searchInput = screen.getByPlaceholderText('Search by name or code...');
    fireEvent.change(searchInput, { target: { value: 'merge' } });

    expect(screen.getByText('Merge duplicate students')).toBeInTheDocument();
    expect(screen.queryByText('Add new student')).not.toBeInTheDocument();
  });

  it('does not render scope selectors or scope badges in permissions UI', () => {
    render(
      <RoleGrantsEditor
        grants={[{ permissionCode: 'students.read_basic' as never, scope: 'O' }]}
        onChange={vi.fn()}
        user={mockUser}
        locale="ar"
      />,
    );

    // No Scope label or dropdown
    expect(screen.queryByLabelText(/scope/i)).not.toBeInTheDocument();
    expect(screen.queryByText('نطاق الصلاحية')).not.toBeInTheDocument();
    expect(screen.queryByText('الأكاديمية بالكامل (O)')).not.toBeInTheDocument();
    expect(screen.queryByText('(O)')).not.toBeInTheDocument();
  });
});
