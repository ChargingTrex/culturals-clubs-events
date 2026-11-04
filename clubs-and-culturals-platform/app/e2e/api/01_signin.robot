*** Settings ***
Documentation     Step 0 of the run-through: every persona signs in, staff need a second factor,
...               and `/module/auth/me` tells each of them what they may open.
Resource          ../resources/api.resource
Suite Setup       Open API
Test Tags         api


*** Test Cases ***
Every pilot persona signs in
    [Tags]    smoke
    FOR    ${email}    IN    ${STUDENT_EMAIL}    ${MEMBER_EMAIL}    ${SECRETARY_EMAIL}    ${TREASURER_EMAIL}    ${PRESIDENT_EMAIL}    ${LENS_PRESIDENT_EMAIL}
        ${token}=    Login As    ${email}
        Should Not Be Empty    ${token}
    END
    FOR    ${email}    IN    ${SOCIETY_EMAIL}    ${DEAN_EMAIL}    ${VC_EMAIL}
        ${token}=    Staff Login As    ${email}
        Should Not Be Empty    ${token}
    END

Staff without a code are refused with 401
    [Tags]    smoke
    FOR    ${email}    IN    ${SOCIETY_EMAIL}    ${DEAN_EMAIL}    ${VC_EMAIL}
        ${body}=    Create Dictionary    email=${email}    password=${SEED_PASSWORD}
        ${r}=    POST On Session    api    /module/auth/login    json=${body}    expected_status=401
        Problem Code Should Be    ${r}    AUTH_MFA_REQUIRED
        Should Be Equal    ${r.json()}[errors][0][field]    mfa_code
    END

A wrong password is refused
    ${body}=    Create Dictionary    email=${STUDENT_EMAIL}    password=not-the-password
    ${r}=    POST On Session    api    /module/auth/login    json=${body}    expected_status=401
    Problem Code Should Be    ${r}    AUTH_INVALID_CREDENTIALS

Refresh rotates, and reusing an old refresh token revokes the family
    ${body}=    Create Dictionary    email=${STUDENT_EMAIL}    password=${SEED_PASSWORD}
    ${session}=    POST On Session    api    /module/auth/login    json=${body}
    ${first}=    Set Variable    ${session.json()}[refresh_token]
    ${rotated}=    POST On Session    api    /module/auth/refresh    json=${{ {'refresh_token': $first} }}
    ${second}=    Set Variable    ${rotated.json()}[refresh_token]
    Should Not Be Equal    ${first}    ${second}
    ${replay}=    POST On Session    api    /module/auth/refresh    json=${{ {'refresh_token': $first} }}    expected_status=401
    Problem Code Should Be    ${replay}    AUTH_INVALID_CREDENTIALS
    ${family}=    POST On Session    api    /module/auth/refresh    json=${{ {'refresh_token': $second} }}    expected_status=401
    Problem Code Should Be    ${family}    AUTH_INVALID_CREDENTIALS

A student is offered the three student pages and nothing else
    ${token}=    Login As    ${STUDENT_EMAIL}
    ${caps}=    Capabilities Of    ${token}
    Should Be True    ${caps}[is_student]
    Should Be Empty    ${caps}[clubs]
    Should Be Empty    ${caps}[organiser_events]
    Should Be Empty    ${caps}[approval_stages]
    Should Not Be True    ${caps}[can_see_overview]

A club member holds a club but no budget access
    ${token}=    Login As    ${MEMBER_EMAIL}
    ${caps}=    Capabilities Of    ${token}
    Should Not Be Empty    ${caps}[clubs]
    Should Be Empty    ${caps}[clubs_with_budget_access]
    Should Be Empty    ${caps}[clubs_door_staff]

A treasurer sees the budget but never works a door
    ${token}=    Login As    ${TREASURER_EMAIL}
    ${caps}=    Capabilities Of    ${token}
    Should Not Be Empty    ${caps}[clubs_with_budget_access]
    Should Not Be Empty    ${caps}[clubs_can_propose]
    Should Be Empty    ${caps}[clubs_door_staff]
    Should Be Empty    ${caps}[clubs_can_operate_events]

The Vice-Chancellor gets aggregates, never individual records
    ${token}=    Staff Login As    ${VC_EMAIL}
    ${caps}=    Capabilities Of    ${token}
    Should Be True    ${caps}[is_vice_chancellor]
    Should Not Be True    ${caps}[can_see_individual_records]
    Should Not Be True    ${caps}[can_see_overview]
    Lists Should Be Equal    ${caps}[approval_stages]    ${{ ['vc'] }}


*** Keywords ***
Capabilities Of
    [Arguments]    ${token}
    ${me}=    Me    ${token}
    RETURN    ${me}[capabilities]
