*** Settings ***
Documentation     Joining and the roster, one rule per test: a request to an approval club waits in the queue and the
...               President is told; accepting makes the membership and declining stores the note; an open club admits at
...               once and opening a club settles its queue; a student holds at most five clubs, at join and at accept;
...               a role change is stored with its history; office bearers cannot leave; reading a roster is audited.
...               People are picked from the seed's club-less students, never the named personas.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       People And Clubs
Suite Teardown    Put The Clubs Back
Test Tags         api    members    unit


*** Test Cases ***
A request to join an approval club is queued and the President is told
    [Tags]    smoke
    ${r}=    Join Club    ${a}    ${music}    expected=202
    Set Suite Variable    ${a_request}    ${r.json()}[id]
    Should Be Equal    ${r.json()}[state]    pending
    ${jr}=    Stored Join Request    ${a_request}
    Should Be Equal    ${jr}[state]    pending
    Should Be Told    ${PRESIDENT_EMAIL}    club.join_requested    ${music}    asked to join Music Club
    ${vp}=    Email Of Role    ${music}    club_vice_president
    Should Be Told    ${vp}    club.join_requested    ${music}
    Should Not Be Told    ${TREASURER_EMAIL}    club.join_requested    ${music}
    Audit Should Contain    ${a_request}    club.join_requested

Asking twice is refused while the request waits
    ${r}=    Join Club    ${a}    ${music}    expected=409
    Problem Code Should Be    ${r}    CLUBS_JOIN_PENDING
    ${n}=    Count Rows    clubs_joinrequest    club_id = replace(?, '-', '') and state = 'pending'    ${music}
    Should Be Equal As Integers    ${n}    1

The Treasurer may not decide a request, and a stranger never sees the queue
    ${r}=    Accept Join Request    ${treasurer}    ${music}    ${a_request}    expected=403
    Problem Code Should Be    ${r}    CLUBS_ROLE_ASSIGN_DENIED
    ${r}=    Join Requests Of    ${b}    ${music}    expected=404
    Problem Code Should Be    ${r}    NOT_FOUND
    ${jr}=    Stored Join Request    ${a_request}
    Should Be Equal    ${jr}[state]    pending

Accepting creates the membership and tells the student
    [Tags]    smoke
    ${queue}=    Join Requests Of    ${president}    ${music}
    ${ids}=    Evaluate    [j['id'] for j in $queue.json()['results']]
    List Should Contain Value    ${ids}    ${a_request}
    ${r}=    Accept Join Request    ${president}    ${music}    ${a_request}    note=Welcome aboard
    Should Be Equal    ${r.json()}[state]    accepted
    ${jr}=    Stored Join Request    ${a_request}
    Should Be Equal    ${jr}[state]    accepted
    Should Be Equal    ${jr}[note]    Welcome aboard
    Should Not Be Equal    ${jr}[decided_at]    ${None}
    ${m}=    Stored Membership    ${a_email}    ${music}
    Length Should Be    ${m}    1
    Should Be Equal    ${m}[0][role]    club_member
    Remember To Leave    ${a}    ${music}
    Should Be Told    ${a_email}    club.join_accepted    ${music}    Welcome to Music Club
    Audit Should Contain    ${a_request}    club.join_accepted

A member asking again is refused
    ${r}=    Join Club    ${a}    ${music}    expected=409
    Problem Code Should Be    ${r}    CLUBS_ALREADY_MEMBER

Declining stores the note and tells the student, and no membership appears
    ${r}=    Join Club    ${b}    ${music}    expected=202
    Set Suite Variable    ${b_request}    ${r.json()}[id]
    Decline Join Request    ${president}    ${music}    ${b_request}    note=The roster is full this term
    ${jr}=    Stored Join Request    ${b_request}
    Should Be Equal    ${jr}[state]    declined
    Should Be Equal    ${jr}[note]    The roster is full this term
    ${m}=    Stored Membership    ${b_email}    ${music}
    Should Be Empty    ${m}
    Should Be Told    ${b_email}    club.join_declined    ${music}    The roster is full this term
    Audit Should Contain    ${b_request}    club.join_declined

A decided request takes no second decision
    ${r}=    Accept Join Request    ${president}    ${music}    ${b_request}    expected=409
    Problem Code Should Be    ${r}    CLUBS_JOIN_ALREADY_DECIDED
    ${jr}=    Stored Join Request    ${b_request}
    Should Be Equal    ${jr}[state]    declined

An open club admits at once
    [Tags]    smoke
    Set Join Mode    ${dean}    ${astro}    open
    ${r}=    Join Club    ${c}    ${astro}    expected=201
    Should Be Equal    ${r.json()}[role]    club_member
    ${m}=    Stored Membership    ${c_email}    ${astro}
    Length Should Be    ${m}    1
    Remember To Leave    ${c}    ${astro}
    Audit Should Contain    ${r.json()}[id]    club.joined
    ${n}=    Count Rows    clubs_joinrequest    club_id = replace(?, '-', '')    ${astro}
    Should Be Equal As Integers    ${n}    0

Opening a club lets everyone waiting in
    ${r}=    Join Club    ${d}    ${chess}    expected=202
    ${request}=    Set Variable    ${r.json()}[id]
    Set Join Mode    ${dean}    ${chess}    open
    ${jr}=    Stored Join Request    ${request}
    Should Be Equal    ${jr}[state]    accepted
    Should Be Equal    ${jr}[note]    Club opened to all members
    ${m}=    Stored Membership    ${d_email}    ${chess}
    Length Should Be    ${m}    1
    Remember To Leave    ${d}    ${chess}
    Should Be Told    ${d_email}    club.join_accepted    ${chess}

A student holds at most five clubs
    [Tags]    smoke
    # Under --include smoke the two tests above have not opened these clubs yet; opening twice is harmless.
    Set Join Mode    ${dean}    ${astro}    open
    Set Join Mode    ${dean}    ${chess}    open
    FOR    ${club}    IN    ${astro}    ${chess}    @{open_clubs}[0:3]
        Join Club    ${e}    ${club}    expected=201
        Remember To Leave    ${e}    ${club}
    END
    ${r}=    Join Club    ${e}    ${open_clubs}[3]    expected=409
    Problem Code Should Be    ${r}    CLUBS_MEMBERSHIP_LIMIT
    ${r}=    Join Club    ${e}    ${music}    expected=409
    Problem Code Should Be    ${r}    CLUBS_MEMBERSHIP_LIMIT
    ${n}=    Count Rows    clubs_membership    student_id = (select s.id from identity_student s join identity_user u on u.id = s.user_id where u.email = ?) and ended_at is null    ${e_email}
    Should Be Equal As Integers    ${n}    5
    ${pending}=    Count Rows    clubs_joinrequest    state = 'pending' and student_id = (select s.id from identity_student s join identity_user u on u.id = s.user_id where u.email = ?)    ${e_email}
    Should Be Equal As Integers    ${pending}    0

An accept for a student already at the cap is refused and the request stays pending
    FOR    ${club}    IN    ${astro}    ${chess}    @{open_clubs}[0:2]
        Join Club    ${f}    ${club}    expected=201
        Remember To Leave    ${f}    ${club}
    END
    ${r}=    Join Club    ${f}    ${music}    expected=202
    ${request}=    Set Variable    ${r.json()}[id]
    Join Club    ${f}    ${open_clubs}[2]    expected=201
    Remember To Leave    ${f}    ${open_clubs}[2]
    ${r}=    Accept Join Request    ${president}    ${music}    ${request}    expected=409
    Problem Code Should Be    ${r}    CLUBS_MEMBERSHIP_LIMIT
    ${jr}=    Stored Join Request    ${request}
    Should Be Equal    ${jr}[state]    pending
    ${m}=    Stored Membership    ${f_email}    ${music}
    Should Be Empty    ${m}
    [Teardown]    Decline Join Request    ${president}    ${music}    ${request}    note=E2E: tidy up

A role change is stored with its history, and only the President or Vice-President may make it
    Set Test Variable    ${member}    ${None}
    ${roster}=    Roster    ${president}    ${music}
    Should Be True    ${roster.json()}[can_assign_roles]
    ${member}=    Evaluate    [m for m in $roster.json()['results'] if m['role'] == 'club_member' and m['prn'].lower() + '@college.edu' != $a_email][0]
    # The teardown keyword sees test variables, not this body's locals: promote it, or the restore is skipped.
    Set Test Variable    ${member}
    ${r}=    Set Role    ${treasurer}    ${member}[id]    club_core    expected=403
    Problem Code Should Be    ${r}    CLUBS_ROLE_ASSIGN_DENIED
    Set Role    ${president}    ${member}[id]    club_core    reason=Runs the sound desk
    ${m}=    Row By Id    clubs_membership    ${member}[id]
    Should Be Equal    ${m}[role]    club_core
    ${changes}=    Query    select from_role, to_role, reason from clubs_rolechange where membership_id = replace(?, '-', '') order by created_at desc    ${member}[id]
    Should Be Equal    ${changes}[0][from_role]    club_member
    Should Be Equal    ${changes}[0][to_role]    club_core
    Should Be Equal    ${changes}[0][reason]    Runs the sound desk
    ${again}=    Roster    ${president}    ${music}
    ${now}=    Evaluate    [m['role'] for m in $again.json()['results'] if m['id'] == $member['id']][0]
    Should Be Equal    ${now}    club_core
    [Teardown]    Restore Member Role

An office bearer cannot leave without handing over
    ${r}=    Leave Club    ${treasurer}    ${music}    expected=409
    Problem Code Should Be    ${r}    CLUBS_OFFICE_BEARER_CANNOT_LEAVE
    ${m}=    Stored Membership    ${TREASURER_EMAIL}    ${music}
    Length Should Be    ${m}    1

Reading the roster is audited, and a member sees it without the role controls
    ${before}=    Count Rows    governance_auditentry    action = 'club.roster.read' and target_id = ?    ${music}
    ${r}=    Roster    ${member}    ${music}
    Should Not Be True    ${r.json()}[can_assign_roles]
    ${after}=    Count Rows    governance_auditentry    action = 'club.roster.read' and target_id = ?    ${music}
    Should Be Equal As Integers    ${after}    ${before + 1}


*** Keywords ***
People And Clubs
    Open API
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    Set Suite Variable    ${dean}
    Set Suite Variable    ${president}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${member}
    ${music}=    My First Club    ${president}
    Set Suite Variable    ${music}
    ${astro}=    Club Named    ${dean}    ${OPEN_CLUB_NAME}
    ${chess}=    Club Named    ${dean}    Chess Club
    Set Suite Variable    ${astro}
    Set Suite Variable    ${chess}
    # Four more clubs opened for the five-club tests; every flipped club is put back by the suite teardown.
    @{open_clubs}=    Create List
    FOR    ${name}    IN    Art Club    FOSS Club    Oratory Club    Science Society
        ${id}=    Club Named    ${dean}    ${name}
        Set Join Mode    ${dean}    ${id}    open
        Append To List    ${open_clubs}    ${id}
    END
    Set Suite Variable    @{open_clubs}
    # Six club-less students, each signed in once. Their emails are prn.lower()@college.edu (seed_demo).
    FOR    ${name}    ${n}    IN    a    0    b    1    c    2    d    3    e    4    f    5
        ${email}=    Club-less Student    ${n}
        ${token}=    Login As    ${email}
        Set Suite Variable    ${${name}}    ${token}
        Set Suite Variable    ${${name}_email}    ${email}
    END
    @{to_leave}=    Create List
    Set Suite Variable    @{to_leave}

Restore Member Role
    IF    $member is not None
        Set Role    ${president}    ${member}[id]    club_member    reason=E2E: back as before
    END

Remember To Leave
    [Arguments]    ${token}    ${club_id}
    ${pair}=    Create List    ${token}    ${club_id}
    Append To List    ${to_leave}    ${pair}

Put The Clubs Back
    FOR    ${pair}    IN    @{to_leave}
        Leave Club    ${pair}[0]    ${pair}[1]    expected=any
    END
    FOR    ${club}    IN    ${astro}    ${chess}    @{open_clubs}
        Set Join Mode    ${dean}    ${club}    approval
    END
