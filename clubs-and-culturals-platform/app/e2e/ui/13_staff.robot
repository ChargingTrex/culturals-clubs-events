*** Settings ***
Documentation     Steps 3–5 and 8 on screen: the Society approves, the Dean sanctions a head lower and
...               approves, the Dean resolves a venue clash, and the Vice-Chancellor sees two pages and the report.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Suite Setup       Clubs Send Their Proposals
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui


*** Test Cases ***
Society approves the proposal and sends it to the Dean
    [Tags]    smoke
    Sign In As    ${SOCIETY_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Review    ${proposal}
    Click Button    Approve and send to Dean
    Wait For Heading    Cultural Society approvals
    Wait For Text    Approved: ${proposal}

Dean sanctions one head lower and approves
    [Tags]    smoke
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Review    ${proposal}
    Fill Field    Sanction for Sound & lighting    10000
    Snapshot    13-dean-sanction
    Click Button    Approve
    Wait For Heading    Dean approvals
    Wait For Text    Approved: ${proposal}

Dean resolves the clash from the Venues page
    [Tags]    smoke
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Click Link    Venues
    Wait For Heading    Venues
    Fill Field    Day    ${clash_day}
    Wait For Elements State    [role="alert"][aria-label="Venue clashes"]    visible
    Click Button    Move “${clash_b}” to another venue
    Fill Field    Reason (the club sees this)    The Music Club asked first; the Amphitheatre is free
    Click Button    Move
    Wait For Text    Moved “${clash_b}” to
    # The seed's own clash may still be listed; ours must be gone.
    Wait For Elements State    [aria-label="Venue clashes"] >> text=${clash_b}    detached

Vice-Chancellor sees two pages and the report's unique-student figure
    Sign In As    ${VC_EMAIL}    ${MFA_CODE}
    Wait For Heading    Vice-Chancellor approvals
    Pages Should Be    Above-threshold    Semester report
    Click Link    Semester report
    Wait For Heading    Semester report
    ${tiles}=    Get Elements    [data-testid="tile"]
    ${labels}=    Create List
    FOR    ${tile}    IN    @{tiles}
        ${t}=    Get Text    ${tile}
        Append To List    ${labels}    ${t}
    END
    ${unique}=    Evaluate    [t for t in $labels if 'Unique students' in t]
    Should Not Be Empty    ${unique}
    Should Contain    ${unique}[0]    ${{ str($unique_students) }}
    # Finding: the report page leads with "Events run" and "Participation"; "Unique students" is the third tile, not the first.


*** Keywords ***
Clubs Send Their Proposals
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${event}=    Create Draft Event    ${treasurer}    E2E UI Street Set    Music Room    ${52}    capacity=30    expected=25
    Add Budget Line    ${treasurer}    ${event}[budget][id]    Sound & lighting    12000
    Add Budget Line    ${treasurer}    ${event}[budget][id]    Refreshments    3000
    POST As    ${treasurer}    /events/${event}[id]/submit
    Set Suite Variable    ${proposal}    E2E UI Street Set
    # Two clubs want Seminar Hall B the same evening: both are accepted and flagged for the Dean.
    ${a}=    Create Draft Event    ${treasurer}    E2E Clash Music    Seminar Hall B    ${54}    capacity=100    expected=80
    Add Budget Line    ${treasurer}    ${a}[budget][id]    Sound    4000
    POST As    ${treasurer}    /events/${a}[id]/submit
    ${dance}=    Login As    ${DANCE_TREASURER_EMAIL}
    ${b}=    Create Draft Event    ${dance}    E2E Clash Dance    Seminar Hall B    ${54}    capacity=100    expected=80
    Add Budget Line    ${dance}    ${b}[budget][id]    Stage    4000
    ${sent}=    POST As    ${dance}    /events/${b}[id]/submit
    Should Not Be Empty    ${sent.json()}[soft_clashes]
    Set Suite Variable    ${clash_b}    E2E Clash Dance
    Set Suite Variable    ${clash_day}    ${b}[starts_at][:10]
    ${vc}=    Staff Login As    ${VC_EMAIL}
    ${report}=    GET As    ${vc}    /reporting/reports/semester
    Set Suite Variable    ${unique_students}    ${report.json()}[unique_students]

Review
    [Documentation]    Open the queue row for this proposal.
    [Arguments]    ${title}
    Wait For Text    ${title}
    ${rows}=    Get Elements    [data-testid="queue-row"]
    FOR    ${r}    IN    @{rows}
        ${text}=    Get Text    ${r}
        IF    $title in $text
            Click    ${r} >> a:has-text("Review")
            BREAK
        END
    END
    Wait For Heading    ${title}
