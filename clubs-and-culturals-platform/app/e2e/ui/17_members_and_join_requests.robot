*** Settings ***
Documentation     Membership on screen: students ask to join from the Clubs directory (or join an open club at once);
...               the President decides the queue on the Join requests page, one by one or all at once, and a student
...               already in five clubs is refused on their own row while the rest go through; the roster then shows
...               the new members and a role change sticks. Everything is read back from the database.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Students Ask To Join
Suite Teardown    Put The Clubs Back
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    members


*** Test Cases ***
The President approves every waiting request at once, and the capped student's row explains the refusal
    [Tags]    smoke
    Sign In As    ${PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Click Link    Join requests
    Wait For Heading    Music Club join requests
    Get Element Count    [data-testid="join-row"]    ==    4
    ${all}=    Get Element By    Label    Select all (4 waiting)
    Check Checkbox    ${all}
    Click Button    Approve selected (4)
    FOR    ${name}    IN    @{joiner_names}
        Wait For Elements State    [data-testid="join-row"]:has-text("${name}") >> text=Approved    visible
    END
    Wait For Elements State    [data-testid="join-row"]:has-text("${capped_name}") >> [role="alert"]    visible
    Get Text    [data-testid="join-row"]:has-text("${capped_name}") >> [role="alert"]    contains    5 clubs
    Toast Should Read    3 approved, 1 refused
    Snapshot    17-president-bulk-approve
    FOR    ${email}    IN    @{joiner_emails}
        ${m}=    Stored Membership    ${email}    ${music}
        Length Should Be    ${m}    1
        Should Be Equal    ${m}[0][role]    club_member
        Should Be Told    ${email}    club.join_accepted    ${music}
    END
    ${jr}=    Stored Join Request    ${capped_request}
    Should Be Equal    ${jr}[state]    pending

The President declines one request from its row, with the student told
    ${email}=    Club-less Student    6
    ${student}=    Login As    ${email}
    ${r}=    Join Club    ${student}    ${music}    expected=202
    ${name}=    Full Name Of    ${email}
    Sign In As    ${PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Click Link    Join requests
    Wait For Heading    Music Club join requests
    Click    [data-testid="join-row"]:has-text("${name}") >> role=button[name="Decline"]
    Wait For Elements State    [data-testid="join-row"]:has-text("${name}") >> text=Declined    visible
    Toast Should Read    1 declined
    ${jr}=    Stored Join Request    ${r.json()}[id]
    Should Be Equal    ${jr}[state]    declined
    Should Be Told    ${email}    club.join_declined    ${music}
    ${m}=    Stored Membership    ${email}    ${music}
    Should Be Empty    ${m}

A student joins an open club at once and asks to join a club that vets its members
    ${email}=    Club-less Student    7
    Sign In As    ${email}
    Wait For Heading    Feed
    Click Link    Clubs
    Wait For Heading    Clubs
    Get Text    [data-testid="membership-strip"]    contains    0
    Click Button    Join ${OPEN_CLUB_NAME}
    Toast Should Read    You joined ${OPEN_CLUB_NAME}
    Wait For Elements State    [data-testid="club-card"]:has-text("${OPEN_CLUB_NAME}") >> text="Member"    visible
    ${m}=    Stored Membership    ${email}    ${open_club}
    Length Should Be    ${m}    1
    Click Button    Request to join Music Club
    Toast Should Read    Asked to join Music Club
    Wait For Elements State    [data-testid="club-card"]:has-text("Music Club") >> text="Requested"    visible
    ${rows}=    Query    select j.id, j.state from clubs_joinrequest j join identity_student s on s.id = j.student_id join identity_user u on u.id = s.user_id where u.email = ? and j.club_id = replace(?, '-', '')    ${email}    ${music}
    Length Should Be    ${rows}    1
    Should Be Equal    ${rows}[0][state]    pending
    Should Be Told    ${PRESIDENT_EMAIL}    club.join_requested    ${music}
    [Teardown]    Run Keywords    Close Context
    ...    AND    Tidy Up The Directory Student    ${email}

The roster lists the new members and a role change sticks
    Sign In As    ${PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Click Link    Members & roles
    Wait For Heading    Music Club members
    FOR    ${name}    IN    @{joiner_names}
        Wait For Elements State    [data-testid="member-row"]:has-text("${name}")    visible
    END
    ${name}=    Set Variable    ${joiner_names}[0]
    Select Option    Role for ${name}    Core team
    Toast Should Read    is now
    ${m}=    Stored Membership    ${joiner_emails}[0]    ${music}
    Should Be Equal    ${m}[0][role]    club_core
    Select Option    Role for ${name}    Member
    Wait Until Keyword Succeeds    10s    1s    Stored Role Should Be    ${joiner_emails}[0]    club_member


*** Keywords ***
Students Ask To Join
    Open API
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${music}=    My First Club    ${president}
    Set Suite Variable    ${president}
    Set Suite Variable    ${dean}
    Set Suite Variable    ${music}
    # Five clubs outside the five demo rosters are opened for the cap scenario (the seed makes every club approval-only).
    ${clubs}=    GET As    ${dean}    /clubs    page_size=200
    ${spare}=    Evaluate    [c for c in $clubs.json()['results'] if c['name'] not in ('Music Club', 'Dance Club', 'Literary Club', 'Photography Club', 'Theatre Club') and c['category'] != 'committee' and c['status'] == 'active']
    ${open_club}=    Evaluate    [c['id'] for c in $spare if c['name'] == $OPEN_CLUB_NAME][0]
    ${others}=    Evaluate    [c['id'] for c in $spare if c['name'] != $OPEN_CLUB_NAME][:4]
    ${opened}=    Evaluate    [$open_club] + $others
    FOR    ${club}    IN    @{opened}
        Set Join Mode    ${dean}    ${club}    open
    END
    Set Suite Variable    ${open_club}
    Set Suite Variable    ${opened}
    # Three club-less students ask to join Music Club.
    ${joiner_emails}=    Create List
    ${joiner_names}=    Create List
    ${joiner_requests}=    Create List
    FOR    ${n}    IN RANGE    3
        ${email}=    Club-less Student    ${n}
        ${token}=    Login As    ${email}
        ${r}=    Join Club    ${token}    ${music}    expected=202
        Append To List    ${joiner_emails}    ${email}
        ${name}=    Full Name Of    ${email}
        Append To List    ${joiner_names}    ${name}
        Append To List    ${joiner_requests}    ${r.json()}[id]
    END
    # A fourth asks too, then fills up five clubs, so the President's accept must be refused.
    ${capped_email}=    Club-less Student    3
    ${capped}=    Login As    ${capped_email}
    ${r}=    Join Club    ${capped}    ${music}    expected=202
    FOR    ${club}    IN    @{opened}
        Join Club    ${capped}    ${club}    expected=201
    END
    ${capped_name}=    Full Name Of    ${capped_email}
    Set Suite Variable    ${joiner_emails}
    Set Suite Variable    ${joiner_names}
    Set Suite Variable    ${joiner_requests}
    Set Suite Variable    ${capped_email}
    Set Suite Variable    ${capped}
    Set Suite Variable    ${capped_name}
    Set Suite Variable    ${capped_request}    ${r.json()}[id]

Put The Clubs Back
    [Documentation]    Join modes back to approval; the people this suite added leave again, so ui/10's lists hold.
    FOR    ${club}    IN    @{opened}
        Leave Club    ${capped}    ${club}
    END
    Decline Join Request    ${president}    ${music}    ${capped_request}    note=E2E tidy-up    expected=any
    FOR    ${email}    IN    @{joiner_emails}
        ${token}=    Login As    ${email}
        Leave Club    ${token}    ${music}
    END
    FOR    ${club}    IN    @{opened}
        Set Join Mode    ${dean}    ${club}    approval
    END

Tidy Up The Directory Student
    [Arguments]    ${email}
    ${token}=    Login As    ${email}
    Leave Club    ${token}    ${open_club}
    ${pending}=    Query    select j.id from clubs_joinrequest j join identity_student s on s.id = j.student_id join identity_user u on u.id = s.user_id where u.email = ? and j.club_id = replace(?, '-', '') and j.state = 'pending'    ${email}    ${music}
    FOR    ${row}    IN    @{pending}
        ${rid}=    Evaluate    str(uuid.UUID($row['id']))    modules=uuid
        Decline Join Request    ${president}    ${music}    ${rid}    note=E2E tidy-up    expected=any
    END

Full Name Of
    [Arguments]    ${email}
    ${name}=    Scalar    select s.full_name from identity_student s join identity_user u on u.id = s.user_id where u.email = ?    ${email}
    RETURN    ${name}

Stored Role Should Be
    [Arguments]    ${email}    ${role}
    ${m}=    Stored Membership    ${email}    ${music}
    Should Be Equal    ${m}[0][role]    ${role}
