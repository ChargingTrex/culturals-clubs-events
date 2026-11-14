/**
 * The approval route, drawn the same way for approvers and for clubs:
 * Club → Cultural Society → Dean → Vice-Chancellor → Sanctioned, with gates the
 * request skips shown as "Not needed" (design system: ApprovalFlow).
 */
import type { components } from './api/schema';
import type { EditRole, FlowStep } from './ds';
import { fmtDate } from './format';

type ApprovalRequest = components['schemas']['ApprovalRequest'];
type ApprovalStage = components['schemas']['ApprovalStageEnum'];

export const ROUTE: ApprovalStage[] = ['cultural_society', 'dean', 'vc'];

export const GATE_NAME: Record<ApprovalStage, string> = {
  cultural_society: 'Cultural Society',
  dean: 'Dean of Student Affairs',
  vc: 'Vice-Chancellor',
};

/** Edit tracking: gates 1–2 are Admin edits (violet), gate 3 is Management (teal). */
export const STAGE_ROLE: Record<ApprovalStage, EditRole> = {
  cultural_society: 'admin',
  dean: 'admin',
  vc: 'management',
};

/** The edit colour a backend role writes in: the Vice-Chancellor is Management (teal), every other approver Admin (violet). */
export const editRoleOf = (role: string | undefined | null): EditRole =>
  role === 'vice_chancellor' ? 'management' : 'admin';

/**
 * What a decision did to the sanctioned total: `{ from, to }` when this step lowered it,
 * `{ to }` when it only carried the figure on, nothing when no money is set yet. A later
 * gate repeats the earlier gate's figure, so the change belongs to the step that made it.
 */
export function sanctionChange(
  steps: ReadonlyArray<{ amount_sanctioned?: string | null }>,
  index: number,
  requested: string | number | null | undefined,
): { from?: number; to?: number } {
  const to = Number(steps[index]?.amount_sanctioned ?? 0);
  if (!(to > 0)) return {};
  const earlier = steps
    .slice(0, index)
    .map((s) => Number(s.amount_sanctioned ?? 0))
    .filter((n) => n > 0);
  const before = earlier.length > 0 ? earlier[earlier.length - 1]! : Number(requested ?? 0);
  return to < before ? { from: before, to } : { to };
}

export function flowSteps(a: ApprovalRequest): FlowStep[] {
  const route = (a.stages as ApprovalStage[] | undefined) ?? [];
  const steps: FlowStep[] = [{ label: 'Club', who: a.club, status: 'done', state: 'Submitted' }];
  for (const stage of ROUTE) {
    const decided = [...a.steps].reverse().find((s) => s.stage === stage);
    const at = decided ? fmtDate(decided.created_at) : undefined;
    const base = { label: GATE_NAME[stage], role: STAGE_ROLE[stage], who: decided?.actor_label };
    if (!route.includes(stage)) steps.push({ ...base, status: 'skipped' });
    else if (decided?.decision === 'reject') steps.push({ ...base, status: 'rejected', at });
    else if (decided?.decision === 'return' && a.current_stage === stage && a.state === 'returned')
      steps.push({ ...base, status: 'returned', at });
    else if (decided?.decision === 'approve') steps.push({ ...base, status: 'done', at });
    else if (a.current_stage === stage && (a.state === 'pending' || a.state === undefined))
      steps.push({
        ...base,
        status: 'current',
        days: a.age_hours != null ? Math.floor(a.age_hours / 24) : undefined,
      });
    else steps.push({ ...base, status: 'upcoming' });
  }
  steps.push({
    label: 'Sanctioned',
    status: a.state === 'approved' ? 'done' : 'upcoming',
    state: a.state === 'approved' ? 'Published' : 'Next',
  });
  return steps;
}
