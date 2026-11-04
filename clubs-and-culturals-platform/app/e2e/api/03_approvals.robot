*** Settings ***
Documentation     Steps 3–4: the Cultural Society and the Dean decide; Culturals Night 2026 picks up
...               the Vice-Chancellor because it is over the threshold; the Dean hands the gate to a delegate.
Resource          ../resources/api.resource
Suite Setup       Approvers Sign In
Test Tags         api


*** Test Cases ***
The Society approves the Street Play and it moves to the Dean
    [Tags]    smoke
    ${r}=    Decide    ${society}    ${play}[id]    approve
    Should Be Equal    ${r.json()}[request][current_stage]    dean
    Should Be Equal    ${r.json()}[step][stage]    cultural_society

A club member is not an approver
    ${member}=    Login As    ${THEATRE_MEMBER_EMAIL}
    ${r}=    Decide    ${member}    ${play}[id]    approve    expected=403
    Problem Code Should Be    ${r}    GOVERNANCE_NOT_APPROVER

The Dean may reduce a head, never raise it
    ${line}=    Set Variable    ${play}[lines][0]
    ${over}=    Evaluate    {$line['id']: str(float($line['amount_requested']) + 1)}
    ${r}=    Decide    ${dean}    ${play}[id]    approve    sanctioned=${over}    expected=422
    Problem Code Should Be    ${r}    BUDGET_SANCTION_EXCEEDS_REQUEST

Returning without a comment is refused
    ${r}=    Decide    ${dean}    ${play}[id]    return    expected=422
    Problem Code Should Be    ${r}    GOVERNANCE_COMMENT_REQUIRED

The Dean approves with one head reduced and the event is published
    [Tags]    smoke
    ${line}=    Set Variable    ${play}[lines][0]
    ${reduced}=    Evaluate    {$line['id']: str(float($line['amount_requested']) * 0.8)}
    ${r}=    Decide    ${dean}    ${play}[id]    approve    sanctioned=${reduced}
    Should Be Equal    ${r.json()}[request][state]    approved
    ${lines}=    Set Variable    ${r.json()}[request][lines]
    Should Be True    float($lines[0]['amount_sanctioned']) < float($lines[0]['amount_requested'])
    FOR    ${l}    IN    @{lines}[1:]
        Should Be Equal As Numbers    ${l}[amount_sanctioned]    ${l}[amount_requested]
    END
    ${event}=    GET As    ${dean}    /events/${play}[event]
    Should Be Equal    ${event.json()}[status]    published
    Should Be Equal    ${event.json()}[budget][stage]    sanctioned

The Vice-Chancellor cannot jump the queue on Culturals Night
    Should Be True    ${night}[requires_vc]
    Lists Should Be Equal    ${night}[stages]    ${{ ['cultural_society', 'dean', 'vc'] }}
    ${r}=    Decide    ${vc}    ${night}[id]    approve    expected=409
    Problem Code Should Be    ${r}    GOVERNANCE_WRONG_STAGE

Culturals Night goes Society, Dean, Vice-Chancellor
    [Tags]    smoke
    ${r}=    Decide    ${society}    ${night}[id]    approve
    Should Be Equal    ${r.json()}[request][current_stage]    dean
    ${r}=    Decide    ${dean}    ${night}[id]    approve
    Should Be Equal    ${r.json()}[request][current_stage]    vc
    Should Be True    ${r.json()}[request][requires_mfa]
    ${r}=    Decide    ${vc}    ${night}[id]    approve
    Should Be Equal    ${r.json()}[request][state]    approved
    Should Be True    ${r.json()}[step][mfa_verified]

A Vice-Chancellor session without a second factor does not exist
    [Documentation]    Finding: GOVERNANCE_MFA_REQUIRED (403) is unreachable in local mode — login already refuses staff
    ...    without a code (401), so no VC bearer can lack the mfa claim.
    ${body}=    Create Dictionary    email=${VC_EMAIL}    password=${SEED_PASSWORD}
    ${r}=    POST On Session    api    /module/auth/login    json=${body}    expected_status=401
    Problem Code Should Be    ${r}    AUTH_MFA_REQUIRED

The Dean delegates the gate for a day and the delegate's step names the Dean
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${event}=    Create Draft Event    ${treasurer}    E2E Delegated Decision    Music Room    ${34}    capacity=30    expected=25
    Add Budget Line    ${treasurer}    ${event}[budget][id]    Refreshments    2500
    POST As    ${treasurer}    /events/${event}[id]/submit
    ${approval}=    Find Approval For Event    ${society}    ${event}[id]
    Decide    ${society}    ${approval}[id]    approve
    ${delegate}=    Me    ${society}
    ${principal}=    Me    ${dean}
    ${starts}=    Evaluate    (datetime.datetime.now(datetime.timezone.utc) - datetime.timedelta(minutes=1)).isoformat()    modules=datetime
    ${ends}=    Evaluate    (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=1)).isoformat()    modules=datetime
    ${body}=    Create Dictionary    stage=dean    delegate_user=${delegate}[sub]    starts_at=${starts}    ends_at=${ends}    reason=Away for a day
    ${d}=    POST As    ${dean}    /governance/delegations    ${body}    201
    Should Be Equal    ${d.json()}[status]    active
    # The delegate must sign in again: login demands MFA for anyone with a delegation in force, and the queue follows the token.
    ${covering}=    Staff Login As    ${SOCIETY_EMAIL}
    ${queue}=    GET As    ${covering}    /governance/approvals/queue
    List Should Contain Value    ${queue.json()}[stages_delegated_to_you]    dean
    ${r}=    Decide    ${covering}    ${approval}[id]    approve
    Should Be Equal    ${r.json()}[step][on_behalf_of]    ${principal}[sub]
    Should Be Equal    ${r.json()}[step][stage]    dean
    Should Be Equal    ${r.json()}[request][state]    approved
    [Teardown]    Revoke Delegation    ${d.json()}[id]


*** Keywords ***
Approvers Sign In
    Open API
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    Set Suite Variable    ${society}
    Set Suite Variable    ${dean}
    Set Suite Variable    ${vc}
    ${event}=    Find Event    ${dean}    ${STREET_PLAY}
    ${play}=    Find Approval For Event    ${dean}    ${event}[id]
    Set Suite Variable    ${play}
    ${event}=    Find Event    ${dean}    ${CULTURALS_NIGHT}
    ${night}=    Find Approval For Event    ${dean}    ${event}[id]
    Set Suite Variable    ${night}

Revoke Delegation
    [Documentation]    So the Society's queue is its own again for the suites that follow.
    [Arguments]    ${id}
    ${r}=    POST As    ${dean}    /governance/delegations/${id}/revoke
    Should Be Equal    ${r.json()}[status]    revoked
