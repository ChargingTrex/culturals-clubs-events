*** Settings ***
Documentation     Intimation to the club and the approvers: the notification endpoints show only your own rows, the
...               unread count moves by exactly one for each thing that happens to you, mark-read clears it, each
...               kind of notice reaches the right people and nobody else, a registered student hears of a move,
...               and every stored link opens a page the app has.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Everyone Signs In
Test Tags         api    notifications    unit


*** Test Cases ***
The notification list is the caller's own rows, newest first
    ${rows}=    Notifications Of    ${treasurer}
    ${stored}=    Count Rows    governance_notification    user_id = (select id from identity_user where email = ?)    ${TREASURER_EMAIL}
    Should Be Equal As Integers    ${rows}[count]    ${stored}
    ${unread}=    Notifications Of    ${treasurer}    unread_only=${True}
    ${unread_stored}=    Count Rows    governance_notification    read_at is null and user_id = (select id from identity_user where email = ?)    ${TREASURER_EMAIL}
    Should Be Equal As Integers    ${unread}[count]    ${unread_stored}
    ${count}=    Unread Count Of    ${treasurer}
    Should Be Equal As Integers    ${count}    ${unread_stored}

The Treasurer's unread count rises by one when the Dean returns a proposal
    [Tags]    smoke
    ${p}=    Propose    ${treasurer}    E2E Notify Return    Music Room    ${105}    Sound=2000
    Decide    ${society}    ${p}[approval]    approve
    ${before}=    Unread Count Of    ${treasurer}
    Decide    ${dean}    ${p}[approval]    return    comment=Add a floor plan
    ${after}=    Unread Count Of    ${treasurer}
    Should Be Equal As Integers    ${after}    ${before + 1}
    Budget Viewers Should Be Told    ${p}[event]    approval.returned    Add a floor plan
    Should Not Be Told    ${MEMBER_EMAIL}    approval.returned    ${p}[event]
    Should Not Be Told    ${SECRETARY_EMAIL}    approval.returned    ${p}[event]

The President's unread count rises by one when a student asks to join
    [Tags]    smoke
    ${email}=    Club-less Student    5
    ${joiner}=    Login As    ${email}
    ${before}=    Unread Count Of    ${president}
    ${r}=    Join Club    ${joiner}    ${music}    expected=202
    ${after}=    Unread Count Of    ${president}
    Should Be Equal As Integers    ${after}    ${before + 1}
    ${told}=    Should Be Told    ${PRESIDENT_EMAIL}    club.join_requested    /club/join-requests?club=${music}
    Should Not Be Told    ${TREASURER_EMAIL}    club.join_requested    ${music}
    [Teardown]    Decline Join Request    ${president}    ${music}    ${r.json()}[id]    note=Full for now

Mark-read clears every unread row and the count reads zero
    ${before}=    Unread Count Of    ${treasurer}
    Should Be True    ${before} > 0
    ${marked}=    Mark All Read    ${treasurer}
    Should Be Equal As Integers    ${marked}[marked]    ${before}
    ${count}=    Unread Count Of    ${treasurer}
    Should Be Equal As Integers    ${count}    0
    ${left}=    Count Rows    governance_notification    read_at is null and user_id = (select id from identity_user where email = ?)    ${TREASURER_EMAIL}
    Should Be Equal As Integers    ${left}    0
    ${again}=    Mark All Read    ${treasurer}
    Should Be Equal As Integers    ${again}[marked]    0

Each gate's notice reaches the right people and nobody else
    ${p}=    Propose    ${treasurer}    E2E Notify Every Gate    Music Room    ${106}    Sound=3000
    Should Be Told    ${SOCIETY_EMAIL}    approval.pending    ${p}[approval]    sent “E2E Notify Every Gate” for approval
    Should Not Be Told    ${DEAN_EMAIL}    approval.pending    ${p}[approval]
    Should Not Be Told    ${VC_EMAIL}    approval.pending    ${p}[approval]
    Decide    ${society}    ${p}[approval]    approve
    Should Be Told    ${DEAN_EMAIL}    approval.pending    ${p}[approval]
    Budget Viewers Should Be Told    ${p}[event]    approval.advanced    now with the Dean
    Should Not Be Told    ${MEMBER_EMAIL}    approval.advanced    ${p}[event]
    ${all}=    Evaluate    {$p['lines']['Sound']: '3000'}
    Decide    ${dean}    ${p}[approval]    approve    sanctioned=${all}
    Budget Viewers Should Be Told    ${p}[event]    approval.approved    is approved and published
    Should Not Be Told    ${MEMBER_EMAIL}    approval.approved    ${p}[event]
    Should Not Be Told    ${VC_EMAIL}    approval.pending    ${p}[approval]
    ${vc_rows}=    Query    select n.id from governance_notification n join identity_user u on u.id = n.user_id where u.email = ? and n.link like ?    ${VC_EMAIL}    %${p}[event]%
    Should Be Empty    ${vc_rows}

A rejection at the first gate tells the club why, and the Dean is never asked
    ${p}=    Propose    ${treasurer}    E2E Notify Rejected    Music Room    ${107}    Printing=300
    Decide    ${society}    ${p}[approval]    reject    comment=The hall is closed for repairs that week
    Budget Viewers Should Be Told    ${p}[event]    approval.rejected    closed for repairs
    Should Not Be Told    ${DEAN_EMAIL}    approval.pending    ${p}[approval]

A registered student and the four officers hear of the Dean's move, each with their own link
    ${p}=    Publish A Proposal    ${treasurer}    E2E Notify Move    Music Room    ${108}    Sound=2500
    Set Suite Variable    ${moved}    ${p}
    Register For    ${student}    ${p}[event]
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    Reassign    ${dean}    ${p}[event]    to_venue=${amphi}[id]    reason=The Music Room floor is being relaid
    Officers Should Be Told    ${p}[event]    event.venue_changed    Amphitheatre
    ${officer}=    Email Of Role    ${music}    club_secretary
    ${rows}=    Notifications For    ${officer}    event.venue_changed    ${p}[event]
    Should Be Equal    ${rows}[0][link]    /club/events/${p}[event]
    ${rows}=    Should Be Told    ${STUDENT_EMAIL}    event.venue_changed    ${p}[event]    relaid
    ${links}=    Evaluate    [r['link'] for r in $rows]
    List Should Contain Value    ${links}    /events/${p}[event]
    Should Not Be Told    ${MEMBER_EMAIL}    event.venue_changed    ${p}[event]

A registered student is told of a move once, with the student page as the link
    [Tags]    known-issue
    [Documentation]    Finding: a Dean's move notifies a registered student twice — once from events/services.py
    ...    notify_venue_change (link /events/<id>) and once from participation/signals.py (link /club/<club>/events/<id>,
    ...    a route the app does not have).
    ${rows}=    Notifications For    ${STUDENT_EMAIL}    event.venue_changed    ${moved}[event]
    Length Should Be    ${rows}    1
    Should Be Equal    ${rows}[0][link]    /events/${moved}[event]

The approval and move links open pages the app has
    [Documentation]    Findings #2 and #3 (docs/qa/e2e-findings-2026-11-08.md) fixed: the approver's link carries the
    ...    approval id and the club's link the app's /club/events route.
    ${rows}=    Notifications For    ${SOCIETY_EMAIL}    approval.pending    ${moved}[approval]
    Should Be Equal    ${rows}[0][link]    /staff/approvals/${moved}[approval]
    ${rows}=    Notifications For    ${TREASURER_EMAIL}    approval.approved    ${moved}[event]
    Should Be Equal    ${rows}[0][link]    /club/events/${moved}[event]
    ${rows}=    Notifications For    ${PRESIDENT_EMAIL}    club.join_requested    ${music}
    Link Should Be A Page    ${rows}[-1][link]

Every other stored link opens a page the app has
    [Tags]    known-issue
    [Documentation]    Finding: registration.confirmed links to /me/passes (the page is /passes); club.join_* links to
    ...    /clubs/<id> (there is no club page); photo.removal_requested and the waitlist notices use /club/<club>/events/<id>
    ...    (the route is /club/events/<id>). participation/services.py:119,148,171 and clubs/services.py:178.
    ${rows}=    Notifications For    ${STUDENT_EMAIL}    registration.confirmed    /me/passes
    Should Not Be Empty    ${rows}
    Link Should Be A Page    ${rows}[-1][link]
    ${rows}=    Query    select link from governance_notification where kind like 'club.join_%' order by created_at desc limit 1
    Link Should Be A Page    ${rows}[0][link]


*** Keywords ***
Everyone Signs In
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${president}
    Set Suite Variable    ${student}
    Set Suite Variable    ${society}
    Set Suite Variable    ${dean}
    ${music}=    My First Club    ${treasurer}
    Set Suite Variable    ${music}

Link Should Be A Page
    [Documentation]    The app's routes (frontend App.tsx, club/screens.tsx, staff/screens.tsx, organiser/screens.tsx), ids allowed where the route has one.
    [Arguments]    ${link}
    ${path}=    Evaluate    $link.split('?')[0]
    ${uuid}=    Set Variable    [0-9a-f-]{36}
    ${ok}=    Evaluate    re.fullmatch(r'/(feed|events|passes|profile|clubs|scan|club/events|club/events/new|club/budget|club/roster|club/join-requests|staff/venues|staff/calendar|staff/overview|staff/report|staff/approvals|staff/approvals/(society|dean|vc)|events/${uuid}|club/events/${uuid}|club/budget/${uuid}|staff/approvals/${uuid})', $path) is not None    modules=re
    Should Be True    ${ok}    msg=${link} is not a page the app has
