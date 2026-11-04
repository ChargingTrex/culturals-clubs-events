*** Settings ***
Documentation     Step 6 on screen: the Photography Club president opens the scan station for the live event,
...               pastes a real pass, and sees Checked in, then Already checked in, then Code not recognised.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Suite Setup       A Student Holds A Pass For The Live Event
Test Tags         ui


*** Test Cases ***
Checked in, duplicate, not recognised
    [Tags]    smoke
    Open App
    Sign In As    ${LENS_PRESIDENT_EMAIL}
    Wait For Heading    What's on
    Click Link    Scan station
    Wait For Heading    Scan station
    ${door}=    Get Element By    Label    Event at this door
    Select Options By    ${door}    value    ${live_id}
    Check Code    ${pass}
    Verdict Should Be    accepted    Checked in
    Check Code    ${pass}
    Verdict Should Be    duplicate    Already checked in
    Check Code    not-a-real-code
    Verdict Should Be    unknown_code    Code not recognised
    Snapshot    14-scan-verdicts
    [Teardown]    Close Context


*** Keywords ***
A Student Holds A Pass For The Live Event
    Open API
    ${student}=    Login As    ${UI_DOOR_STUDENT_EMAIL}
    ${live}=    Find Event    ${student}    ${LIVE_EVENT}
    ${r}=    Register For    ${student}    ${live}[id]    expected=any
    IF    ${r.status_code} == 201
        Set Suite Variable    ${pass}    ${r.json()}[pass_token]
    ELSE
        Set Suite Variable    ${pass}    ${live}[my_registration][pass_token]
    END
    Set Suite Variable    ${live_id}    ${live}[id]

Check Code
    [Arguments]    ${code}
    Fill Field    Pass code    ${code}
    Click Button    Check code

Verdict Should Be
    [Arguments]    ${result}    ${label}
    Wait For Elements State    [data-testid="verdict"][data-result="${result}"]    visible
    Get Text    [data-testid="verdict"]    contains    ${label}
