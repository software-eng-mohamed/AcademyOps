import type { RealtimeSessionPrincipal } from '../iam/authorization/session-access.service';
import type { RealtimeFanoutMessage, RealtimeTopic } from './realtime.contracts';

export const staffRoom = (organizationId: string) => `org:${organizationId}:staff`;
export const studentRoom = (organizationId: string, personId: string) =>
  `org:${organizationId}:student:${personId}`;

export function roomsForPrincipal(principal: RealtimeSessionPrincipal): string[] {
  const organizationId = principal.accessContext.organizationId;
  const rooms: string[] = [];
  if (principal.isStaff) rooms.push(staffRoom(organizationId));
  if (principal.isStudent && principal.accessContext.studentPersonId) {
    rooms.push(studentRoom(organizationId, principal.accessContext.studentPersonId));
  }
  return rooms;
}

export function roomsForFanout(message: RealtimeFanoutMessage): string[] {
  const rooms = message.studentPersonIds.map((id) => studentRoom(message.organizationId, id));
  if (message.staff) rooms.unshift(staffRoom(message.organizationId));
  return [...new Set(rooms)];
}

export function resyncTopics(isStaff: boolean, isStudent: boolean): RealtimeTopic[] {
  if (isStaff) {
    return ['owner', 'accounts', 'attendance', 'student', 'calendar', 'notifications', 'messaging'];
  }
  return isStudent ? ['accounts', 'attendance', 'student', 'calendar', 'notifications'] : [];
}
