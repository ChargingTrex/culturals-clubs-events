import { useMutation, useQuery } from '@tanstack/react-query';
import type { ApiError } from '../shared/api/client';
import { BarChart, BudgetSheet, BudgetSummary, Button } from '../shared/ds';
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
  const money = r.money ?? { requested: '0', sanctioned: '0', spent: '0' };
  const events = r.events ?? [];

  return (
    <>
      <div className="mb-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1>Semester report</h1>
          <p className="mt-1.5 text-ink-muted">
            {semesterName}
            {r.semester?.starts_on
              ? ` · ${fmtDate(r.semester.starts_on)} – ${fmtDate(r.semester.ends_on)}`
              : ''}{' '}
            · aggregates only, no individual records.
          </p>
        </div>
        <Button
          icon="download"
          disabled={csv.isPending}
          onClick={() => csv.mutate(`semester-report-${semesterName.replace(/\s+/g, '-')}.csv`)}
        >
          {csv.isPending ? 'Preparing…' : 'Download CSV'}
        </Button>
      </div>
      {csv.error ? <ProblemView error={csv.error} /> : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5 lg:gap-5">
        <Tile label="Events run" value={r.events_run ?? 0} />
        <Tile label="Participation" value={r.total_participation ?? 0} hint="attendances" />
        <Tile label="Unique students" value={r.unique_students ?? 0} />
        <Tile label="Avg attendance" value={r.avg_attendance ?? 0} hint="per event" />
        <Tile label="External guests" value={r.external_participants ?? 0} />
      </div>

      <div className="mt-5 grid gap-3.5 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:gap-5">
        <Tile
          label="Requested"
          value={inr(money.requested)}
          hint="by clubs, across every budget this semester"
        />
        <BudgetSummary
          title="Money"
          subtitle="Spent against what the approvers sanctioned"
          sanctioned={Number(money.sanctioned)}
          spent={Number(money.spent)}
        />
      </div>

      <div className="mt-5 grid gap-3.5 lg:grid-cols-2 lg:gap-5">
        <section className="panel">
          <h3>Attendance by club</h3>
          <p className="mb-3 text-body-md text-ink-muted">
            Check-ins across the club&apos;s events
          </p>
          {(r.by_club ?? []).length === 0 ? (
            <p className="text-body-md text-ink-muted">No events run yet.</p>
          ) : (
            <BarChart
              label="Attendance by club"
              valueLabel="Attendance"
              data={r.by_club.map((c) => ({
                key: c.club_id,
                label: c.club,
                value: c.attendance,
                note: `${c.events_run} event${c.events_run === 1 ? '' : 's'}`,
              }))}
            />
          )}
        </section>
        <section className="panel">
          <h3>Attendance by category</h3>
          <p className="mb-3 text-body-md text-ink-muted">Clubs grouped by category</p>
          {(r.by_category ?? []).length === 0 ? (
            <p className="text-body-md text-ink-muted">No events run yet.</p>
          ) : (
            <BarChart
              label="Attendance by category"
              valueLabel="Attendance"
              data={r.by_category.map((c) => ({
                key: c.category,
                label: cap(c.category),
                value: c.attendance,
                note: `${c.clubs_active} club${c.clubs_active === 1 ? '' : 's'} · ${c.events_run} event${c.events_run === 1 ? '' : 's'}`,
              }))}
            />
          )}
          {(r.by_department ?? []).length > 0 ? (
            <>
              <h3 className="mt-6">Attendance by department</h3>
              <p className="mb-3 text-body-md text-ink-muted">
                Where the students who came are from
              </p>
              <BarChart
                label="Attendance by department"
                valueLabel="Attendance"
                labelWidth="12rem"
                data={r.by_department.map((d) => ({
                  key: d.department,
                  label: d.department,
                  value: d.attendance,
                  note: `${d.students_reached} student${d.students_reached === 1 ? '' : 's'}`,
                }))}
              />
            </>
          ) : null}
        </section>
      </div>

      <div className="mt-5">
        {events.length === 0 ? (
          <Empty>No completed events this semester.</Empty>
        ) : (
          <BudgetSheet
            title="Events"
            subtitle={`${events.length} completed this semester`}
            columns={[
              { key: 'event', label: 'Event', wrap: true },
              { key: 'date', label: 'Date' },
              { key: 'attended', label: 'Attended', align: 'right' },
              { key: 'photos', label: 'Photos', type: 'number' },
              { key: 'posts', label: 'Posts', type: 'number' },
              { key: 'sanctioned', label: 'Sanctioned', type: 'money' },
              { key: 'spent', label: 'Spent', type: 'money' },
            ]}
            rows={events.map((e) => ({
              id: e.id,
              cells: {
                event: (
                  <span className="block py-1.5">
                    <strong>{e.title}</strong>
                    <span className="block caption text-ink-muted">{e.club}</span>
                  </span>
                ),
                date: fmtDate(e.starts_at),
                attended: (
                  <span className="figure-md">
                    {e.attended}
                    <span className="text-ink-muted">/{e.registered}</span>
                  </span>
                ),
                photos: e.photos,
                posts: e.social_links.length,
                sanctioned: Number(e.sanctioned),
                spent: Number(e.spent),
              },
              over: {
                spent: Number(e.sanctioned) > 0 && Number(e.spent) > Number(e.sanctioned),
              },
            }))}
            totals={['sanctioned', 'spent']}
          />
        )}
      </div>

      {(r.caveats ?? []).length > 0 ? (
        <div className="note mt-5">
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
