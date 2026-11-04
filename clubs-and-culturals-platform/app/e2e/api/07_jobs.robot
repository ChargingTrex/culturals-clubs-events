*** Settings ***
Documentation     The scheduled jobs sit outside the user token scheme: only the JOBS_TOKEN opens them.
Resource          ../resources/api.resource
Suite Setup       Open API
Test Tags         api


*** Test Cases ***
The SLA escalation job refuses a call without the token
    ${r}=    POST On Session    api    /jobs/escalate-sla    expected_status=401
    Problem Code Should Be    ${r}    JOBS_UNAUTHORIZED

A user's bearer is not the jobs token
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${r}=    POST As    ${dean}    /jobs/escalate-sla    expected=401
    Problem Code Should Be    ${r}    JOBS_UNAUTHORIZED

With the token the job runs and reports a result
    [Tags]    smoke
    ${r}=    POST As    ${JOBS_TOKEN}    /jobs/escalate-sla
    Should Be Equal    ${r.json()}[job]    escalate-sla
    Should Not Be Empty    ${r.json()}[finished_at]
    Dictionary Should Contain Key    ${r.json()}    result
