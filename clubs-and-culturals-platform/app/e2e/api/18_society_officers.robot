*** Settings ***
Documentation     The Cultural Society's Secretary and Vice-Secretary (AR-09), one rule per test: only the two officers
...               hold the Society's approval stage and a plain Society member decides nothing; the Dean's queue lists a
...               proposal still with the Society as "upcoming"; the officers move a booking's time and venue while its
...               proposal is with the Society and not after, with the event row, the reassignment, the audit entry and
...               the club's notifications checked; the calendar says who may move what; a club's Vice-President reads
...               the calendar and moves nothing; and the officers keep the Society's member list while only the Dean
...               appoints or removes an officer.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       The Society Signs In And The Club Proposes
Test Tags         api    society    unit


*** Test Cases ***
Only the Secretary and the Vice-Secretary hold the Society's stage
    [Tags]    smoke    approvals
    FOR    ${token}    IN    ${secretary}    ${vice}
        ${me}=    Me    ${token}
        Lists Should Be Equal    ${me}[capabilities][approval_stages]    ${{ ['cultural_society'] }}
        Should Be True    ${me}[capabilities][is_society_officer]
        Should Be True    ${me}[capabilities][is_cultural_society]
        Should Be True    ${me}[capabilities][can_manage_society]
    END
    ${me}=    Me    ${smember}
    Should Be Empty    ${me}[capabilities][approval_stages]
    Should Not Be True    ${me}[capabilities][is_society_officer]
    Should Not Be True    ${me}[capabilities][can_manage_society]
    Should Be True    ${me}[capabilities][is_cultural_society]
    Should Be True    ${me}[capabilities][can_see_overview]

Both officers are told a proposal is waiting, and a plain member is not
    [Tags]    notifications
    Should Be Told    ${SOCIETY_EMAIL}    approval.pending    ${waiting}[approval]
    Should Be Told    ${SOCIETY_VICE_EMAIL}    approval.pending    ${waiting}[approval]
    Should Not Be Told    ${SOCIETY_MEMBER_EMAIL}    approval.pending    ${waiting}[approval]

A plain Society member cannot decide, and nothing is written
    [Tags]    approvals
    ${r}=    Decide    ${smember}    ${waiting}[approval]    approve    expected=any
    Should Be True    ${r.status_code} in (403, 404)    msg=a plain member decided: ${r.status_code} ${r.text}
    ${steps}=    Stored Steps    ${waiting}[approval]
    Should Be Empty    ${steps}
    ${a}=    Stored Approval    ${waiting}[approval]
    Should Be Equal    ${a}[current_stage]    cultural_society

A plain Society member still reads the calendar, the overview and the semester report
    Venue Calendar    ${smember}    from=${day125}    to=${day125}
    Overview    ${smember}
    Semester Report    ${smember}
    # Their queue exists and is empty: nothing is theirs to decide, now or later.
    ${q}=    Approval Queue    ${smember}
    Should Be Empty    ${q.json()}[stages_you_hold]
    Should Be Empty    ${q.json()}[results]
    Should Be Empty    ${q.json()}[upcoming]

The Dean's queue lists a proposal still with the Society as upcoming, not as theirs to decide
    [Tags]    smoke    approvals
    ${q}=    Approval Queue    ${dean}
    ${now}=    Titles In    ${q.json()}[results]
    ${later}=    Titles In    ${q.json()}[upcoming]
    List Should Not Contain Value    ${now}    E2E Soc With Society
    List Should Contain Value    ${later}    E2E Soc With Society
    List Should Contain Value    ${now}    E2E Soc At The Dean
    List Should Not Contain Value    ${later}    E2E Soc At The Dean
    ${row}=    Evaluate    [r for r in $q.json()['upcoming'] if r['event_title'] == 'E2E Soc With Society'][0]
    Should Be Equal    ${row}[current_stage]    cultural_society
    # The Dean can open it to read, and cannot decide it yet.
    GET As    ${dean}    /governance/approvals/${waiting}[approval]
    ${r}=    Decide    ${dean}    ${waiting}[approval]    approve    expected=409
    Problem Code Should Be    ${r}    GOVERNANCE_WRONG_STAGE

The Society's own queue holds it to decide, and has nothing upcoming once it has moved on
    [Tags]    approvals
    ${q}=    Approval Queue    ${secretary}
    ${now}=    Titles In    ${q.json()}[results]
    ${later}=    Titles In    ${q.json()}[upcoming]
    List Should Contain Value    ${now}    E2E Soc With Society
    List Should Not Contain Value    ${now}    E2E Soc At The Dean
    List Should Not Contain Value    ${later}    E2E Soc At The Dean

The calendar says who may move what
    [Tags]    calendar
    # The Dean: every live booking. An officer: only what is still with the Society. Everyone else: nothing.
    Can Move Should Be    ${dean}    ${day125}    ${waiting}[event]    ${True}
    Can Move Should Be    ${dean}    ${day126}    ${at_dean}[event]    ${True}
    Can Move Should Be    ${dean}    ${day127}    ${published}[event]    ${True}
    FOR    ${token}    IN    ${secretary}    ${vice}
        Can Move Should Be    ${token}    ${day125}    ${waiting}[event]    ${True}
        Can Move Should Be    ${token}    ${day126}    ${at_dean}[event]    ${False}
        Can Move Should Be    ${token}    ${day127}    ${published}[event]    ${False}
    END
    FOR    ${token}    IN    ${smember}    ${vc}    ${president}    ${vp}
        Can Move Should Be    ${token}    ${day125}    ${waiting}[event]    ${False}
        Can Move Should Be    ${token}    ${day127}    ${published}[event]    ${False}
    END

A club's Vice-President reads the calendar like the President, and a member cannot
    [Tags]    calendar
    ${cal}=    Venue Calendar    ${vp}    from=${day125}    to=${day125}
    ${own}=    Booking In    ${cal}    ${waiting}[event]
    Should Be Equal    ${own}[title]    E2E Soc With Society
    Should Be Equal    ${own}[club]    Music Club
    ${r}=    Venue Calendar    ${member}    expected=403    from=${day125}    to=${day125}
    Problem Code Should Be    ${r}    EVENTS_CALENDAR_DENIED

Nobody but the Dean and the Society's officers moves a booking, the club included
    [Tags]    calendar
    ${start}=    Campus Slot    ${day125}    15
    ${end}=    Campus Slot    ${day125}    17
    FOR    ${token}    IN    ${smember}    ${vc}    ${president}    ${vp}    ${treasurer}
        ${r}=    Reassign    ${token}    ${waiting}[event]    expected=403    starts_at=${start}    ends_at=${end}    reason=Not my call, but trying anyway
        Problem Code Should Be    ${r}    EVENTS_REASSIGN_DENIED
    END
    ${moves}=    Stored Reassignments    ${waiting}[event]
    Should Be Empty    ${moves}
    # Nor by editing its own submitted proposal.
    ${r}=    PATCH As    ${president}    /events/${waiting}[event]    ${{ {'starts_at': $start, 'ends_at': $end} }}    expected=409
    Problem Code Should Be    ${r}    EVENTS_LOCKED
    Event Times Should Not Have Moved To    ${waiting}[event]    ${start}

The Secretary's move into an hour another booking holds is refused
    [Tags]    calendar
    ${room}=    Find Venue    ${secretary}    Music Room
    ${start}=    Campus Slot    ${day127}    10
    ${end}=    Campus Slot    ${day127}    12
    ${r}=    Reassign    ${secretary}    ${waiting}[event]    expected=409    to_venue=${room}[id]    starts_at=${start}    ends_at=${end}    reason=Trying the hour a published event holds
    Problem Code Should Be    ${r}    EVENTS_VENUE_UNAVAILABLE
    Event Times Should Not Have Moved To    ${waiting}[event]    ${start}

The Secretary moves a proposal that is with the Society: venue and time, and the club's leadership is told
    [Tags]    smoke    calendar    notifications
    ${amphi}=    Find Venue    ${secretary}    Amphitheatre
    ${start}=    Campus Slot    ${day125}    14
    ${end}=    Campus Slot    ${day125}    16
    ${r}=    Reassign    ${secretary}    ${waiting}[event]    to_venue=${amphi}[id]    starts_at=${start}    ends_at=${end}    reason=The Music Room is being repainted that morning
    Should Be Equal    ${r.json()}[from_venue_name]    Music Room
    Should Be Equal    ${r.json()}[to_venue_name]    Amphitheatre
    Event Times Should Be    ${waiting}[event]    ${start}    ${end}
    ${e}=    Row By Id    events_event    ${waiting}[event]
    Should Be Equal    ${e}[venue_id]    ${{ $amphi['id'].replace('-', '') }}
    Should Be Equal    ${e}[status]    submitted
    ${moves}=    Stored Reassignments    ${waiting}[event]
    Length Should Be    ${moves}    1
    Should Be Equal    ${moves}[0][reason]    The Music Room is being repainted that morning
    Should Be Equal    ${moves}[0][actor_label]    Nivedita Raman
    Audit Should Contain    ${waiting}[event]    event.venue_reassigned
    Officers Should Be Told    ${waiting}[event]    event.venue_changed    was moved to
    ${told}=    Should Be Told    ${PRESIDENT_EMAIL}    event.venue_changed    ${waiting}[event]    The Music Room is being repainted that morning
    Should Contain    ${told}[-1][body]    Amphitheatre
    Should Be Equal    ${told}[-1][link]    /club/events/${waiting}[event]
    # It is still the Society's to decide, in its new slot.
    ${a}=    Stored Approval    ${waiting}[approval]
    Should Be Equal    ${a}[current_stage]    cultural_society

The Vice-Secretary moves only the time
    [Tags]    calendar
    ${start}=    Campus Slot    ${day125}    16
    ${end}=    Campus Slot    ${day125}    18
    ${r}=    Reassign    ${vice}    ${waiting}[event]    starts_at=${start}    ends_at=${end}    reason=Two hours later suits the sound crew
    Should Be Equal    ${r.json()}[from_venue_name]    ${r.json()}[to_venue_name]
    Event Times Should Be    ${waiting}[event]    ${start}    ${end}
    ${moves}=    Stored Reassignments    ${waiting}[event]
    Length Should Be    ${moves}    2
    Should Be Equal    ${moves}[1][actor_label]    Arjun Menon

Once the Society has approved, its officers can no longer move it and the Dean still can
    [Tags]    smoke    calendar
    ${start}=    Campus Slot    ${day126}    14
    ${end}=    Campus Slot    ${day126}    16
    FOR    ${token}    IN    ${secretary}    ${vice}
        ${r}=    Reassign    ${token}    ${at_dean}[event]    expected=403    starts_at=${start}    ends_at=${end}    reason=Trying after our gate has passed
        Problem Code Should Be    ${r}    EVENTS_REASSIGN_DENIED
        Should Contain    ${r.json()}[detail]    only the Dean
    END
    Event Times Should Not Have Moved To    ${at_dean}[event]    ${start}
    Reassign    ${dean}    ${at_dean}[event]    starts_at=${start}    ends_at=${end}    reason=The Dean has the final say on the slot
    Event Times Should Be    ${at_dean}[event]    ${start}    ${end}

An officer cannot move a published booking
    [Tags]    calendar
    ${amphi}=    Find Venue    ${secretary}    Amphitheatre
    ${r}=    Reassign    ${secretary}    ${published}[event]    expected=403    to_venue=${amphi}[id]    reason=Published events are the Dean's to move
    Problem Code Should Be    ${r}    EVENTS_REASSIGN_DENIED
    ${moves}=    Stored Reassignments    ${published}[event]
    Should Be Empty    ${moves}

The Vice-Secretary approves at the Society's stage and the step records their role
    [Tags]    smoke    approvals
    Decide    ${vice}    ${for_vice}[approval]    approve    comment=Checked by the Vice-Secretary
    ${a}=    Stored Approval    ${for_vice}[approval]
    Should Be Equal    ${a}[current_stage]    dean
    ${steps}=    Stored Steps    ${for_vice}[approval]
    Length Should Be    ${steps}    1
    Step Should Be    ${steps}[0]    cultural_society    approve    cultural_society_vice_secretary
    # The Secretary's own approval, made in the suite setup, records the Secretary's role.
    ${steps}=    Stored Steps    ${at_dean}[approval]
    Step Should Be    ${steps}[0]    cultural_society    approve    cultural_society_secretary
    # Having approved, it is no longer upcoming for the Dean: it is in the Dean's queue.
    ${q}=    Approval Queue    ${dean}
    ${now}=    Titles In    ${q.json()}[results]
    List Should Contain Value    ${now}    E2E Soc For The Vice

The roster lists the officers first, and the Society and the Dean can read it
    [Tags]    members
    FOR    ${token}    IN    ${secretary}    ${vice}    ${smember}    ${dean}
        ${r}=    Society Roster    ${token}
        ${labels}=    Evaluate    [m['role_label'] for m in $r.json()['members']][:3]
        Lists Should Be Equal    ${labels}    ${{ ['Secretary', 'Vice-Secretary', 'Member'] }}
    END
    ${r}=    Society Roster    ${smember}
    Should Not Be True    ${r.json()}[can_manage]
    Should Not Be True    ${r.json()}[can_appoint_officers]
    ${r}=    Society Roster    ${secretary}
    Should Be True    ${r.json()}[can_manage]
    Should Not Be True    ${r.json()}[can_appoint_officers]
    ${r}=    Society Roster    ${dean}
    Should Be True    ${r.json()}[can_appoint_officers]

A student, a club president and the Vice-Chancellor cannot read or change the roster
    [Tags]    members
    FOR    ${token}    IN    ${student}    ${president}    ${vc}
        ${r}=    Society Roster    ${token}    expected=403
        Problem Code Should Be    ${r}    SOCIETY_MANAGE_DENIED
        ${r}=    Add To Society    ${token}    ${recruit_email}    expected=403
        Problem Code Should Be    ${r}    SOCIETY_MANAGE_DENIED
    END
    ${roles}=    Stored Global Roles    ${recruit_email}
    List Should Not Contain Value    ${roles}    cultural_society

A plain Society member manages nobody
    [Tags]    members
    ${r}=    Add To Society    ${smember}    ${recruit_email}    expected=403
    Problem Code Should Be    ${r}    SOCIETY_MANAGE_DENIED
    ${vice_id}=    User Id Of    ${SOCIETY_VICE_EMAIL}
    Remove From Society    ${smember}    ${vice_id}    expected=403

The Vice-Secretary adds a member: the role is stored, the person is told and the change is audited
    [Tags]    smoke    members    notifications
    ${r}=    Add To Society    ${vice}    ${recruit_email}
    ${row}=    Evaluate    [m for m in $r.json()['members'] if m['email'] == $recruit_email][0]
    Should Be Equal    ${row}[role]    cultural_society
    Should Be Equal    ${row}[role_label]    Member
    Should Be True    ${row}[can_remove]
    ${roles}=    Stored Global Roles    ${recruit_email}
    List Should Contain Value    ${roles}    cultural_society
    List Should Contain Value    ${roles}    student
    Should Be Told    ${recruit_email}    society.role_set    /staff/society    added to the Cultural Society
    Audit Should Contain    ${row}[user_id]    society.role_set
    Set Suite Variable    ${recruit_id}    ${row}[user_id]

Adding someone who is already a member is refused
    [Tags]    members
    ${r}=    Add To Society    ${secretary}    ${recruit_email}    expected=409
    Problem Code Should Be    ${r}    SOCIETY_ALREADY_HELD

The new member signs in with a code, sees the Society's pages and holds no approval stage
    [Tags]    members
    ${token}=    Staff Login As    ${recruit_email}
    ${me}=    Me    ${token}
    Should Be True    ${me}[capabilities][is_cultural_society]
    Should Be Empty    ${me}[capabilities][approval_stages]
    Venue Calendar    ${token}    from=${day125}    to=${day125}
    Society Roster    ${token}

An officer cannot appoint, demote or remove an officer
    [Tags]    members
    ${r}=    Add To Society    ${secretary}    ${recruit_email}    role=cultural_society_vice_secretary    expected=403
    Problem Code Should Be    ${r}    SOCIETY_MANAGE_DENIED
    ${r}=    Add To Society    ${secretary}    ${SOCIETY_VICE_EMAIL}    role=cultural_society    expected=403
    Problem Code Should Be    ${r}    SOCIETY_MANAGE_DENIED
    ${vice_id}=    User Id Of    ${SOCIETY_VICE_EMAIL}
    ${r}=    Remove From Society    ${secretary}    ${vice_id}    expected=403
    Problem Code Should Be    ${r}    SOCIETY_MANAGE_DENIED
    ${own_id}=    User Id Of    ${SOCIETY_EMAIL}
    Remove From Society    ${secretary}    ${own_id}    expected=403
    ${roles}=    Stored Global Roles    ${SOCIETY_VICE_EMAIL}
    Lists Should Be Equal    ${roles}    ${{ ['cultural_society_vice_secretary'] }}
    ${row}=    Society Row Of    ${secretary}    ${SOCIETY_VICE_EMAIL}
    Should Not Be True    ${row}[can_remove]

There is one Vice-Secretary: the Dean is refused a second and replaces the first
    [Tags]    members
    ${r}=    Add To Society    ${dean}    ${recruit_email}    role=cultural_society_vice_secretary    expected=409
    Problem Code Should Be    ${r}    SOCIETY_OFFICE_TAKEN
    ${vice_id}=    User Id Of    ${SOCIETY_VICE_EMAIL}
    Remove From Society    ${dean}    ${vice_id}
    ${roles}=    Stored Global Roles    ${SOCIETY_VICE_EMAIL}
    Should Be Empty    ${roles}
    Should Be Told    ${SOCIETY_VICE_EMAIL}    society.role_removed    ${EMPTY}    removed from the Cultural Society
    Add To Society    ${dean}    ${recruit_email}    role=cultural_society_vice_secretary
    ${roles}=    Stored Global Roles    ${recruit_email}
    List Should Contain Value    ${roles}    cultural_society_vice_secretary
    List Should Not Contain Value    ${roles}    cultural_society
    # The new Vice-Secretary now holds the stage; the one replaced does not.
    ${token}=    Staff Login As    ${recruit_email}
    ${me}=    Me    ${token}
    Lists Should Be Equal    ${me}[capabilities][approval_stages]    ${{ ['cultural_society'] }}
    [Teardown]    Put The Seeded Vice-Secretary Back

The Secretary removes a member and they are told
    [Tags]    members    notifications
    ${roles}=    Stored Global Roles    ${recruit_email}
    Lists Should Be Equal    ${{ sorted($roles) }}    ${{ ['cultural_society', 'student'] }}
    ${r}=    Remove From Society    ${secretary}    ${recruit_id}
    ${emails}=    Evaluate    [m['email'] for m in $r.json()['members']]
    List Should Not Contain Value    ${emails}    ${recruit_email}
    ${roles}=    Stored Global Roles    ${recruit_email}
    Lists Should Be Equal    ${roles}    ${{ ['student'] }}
    Should Be Told    ${recruit_email}    society.role_removed    ${EMPTY}    removed from the Cultural Society
    Audit Should Contain    ${recruit_id}    society.role_removed

An address with no account, and a person who is not in the Society, are refused
    [Tags]    members
    ${r}=    Add To Society    ${secretary}    nobody.at.all@college.edu    expected=422
    Problem Code Should Be    ${r}    SOCIETY_NO_SUCH_ACCOUNT
    ${dean_id}=    User Id Of    ${DEAN_EMAIL}
    Remove From Society    ${secretary}    ${dean_id}    expected=404
    Remove From Society    ${secretary}    ${recruit_id}    expected=404


*** Keywords ***
The Society Signs In And The Club Proposes
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${secretary}=    Staff Login As    ${SOCIETY_EMAIL}
    ${vice}=    Staff Login As    ${SOCIETY_VICE_EMAIL}
    ${smember}=    Staff Login As    ${SOCIETY_MEMBER_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    ${music}=    My First Club    ${president}
    ${vp_email}=    Email Of Role    ${music}    club_vice_president
    ${vp}=    Login As    ${vp_email}
    FOR    ${name}    IN    treasurer    president    member    student    secretary    vice    smember    dean    vc    vp
        Set Suite Variable    ${${name}}
    END
    # Someone in no club, to be added to and removed from the Society.
    ${recruit_email}=    Club-less Student    5
    Set Suite Variable    ${recruit_email}
    ${day125}=    Day    125
    ${day126}=    Day    126
    ${day127}=    Day    127
    Set Suite Variable    ${day125}
    Set Suite Variable    ${day126}
    Set Suite Variable    ${day127}
    # Still with the Society: the officers may move it.
    ${waiting}=    Propose    ${treasurer}    E2E Soc With Society    Music Room    ${125}    Sound=3000
    # Approved by the Secretary, now with the Dean: the officers may not.
    ${at_dean}=    Propose    ${treasurer}    E2E Soc At The Dean    Music Room    ${126}    Sound=3000
    Decide    ${secretary}    ${at_dean}[approval]    approve    comment=Checked by the Secretary
    # Published: the Dean's alone to move.
    ${published}=    Publish A Proposal    ${treasurer}    E2E Soc Published    Music Room    ${127}    Sound=2000
    # One for the Vice-Secretary to approve.
    ${for_vice}=    Propose    ${treasurer}    E2E Soc For The Vice    Music Room    ${128}    Sound=1000
    FOR    ${name}    IN    waiting    at_dean    published    for_vice
        Set Suite Variable    ${${name}}
    END

Put The Seeded Vice-Secretary Back
    [Documentation]    Later suites sign in as the seeded Vice-Secretary, so the Dean undoes the replacement.
    ${recruit}=    User Id Of    ${recruit_email}
    Remove From Society    ${dean}    ${recruit}    expected=any
    Add To Society    ${dean}    ${SOCIETY_VICE_EMAIL}    role=cultural_society_vice_secretary    expected=any
    Add To Society    ${dean}    ${recruit_email}    expected=any
    ${roles}=    Stored Global Roles    ${SOCIETY_VICE_EMAIL}
    Lists Should Be Equal    ${roles}    ${{ ['cultural_society_vice_secretary'] }}

Day
    [Arguments]    ${days_ahead}
    ${d}=    Evaluate    (datetime.date.today() + datetime.timedelta(days=int($days_ahead))).isoformat()    modules=datetime
    RETURN    ${d}

Booking In
    [Arguments]    ${calendar}    ${event_id}
    ${b}=    Evaluate    [b for b in $calendar.json()['bookings'] if b['id'] == $event_id][0]
    RETURN    ${b}

Can Move Should Be
    [Documentation]    The `can_move` flag the calendar gives this caller for this booking.
    [Arguments]    ${token}    ${day}    ${event_id}    ${expected}
    ${cal}=    Venue Calendar    ${token}    from=${day}    to=${day}
    ${b}=    Booking In    ${cal}    ${event_id}
    Should Be Equal    ${b}[can_move]    ${expected}    msg=can_move for ${event_id} on ${day}

Event Times Should Not Have Moved To
    [Arguments]    ${event_id}    ${starts}
    ${r}=    Row    select starts_at from events_event where id = replace(?, '-', '')    ${event_id}
    ${same}=    Same Instant    ${r}[starts_at]    ${starts}
    Should Not Be True    ${same}    msg=the refused move was written: ${r}[starts_at]
