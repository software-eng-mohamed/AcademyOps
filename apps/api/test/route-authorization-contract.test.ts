import { readdirSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

const httpDecorators = new Set(['Get', 'Post', 'Put', 'Patch', 'Delete']);
const authenticatedSelfService = new Set([
  'AuthController.logout',
  'AuthController.me',
  'AuthController.updatePreferences',
  'AuthController.completeOnboarding',
  'AuthController.changePassword',
  'MfaController.enroll',
  'MfaController.verify',
  'MfaController.stepUp',
  'MfaController.regenerateRecoveryCodes',
  'NotificationsController.list',
  'NotificationsController.markRead',
  'NotificationsController.markAllRead',
  'RealtimeTicketController.issue',
  'SearchController.list',
  'SearchController.recordRecent',
]);
// This route selects a role-specific permission AND scope matrix in the service.
// It is not self-service: the HTTP no-grants matrix must still reject it.
const serviceAuthorized = new Set(['WorkspaceOverviewController.overview']);

function decoratorName(decorator: ts.Decorator): string | undefined {
  const expression = decorator.expression;
  const target = ts.isCallExpression(expression) ? expression.expression : expression;
  return ts.isIdentifier(target) ? target.text : undefined;
}

function decorators(node: ts.Node): string[] {
  if (!ts.canHaveDecorators(node)) return [];
  return (ts.getDecorators(node) ?? []).map(decoratorName).filter((name) => name !== undefined);
}

function controllerFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return controllerFiles(path);
    return entry.name.endsWith('.controller.ts') ? [path] : [];
  });
}

type RouteSecurity = {
  id: string;
  public: boolean;
  permission: boolean;
  rateLimited: boolean;
};

function readRouteSecurity(): RouteSecurity[] {
  const sourceRoot = resolve(__dirname, '../src');
  return controllerFiles(sourceRoot).flatMap((file) => {
    const source = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TS,
    );
    const routes: RouteSecurity[] = [];
    source.forEachChild((node) => {
      if (!ts.isClassDeclaration(node) || !node.name) return;
      const classDecorators = decorators(node);
      for (const member of node.members) {
        if (!ts.isMethodDeclaration(member) || !member.name || !ts.isIdentifier(member.name)) {
          continue;
        }
        const methodDecorators = decorators(member);
        if (!methodDecorators.some((name) => httpDecorators.has(name))) continue;
        routes.push({
          id: `${node.name.text}.${member.name.text}`,
          public: [...classDecorators, ...methodDecorators].includes('Public'),
          permission: [...classDecorators, ...methodDecorators].includes('RequirePermission'),
          rateLimited: [...classDecorators, ...methodDecorators].includes('RateLimit'),
        });
      }
    });
    return routes;
  });
}

describe('route authorization contract', () => {
  const routes = readRouteSecurity();

  it('classifies every controller route exactly once', () => {
    const unclassified = routes.filter(
      (route) =>
        !route.public &&
        !route.permission &&
        !authenticatedSelfService.has(route.id) &&
        !serviceAuthorized.has(route.id),
    );
    const conflicting = routes.filter(
      (route) =>
        Number(route.public) +
          Number(route.permission) +
          Number(authenticatedSelfService.has(route.id)) +
          Number(serviceAuthorized.has(route.id)) !==
        1,
    );

    expect(
      unclassified,
      'Routes need Public, RequirePermission, or a reviewed service authorization boundary',
    ).toEqual([]);
    expect(conflicting, 'Routes must have one authorization classification').toEqual([]);
  });

  it('keeps the reviewed self-service allowlist exact', () => {
    const routeIds = new Set(routes.map((route) => route.id));
    expect([...authenticatedSelfService].filter((id) => !routeIds.has(id))).toEqual([]);
    expect([...serviceAuthorized].filter((id) => !routeIds.has(id))).toEqual([]);
  });

  it('rate-limits every public route except minimal health probes', () => {
    const healthRoutes = new Set(['HealthController.live']);
    expect(
      routes
        .filter((route) => route.public && !healthRoutes.has(route.id) && !route.rateLimited)
        .map(({ id }) => id),
    ).toEqual([]);
  });
});
