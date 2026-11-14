*** Settings ***
Documentation     AR-09 on screen: the Society's Vice-Secretary is offered the approval queue and a plain Society member
...               is not; the Secretary moves a proposal that is still with the Society from the calendar (the club's
...               leadership is told) and is offered no Move on a published booking; a plain member reads the calendar
...               with no Move at all; and on the Society members page the Secretary adds a member by email and removes
...               them again, a plain member only reads, and only the Dean is offered the officer roles.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       The Club Has A Proposal With The Society
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    society


*** Variables ***
${WAITING_TITLE}      E2E UI Soc Move Me
${PUBLISHED_TITLE}    E2E UI Soc Published


*** Test Cases ***
The Vice-Secretary is offered the Society's queue, and a plain member only the pages to read
    [Tags]    smoke
    Sign In As    ${SOCIETY_VICE_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Pages Should Be    Society approvals    Calendar    Society members    This semester    Semester report
    Wait For Text    ${WAITING_TITLE}
    Sign Out
    Sign In As    ${SOCIETY_MEMBER_EMAIL}    ${MFA_CODE}
    Pages Should Be    Calendar    Society members    This semester    Semester report

The Secretary moves a proposal that is with the Society, and is offered no Move on a published booking
    [Tags]    smoke    calendar
    Sign In As    ${SOCIETY_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Click Link    Calendar
    Wait For Heading    Semester event calendar
    Open Calendar Day    ${day}
    Wait For Elements State    [data-testid="slot"][data-venue="Music Room"][data-hour="10"] >> [data-testid="slot-booking"]:has-text("${WAITING_TITLE}")    visible
    Wait For Elements State    [data-testid="slot"][data-venue="Seminar Hall A"][data-hour="10"] >> [data-testid="slot-booking"]:has-text("${PUBLISHED_TITLE}")    visible
    Get Element Count    role=button[name="Move ${PUBLISHED_TITLE}"]    ==    0
    Click    role=button[name="Move ${WAITING_TITLE}"] >> nth=0
    Wait For Elements State    form[aria-label="Move ${WAITING_TITLE}"]    visible
    Pick    From    13:00
    Pick    To    15:00
    Fill Field    Reason (the club is shown this)    The morning slot is needed for a department exam
    Snapshot    23-secretary-move-form
    Click Button    Move
    Toast Should Read    moved; the club and registered students are told
    Wait For Elements State    [data-testid="slot"][data-venue="Music Room"][data-hour="13"] >> [data-testid="slot-booking"]:has-text("${WAITING_TITLE}")    visible
    ${starts}=    Campus Time    ${135}    13
    ${ends}=    Campus Time    ${135}    15
    Event Times Should Be    ${waiting}[event]    ${starts.isoformat()}    ${ends.isoformat()}
    ${moves}=    Stored Reassignments    ${waiting}[event]
    Length Should Be    ${moves}    1
    Should Be Equal    ${moves}[0][reason]    The morning slot is needed for a department exam
    Should Be Told    ${PRESIDENT_EMAIL}    event.venue_changed    ${waiting}[event]    The morning slot is needed for a department exam
    Should Be Told    ${TREASURER_EMAIL}    event.venue_changed    ${waiting}[event]    was moved to

A plain Society member reads the calendar and is offered no Move
    [Tags]    calendar
    Sign In As    ${SOCIETY_MEMBER_EMAIL}    ${MFA_CODE}
    Click Link    Calendar
    Wait For Heading    Semester event calendar
    Open Calendar Day    ${day}
    Wait For Elements State    [data-testid="slot"][data-venue="Seminar Hall A"][data-hour="10"] >> [data-testid="slot-booking"]:has-text("${PUBLISHED_TITLE}")    visible
    Get Element Count    role=button[name=/^Move /]    ==    0

The Secretary adds a member by email and removes them again
    [Tags]    smoke    members
    Sign In As    ${SOCIETY_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Click Link    Society members
    Wait For Heading    Society members
    Wait For Elements State    ul[aria-label="Cultural Society"] >> li:has-text("${SOCIETY_VICE_EMAIL}")    visible
    # Only the Dean appoints officers, so the Secretary is not offered a role to choose.
    Get Element Count    form[aria-label="Add to the Society"] >> select    ==    0
    # Nor a Remove on an officer's row, their own included.
    Get Element Count    ul[aria-label="Cultural Society"] >> li:has-text("${SOCIETY_VICE_EMAIL}") >> role=button    ==    0
    Fill Text    form[aria-label="Add to the Society"] >> input[type="email"]    ${recruit_email}
    Click    form[aria-label="Add to the Society"] >> role=button[name="Add"]
    Toast Should Read    ${recruit_email} added
    Wait For Elements State    ul[aria-label="Cultural Society"] >> li:has-text("${recruit_email}")    visible
    ${row}=    Get Text    ul[aria-label="Cultural Society"] >> li:has-text("${recruit_email}")
    Should Contain    ${row}    Member
    ${roles}=    Stored Global Roles    ${recruit_email}
    List Should Contain Value    ${roles}    cultural_society
    Should Be Told    ${recruit_email}    society.role_set    /staff/society
    Snapshot    23-society-members
    # Removing asks once more before it happens.
    Click    ul[aria-label="Cultural Society"] >> li:has-text("${recruit_email}") >> role=button[name=/^Remove /]
    ${roles}=    Stored Global Roles    ${recruit_email}
    List Should Contain Value    ${roles}    cultural_society
    Click    ul[aria-label="Cultural Society"] >> li:has-text("${recruit_email}") >> role=button[name=/^Confirm removing /]
    Toast Should Read    removed from the Society
    Wait For Elements State    ul[aria-label="Cultural Society"] >> li:has-text("${recruit_email}")    detached
    ${roles}=    Stored Global Roles    ${recruit_email}
    List Should Not Contain Value    ${roles}    cultural_society

An address nobody signs in with is refused on screen
    [Tags]    members
    Sign In As    ${SOCIETY_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Click Link    Society members
    Wait For Heading    Society members
    Fill Text    form[aria-label="Add to the Society"] >> input[type="email"]    nobody.at.all@college.edu
    Click    form[aria-label="Add to the Society"] >> role=button[name="Add"]
    Expect Problem Banner    SOCIETY_NO_SUCH_ACCOUNT

A plain member reads the roster and can change nothing
    [Tags]    members
    Sign In As    ${SOCIETY_MEMBER_EMAIL}    ${MFA_CODE}
    Click Link    Society members
    Wait For Heading    Society members
    Wait For Elements State    ul[aria-label="Cultural Society"] >> li:has-text("${SOCIETY_EMAIL}")    visible
    Get Element Count    form[aria-label="Add to the Society"]    ==    0
    Get Element Count    ul[aria-label="Cultural Society"] >> role=button    ==    0

The Dean is offered the officer roles and may remove an officer
    [Tags]    members
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Click Link    Society members
    Wait For Heading    Society members
    Wait For Elements State    form[aria-label="Add to the Society"] >> select    visible
    ${options}=    Get Select Options    form[aria-label="Add to the Society"] >> select
    ${labels}=    Evaluate    [o['label'] for o in $options]
    Lists Should Be Equal    ${labels}    ${{ ['Member', 'Secretary', 'Vice-Secretary'] }}
    Wait For Elements State    ul[aria-label="Cultural Society"] >> li:has-text("${SOCIETY_VICE_EMAIL}") >> role=button[name=/^Remove /]    visible


*** Keywords ***
Pick
    [Documentation]    Choose an option in the move form's From, To or Venue select, addressed by their order in the form.
    [Arguments]    ${label}    ${option}
    ${index}=    Evaluate    {'From': 0, 'To': 1, 'Venue': 2}[$label]
    Select Options By    form[aria-label^="Move "] >> select >> nth=${index}    label    ${option}

The Club Has A Proposal With The Society
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    # Still with the Society: the Secretary may move it. And a published one the same day: only the Dean may.
    ${waiting}=    Propose    ${treasurer}    ${WAITING_TITLE}    Music Room    ${135}    Sound=1500
    Publish A Proposal    ${treasurer}    ${PUBLISHED_TITLE}    Seminar Hall A    ${135}    Sound=1500
    Set Suite Variable    ${waiting}
    ${when}=    Campus Time    ${135}    10
    Set Suite Variable    ${day}    ${when.date().isoformat()}
    ${recruit_email}=    Club-less Student    7
    Set Suite Variable    ${recruit_email}
