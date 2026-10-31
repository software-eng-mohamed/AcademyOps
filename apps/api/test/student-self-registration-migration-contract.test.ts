import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { requiresStepUpMfa } from '@academyops/contracts';
import { ConflictException } from '@nestjs/common';
import { validateAndDeDuplicateGrants } from '../src/iam/administration/role-grant-policy';

const migrationSql = readFileSync(
  new URL(
    '../prisma/migrations/202608090028_student_self_registration/migration.sql',
    import.meta.url,
  ),
  'utf8',
);

interface OpenApiDoc {
  paths: Record<
    string,
    Record<
      string,
      {
        responses: Record<
          string,
          {
            content?: Record<
              string,
              {
                schema: {
                  $ref: string;
                };
              }
            >;
          }
        >;
        requestBody?: {
          content?: Record<string, { schema: { $ref: string } }>;
        };
      }
    >
  >;
}

describe('Student self-registration migration static contract', () => {
  it('contains the expected SQL statements', () => {
    // 1. Alter User and StudentProfile status constraints
    expect(migrationSql).toContain(
      'ALTER TABLE users DROP CONSTRAINT IF EXISTS users_status_check',
    );
    expect(migrationSql).toContain("status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED')");
    expect(migrationSql).toContain(
      'ALTER TABLE student_profiles DROP CONSTRAINT IF EXISTS student_profiles_portal_status_check',
    );
    expect(migrationSql).toContain(
      "portal_status IN ('PENDING', 'ACTIVE', 'SUSPENDED', 'REJECTED')",
    );

    // 2. Create table and checks
    expect(migrationSql).toContain('CREATE TABLE student_registrations');
    expect(migrationSql).toContain('CONSTRAINT student_registrations_pkey PRIMARY KEY (id)');
    expect(migrationSql).toContain('CONSTRAINT student_registrations_status_check CHECK');
    expect(migrationSql).toContain('CONSTRAINT student_registrations_version_check CHECK');
    expect(migrationSql).toContain('CONSTRAINT student_registrations_review_fields_check CHECK');

    // 3. Unique tenant/person, tenant/user, and reviewer FK
    expect(migrationSql).toContain(
      'CONSTRAINT student_registrations_org_person_uq UNIQUE (organization_id, person_id)',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT student_registrations_org_user_uq UNIQUE (organization_id, user_id)',
    );
    expect(migrationSql).toContain('CONSTRAINT student_registrations_reviewer_fk');

    // 4. Unique active assignment and active login uniqueness indexes
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS user_role_assignments_org_user_role_active_idx',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS user_login_identifiers_org_type_val_active_idx',
    );

    // 5. Trigger transition guard and Owner role grant guard
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION guard_student_registration_transitions()',
    );
    expect(migrationSql).toContain('CREATE TRIGGER student_registration_status_transition_guard');
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION guard_owner_only_registration_permissions()',
    );
  });

  it('contracts require step-up MFA for students.registration.manage', () => {
    expect(requiresStepUpMfa.has('students.registration.manage')).toBe(true);
  });

  it('proves validateAndDeDuplicateGrants rejects student registration manage permission', () => {
    try {
      validateAndDeDuplicateGrants([
        { permissionCode: 'students.registration.manage', scope: 'O' },
      ]);
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual({
        code: 'OWNER_ONLY_PERMISSIONS',
        messageKey: 'roles.ownerOnlyPermissions',
      });
    }

    try {
      validateAndDeDuplicateGrants([{ permissionCode: 'refunds.approve', scope: 'O' }]);
      expect.fail('Should have thrown');
    } catch (err: unknown) {
      expect(err).toBeInstanceOf(ConflictException);
      expect((err as ConflictException).getResponse()).toEqual({
        code: 'OWNER_ONLY_PERMISSIONS',
        messageKey: 'roles.ownerOnlyPermissions',
      });
    }

    const allowed = [
      { permissionCode: 'students.create', scope: 'B' },
      { permissionCode: 'students.read_basic', scope: 'B' },
    ];
    expect(validateAndDeDuplicateGrants(allowed)).toEqual(allowed);
  });

  it('validates student registration OpenAPI contract paths and schemas', () => {
    const openapiPath = resolve(__dirname, '../../../packages/api-client/openapi.json');
    const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDoc;

    const expectations = [
      {
        path: '/api/v1/student-registrations',
        method: 'post',
        status: 202,
        schemaRef: '#/components/schemas/RegistrationResponseDto',
      },
      {
        path: '/api/v1/student-registrations',
        method: 'get',
        status: 200,
        schemaRef: '#/components/schemas/StudentRegistrationsPageDto',
      },
      {
        path: '/api/v1/student-registrations/{id}',
        method: 'get',
        status: 200,
        schemaRef: '#/components/schemas/StudentRegistrationDetailDto',
      },
      {
        path: '/api/v1/student-registrations/{id}/approve',
        method: 'post',
        status: 200,
        schemaRef: '#/components/schemas/StudentRegistrationDetailDto',
      },
      {
        path: '/api/v1/student-registrations/{id}/reject',
        method: 'post',
        status: 200,
        schemaRef: '#/components/schemas/StudentRegistrationDetailDto',
      },
    ];

    expectations.forEach(({ path, method, status, schemaRef }) => {
      const endpoint = openapi.paths[path]?.[method];
      expect(endpoint).toBeDefined();

      const response = endpoint.responses[String(status)];
      expect(response).toBeDefined();
      expect(response.content?.['application/json']?.schema?.$ref).toBe(schemaRef);
    });
    expect(
      openapi.paths['/api/v1/student-registrations/{id}/approve']?.post.requestBody?.content?.[
        'application/json'
      ]?.schema.$ref,
    ).toBe('#/components/schemas/ApproveStudentRegistrationDto');
  });
});
