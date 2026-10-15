import type { AssignmentRule, Group, GroupRole, Membership, User } from './types';

function matches(rule: AssignmentRule, u: User): boolean {
  if (rule.schoolRoles && !rule.schoolRoles.includes(u.schoolRole)) return false;
  if (rule.grades && (u.grade == null || !rule.grades.includes(u.grade))) return false;
  if (rule.sectionIds && !u.sectionIds?.some((s) => rule.sectionIds!.includes(s))) return false;
  if (rule.teamIds && !u.teamIds?.some((t) => rule.teamIds!.includes(t))) return false;
  if (rule.clubIds && !u.clubIds?.some((c) => rule.clubIds!.includes(c))) return false;
  return true;
}

const better = (a: GroupRole, b: GroupRole) =>
  (['owner', 'moderator', 'member', 'subscriber'].indexOf(a) <
   ['owner', 'moderator', 'member', 'subscriber'].indexOf(b) ? a : b);

/**
 * Re-evaluate rule-based membership from roster data.
 * Manual memberships are never touched; rule memberships are added or removed
 * so the group always mirrors the roster (e.g. a student changes periods).
 */
export function syncRuleMemberships(group: Group, users: User[], existing: Membership[], now = new Date().toISOString()): Membership[] {
  const manual = existing.filter((m) => m.groupId === group.id && m.source !== 'rule');
  const manualIds = new Set(manual.map((m) => m.userId));
  const want = new Map<string, { role: GroupRole; ruleId: string }>();

  const add = (userId: string, role: GroupRole, ruleId: string) => {
    if (manualIds.has(userId)) return;
    const cur = want.get(userId);
    want.set(userId, cur ? { role: better(cur.role, role), ruleId: cur.ruleId } : { role, ruleId });
  };

  for (const rule of group.assignmentRules) {
    for (const u of users) {
      if (!matches(rule, u)) continue;
      add(u.id, rule.assignAs, rule.id);
      if (rule.includeGuardiansAs) {
        for (const g of users.filter((p) => p.guardianOf?.includes(u.id))) add(g.id, rule.includeGuardiansAs, rule.id);
      }
    }
  }

  const prev = new Map(existing.filter((m) => m.groupId === group.id && m.source === 'rule').map((m) => [m.userId, m]));
  const ruled: Membership[] = [...want].map(([userId, w]) => ({
    ...(prev.get(userId) ?? { joinedAt: now }),
    groupId: group.id, userId, role: w.role, source: 'rule', ruleId: w.ruleId,
  }) as Membership);

  return [...manual, ...ruled];
}
