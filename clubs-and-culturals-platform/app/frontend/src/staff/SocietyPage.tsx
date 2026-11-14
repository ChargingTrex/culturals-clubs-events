/**
 * AR-08: the Cultural Society's roster.
 *
 * The Secretary and Vice-Secretary add and remove members. Appointing or removing
 * an officer is the Dean's (or an administrator's). The API decides both and says
 * so in `can_manage`, `can_appoint_officers` and each row's `can_remove`.
 */
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import type { ApiError } from '../shared/api/client';
import { Button } from '../shared/ds';
import { Empty, Loading } from '../shared/ui/Empty';
import { Pill } from '../shared/ui/Pill';
import { ProblemView } from '../shared/ui/ProblemView';
import { useToast } from '../shared/ui/Toast';
import { STAFF_KEYS, staffApi, type SocietyMember, type SocietyRole, type SocietyRoster } from './api';

const ROLE_OPTIONS: { value: SocietyRole; label: string }[] = [
  { value: 'cultural_society', label: 'Member' },
  { value: 'cultural_society_secretary', label: 'Secretary' },
  { value: 'cultural_society_vice_secretary', label: 'Vice-Secretary' },
];

function AddForm({ canAppoint }: { canAppoint: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<SocietyRole>('cultural_society');
  const add = useMutation<SocietyRoster, ApiError>({
    mutationFn: () => staffApi.societyAdd({ email: email.trim(), role }),
    onSuccess: (roster) => {
      queryClient.setQueryData(STAFF_KEYS.society, roster);
      toast.show(`${email.trim()} added; they are told, and it applies at their next sign-in`);
      setEmail('');
      setRole('cultural_society');
    },
  });
  return (
    <form
      aria-label="Add to the Society"
      className="mb-5 grid gap-3 rounded-lg border border-line bg-surface p-4 sm:grid-cols-[1fr_auto_auto] sm:items-end"
      onSubmit={(e) => {
        e.preventDefault();
        add.mutate();
      }}
    >
      <label className="grid gap-1 text-label-md">
        Institutional email
        <input
          type="email"
          required
          className="field"
          placeholder="name@college.edu"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </label>
      {canAppoint ? (
        <label className="grid gap-1 text-label-md">
          Role
          <select className="field" value={role} onChange={(e) => setRole(e.target.value as SocietyRole)}>
            {ROLE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <Button type="submit" disabled={add.isPending || email.trim() === ''}>
        Add
      </Button>
      {add.error ? (
        <div className="sm:col-span-3">
          <ProblemView error={add.error} />
        </div>
      ) : null}
    </form>
  );
}

function Row({ m }: { m: SocietyMember }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [confirming, setConfirming] = useState(false);
  const remove = useMutation<SocietyRoster, ApiError>({
    mutationFn: () => staffApi.societyRemove(m.user_id),
    onSuccess: (roster) => {
      queryClient.setQueryData(STAFF_KEYS.society, roster);
      toast.show(`${m.display_name} removed from the Society`);
    },
  });
  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 last:border-b-0">
      <div className="min-w-0 flex-1">
        <div className="font-semibold">{m.display_name}</div>
        <div className="truncate text-body-md text-ink-muted">{m.email}</div>
      </div>
      <Pill tone={m.role === 'cultural_society' ? 'plain' : 'ok'}>{m.role_label}</Pill>
      {m.can_remove ? (
        confirming ? (
          <span className="flex gap-2">
            <Button
              size="sm"
              variant="danger"
              disabled={remove.isPending}
              aria-label={`Confirm removing ${m.display_name}`}
              onClick={() => remove.mutate()}
            >
              Remove
            </Button>
            <Button size="sm" variant="outlined" onClick={() => setConfirming(false)}>
              Keep
            </Button>
          </span>
        ) : (
          <Button
            size="sm"
            variant="outlined"
            aria-label={`Remove ${m.display_name}`}
            onClick={() => setConfirming(true)}
          >
            Remove
          </Button>
        )
      ) : null}
      {remove.error ? (
        <div className="basis-full">
          <ProblemView error={remove.error} />
        </div>
      ) : null}
    </li>
  );
}

export function SocietyPage() {
  const roster = useQuery<SocietyRoster, ApiError>({
    queryKey: STAFF_KEYS.society,
    queryFn: staffApi.society,
  });
  const data = roster.data;
  return (
    <>
      <div className="mb-5">
        <h1>Society members</h1>
        <p className="mt-1.5 max-w-[62ch] text-ink-muted">
          The Secretary and Vice-Secretary approve proposals for the Cultural Society, can move a
          proposal&rsquo;s time or venue while it is with them, and keep this list. Members see the
          calendar and reports. The Dean appoints the two officers.
        </p>
      </div>
      {roster.isPending ? <Loading label="Loading the Society…" /> : null}
      {roster.error ? <ProblemView error={roster.error} /> : null}
      {data ? (
        <>
          {data.can_manage ? <AddForm canAppoint={data.can_appoint_officers} /> : null}
          {data.members.length === 0 ? (
            <Empty>Nobody is in the Cultural Society yet.</Empty>
          ) : (
            <ul
              aria-label="Cultural Society"
              className="m-0 list-none rounded-lg border border-line bg-surface p-0"
            >
              {data.members.map((m) => (
                <Row key={m.user_id} m={m} />
              ))}
            </ul>
          )}
        </>
      ) : null}
    </>
  );
}
