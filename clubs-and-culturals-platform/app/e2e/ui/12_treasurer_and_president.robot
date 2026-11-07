*** Settings ***
Documentation     Step 1 on screen: the Treasurer creates an event priced later, adds two budget entries
...               and sends it. The President changes a member's role; the Treasurer is not offered the control.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Suite Setup       Look Up The Member
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui


*** Test Cases ***
Treasurer: New event priced later, two budget entries, send for approval
    [Tags]    smoke
    Sign In As    ${TREASURER_EMAIL}
    Wait For Heading    Feed
    Click Link    New event
    Wait For Heading    New event
    Fill Field    Title    E2E UI Monsoon Set
    Select Option    Venue    Music Room · seats 40
    ${day}=    Evaluate    (datetime.date.today() + datetime.timedelta(days=50)).isoformat()    modules=datetime
    Fill Field    Start date    ${day}
    Select Option    Start hour    18:00
    Select Option    End hour    20:00
    Fill Field    Capacity    30
    Fill Field    Expected attendance    25
    Click Button    Save draft
    Wait For Heading    E2E UI Monsoon Set
    Click Link    Open budget
    Wait For Heading    E2E UI Monsoon Set
    Add Entry    Sound & lighting    12000
    Add Entry    Refreshments    3000
    Get Text    [data-testid="total-requested"]    contains    15,000
    Snapshot    12-treasurer-budget
    Click Button    Send for approval
    Wait For Text    Sent for approval — 2 gates

President changes a member's role, and puts it back
    Sign In As    ${PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Click Link    Members & roles
    Wait For Heading    Music Club members
    Select Option    Role for ${member_name}    Core team
    Role Should Be    ${member_name}    club_core
    Select Option    Role for ${member_name}    Member
    Role Should Be    ${member_name}    club_member

Treasurer is not offered the role control
    [Documentation]    Finding: the roster hides the control from anyone who may not assign roles, so the API's
    ...    CLUBS_ROLE_ASSIGN_DENIED message can never be shown on screen — the refusal is enforced by absence.
    Sign In As    ${TREASURER_EMAIL}
    Wait For Heading    Feed
    Click Link    Members & roles
    Wait For Heading    Music Club members
    Wait For Elements State    [data-testid="member-row"] >> nth=0    visible
    ${controls}=    Get Element By Role    combobox    name=Role for    all_elements=${True}
    Should Be Empty    ${controls}


*** Keywords ***
Look Up The Member
    Open API
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${club}=    My First Club    ${president}
    ${roster}=    GET As    ${president}    /clubs/${club}/members
    ${member}=    Evaluate    [m for m in $roster.json()['results'] if m['role'] == 'club_member'][0]
    Set Suite Variable    ${member_name}    ${member}[full_name]

Role Should Be
    [Documentation]    The roster re-renders from the API after a change; the assertion retries until it does.
    [Arguments]    ${name}    ${role}
    ${field}=    Get Element By    Label    Role for ${name}
    Get Selected Options    ${field}    value    ==    ${role}

Add Entry
    [Arguments]    ${head}    ${amount}
    Fill Field    Add an entry    ${head}
    Fill Field    Amount (₹)    ${amount}
    Click Button    Add
    Wait For Text    ${head}
