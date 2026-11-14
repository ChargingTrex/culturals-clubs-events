*** Settings ***
Documentation     Every way a proposal leaves a gate, checked in the API's answer and again in the database:
...               the Dean cuts heads and approves; the Dean returns, the Treasurer edits and resends; above the
...               threshold the Vice-Chancellor approves the Dean's figures and cannot re-cut them; the Society,
...               the Dean and the Vice-Chancellor each reject, and a rejection is final.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Everyone Signs In
Test Tags         api    decisions    approvals


*** Test Cases ***
The Dean cuts two heads and approves; the database holds the Dean's figures
    [Tags]    smoke
    ${p}=    Propose    ${treasurer}    E2E Dean Cuts    Music Room    ${61}    Sound=20000    Refreshments=8000    Printing=2000
    Lists Should Be Equal    ${p}[stages]    ${{ ['cultural_society', 'dean'] }}
    Decide    ${society}    ${p}[approval]    approve
    ${cut}=    Evaluate    {$p['lines']['Sound']: '15000', $p['lines']['Printing']: '0'}
    ${r}=    Decide    ${dean}    ${p}[approval]    approve    sanctioned=${cut}
    Should Be Equal    ${r.json()}[request][state]    approved
    ${e}=    Stored Event    ${p}[event]
    Should Be Equal    ${e}[status]    published
    Should Be Equal    ${e}[budget_stage]    sanctioned
    Line Should Be    ${p}[lines][Sound]    20000    15000
    Line Should Be    ${p}[lines][Refreshments]    8000    8000
    Line Should Be    ${p}[lines][Printing]    2000    0
    ${steps}=    Stored Steps    ${p}[approval]
    Length Should Be    ${steps}    2
    Step Should Be    ${steps}[0]    cultural_society    approve    cultural_society
    Step Should Be    ${steps}[1]    dean    approve    dean
    Should Be Equal As Numbers    ${steps}[1][amount_sanctioned]    23000
    Should Be Equal As Integers    ${steps}[1][mfa_verified]    1
    Audit Should Read    ${p}[event]    event.submitted    approval.approve    approval.approve
    Club Should Be Told    ${p}[event]    approval.approved    is approved and published
    ${seen}=    GET As    ${treasurer}    /events/${p}[event]
    Should Be Equal    ${seen.json()}[status]    published
    Should Be Equal As Numbers    ${seen.json()}[budget][total_sanctioned]    23000

The Dean approves without touching a head and every head is sanctioned as requested
    [Documentation]    Finding #1 (docs/qa/e2e-findings-2026-11-08.md), fixed 2026-11-10: a Dean approval with no `sanctioned`
    ...    map sanctions every head as requested. The approver screen always sends every line; an API client need not.
    ...    The rule (governance/services.py) is "any head the approver did not touch is sanctioned as requested".
    ${p}=    Propose    ${treasurer}    E2E Dean Approves As Asked    Music Room    ${62}    Sound=6000    Refreshments=2000
    Decide    ${society}    ${p}[approval]    approve
    Decide    ${dean}    ${p}[approval]    approve
    Event Status Should Be    ${p}[event]    published
    Line Should Be    ${p}[lines][Sound]    6000    6000
    Line Should Be    ${p}[lines][Refreshments]    2000    2000
    ${seen}=    GET As    ${treasurer}    /events/${p}[event]
    Should Be Equal As Numbers    ${seen.json()}[budget][total_sanctioned]    8000

The Dean returns it; the Treasurer edits event and budget, and it goes through every gate again
    ${p}=    Propose    ${treasurer}    E2E Return And Resend    Music Room    ${63}    Sound=10000    Printing=1500
    Decide    ${society}    ${p}[approval]    approve
    ${r}=    Decide    ${dean}    ${p}[approval]    return    comment=Get a second quote for sound
    Should Be Equal    ${r.json()}[request][state]    returned
    ${e}=    Stored Event    ${p}[event]
    Should Be Equal    ${e}[status]    returned
    Should Be Equal    ${e}[budget_stage]    returned
    ${steps}=    Stored Steps    ${p}[approval]
    Step Should Be    ${steps}[1]    dean    return    dean
    Should Be Equal    ${steps}[1][comment]    Get a second quote for sound
    Line Should Be    ${p}[lines][Sound]    10000    ${None}
    Club Should Be Told    ${p}[event]    approval.returned    Get a second quote for sound
    # The Treasurer edits both the event and a budget head, then resends.
    ${edit}=    Create Dictionary    description=Second quote attached: the sound is cheaper    expected_attendance=${35}
    PATCH As    ${treasurer}    /events/${p}[event]    ${edit}
    PUT As    ${treasurer}    /budget/budgets/${p}[budget]/lines/${p}[lines][Sound]/edit    ${{ {'amount_requested': '7000'} }}
    ${again}=    POST As    ${treasurer}    /events/${p}[event]/submit
    Should Be Equal    ${again.json()}[current_stage]    cultural_society
    ${requests}=    Stored Requests    ${p}[event]
    Length Should Be    ${requests}    2
    Should Be Equal As Numbers    ${requests}[1][amount_requested]    8500
    Should Be Equal    ${requests}[0][state]    returned
    Should Be Equal    ${requests}[1][state]    pending
    Line Should Be    ${p}[lines][Sound]    7000    ${None}
    Decide    ${society}    ${again.json()}[id]    approve
    ${r}=    Decide    ${dean}    ${again.json()}[id]    approve
    Should Be Equal    ${r.json()}[request][state]    approved
    ${e}=    Stored Event    ${p}[event]
    Should Be Equal    ${e}[status]    published
    Should Be Equal    ${e}[description]    Second quote attached: the sound is cheaper
    Should Be Equal As Integers    ${e}[expected_attendance]    35
    Audit Should Read    ${p}[event]    event.submitted    approval.approve    approval.return
    ...    event.submitted    approval.approve    approval.approve

Above the threshold the Dean cuts, the Vice-Chancellor cannot re-cut, and approves the Dean's figures
    ${p}=    Propose    ${treasurer}    E2E Above Threshold Approved    Main Auditorium    ${64}    Stage=40000    Sound=20000
    Lists Should Be Equal    ${p}[stages]    ${{ ['cultural_society', 'dean', 'vc'] }}
    Decide    ${society}    ${p}[approval]    approve
    ${cut}=    Evaluate    {$p['lines']['Stage']: '25000'}
    ${r}=    Decide    ${dean}    ${p}[approval]    approve    sanctioned=${cut}
    # The route is fixed at submission: below the threshold after the cut, it still goes to the Vice-Chancellor.
    Should Be Equal    ${r.json()}[request][current_stage]    vc
    # Finding: a sanction map from the Vice-Chancellor is accepted (200) and silently ignored, not refused.
    ${recut}=    Evaluate    {$p['lines']['Sound']: '1000'}
    ${r}=    Decide    ${vc}    ${p}[approval]    approve    sanctioned=${recut}
    Should Be Equal    ${r.json()}[request][state]    approved
    Line Should Be    ${p}[lines][Stage]    40000    25000
    Line Should Be    ${p}[lines][Sound]    20000    20000
    ${steps}=    Stored Steps    ${p}[approval]
    Length Should Be    ${steps}    3
    Step Should Be    ${steps}[2]    vc    approve    vice_chancellor
    Should Be Equal As Integers    ${steps}[2][mfa_verified]    1
    Should Be Equal As Numbers    ${steps}[2][amount_sanctioned]    45000
    Event Status Should Be    ${p}[event]    published

The Vice-Chancellor rejects; the rejection is final and the club is told why
    [Tags]    smoke
    ${p}=    Propose    ${treasurer}    E2E Vice-Chancellor Rejects    Main Auditorium    ${65}    Stage=70000
    Decide    ${society}    ${p}[approval]    approve
    Decide    ${dean}    ${p}[approval]    approve
    ${r}=    Decide    ${vc}    ${p}[approval]    reject    expected=422
    Problem Code Should Be    ${r}    GOVERNANCE_COMMENT_REQUIRED
    ${r}=    Decide    ${vc}    ${p}[approval]    reject    comment=Too large for one evening; fold it into the fest
    Should Be Equal    ${r.json()}[request][state]    rejected
    ${e}=    Stored Event    ${p}[event]
    Should Be Equal    ${e}[status]    rejected
    Should Be Equal    ${e}[budget_stage]    rejected
    ${req}=    Row    select state, resolved_at from governance_approvalrequest where id = replace(?, '-', '')    ${p}[approval]
    Should Be Equal    ${req}[state]    rejected
    Should Not Be Equal    ${req}[resolved_at]    ${None}
    ${steps}=    Stored Steps    ${p}[approval]
    Step Should Be    ${steps}[2]    vc    reject    vice_chancellor
    Should Be Equal    ${steps}[2][comment]    Too large for one evening; fold it into the fest
    Club Should Be Told    ${p}[event]    approval.rejected    Vice-Chancellor: Too large for one evening
    # Final: no second decision, no resubmission, no edits, and gone from the queue.
    ${r}=    Decide    ${vc}    ${p}[approval]    approve    expected=409
    Problem Code Should Be    ${r}    GOVERNANCE_ALREADY_RESOLVED
    ${r}=    POST As    ${treasurer}    /events/${p}[event]/submit    expected=409
    Problem Code Should Be    ${r}    GOVERNANCE_ALREADY_SUBMITTED
    ${r}=    PATCH As    ${treasurer}    /events/${p}[event]    ${{ {'description': 'once more'} }}    expected=409
    Problem Code Should Be    ${r}    EVENTS_LOCKED
    Queue Should Not Hold    ${vc}    ${p}[approval]

The Dean rejects at the Dean gate; the Vice-Chancellor is never asked and nothing is sanctioned
    ${p}=    Propose    ${treasurer}    E2E Dean Rejects    Main Auditorium    ${66}    Stage=55000
    Lists Should Be Equal    ${p}[stages]    ${{ ['cultural_society', 'dean', 'vc'] }}
    Decide    ${society}    ${p}[approval]    approve
    ${r}=    Decide    ${dean}    ${p}[approval]    reject    comment=No quotes attached for the stage
    Should Be Equal    ${r.json()}[request][state]    rejected
    Should Be Equal    ${r.json()}[request][current_stage]    dean
    ${e}=    Stored Event    ${p}[event]
    Should Be Equal    ${e}[status]    rejected
    Should Be Equal    ${e}[budget_stage]    rejected
    Line Should Be    ${p}[lines][Stage]    55000    ${None}
    ${steps}=    Stored Steps    ${p}[approval]
    Length Should Be    ${steps}    2
    Queue Should Not Hold    ${vc}    ${p}[approval]
    ${asked}=    Query    select n.id from governance_notification n join identity_user u on u.id = n.user_id where u.email = ? and n.kind = 'approval.pending' and n.link like ?    ${VC_EMAIL}    %${p}[event]
    Should Be Empty    ${asked}
    Club Should Be Told    ${p}[event]    approval.rejected    Dean of Student Affairs: No quotes attached

The Society rejects at the first gate; the Dean is never asked
    ${p}=    Propose    ${treasurer}    E2E Society Rejects    Music Room    ${67}    Printing=900
    ${r}=    Decide    ${society}    ${p}[approval]    reject    comment=Clashes with the society's own week
    Should Be Equal    ${r.json()}[request][state]    rejected
    ${steps}=    Stored Steps    ${p}[approval]
    Length Should Be    ${steps}    1
    Step Should Be    ${steps}[0]    cultural_society    reject    cultural_society
    Event Status Should Be    ${p}[event]    rejected
    Queue Should Not Hold    ${dean}    ${p}[approval]
    ${asked}=    Query    select n.id from governance_notification n join identity_user u on u.id = n.user_id where u.email = ? and n.kind = 'approval.pending' and n.link like ?    ${DEAN_EMAIL}    %${p}[event]
    Should Be Empty    ${asked}

A rejected proposal can still be deleted by the club, and the database lets it go
    ${p}=    Propose    ${treasurer}    E2E Rejected Then Deleted    Music Room    ${68}    Printing=500
    Decide    ${society}    ${p}[approval]    reject    comment=Not this term
    ${headers}=    Bearer    ${treasurer}
    DELETE On Session    api    /events/${p}[event]    headers=${headers}    expected_status=204
    ${left}=    Query    select id from events_event where id = replace(?, '-', '')    ${p}[event]
    Should Be Empty    ${left}


*** Keywords ***
Everyone Signs In
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${society}
    Set Suite Variable    ${dean}
    Set Suite Variable    ${vc}

Queue Should Not Hold
    [Arguments]    ${token}    ${approval_id}
    ${queue}=    GET As    ${token}    /governance/approvals/queue
    Should Not Contain    ${{ [a['id'] for a in $queue.json()['results']] }}    ${approval_id}
