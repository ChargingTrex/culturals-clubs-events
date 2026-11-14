*** Settings ***
Documentation     What may change on a proposal, by whom and when, one rule per test: every field of a draft is edited and
...               stored; half hours and more seats than the hall are refused; under review it is locked; the Dean and the
...               Vice-Chancellor cannot edit the club's words, only the Dean cuts heads (never raises them) and moves
...               bookings; a return reopens everything and the resend carries the new figures; the Vice-Chancellor's
...               sanction figures are ignored; a published event is closed to edits and deletion.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Everyone Signs In
Test Tags         api    approvals    unit


*** Test Cases ***
Every field of a draft can be edited and is stored
    [Tags]    smoke
    ${hall}=    Find Venue    ${treasurer}    Seminar Hall A
    ${starts}=    Campus Time    ${94}    14
    ${ends}=    Campus Time    ${94}    16
    ${edit}=    Create Dictionary    title=E2E Edited Title    description=Now with a second act    venue=${hall}[id]
    ...    starts_at=${starts.isoformat()}    ends_at=${ends.isoformat()}    capacity=${60}    expected_attendance=${55}
    ${r}=    PATCH As    ${treasurer}    /events/${d1}[event]    ${edit}
    Should Be Equal    ${r.json()}[venue_name]    Seminar Hall A
    ${e}=    Row By Id    events_event    ${d1}[event]
    Should Be Equal    ${e}[title]    E2E Edited Title
    Should Be Equal    ${e}[description]    Now with a second act
    Should Be Equal As Integers    ${e}[capacity]    60
    Should Be Equal As Integers    ${e}[expected_attendance]    55
    Should Be Equal    ${e}[venue_id]    ${{ $hall['id'].replace('-', '') }}
    Event Times Should Be    ${d1}[event]    ${starts.isoformat()}    ${ends.isoformat()}

A half-hour start is refused
    ${half}=    Evaluate    ($starts_94 + datetime.timedelta(minutes=30)).isoformat()    modules=datetime
    ${r}=    PATCH As    ${treasurer}    /events/${d1}[event]    ${{ {'starts_at': $half} }}    422
    Should Be Equal    ${r.json()}[errors][0][field]    starts_at
    Event Times Should Be    ${d1}[event]    ${starts_94.isoformat()}    ${ends_94.isoformat()}

An end before the start is refused
    ${before}=    Evaluate    ($starts_94 - datetime.timedelta(hours=1)).isoformat()    modules=datetime
    ${r}=    PATCH As    ${treasurer}    /events/${d1}[event]    ${{ {'ends_at': $before} }}    422
    Should Be Equal    ${r.json()}[errors][0][field]    ends_at

More seats than the hall has is refused
    [Documentation]    The create path checks capacity against the venue (EventCreateSerializer.validate); the edit path
    ...    (EventSerializer.validate) does not, so a draft can be edited to seat more than the hall. Finding, 2026-11-09.
    [Tags]    known-issue
    ${hall}=    Find Venue    ${treasurer}    Seminar Hall A
    ${too_many}=    Evaluate    int($hall['capacity']) + 1
    ${r}=    PATCH As    ${treasurer}    /events/${d1}[event]    ${{ {'capacity': $too_many} }}    422
    Should Be Equal    ${r.json()}[errors][0][field]    capacity
    ${e}=    Row By Id    events_event    ${d1}[event]
    Should Be Equal As Integers    ${e}[capacity]    60

A member cannot edit the proposal
    ${r}=    PATCH As    ${member}    /events/${d1}[event]    ${{ {'description': 'mine now'} }}    403
    Problem Code Should Be    ${r}    EVENTS_EDIT_DENIED
    ${e}=    Row By Id    events_event    ${d1}[event]
    Should Be Equal    ${e}[description]    Now with a second act

Under review the proposal and its budget are locked
    [Tags]    smoke
    ${sent}=    POST As    ${treasurer}    /events/${d1}[event]/submit
    Set Suite Variable    ${d1_approval}    ${sent.json()}[id]
    ${r}=    PATCH As    ${treasurer}    /events/${d1}[event]    ${{ {'description': 'under review'} }}    409
    Problem Code Should Be    ${r}    EVENTS_LOCKED
    ${r}=    Add Budget Line    ${treasurer}    ${d1}[budget]    Printing    100    expected=409
    Problem Code Should Be    ${r}    BUDGET_LOCKED
    ${e}=    Row By Id    events_event    ${d1}[event]
    Should Be Equal    ${e}[status]    submitted

The Dean and the Vice-Chancellor may not edit the club's proposal
    ${r}=    PATCH As    ${dean}    /events/${d1}[event]    ${{ {'description': 'the Dean says'} }}    403
    Problem Code Should Be    ${r}    EVENTS_EDIT_DENIED
    ${r}=    PATCH As    ${vc}    /events/${d1}[event]    ${{ {'description': 'the VC says'} }}    403
    Problem Code Should Be    ${r}    EVENTS_EDIT_DENIED
    ${e}=    Row By Id    events_event    ${d1}[event]
    Should Be Equal    ${e}[description]    Now with a second act

Only the Dean may move a booking
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    FOR    ${who}    IN    ${vc}    ${society}    ${president}
        ${r}=    Reassign    ${who}    ${d1}[event]    expected=403    to_venue=${amphi}[id]    reason=Trying from the wrong chair
        Problem Code Should Be    ${r}    EVENTS_REASSIGN_DENIED
    END
    ${moves}=    Stored Reassignments    ${d1}[event]
    Should Be Empty    ${moves}

The Dean cannot decide before the Society has
    ${r}=    Decide    ${dean}    ${d1_approval}    approve    expected=409
    Problem Code Should Be    ${r}    GOVERNANCE_WRONG_STAGE
    ${steps}=    Stored Steps    ${d1_approval}
    Should Be Empty    ${steps}

After a return every field opens again and the resend carries the new figures
    [Tags]    smoke
    Decide    ${society}    ${d1_approval}    approve
    Decide    ${dean}    ${d1_approval}    return    comment=Trim the sound quote
    Event Status Should Be    ${d1}[event]    returned
    PATCH As    ${treasurer}    /events/${d1}[event]    ${{ {'description': 'Second quote: cheaper sound', 'expected_attendance': 40} }}
    Edit Line    ${treasurer}    ${d1}[budget]    ${d1}[lines][Sound]    amount_requested=7000
    ${again}=    POST As    ${treasurer}    /events/${d1}[event]/submit
    Set Suite Variable    ${d1_second}    ${again.json()}[id]
    ${requests}=    Stored Requests    ${d1}[event]
    Length Should Be    ${requests}    2
    Should Be Equal    ${requests}[0][state]    returned
    Should Be Equal    ${requests}[1][state]    pending
    Should Be Equal As Numbers    ${requests}[1][amount_requested]    7000
    ${e}=    Row By Id    events_event    ${d1}[event]
    Should Be Equal    ${e}[description]    Second quote: cheaper sound
    Should Be Equal As Integers    ${e}[expected_attendance]    40

The Dean may lower a head, never raise it, and the figure is stored
    Decide    ${society}    ${d1_second}    approve
    ${over}=    Evaluate    {$d1['lines']['Sound']: '7001'}
    ${r}=    Decide    ${dean}    ${d1_second}    approve    sanctioned=${over}    expected=422
    Problem Code Should Be    ${r}    BUDGET_SANCTION_EXCEEDS_REQUEST
    Line Should Be    ${d1}[lines][Sound]    7000    ${None}
    ${cut}=    Evaluate    {$d1['lines']['Sound']: '6000'}
    ${r}=    Decide    ${dean}    ${d1_second}    approve    sanctioned=${cut}
    Should Be Equal    ${r.json()}[request][state]    approved
    Line Should Be    ${d1}[lines][Sound]    7000    6000
    Event Status Should Be    ${d1}[event]    published

A decided request takes no second decision
    ${r}=    Decide    ${dean}    ${d1_second}    approve    expected=409
    Problem Code Should Be    ${r}    GOVERNANCE_ALREADY_RESOLVED
    ${steps}=    Stored Steps    ${d1_second}
    Length Should Be    ${steps}    2

A published event is closed to edits and deletion by the club
    ${r}=    PATCH As    ${treasurer}    /events/${d1}[event]    ${{ {'description': 'after the fact'} }}    409
    Problem Code Should Be    ${r}    EVENTS_LOCKED
    ${r}=    DELETE As    ${treasurer}    /events/${d1}[event]    expected=409
    Problem Code Should Be    ${r}    EVENT_NOT_DELETABLE
    ${e}=    Row By Id    events_event    ${d1}[event]
    Should Be Equal    ${e}[status]    published

The Vice-Chancellor's sanction figures are ignored; the Dean's stand
    [Documentation]    Finding #4 (docs/qa/e2e-findings-2026-11-08.md): the VC's map is accepted (200) and ignored rather
    ...    than refused. The test accepts either answer and checks that the lines keep the Dean's figures.
    ${p}=    Propose    ${treasurer}    E2E VC Cannot Recut    Main Auditorium    ${95}    Stage=60000    Sound=5000
    Lists Should Be Equal    ${p}[stages]    ${{ ['cultural_society', 'dean', 'vc'] }}
    Decide    ${society}    ${p}[approval]    approve
    ${dean_map}=    Evaluate    {$p['lines']['Stage']: '55000', $p['lines']['Sound']: '5000'}
    Decide    ${dean}    ${p}[approval]    approve    sanctioned=${dean_map}
    ${recut}=    Evaluate    {$p['lines']['Stage']: '1000', $p['lines']['Sound']: '1'}
    ${r}=    Decide    ${vc}    ${p}[approval]    approve    sanctioned=${recut}    expected=any
    Should Be True    ${r.status_code} in (200, 422)
    Line Should Be    ${p}[lines][Stage]    60000    55000
    Line Should Be    ${p}[lines][Sound]    5000    5000
    IF    ${r.status_code} == 200
        Event Status Should Be    ${p}[event]    published
        ${steps}=    Stored Steps    ${p}[approval]
        Should Be Equal As Numbers    ${steps}[2][amount_sanctioned]    60000
    END

A draft can be deleted by the club and nothing of it remains
    ${d3}=    Create Draft Event    ${treasurer}    E2E Deleted Draft    Music Room    ${96}    capacity=30    expected=25
    Add Budget Line    ${treasurer}    ${d3}[budget][id]    Tea    100
    DELETE As    ${treasurer}    /events/${d3}[id]    expected=204
    ${left}=    Count Rows    events_event    id = replace(?, '-', '')    ${d3}[id]
    Should Be Equal As Integers    ${left}    0
    ${budget}=    Count Rows    budget_budget    id = replace(?, '-', '')    ${d3}[budget][id]
    Should Be Equal As Integers    ${budget}    0


*** Keywords ***
Everyone Signs In
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${president}
    Set Suite Variable    ${member}
    Set Suite Variable    ${society}
    Set Suite Variable    ${dean}
    Set Suite Variable    ${vc}
    ${event}=    Create Draft Event    ${treasurer}    E2E Field Edits    Music Room    ${94}    capacity=30    expected=25
    ${r}=    Add Budget Line    ${treasurer}    ${event}[budget][id]    Sound    9000
    ${lines}=    Evaluate    {l['head']: l['id'] for l in $r.json()['lines']}
    ${d1}=    Create Dictionary    event=${event}[id]    budget=${event}[budget][id]    lines=${lines}
    Set Suite Variable    ${d1}
    ${starts_94}=    Campus Time    ${94}    14
    ${ends_94}=    Campus Time    ${94}    16
    Set Suite Variable    ${starts_94}
    Set Suite Variable    ${ends_94}
