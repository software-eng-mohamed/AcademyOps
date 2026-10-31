export type SessionTrainer = {
  trainerId: string;
  role: 'PRIMARY' | 'ASSISTANT';
  label?: string;
  uiKey?: string;
};
export function sessionTrainers(raw: string): SessionTrainer[] {
  try {
    const items: unknown = JSON.parse(raw);
    return Array.isArray(items) ? items : [];
  } catch {
    return [];
  }
}
export function validSessionTrainers(raw: string): boolean {
  try {
    const items: unknown = JSON.parse(raw);
    return (
      Array.isArray(items) &&
      items.length <= 25 &&
      items.every(
        (item) =>
          item &&
          typeof item.trainerId === 'string' &&
          item.trainerId.trim() &&
          ['PRIMARY', 'ASSISTANT'].includes(item.role),
      ) &&
      new Set(items.map((item) => item.trainerId)).size === items.length
    );
  } catch {
    return false;
  }
}
