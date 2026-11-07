*** Settings ***
Documentation     Steps 1–2: the Treasurer creates an event priced later, prices it line by line
...               (or declares it needs no budget), and sends it. Under review the lines freeze.
Resource          ../resources/api.resource
Suite Setup       Treasurer Drafts An Event
Test Tags         api


*** Test Cases ***
A priced-later draft starts with an empty, editable budget
    [Tags]    smoke
    ${budget}=    Budget    ${treasurer}    ${budget_id}
    Should Be Equal    ${budget}[stage]    draft
    Should Be Empty    ${budget}[lines]
    Should Be True    ${budget}[is_editable]
    Should Not Be True    ${budget}[is_ready_to_submit]

Declaring nil without a reason is refused
    ${r}=    POST As    ${treasurer}    /budget/budgets/${budget_id}/declare-nil    ${{ {'reason': ''} }}    422
    # Finding: the docs promise BUDGET_NIL_REASON_REQUIRED; the serializer answers first with VALIDATION_FAILED on `reason`.
    Should Be Equal    ${r.json()}[errors][0][field]    reason

Declaring nil with a reason makes the budget ready to send
    ${r}=    POST As    ${treasurer}    /budget/budgets/${budget_id}/declare-nil    ${{ {'reason': 'Acoustic set, the hall and gear are ours already'} }}
    Should Be Equal    ${r.json()}[nil_declaration][head]    No budget required
    Should Be True    ${r.json()}[is_ready_to_submit]

Adding a priced line withdraws the nil declaration
    ${r}=    Add Budget Line    ${treasurer}    ${budget_id}    Sound & lighting    12000
    Should Be Equal    ${r.json()}[nil_declaration]    ${None}
    ${r}=    Add Budget Line    ${treasurer}    ${budget_id}    Refreshments    3000
    Length Should Be    ${r.json()}[lines]    2
    Should Be Equal As Numbers    ${r.json()}[total_requested]    15000

The Treasurer sends it for approval and the route is frozen
    [Tags]    smoke
    ${r}=    POST As    ${treasurer}    /events/${event_id}/submit
    Lists Should Be Equal    ${r.json()}[stages]    ${{ ['cultural_society', 'dean'] }}
    Should Be Equal    ${r.json()}[current_stage]    cultural_society
    Should Not Be True    ${r.json()}[requires_vc]
    ${again}=    POST As    ${treasurer}    /events/${event_id}/submit    expected=409
    Problem Code Should Be    ${again}    GOVERNANCE_ALREADY_SUBMITTED

Lines are locked while an approver holds the budget
    ${r}=    Add Budget Line    ${treasurer}    ${budget_id}    Printing    800    expected=409
    Problem Code Should Be    ${r}    BUDGET_LOCKED

A club member cannot read the budget at all
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${r}=    GET As    ${member}    /budget/budgets/${budget_id}    expected=404
    Problem Code Should Be    ${r}    NOT_FOUND
    ${event}=    GET As    ${member}    /events/${event_id}
    Should Be Equal    ${event.json()}[budget]    ${None}

An event declared free is sent with its reason where the figures would be
    ${nil}=    Create Draft Event    ${treasurer}    E2E Free Listening Session    Music Room    ${32}    capacity=30    expected=25
    POST As    ${treasurer}    /budget/budgets/${nil}[budget][id]/declare-nil    ${{ {'reason': 'Members only, nothing to buy'} }}
    ${sent}=    POST As    ${treasurer}    /events/${nil}[id]/submit
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${queue}=    GET As    ${society}    /governance/approvals/queue
    ${item}=    Evaluate    [a for a in $queue.json()['results'] if a['event'] == $nil['id']][0]
    Should Be Equal    ${item}[nil_declaration][reason]    Members only, nothing to buy
    Should Be Equal As Numbers    ${item}[amount_requested]    0


*** Keywords ***
Treasurer Drafts An Event
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    Set Suite Variable    ${treasurer}
    ${event}=    Create Draft Event    ${treasurer}    E2E Monsoon Unplugged    Music Room    ${30}    capacity=30    expected=25
    Set Suite Variable    ${event_id}    ${event}[id]
    Set Suite Variable    ${budget_id}    ${event}[budget][id]
    Should Be Equal    ${event}[status]    draft

Budget
    [Arguments]    ${token}    ${id}
    ${r}=    GET As    ${token}    /budget/budgets/${id}
    RETURN    ${r.json()}
