*** Settings ***
Documentation     Talk to the module API as a person would: sign in, then act with that bearer.
Library           RequestsLibrary
Library           Collections
Library           OperatingSystem


*** Keywords ***
Open API
    Create Session    api    ${API_BASE}

Login As
    [Documentation]    Password sign-in. Pass the MFA code for staff. Returns the access token.
    [Arguments]    ${email}    ${mfa_code}=${EMPTY}
    ${body}=    Create Dictionary    email=${email}    password=${SEED_PASSWORD}
    IF    $mfa_code    Set To Dictionary    ${body}    mfa_code=${mfa_code}
    ${r}=    POST On Session    api    /module/auth/login    json=${body}
    RETURN    ${r.json()}[access_token]

Staff Login As
    [Arguments]    ${email}
    ${token}=    Login As    ${email}    ${MFA_CODE}
    RETURN    ${token}

Bearer
    [Arguments]    ${token}
    ${headers}=    Create Dictionary    Authorization=Bearer ${token}
    RETURN    ${headers}

GET As
    [Arguments]    ${token}    ${path}    ${expected}=200    &{params}
    ${headers}=    Bearer    ${token}
    ${r}=    GET On Session    api    ${path}    headers=${headers}    params=${params}    expected_status=${expected}
    RETURN    ${r}

POST As
    [Arguments]    ${token}    ${path}    ${json}=${None}    ${expected}=200
    ${headers}=    Bearer    ${token}
    ${r}=    POST On Session    api    ${path}    json=${json}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

PATCH As
    [Arguments]    ${token}    ${path}    ${json}    ${expected}=200
    ${headers}=    Bearer    ${token}
    ${r}=    PATCH On Session    api    ${path}    json=${json}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

PUT As
    [Arguments]    ${token}    ${path}    ${json}    ${expected}=200
    ${headers}=    Bearer    ${token}
    ${r}=    PUT On Session    api    ${path}    json=${json}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

Problem Code Should Be
    [Documentation]    RFC 9457 body: the `code` names the rule that refused.
    [Arguments]    ${response}    ${code}
    Should Be Equal    ${response.json()}[code]    ${code}    msg=${response.text}

Me
    [Arguments]    ${token}
    ${r}=    GET As    ${token}    /module/auth/me
    RETURN    ${r.json()}

My First Club
    [Arguments]    ${token}
    ${me}=    Me    ${token}
    RETURN    ${me}[capabilities][clubs][0]

Find Event
    [Documentation]    By exact title, among what this caller can see.
    [Arguments]    ${token}    ${title}
    ${r}=    GET As    ${token}    /events    page_size=200
    ${event}=    Evaluate    [e for e in $r.json()['results'] if e['title'] == $title][0]
    RETURN    ${event}

Find Venue
    [Arguments]    ${token}    ${name}
    ${r}=    GET As    ${token}    /venues    page_size=200
    ${venue}=    Evaluate    [v for v in $r.json()['results'] if v['name'] == $name][0]
    RETURN    ${venue}

Find Approval For Event
    [Arguments]    ${token}    ${event_id}
    ${r}=    GET As    ${token}    /governance/approvals    page_size=200    state=pending
    ${approval}=    Evaluate    [a for a in $r.json()['results'] if a['event'] == $event_id][0]
    RETURN    ${approval}

Decide
    [Arguments]    ${token}    ${approval_id}    ${decision}    ${comment}=${EMPTY}    ${sanctioned}=${None}    ${expected}=200
    ${body}=    Create Dictionary    decision=${decision}    comment=${comment}
    IF    $sanctioned is not None    Set To Dictionary    ${body}    sanctioned=${sanctioned}
    ${r}=    POST As    ${token}    /governance/approvals/${approval_id}/decide    ${body}    ${expected}
    RETURN    ${r}

Approve Through Every Gate
    [Documentation]    Society then Dean, so a fresh proposal ends up published.
    [Arguments]    ${event_id}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${approval}=    Find Approval For Event    ${society}    ${event_id}
    Decide    ${society}    ${approval}[id]    approve
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    Decide    ${dean}    ${approval}[id]    approve

Create Draft Event
    [Documentation]    A priced-later draft: empty budget, not submitted. Starts `days_ahead` days out at `start_hour`:00 India time
    ...    for `hours` hours: bookings are whole campus-clock hours. `club` defaults to the caller's first club.
    [Arguments]    ${token}    ${title}    ${venue_name}    ${days_ahead}    ${capacity}=50    ${expected}=40    ${club}=${None}
    ...    ${start_hour}=10    ${hours}=2    ${kind}=performance    ${status}=201
    IF    $club is None
        ${club}=    My First Club    ${token}
    END
    ${venue}=    Find Venue    ${token}    ${venue_name}
    ${starts}=    Campus Time    ${days_ahead}    ${start_hour}
    ${ends}=    Evaluate    $starts + datetime.timedelta(hours=int($hours))    modules=datetime
    # Finding: the docs call `kind` optional, but omitting it is a 500 (events/views.py create: payload["kind"]).
    ${body}=    Create Dictionary    title=${title}    club=${club}    venue=${venue}[id]    kind=${kind}
    ...    starts_at=${starts.isoformat()}    ends_at=${ends.isoformat()}    capacity=${capacity}
    ...    expected_attendance=${expected}    submit=${False}
    ${r}=    POST As    ${token}    /events    ${body}    ${status}
    RETURN    ${r.json()}

Campus Time
    [Documentation]    An aware datetime `days_ahead` days from today at `hour`:00 on the campus clock (Asia/Kolkata).
    [Arguments]    ${days_ahead}    ${hour}
    ${dt}=    Evaluate    datetime.datetime.combine(datetime.date.today() + datetime.timedelta(days=int($days_ahead)), datetime.time(int($hour)), tzinfo=zoneinfo.ZoneInfo('Asia/Kolkata'))    modules=datetime,zoneinfo
    RETURN    ${dt}

Add Budget Line
    [Arguments]    ${token}    ${budget_id}    ${head}    ${amount}    ${expected}=201
    ${body}=    Create Dictionary    head=${head}    amount_requested=${amount}
    ${r}=    POST As    ${token}    /budget/budgets/${budget_id}/lines    ${body}    ${expected}
    RETURN    ${r}

Register For
    [Arguments]    ${token}    ${event_id}    ${expected}=201
    ${body}=    Create Dictionary    event=${event_id}
    ${r}=    POST As    ${token}    /participation/registrations    ${body}    ${expected}
    RETURN    ${r}

Scan
    [Arguments]    ${token}    ${event_id}    ${code}    ${expected}=200
    ${body}=    Create Dictionary    token=${code}    station_id=E2E
    ${r}=    POST As    ${token}    /participation/events/${event_id}/scan    ${body}    ${expected}
    RETURN    ${r}

Propose
    [Documentation]    A draft for the caller's first club with these budget heads (head=amount), sent for approval.
    ...    Returns event, budget and approval ids, the frozen route, and line ids by head.
    [Arguments]    ${token}    ${title}    ${venue}    ${days}    &{heads}
    ${event}=    Create Draft Event    ${token}    ${title}    ${venue}    ${days}    capacity=30    expected=25
    FOR    ${head}    ${amount}    IN    &{heads}
        ${r}=    Add Budget Line    ${token}    ${event}[budget][id]    ${head}    ${amount}
    END
    ${lines}=    Evaluate    {l['head']: l['id'] for l in $r.json()['lines']}
    ${sent}=    POST As    ${token}    /events/${event}[id]/submit
    ${p}=    Create Dictionary    event=${event}[id]    budget=${event}[budget][id]    approval=${sent.json()}[id]
    ...    stages=${sent.json()}[stages]    lines=${lines}
    RETURN    ${p}

# ---- added with the regression pack (api/09+, ui/16+) ----
DELETE As
    [Arguments]    ${token}    ${path}    ${expected}=204
    ${headers}=    Bearer    ${token}
    ${r}=    DELETE On Session    api    ${path}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

Find Club
    [Documentation]    By exact name, among the clubs this caller can list.
    [Arguments]    ${token}    ${name}
    ${r}=    GET As    ${token}    /clubs    page_size=200
    ${club}=    Evaluate    [c for c in $r.json()['results'] if c['name'] == $name][0]
    RETURN    ${club}

Club Named
    [Documentation]    The club id for a name, looked up with any token (ids are not private).
    [Arguments]    ${token}    ${name}
    ${club}=    Find Club    ${token}    ${name}
    RETURN    ${club}[id]

Join Club
    [Documentation]    201 joined (open club) or 202 requested (approval club); pass `expected` to assert a refusal.
    [Arguments]    ${token}    ${club_id}    ${expected}=any
    ${r}=    POST As    ${token}    /clubs/${club_id}/join    expected=${expected}
    RETURN    ${r}

Leave Club
    [Arguments]    ${token}    ${club_id}    ${expected}=any
    ${r}=    POST As    ${token}    /clubs/${club_id}/leave    expected=${expected}
    RETURN    ${r}

Set Join Mode
    [Documentation]    Dean or admin only. Opening a club settles its pending queue.
    [Arguments]    ${token}    ${club_id}    ${mode}    ${expected}=200
    ${r}=    PATCH As    ${token}    /clubs/${club_id}    ${{ {'join_mode': $mode} }}    ${expected}
    RETURN    ${r}

Join Requests Of
    [Arguments]    ${token}    ${club_id}    ${state}=pending    ${expected}=200
    ${r}=    GET As    ${token}    /clubs/${club_id}/join-requests    ${expected}    state=${state}
    RETURN    ${r}

Accept Join Request
    [Arguments]    ${token}    ${club_id}    ${request_id}    ${note}=${EMPTY}    ${expected}=200
    ${r}=    POST As    ${token}    /clubs/${club_id}/join-requests/${request_id}/accept    ${{ {'note': $note} }}    ${expected}
    RETURN    ${r}

Decline Join Request
    [Arguments]    ${token}    ${club_id}    ${request_id}    ${note}=${EMPTY}    ${expected}=200
    ${r}=    POST As    ${token}    /clubs/${club_id}/join-requests/${request_id}/decline    ${{ {'note': $note} }}    ${expected}
    RETURN    ${r}

Roster
    [Arguments]    ${token}    ${club_id}    ${expected}=200
    ${r}=    GET As    ${token}    /clubs/${club_id}/members    ${expected}
    RETURN    ${r}

Set Role
    [Arguments]    ${token}    ${membership_id}    ${role}    ${reason}=${EMPTY}    ${expected}=200
    ${r}=    POST As    ${token}    /memberships/${membership_id}/role    ${{ {'role': $role, 'reason': $reason} }}    ${expected}
    RETURN    ${r}

Edit Line
    [Documentation]    PUT …/lines/{id}/edit with any of head, amount_requested, basis.
    [Arguments]    ${token}    ${budget_id}    ${line_id}    ${expected}=200    &{fields}
    ${r}=    PUT As    ${token}    /budget/budgets/${budget_id}/lines/${line_id}/edit    ${fields}    ${expected}
    RETURN    ${r}

Remove Line
    [Arguments]    ${token}    ${budget_id}    ${line_id}    ${expected}=200
    ${r}=    DELETE As    ${token}    /budget/budgets/${budget_id}/lines/${line_id}/remove    ${expected}
    RETURN    ${r}

Import Lines
    [Documentation]    Multipart CSV upload; `mode` is replace or append.
    [Arguments]    ${token}    ${budget_id}    ${path}    ${mode}=replace    ${expected}=200
    ${content}=    Get File    ${path}
    ${csv}=    Evaluate    (os.path.basename($path), $content, 'text/csv')    modules=os
    ${files}=    Create Dictionary    file=${csv}
    ${headers}=    Bearer    ${token}
    ${r}=    POST On Session    api    /budget/budgets/${budget_id}/lines/import    files=${files}    data=${{ {'mode': $mode} }}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

Budget Of
    [Arguments]    ${token}    ${budget_id}    ${expected}=200
    ${r}=    GET As    ${token}    /budget/budgets/${budget_id}    ${expected}
    RETURN    ${r}

Set Envelope
    [Documentation]    Dean or admin: the club's annual envelope for `year` (default this year).
    [Arguments]    ${token}    ${club_id}    ${amount}    ${year}=${None}    ${expected}=200
    IF    $year is None
        ${year}=    Evaluate    datetime.date.today().year    modules=datetime
    END
    ${r}=    PUT As    ${token}    /budget/envelopes/${club_id}    ${{ {'year': int($year), 'amount': str($amount)} }}    ${expected}
    RETURN    ${r}

Reassign
    [Documentation]    The Dean's move: any of to_venue, starts_at+ends_at, plus reason.
    [Arguments]    ${token}    ${event_id}    ${expected}=200    &{body}
    ${r}=    POST As    ${token}    /events/${event_id}/reassign    ${body}    ${expected}
    RETURN    ${r}

Venue Calendar
    [Arguments]    ${token}    ${expected}=200    &{params}
    ${r}=    GET As    ${token}    /venue-calendar    ${expected}    &{params}
    RETURN    ${r}

Next Open Block Date
    [Documentation]    ISO date of a coming Wednesday on the campus clock: weeks_ahead=1 is the first Wednesday after today, 2 the one after.
    [Arguments]    ${weeks_ahead}=2
    ${day}=    Evaluate    (lambda t: (t + datetime.timedelta(days=((2 - t.weekday()) % 7 or 7) + 7 * (int(${weeks_ahead}) - 1))).isoformat())(datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Kolkata')).date())    modules=datetime,zoneinfo
    RETURN    ${day}

Campus Slot
    [Documentation]    ISO datetime for `date` at `hour`:00 on the campus clock.
    [Arguments]    ${date}    ${hour}
    ${iso}=    Evaluate    datetime.datetime.combine(datetime.date.fromisoformat($date), datetime.time(int($hour)), tzinfo=zoneinfo.ZoneInfo('Asia/Kolkata')).isoformat()    modules=datetime,zoneinfo
    RETURN    ${iso}

Open Block
    [Arguments]    ${token}    ${date}=${None}    ${expected}=200
    IF    $date is None
        ${r}=    GET As    ${token}    /open-block    ${expected}
    ELSE
        ${r}=    GET As    ${token}    /open-block    ${expected}    date=${date}
    END
    RETURN    ${r}

Book Open Block
    [Arguments]    ${token}    ${club_id}    ${venue_id}    ${starts_at}    ${title}=${EMPTY}    ${expected}=201
    ${body}=    Create Dictionary    club=${club_id}    venue=${venue_id}    starts_at=${starts_at}    title=${title}
    ${r}=    POST As    ${token}    /open-block    ${body}    ${expected}
    RETURN    ${r}

Notifications Of
    [Arguments]    ${token}    ${unread_only}=${False}
    IF    $unread_only
        ${r}=    GET As    ${token}    /governance/notifications    unread=true
    ELSE
        ${r}=    GET As    ${token}    /governance/notifications
    END
    RETURN    ${r.json()}

Unread Count Of
    [Arguments]    ${token}
    ${r}=    GET As    ${token}    /governance/notifications/unread-count
    RETURN    ${r.json()}[unread]

Mark All Read
    [Arguments]    ${token}
    ${r}=    POST As    ${token}    /governance/notifications/mark-read
    RETURN    ${r.json()}

Set Preference
    [Arguments]    ${token}    ${personalised_feed}
    ${r}=    PATCH As    ${token}    /module/auth/preferences    ${{ {'personalised_feed': bool($personalised_feed)} }}
    RETURN    ${r.json()}

Overview
    [Arguments]    ${token}    ${expected}=200
    ${r}=    GET As    ${token}    /reporting/reports/overview    ${expected}
    RETURN    ${r}

Semester Report
    [Arguments]    ${token}    ${expected}=200
    ${r}=    GET As    ${token}    /reporting/reports/semester    ${expected}
    RETURN    ${r}

Events Seen By
    [Documentation]    Titles in the order the API lists them, with any filters.
    [Arguments]    ${token}    &{params}
    ${r}=    GET As    ${token}    /events    200    page_size=200    &{params}
    ${titles}=    Evaluate    [e['title'] for e in $r.json()['results']]
    RETURN    ${titles}

Upload Photo
    [Arguments]    ${token}    ${event_id}    ${path}=${PHOTO_FIXTURE}    ${caption}=E2E photo    ${expected}=201
    ${bytes}=    Get Binary File    ${path}
    ${photo}=    Evaluate    (os.path.basename($path), $bytes, 'image/png')    modules=os
    ${files}=    Create Dictionary    file=${photo}
    ${headers}=    Bearer    ${token}
    ${r}=    POST On Session    api    /events/${event_id}/photos    files=${files}    data=${{ {'caption': $caption} }}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

Add Social Post
    [Arguments]    ${token}    ${event_id}    ${url}    ${expected}=201
    ${r}=    POST As    ${token}    /events/${event_id}/social-posts    ${{ {'url': $url} }}    ${expected}
    RETURN    ${r}

Go Live
    [Arguments]    ${token}    ${event_id}    ${expected}=200
    ${r}=    POST As    ${token}    /events/${event_id}/go-live    expected=${expected}
    RETURN    ${r}

Close Event
    [Arguments]    ${token}    ${event_id}    ${outcomes}    ${learnings}=${EMPTY}    ${expected}=200
    ${r}=    POST As    ${token}    /events/${event_id}/close    ${{ {'outcomes': $outcomes, 'learnings': $learnings} }}    ${expected}
    RETURN    ${r}

Publish A Proposal
    [Documentation]    Propose with these heads and approve it through the Society and the Dean; returns the Propose dict.
    [Arguments]    ${token}    ${title}    ${venue}    ${days}    &{heads}
    ${p}=    Propose    ${token}    ${title}    ${venue}    ${days}    &{heads}
    Approve Through Every Gate    ${p}[event]
    RETURN    ${p}

# ---- added with api/18–19 and ui/23–24 (Society officers, proposal documents, previews) ----
Approval Queue
    [Documentation]    The caller's queue: `results` to decide now, `upcoming` still at an earlier gate.
    [Arguments]    ${token}    ${expected}=200
    ${r}=    GET As    ${token}    /governance/approvals/queue    ${expected}
    RETURN    ${r}

Titles In
    [Documentation]    Event titles in a list of approval requests.
    [Arguments]    ${requests}
    ${titles}=    Evaluate    [r['event_title'] for r in $requests]
    RETURN    ${titles}

Society Roster
    [Arguments]    ${token}    ${expected}=200
    ${r}=    GET As    ${token}    /module/cultural-society/members    ${expected}
    RETURN    ${r}

Add To Society
    [Documentation]    `role` is cultural_society (member), cultural_society_secretary or cultural_society_vice_secretary.
    [Arguments]    ${token}    ${email}    ${role}=cultural_society    ${expected}=201
    ${r}=    POST As    ${token}    /module/cultural-society/members    ${{ {'email': $email, 'role': $role} }}    ${expected}
    RETURN    ${r}

Remove From Society
    [Arguments]    ${token}    ${user_id}    ${expected}=200
    ${r}=    DELETE As    ${token}    /module/cultural-society/members/${user_id}    ${expected}
    RETURN    ${r}

Society Row Of
    [Documentation]    This person's row on the roster the caller is shown.
    [Arguments]    ${token}    ${email}
    ${r}=    Society Roster    ${token}
    ${row}=    Evaluate    [m for m in $r.json()['members'] if m['email'] == $email][0]
    RETURN    ${row}

Upload Proposal
    [Documentation]    Multipart upload of the proposal document. The content type follows the extension unless given.
    [Arguments]    ${token}    ${event_id}    ${path}    ${content_type}=${None}    ${expected}=201
    ${bytes}=    Get Binary File    ${path}
    IF    $content_type is None
        ${content_type}=    Evaluate    {'.pdf': 'application/pdf', '.doc': 'application/msword', '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', '.csv': 'text/csv'}.get(os.path.splitext($path)[1].lower(), 'text/plain')    modules=os
    END
    ${doc}=    Evaluate    (os.path.basename($path), $bytes, $content_type)    modules=os
    ${files}=    Create Dictionary    file=${doc}
    ${headers}=    Bearer    ${token}
    ${r}=    POST On Session    api    /events/${event_id}/proposal-document    files=${files}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

Proposal File
    [Arguments]    ${token}    ${event_id}    ${expected}=200
    ${r}=    GET As    ${token}    /events/${event_id}/proposal-document/file    ${expected}
    RETURN    ${r}

Proposal Preview
    [Arguments]    ${token}    ${event_id}    ${expected}=200
    ${r}=    GET As    ${token}    /events/${event_id}/proposal-document/preview    ${expected}
    RETURN    ${r}

Proposal On Event
    [Documentation]    The `proposal_document` the caller is shown on the event (None when it is not theirs to read).
    [Arguments]    ${token}    ${event_id}
    ${r}=    GET As    ${token}    /events/${event_id}
    RETURN    ${r.json()}[proposal_document]
