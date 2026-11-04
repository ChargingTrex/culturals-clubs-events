*** Settings ***
Documentation     The student path on a phone: What's on, the event, Register, the pass under My passes,
...               a profile QR reissue, and sign out.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Suite Setup       Student Has No Registration Yet
Test Tags         ui


*** Test Cases ***
What's on, register, hold the pass, reissue the profile QR, sign out
    [Tags]    smoke
    Open App    width=${390}    height=${844}
    Sign In As    ${STUDENT_EMAIL}
    Wait For Heading    What's on
    ${pages}=    Offered Pages    nav-bottom
    Lists Should Be Equal    ${pages}    ${{ ["What's on", 'My passes', 'Profile QR'] }}
    Wait For Elements State    [data-testid="event-row"] >> nth=0    visible
    Click Link    ${PUBLISHED_EVENT}
    Wait For Heading    ${PUBLISHED_EVENT}
    Click Button    Register
    Wait For Heading    You are registered
    Click Link    View pass
    Wait For Heading    My passes
    ${pass}=    Set Variable    [data-testid="pass"]:has-text("${PUBLISHED_EVENT}")
    Wait For Elements State    ${pass}    visible
    Get Text    ${pass}    contains    Valid — not yet used
    Snapshot    11-student-pass
    Click Link    Profile QR
    Wait For Elements State    [data-testid="profile-version"]    visible
    ${before}=    Get Text    [data-testid="profile-token"]
    Click Button    Lost your phone? Reissue
    Click Button    Yes, reissue
    Wait For Text    Reissued — the old code no longer works
    ${after}=    Get Text    [data-testid="profile-token"]
    Should Not Be Equal    ${before}    ${after}
    Sign Out
    [Teardown]    Close Context


*** Keywords ***
Student Has No Registration Yet
    Open API
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${quiz}=    Find Event    ${student}    ${PUBLISHED_EVENT}
    IF    $quiz['my_registration']
        POST As    ${student}    /participation/registrations/${quiz}[my_registration][id]/cancel    expected=204
    END
