import { readFileSync } from 'fs';
import { resolve } from 'path';
import { describe, expect, it } from 'vitest';
interface OpenApiDoc {
  components: {
    schemas: Record<
      string,
      {
        properties?: Record<string, unknown>;
      }
    >;
  };
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
      }
    >
  >;
}
describe('IAM OpenAPI Contract', () => {
  const openapiPath = resolve(__dirname, '../../../packages/api-client/openapi.json');
  const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDoc;
  const expectations = [
    {
      path: '/api/v1/auth/login',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/LoginResponseDto',
    },
    {
      path: '/api/v1/auth/me',
      method: 'get',
      status: 200,
      schemaRef: '#/components/schemas/CurrentUserSummaryDto',
    },
    {
      path: '/api/v1/auth/me/preferences',
      method: 'patch',
      status: 200,
      schemaRef: '#/components/schemas/CurrentUserSummaryDto',
    },
    {
      path: '/api/v1/auth/me/onboarding/complete',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/CurrentUserSummaryDto',
    },
    { path: '/api/v1/auth/password/change', method: 'post', status: 204, noContent: true },
    {
      path: '/api/v1/auth/password/reset/request',
      method: 'post',
      status: 202,
      schemaRef: '#/components/schemas/RequestPasswordResetResponseDto',
    },
    { path: '/api/v1/auth/password/reset/complete', method: 'post', status: 204, noContent: true },
    { path: '/api/v1/auth/logout', method: 'post', status: 201, noContent: true },
    {
      path: '/api/v1/auth/mfa/totp/enroll',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/EnrollMfaResponseDto',
    },
    {
      path: '/api/v1/auth/mfa/totp/{factorId}/verify',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/VerifyMfaResponseDto',
    },
    {
      path: '/api/v1/auth/mfa/step-up',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/StepUpMfaResponseDto',
    },
    {
      path: '/api/v1/auth/mfa/recovery-codes/regenerate',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/RegenerateRecoveryCodesResponseDto',
    },
    {
      path: '/api/v1/branches',
      method: 'get',
      status: 200,
      schemaRef: '#/components/schemas/BranchesPageDto',
    },
    {
      path: '/api/v1/branches/{id}',
      method: 'get',
      status: 200,
      schemaRef: '#/components/schemas/BranchDto',
    },
    {
      path: '/api/v1/branches',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/BranchDto',
    },
    {
      path: '/api/v1/branches/{id}',
      method: 'patch',
      status: 200,
      schemaRef: '#/components/schemas/BranchDto',
    },
    {
      path: '/api/v1/roles',
      method: 'get',
      status: 200,
      schemaRef: '#/components/schemas/RolesPageDto',
    },
    {
      path: '/api/v1/roles/{id}',
      method: 'get',
      status: 200,
      schemaRef: '#/components/schemas/RoleWithGrantsDto',
    },
    {
      path: '/api/v1/roles',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/RoleWithGrantsDto',
    },
    {
      path: '/api/v1/roles/{id}',
      method: 'patch',
      status: 200,
      schemaRef: '#/components/schemas/RoleDto',
    },
    {
      path: '/api/v1/roles/{id}/grants',
      method: 'put',
      status: 200,
      schemaRef: '#/components/schemas/ReplaceGrantsResponseDto',
    },
    {
      path: '/api/v1/users',
      method: 'get',
      status: 200,
      schemaRef: '#/components/schemas/UsersPageDto',
    },
    {
      path: '/api/v1/users/{id}',
      method: 'get',
      status: 200,
      schemaRef: '#/components/schemas/UserSummaryDto',
    },
    {
      path: '/api/v1/users',
      method: 'post',
      status: 201,
      schemaRef: '#/components/schemas/UserSummaryDto',
    },
    {
      path: '/api/v1/users/{id}/status',
      method: 'patch',
      status: 200,
      schemaRef: '#/components/schemas/UserSummaryDto',
    },
    {
      path: '/api/v1/users/{id}/roles',
      method: 'put',
      status: 200,
      schemaRef: '#/components/schemas/UserSummaryDto',
    },
    {
      path: '/api/v1/users/{id}/branches',
      method: 'put',
      status: 200,
      schemaRef: '#/components/schemas/UserSummaryDto',
    },
  ];
  expectations.forEach(({ path, method, status, schemaRef, noContent }) => {
    it(`validates ${method.toUpperCase()} ${path} has response ${status}`, () => {
      const endpoint = openapi.paths[path]?.[method];
      expect(endpoint).toBeDefined();
      const response = endpoint.responses[String(status)];
      expect(response).toBeDefined();
      if (noContent) {
        expect(response.content).toBeUndefined();
      } else {
        expect(response.content?.['application/json']?.schema?.$ref).toBe(schemaRef);
      }
    });
  });
  it('exposes one English role name field across IAM contracts', () => {
    const legacyNameFields = [`name${'Ar'}`, `name${'En'}`];
    for (const schemaName of [
      'CreateRoleDto',
      'UpdateRoleDto',
      'RoleDto',
      'RoleWithGrantsDto',
      'UserSummaryRoleDto',
    ]) {
      const properties = openapi.components.schemas[schemaName]?.properties;
      expect(properties, schemaName).toHaveProperty('name');
      for (const legacyField of legacyNameFields) {
        expect(properties, schemaName).not.toHaveProperty(legacyField);
      }
    }
  });

  it('does not expose legacy localized name fields in any API schema', () => {
    const serializedSchemas = JSON.stringify(openapi.components.schemas);
    expect(serializedSchemas).not.toContain(`"name${'Ar'}"`);
    expect(serializedSchemas).not.toContain(`"name${'En'}"`);
  });
});
