import { useMutation, useQuery } from '@tanstack/react-query';
import type { ApiError } from '../shared/api/client';
import { fmtDate, inr } from '../shared/format';
import { Empty, Loading } from '../shared/ui/Empty';
import { ProblemView } from '../shared/ui/ProblemView';
import { Tile } from './OverviewPage';
import { STAFF_KEYS, downloadSemesterCsv, staffApi, type SemesterReport } from './api';

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function ReportPage() {
  const report = useQuery<SemesterReport, ApiError>({
    queryKey: STAFF_KEYS.report,
    queryFn: () => staffApi.report(),
  });
  const csv = useMutation<void, ApiError, string>({
    mutationFn: (name) => downloadSemesterCsv(name),
  });

  if (report.isPending) return <Loading />;
  if (report.error) return <ProblemView error={report.error} />;
  const r = report.data;
  const semesterName = r.semester?.name ?? 'Semester';
  const maxClub = Math.max(1, ...(r.by_club ?? []).map((c) => c.attendance));
  const money = r.money ?? { requested: '0', sanctioned: '0', spent: '0' };
  const spentPct =
    Number(money.sanctioned) > 0
      ? Math.min(100, (Number(money.spent) / Number(money.sanctioned)) * 100)
      : 0;

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Semester report</h1>
          <p className="mt-1.5 text-muted">
            {semesterName}
            {r.semester?.starts_on
              ? ` · ${fmtDate(r.semester.starts_on)} – ${fmtDate(r.semester.ends_on)}`
              : ''}{' '}
            · aggregates only, no individual records.
          </p>
        </div>
        <button
          type="button"
          className="btn btn-primary"
          disabled={csv.isPending}
          onClick={() => csv.mutate(`semester-report-${semesterName.replace(/\s+/g, '-')}.csv`)}
        >
          {csv.isPending ? 'Preparing…' : 'Download CSV'}
        </button>
      </div>
      {csv.error ? <ProblemView error={csv.error} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Tile label="Events run" value={r.events_run ?? 0} />
        <Tile label="Participation" value={r.total_participation ?? 0} hint="attendances" />
        <Tile label="Unique students" value={r.unique_students ?? 0} />
        <Tile label="Avg attendance" value={r.avg_attendance ?? 0} hint="per event" />
        <Tile label="External guests" value={r.external_participants ?? 0} />
      </div>

      <section className="panel mt-3.5">
        <h3>Money</h3>
        <div className="mt-2 grid grid-cols-3 gap-3 text-center">
          <div>
            <span className="text-[0.78rem] text-muted uppercase">Requested</span>
            <b className="block font-display text-[1.4rem]">{inr(money.requested)}</b>
          </div>
          <div>
            <span className="text-[0.78rem] text-muted uppercase">Sanctioned</span>
            <b className="block font-display text-[1.4rem]">{inr(money.sanctioned)}</b>
          </div>
          <div>
            <span className="text-[0.78rem] text-muted uppercase">Spent</span>
            <b className="block font-display text-[1.4rem]">{inr(money.spent)}</b>
          </div>
        </div>
        <div className="meter mt-3">
          <i style={{ width: `${spentPct}%` }} />
        </div>
        <p className="mt-1 text-[0.82rem] text-muted">
          {Math.round(spentPct)}% of the sanctioned amount spent
        </p>
      </section>

      <div className="mt-3.5 grid gap-3.5 md:grid-cols-2">
        <section className="panel">
          <h3>By club</h3>
          {(r.by_club ?? []).length === 0 ? (
            <p className="mt-2 text-[0.9rem] text-muted">No events run yet.</p>
          ) : (
            <ul className="mt-2.5 flex list-none flex-col gap-2 p-0 text-[0.9rem]">
              {r.by_club.map((c) => (
                <li key={c.club_id} className="grid grid-cols-[1fr_1.4fr_auto] items-center gap-3">
                  <span className="truncate">
                    <strong>{c.club}</strong>{' '}
                    <span className="text-muted">· {c.events_run} ev</span>
                  </span>
                  <span className="meter">
                    <i style={{ width: `${(c.attendance / maxClub) * 100}%` }} />
                  </span>
                  <b>{c.attendance}</b>
                </li>
              ))}
            </ul>
          )}
        </section>
        <section className="panel">
          <h3>By category</h3>
          <table className="mt-2 w-full text-[0.9rem]">
            <thead>
              <tr className="text-left text-[0.76rem] text-muted uppercase">
                <th className="py-1 font-semibold">Category</th>
                <th className="py-1 text-right font-semibold">Clubs</th>
                <th className="py-1 text-right font-semibold">Events</th>
                <th className="py-1 text-right font-semibold">Attendance</th>
              </tr>
            </thead>
            <tbody>
              {(r.by_category ?? []).map((c) => (
                <tr key={c.category} className="border-t border-line">
                  <td className="py-1.5">{cap(c.category)}</td>
                  <td className="py-1.5 text-right">{c.clubs_active}</td>
                  <td className="py-1.5 text-right">{c.events_run}</td>
                  <td className="py-1.5 text-right">{c.attendance}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {(r.by_department ?? []).length > 0 ? (
            <>
              <h3 className="mt-5">By department</h3>
              <table className="mt-2 w-full text-[0.9rem]">
                <tbody>
                  {r.by_department.map((d) => (
                    <tr key={d.department} className="border-t border-line first:border-t-0">
                      <td className="py-1.5">{d.department}</td>
                      <td className="py-1.5 text-right text-muted">
                        {d.students_reached} students
                      </td>
                      <td className="py-1.5 text-right">{d.attendance}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          ) : null}
        </section>
      </div>

      <section className="panel mt-3.5 overflow-x-auto">
        <h3>Events</h3>
        {(r.events ?? []).length === 0 ? (
          <Empty>No completed events this semester.</Empty>
        ) : (
          <table className="mt-2 w-full min-w-[640px] text-[0.88rem]">
            <thead>
              <tr className="text-left text-[0.74rem] text-muted uppercase">
                <th className="py-1 font-semibold">Event</th>
                <th className="py-1 font-semibold">Date</th>
                <th className="py-1 text-right font-semibold">Attended</th>
                <th className="py-1 text-right font-semibold">Photos</th>
                <th className="py-1 text-right font-semibold">Posts</th>
                <th className="py-1 text-right font-semibold">Sanctioned</th>
                <th className="py-1 text-right font-semibold">Spent</th>
              </tr>
            </thead>
            <tbody>
              {r.events.map((e) => (
                <tr key={e.id} className="border-t border-line">
                  <td className="py-1.5">
                    <strong>{e.title}</strong>
                    <span className="block text-[0.8rem] text-muted">{e.club}</span>
                  </td>
                  <td className="py-1.5">{fmtDate(e.starts_at)}</td>
                  <td className="py-1.5 text-right">
                    {e.attended}
                    <span className="text-muted">/{e.registered}</span>
                  </td>
                  <td className="py-1.5 text-right">{e.photos}</td>
                  <td className="py-1.5 text-right">{e.social_links.length}</td>
                  <td className="py-1.5 text-right">{inr(e.sanctioned)}</td>
                  <td className="py-1.5 text-right">{inr(e.spent)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      {(r.caveats ?? []).length > 0 ? (
        <div className="note mt-3.5">
          <strong>Read with care</strong>
          <ul className="mt-1 ml-4 list-disc">
            {r.caveats.map((c) => (
              <li key={c}>{c}</li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
