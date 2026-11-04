*** Settings ***
Documentation     After the night: the Treasurer settles a sanctioned budget once every blocker is
...               cleared, the semester report leads with unique students, and attendees rate the event once.
Resource          ../resources/api.resource
Suite Setup       Treasurer And Staff Sign In
Test Tags         api


*** Test Cases ***
Settling with no spend recorded names the blocker
    ${r}=    POST As    ${treasurer}    /budget/budgets/${budget_id}/settle    expected=422
    Problem Code Should Be    ${r}    BUDGET_SETTLEMENT_INCOMPLETE
    ${codes}=    Evaluate    [e['code'] for e in $r.json()['errors']]
    List Should Contain Value    ${codes}    NO_SPEND_ENTERED

Every remaining blocker is reported together
    [Tags]    smoke
    # Line A: above the receipt threshold, no receipt. Line B: over its sanction, no explanation.
    PATCH As    ${treasurer}    /budget/budgets/${budget_id}/lines/${line_a}[id]    ${{ {'amount_spent': '9000.00'} }}
    ${over}=    Evaluate    str(float($line_b['amount_sanctioned']) + 500)
    PATCH As    ${treasurer}    /budget/budgets/${budget_id}/lines/${line_b}[id]    ${{ {'amount_spent': $over} }}
    ${r}=    POST As    ${treasurer}    /budget/budgets/${budget_id}/settle    expected=422
    ${codes}=    Evaluate    [e['code'] for e in $r.json()['errors']]
    List Should Contain Value    ${codes}    RECEIPT_REQUIRED
    List Should Contain Value    ${codes}    VARIANCE_NOTE_REQUIRED

A receipt per line and a variance note, then it settles
    [Tags]    smoke
    ${pdf}=    Evaluate    ('sound.pdf', b'%PDF-1.4\\n1 0 obj<<>>endobj\\ntrailer<<>>\\n%%EOF', 'application/pdf')
    ${files}=    Create Dictionary    file=${pdf}
    ${headers}=    Bearer    ${treasurer}
    ${r}=    POST On Session    api    /budget/budgets/${budget_id}/lines/${line_a}[id]/receipts    files=${files}    data=${{ {'amount': '9000.00', 'vendor': 'Sound Co'} }}    headers=${headers}    expected_status=201
    Should Be Equal    ${r.json()}[content_type]    application/pdf
    PATCH As    ${treasurer}    /budget/budgets/${budget_id}/lines/${line_b}[id]    ${{ {'variance_note': 'Extra stage lighting hired on the night'} }}
    ${r}=    POST As    ${treasurer}    /budget/budgets/${budget_id}/settle
    Should Be Equal    ${r.json()}[stage]    settled
    Should Not Be Empty    ${r.json()}[settled_at]

The semester report leads with unique students, not total attendance
    [Tags]    smoke
    ${r}=    GET As    ${vc}    /reporting/reports/semester
    ${report}=    Set Variable    ${r.json()}
    Should Be True    ${report}[unique_students] > 0
    Should Be True    ${report}[unique_students] != ${report}[total_participation]
    Should Be True    ${report}[unique_students] < ${report}[total_participation]
    ${text}=    Set Variable    ${r.text}
    Should Not Match Regexp    ${text}    \\b\\d{2}[A-Z]{2,4}\\d{3,5}\\b

The CSV carries the same headline and no PRN
    ${headers}=    Bearer    ${vc}
    ${r}=    GET On Session    api    /reporting/reports/semester/csv    headers=${headers}
    Should Contain    ${r.headers}[Content-Type]    text/csv
    Should Contain    ${r.text}    unique_students
    Should Not Match Regexp    ${r.text}    \\b\\d{2}[A-Z]{2,4}\\d{3,5}\\b

A student cannot read the report
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${r}=    GET As    ${student}    /reporting/reports/semester    expected=403
    Problem Code Should Be    ${r}    REPORTING_DENIED

An attendee rates the event once
    ${r}=    POST As    ${attendee}    /feedback/events/${event}[id]    ${{ {'rating': 4, 'would_recommend': True, 'comment': 'Loud, late, lovely.'} }}    201
    Should Be Equal As Integers    ${r.json()}[rating]    4
    ${r}=    POST As    ${attendee}    /feedback/events/${event}[id]    ${{ {'rating': 5, 'would_recommend': True} }}    409
    Problem Code Should Be    ${r}    FEEDBACK_ALREADY_SUBMITTED

Someone who did not attend cannot rate it
    ${r}=    POST As    ${absentee}    /feedback/events/${event}[id]    ${{ {'rating': 1, 'would_recommend': False} }}    403
    Problem Code Should Be    ${r}    FEEDBACK_NOT_ATTENDED

The organiser's summary has no ids, names or PRNs
    ${president}=    Login As    ${DANCE_PRESIDENT_EMAIL}
    ${r}=    GET As    ${president}    /feedback/events/${event}[id]/summary
    ${keys}=    Evaluate    sorted($r.json().keys())
    Lists Should Be Equal    ${keys}    ${{ ['average_rating', 'comments', 'count', 'event', 'recommend_rate'] }}
    Should Be True    ${r.json()}[count] >= 1
    List Should Contain Value    ${r.json()}[comments]    Loud, late, lovely.


*** Keywords ***
Treasurer And Staff Sign In
    Open API
    ${treasurer}=    Login As    ${DANCE_TREASURER_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${vc}
    # Finding: the seed already settles "Unplugged Evening", so the Dance Showcase is the reported, sanctioned budget left to settle.
    ${event}=    Find Event    ${treasurer}    ${REPORTED_EVENT}
    Set Suite Variable    ${event}
    Should Be Equal    ${event}[status]    reported
    Should Be Equal    ${event}[budget][stage]    sanctioned
    Set Suite Variable    ${budget_id}    ${event}[budget][id]
    ${budget}=    GET As    ${treasurer}    /budget/budgets/${budget_id}
    # Line A is the biggest head (a receipt is due above 5,000); line B the smallest (overspend by 500 stays under it).
    ${line_a}=    Evaluate    max($budget.json()['lines'], key=lambda l: float(l['amount_sanctioned']))
    ${line_b}=    Evaluate    min($budget.json()['lines'], key=lambda l: float(l['amount_sanctioned']))
    Set Suite Variable    ${line_a}
    Set Suite Variable    ${line_b}
    ${roster}=    GET As    ${dean}    /participation/events/${event}[id]/roster
    ${went}=    Evaluate    [x for x in $roster.json()['results'] if x['attended']][0]
    ${stayed}=    Evaluate    [x for x in $roster.json()['results'] if not x['attended']][0]
    ${attendee}=    Login As    ${{ $went['prn'].lower() + '@college.edu' }}
    ${absentee}=    Login As    ${{ $stayed['prn'].lower() + '@college.edu' }}
    Set Suite Variable    ${attendee}
    Set Suite Variable    ${absentee}
