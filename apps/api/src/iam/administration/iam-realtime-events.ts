import type { OutboxInput } from '../../platform/outbox/outbox.service';

type IamAggregate = { organizationId: string; id: string };

function event(
  aggregateType: 'User' | 'Role' | 'Branch',
  aggregate: IamAggregate,
  type: string,
  payload: Record<string, string>,
): OutboxInput {
  return {
    organizationId: aggregate.organizationId,
    aggregateType,
    aggregateId: aggregate.id,
    type,
    payload,
  };
}

export const iamRealtimeEvents = {
  userCreated: (aggregate: IamAggregate, status: string) =>
    event('User', aggregate, 'user.created', { userId: aggregate.id, status }),
  userStatusChanged: (aggregate: IamAggregate, status: string) =>
    event('User', aggregate, 'user.status_changed', { userId: aggregate.id, status }),
  userRolesReplaced: (aggregate: IamAggregate) =>
    event('User', aggregate, 'user.roles_replaced', { userId: aggregate.id }),
  userBranchesReplaced: (aggregate: IamAggregate) =>
    event('User', aggregate, 'user.branches_replaced', { userId: aggregate.id }),
  roleCreated: (aggregate: IamAggregate) =>
    event('Role', aggregate, 'role.created', { roleId: aggregate.id }),
  roleUpdated: (aggregate: IamAggregate) =>
    event('Role', aggregate, 'role.updated', { roleId: aggregate.id }),
  roleGrantsReplaced: (aggregate: IamAggregate) =>
    event('Role', aggregate, 'role.grants_replaced', { roleId: aggregate.id }),
  branchCreated: (aggregate: IamAggregate) =>
    event('Branch', aggregate, 'branch.created', { branchId: aggregate.id }),
  branchUpdated: (aggregate: IamAggregate) =>
    event('Branch', aggregate, 'branch.updated', { branchId: aggregate.id }),
};
