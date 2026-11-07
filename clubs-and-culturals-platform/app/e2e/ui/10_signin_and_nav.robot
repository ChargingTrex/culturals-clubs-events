*** Settings ***
Documentation     Each persona signs in and is offered exactly the pages the capability rules allow
...               (the list ported from frontend/src/shared/nav/pages.test.ts). Staff without a code are refused on screen.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui


*** Test Cases ***
Student
    [Tags]    smoke
    Sign In As    ${STUDENT_EMAIL}
    Wait For Heading    Feed
    Pages Should Be    Feed    What's on    My passes    Profile QR    Clubs
    Snapshot    10-student-nav

Club member
    Sign In As    ${MEMBER_EMAIL}
    Wait For Heading    Feed
    Pages Should Be    Feed    What's on    My passes    Profile QR    Clubs    Club events    Members & roles

Secretary
    Sign In As    ${SECRETARY_EMAIL}
    Wait For Heading    Feed
    Pages Should Be    Feed    What's on    My passes    Profile QR    Clubs    Club events    New event    Members & roles    Scan station

Treasurer
    Sign In As    ${TREASURER_EMAIL}
    Wait For Heading    Feed
    Pages Should Be    Feed    What's on    My passes    Profile QR    Clubs    Club events    New event    Budget    Members & roles

President
    Sign In As    ${PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Pages Should Be    Feed    What's on    My passes    Profile QR    Clubs    Club events    New event    Budget    Members & roles    Scan station

Organiser of the live event
    Sign In As    ${LENS_PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Pages Should Be    Feed    What's on    My passes    Profile QR    Clubs    Club events    New event    Budget    Members & roles    Scan station

Cultural Society
    Sign In As    ${SOCIETY_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Pages Should Be    Society approvals    This semester    Semester report

Dean
    [Tags]    smoke
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Pages Should Be    Dean approvals    Venues    This semester    Semester report

Vice-Chancellor
    Sign In As    ${VC_EMAIL}    ${MFA_CODE}
    Wait For Heading    Vice-Chancellor approvals
    Pages Should Be    Above-threshold    This semester    Semester report

A staff account with no code is refused on screen
    [Tags]    smoke
    Sign In As    ${DEAN_EMAIL}
    Expect Problem Banner    AUTH_MFA_REQUIRED
    ${code}=    Get Element By    Label    Authenticator code
    Wait For Elements State    ${code}    focused
