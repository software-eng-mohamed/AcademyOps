import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migrationSql = readFileSync(
  new URL('../prisma/migrations/202608100029_phone_otp_login/migration.sql', import.meta.url),
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
      }
    >
  >;
}

describe('Phone OTP login migration and OpenAPI static contract', () => {
  it('contains expected SQL table, constraints, indexes and triggers', () => {
    expect(migrationSql).toContain('CREATE TABLE phone_otp_challenges');
    expect(migrationSql).toContain('CONSTRAINT phone_otp_challenges_pkey PRIMARY KEY (id)');
    expect(migrationSql).toContain(
      'CONSTRAINT phone_otp_challenges_attempts_check CHECK (attempts >= 0 AND attempts <= 5)',
    );
    expect(migrationSql).toContain(
      'CONSTRAINT phone_otp_challenges_expiry_check CHECK (expires_at > created_at)',
    );
    expect(migrationSql).toContain(
      'CREATE UNIQUE INDEX phone_otp_challenges_organization_id_id_key',
    );
    expect(migrationSql).toContain('phone_otp_challenges_user_state_idx');
    expect(migrationSql).toContain('phone_otp_challenges_phone_state_idx');
    expect(migrationSql).toContain('phone_otp_challenges_user_fk');
    expect(migrationSql).toContain('phone_otp_challenges_identifier_fk');
    expect(migrationSql).toContain('phone_otp_challenges_one_live_challenge');
    expect(migrationSql).toContain(
      'CREATE OR REPLACE FUNCTION phone_otp_challenges_immutable_identity()',
    );
    expect(migrationSql).toContain('CREATE TRIGGER phone_otp_challenges_immutable_identity_guard');
  });

  it('validates phone OTP OpenAPI contract paths and schemas', () => {
    const openapiPath = resolve(__dirname, '../../../packages/api-client/openapi.json');
    const openapi = JSON.parse(readFileSync(openapiPath, 'utf8')) as OpenApiDoc;

    const requestEndpoint = openapi.paths['/api/v1/auth/phone-otp/request']?.post;
    expect(requestEndpoint).toBeDefined();
    expect(requestEndpoint?.responses['202']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/RequestPhoneOtpResponseDto',
    );

    const verifyEndpoint = openapi.paths['/api/v1/auth/phone-otp/verify']?.post;
    expect(verifyEndpoint).toBeDefined();
    expect(verifyEndpoint?.responses['201']?.content?.['application/json']?.schema?.$ref).toBe(
      '#/components/schemas/LoginResponseDto',
    );
  });
});
