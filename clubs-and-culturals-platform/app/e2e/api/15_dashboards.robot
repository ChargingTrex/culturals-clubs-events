*** Settings ***
Documentation     The dashboards read from the same rows as everything else: the Dean's overview counts equal the
...               database, clashes rise and fall with bookings and moves, the semester report's headline figures
...               are the database's aggregates, the club's budget list totals are the sums of its lines, and the
...               envelope's utilisation is the sum of what was sanctioned this year.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Everyone Signs In
Test Tags         api    dashboards    unit


*** Test Cases ***
Pending approvals on the overview equal the pending requests in the database
    [Tags]    smoke
    ${o}=    Overview    ${dean}
    ${pending}=    Count Rows    governance_approvalrequest    state = 'pending'
    Should Be Equal As Integers    ${o.json()}[pending_approvals]    ${pending}
    ${by_stage}=    Evaluate    sum($o.json()['pending_by_stage'].values())
    Should Be Equal As Integers    ${by_stage}    ${pending}
    ${dean_stage}=    Count Rows    governance_approvalrequest    state = 'pending' and current_stage = 'dean'
    Should Be Equal As Integers    ${o.json()}[pending_by_stage][dean]    ${dean_stage}
    ${queue}=    GET As    ${dean}    /governance/approvals/queue
    Should Be Equal As Integers    ${queue.json()}[count]    ${dean_stage}

A new proposal raises the pending count by one
    ${before}=    Overview    ${dean}
    ${p}=    Propose    ${treasurer}    E2E Dash Pending    Music Room    ${110}    Sound=1500
    ${after}=    Overview    ${dean}
    Should Be Equal As Integers    ${after.json()}[pending_approvals]    ${before.json()['pending_approvals'] + 1}
    Should Be Equal As Integers    ${after.json()}[pending_by_stage][cultural_society]    ${before.json()['pending_by_stage'].get('cultural_society', 0) + 1}

Venue clashes rise when two clubs ask for one hour, and fall when the Dean moves one
    [Tags]    smoke
    ${before}=    Overview    ${dean}
    ${a}=    Propose    ${treasurer}    E2E Dash Clash Music    Seminar Hall B    ${111}    Sound=1000
    ${b}=    Propose    ${dance}    E2E Dash Clash Dance    Seminar Hall B    ${111}    Stage=1000
    ${during}=    Overview    ${dean}
    Should Be Equal As Integers    ${during.json()}[venue_clashes]    ${before.json()['venue_clashes'] + 1}
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    Reassign    ${dean}    ${b}[event]    to_venue=${amphi}[id]    reason=The Music Club asked for the hall first
    ${after}=    Overview    ${dean}
    Should Be Equal As Integers    ${after.json()}[venue_clashes]    ${before.json()}[venue_clashes]
    ${e}=    Row By Id    events_event    ${b}[event]
    Should Be Equal    ${e}[venue_id]    ${{ $amphi['id'].replace('-', '') }}

Events missing a report are the completed ones that ended more than the grace period ago
    ${o}=    Overview    ${dean}
    ${due}=    Count Rows    events_event    status = 'completed' and ends_at < datetime('now', '-7 days')
    Length Should Be    ${o.json()}[events_missing_report]    ${due}
    ${reported}=    Evaluate    [e for e in $o.json()['missing_evidence'] if not e.get('missing')]
    Should Be Empty    ${reported}

Active clubs on the overview are those with a completed event this semester
    ${o}=    Overview    ${dean}
    ${active}=    Scalar    select count(distinct e.club_id) from events_event e join identity_semester s on s.is_current = 1 where e.status in ('completed', 'reported') and date(e.starts_at) between s.starts_on and s.ends_on
    Should Be Equal As Integers    ${o.json()}[clubs_active]    ${active}
    ${total}=    Count Rows    clubs_club    status = 'active'
    Should Be Equal As Integers    ${o.json()}[clubs_total]    ${total}
    Length Should Be    ${o.json()}[clubs_inactive]    ${{ int($total) - int($active) }}

The overview is for the Dean, the Vice-Chancellor and the Society; a student or a member is refused
    Overview    ${vc}
    Overview    ${society}
    ${r}=    Overview    ${student}    expected=403
    Problem Code Should Be    ${r}    REPORTING_DENIED
    ${r}=    Overview    ${member}    expected=403
    Problem Code Should Be    ${r}    REPORTING_DENIED
    ${r}=    Overview    ${treasurer}    expected=403
    Problem Code Should Be    ${r}    REPORTING_DENIED

The semester report's headline figures are the database's aggregates
    [Tags]    smoke
    ${r}=    Semester Report    ${vc}
    ${report}=    Set Variable    ${r.json()}
    ${events_run}=    Scalar    select count(*) from events_event e join identity_semester s on s.is_current = 1 where e.status in ('completed', 'reported') and date(e.starts_at) between s.starts_on and s.ends_on
    Should Be Equal As Integers    ${report}[events_run]    ${events_run}
    ${participation}=    Scalar    select count(*) from participation_registration r join events_event e on e.id = r.event_id join identity_semester s on s.is_current = 1 where r.attended = 1 and r.cancelled_at is null and e.status in ('completed', 'reported') and date(e.starts_at) between s.starts_on and s.ends_on
    Should Be Equal As Integers    ${report}[total_participation]    ${participation}
    ${unique}=    Scalar    select count(distinct r.student_id) from participation_registration r join events_event e on e.id = r.event_id join identity_semester s on s.is_current = 1 where r.attended = 1 and r.cancelled_at is null and r.student_id is not null and e.status in ('completed', 'reported') and date(e.starts_at) between s.starts_on and s.ends_on
    Should Be Equal As Integers    ${report}[unique_students]    ${unique}
    ${sanctioned}=    Scalar    select coalesce(sum(l.amount_sanctioned), 0) from budget_budgetline l join budget_budget b on b.id = l.budget_id join events_event e on e.id = b.event_id join identity_semester s on s.is_current = 1 where e.status in ('completed', 'reported') and date(e.starts_at) between s.starts_on and s.ends_on
    Should Be Equal As Numbers    ${report}[money][sanctioned]    ${sanctioned}
    Length Should Be    ${report}[events]    ${events_run}

The CSV carries the same headline figure
    ${headers}=    Bearer    ${vc}
    ${csv}=    GET On Session    api    /reporting/reports/semester/csv    headers=${headers}
    Should Contain    ${csv.headers}[Content-Type]    text/csv
    Should Contain    ${csv.text}    unique_students
    ${r}=    Semester Report    ${vc}
    Should Contain    ${csv.text}    ${{ str($r.json()['unique_students']) }}

The club's budget list totals are the sums of its stored lines
    ${r}=    GET As    ${treasurer}    /budget/budgets    200    page_size=200
    Should Not Be Empty    ${r.json()}[results]
    FOR    ${b}    IN    @{r.json()}[results]
        ${requested}=    Scalar    select coalesce(sum(amount_requested), 0) from budget_budgetline where budget_id = replace(?, '-', '')    ${b}[id]
        Should Be Equal As Numbers    ${b}[total_requested]    ${requested}    msg=${b}[id] total_requested
        ${sanctioned}=    Scalar    select coalesce(sum(amount_sanctioned), 0) from budget_budgetline where budget_id = replace(?, '-', '')    ${b}[id]
        Should Be Equal As Numbers    ${b}[total_sanctioned]    ${sanctioned}    msg=${b}[id] total_sanctioned
        ${stage}=    Scalar    select stage from budget_budget where id = replace(?, '-', '')    ${b}[id]
        Should Be Equal    ${b}[stage]    ${stage}
    END
    ${stored}=    Scalar    select count(*) from budget_budget b join events_event e on e.id = b.event_id where e.club_id = replace(?, '-', '')    ${music}
    Should Be Equal As Integers    ${r.json()}[count]    ${stored}

The envelope's utilisation is what was sanctioned this calendar year, and remaining is what is left
    ${year}=    Evaluate    datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Kolkata')).year    modules=datetime,zoneinfo
    Set Envelope    ${dean}    ${music}    300000    year=${year}
    ${r}=    GET As    ${treasurer}    /budget/envelopes/${music}    200    year=${year}
    Should Be Equal As Numbers    ${r.json()}[amount]    300000
    ${sanctioned}=    Scalar    select coalesce(sum(l.amount_sanctioned), 0) from budget_budgetline l join budget_budget b on b.id = l.budget_id join events_event e on e.id = b.event_id where e.club_id = replace(?, '-', '') and b.stage in ('sanctioned', 'settled') and strftime('%Y', datetime(e.starts_at, '+330 minutes')) = ?    ${music}    ${{ str($year) }}
    Should Be Equal As Numbers    ${r.json()}[sanctioned_to_date]    ${sanctioned}
    Should Be Equal As Numbers    ${r.json()}[remaining]    ${{ 300000 - float($sanctioned) }}
    ${r}=    GET As    ${member}    /budget/envelopes/${music}    404    year=${year}


*** Keywords ***
Everyone Signs In
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${dance}=    Login As    ${DANCE_TREASURER_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${dance}
    Set Suite Variable    ${member}
    Set Suite Variable    ${student}
    Set Suite Variable    ${society}
    Set Suite Variable    ${dean}
    Set Suite Variable    ${vc}
    ${music}=    My First Club    ${treasurer}
    Set Suite Variable    ${music}
