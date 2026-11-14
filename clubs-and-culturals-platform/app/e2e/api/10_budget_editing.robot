*** Settings ***
Documentation     The Treasurer's text boxes and spreadsheet, one rule per test: a line's head and amount are edited
...               and stored; empty, negative and duplicate heads are refused; editing every line at once (what the
...               screen's "Edit all" sends) lands every line; a CSV replaces or extends the lines, all rows or none;
...               a member sees no budget; only the Dean sets the envelope; and nothing moves once an approver holds it.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Treasurer Drafts Two Budgets
Test Tags         api    budget    unit


*** Test Cases ***
Editing a line's head and amount is stored
    [Tags]    smoke
    ${r}=    Edit Line    ${treasurer}    ${a}[budget]    ${a}[lines][Sound]    head=Sound & lights    amount_requested=1500
    Should Be Equal As Numbers    ${r.json()}[total_requested]    1700
    ${lines}=    Stored Lines    ${a}[budget]
    Should Be Equal    ${lines}[0][head]    Sound & lights
    Should Be Equal As Numbers    ${lines}[0][amount_requested]    1500
    Should Be Equal As Numbers    ${lines}[1][amount_requested]    200

An empty head is refused
    # The serializer refuses a blank head before the service's BUDGET_LINE_HEAD_REQUIRED can: the field is named either way.
    ${r}=    Edit Line    ${treasurer}    ${a}[budget]    ${a}[lines][Sound]    expected=422    head=${SPACE}
    Problem Code Should Be    ${r}    VALIDATION_FAILED
    Should Be Equal    ${r.json()}[errors][0][field]    head
    ${line}=    Row By Id    budget_budgetline    ${a}[lines][Sound]
    Should Be Equal    ${line}[head]    Sound & lights

A negative amount is refused
    ${r}=    Edit Line    ${treasurer}    ${a}[budget]    ${a}[lines][Sound]    expected=422    amount_requested=-1
    Problem Code Should Be    ${r}    BUDGET_LINE_NEGATIVE
    Line Should Be    ${a}[lines][Sound]    1500    ${None}

A head already on the budget is refused
    ${r}=    Edit Line    ${treasurer}    ${a}[budget]    ${a}[lines][Printing]    expected=409    head=sound & LIGHTS
    Problem Code Should Be    ${r}    BUDGET_LINE_DUPLICATE_HEAD
    ${line}=    Row By Id    budget_budgetline    ${a}[lines][Printing]
    Should Be Equal    ${line}[head]    Printing

Editing every line at once lands every line and the total follows
    [Documentation]    "Edit all" on the budget page sends one PUT per row and then reads the budget back.
    [Tags]    smoke
    Edit Line    ${treasurer}    ${b}[budget]    ${b}[lines][Sound]    amount_requested=4500
    Edit Line    ${treasurer}    ${b}[budget]    ${b}[lines][Refreshments]    head=Stage lights    amount_requested=2500
    Edit Line    ${treasurer}    ${b}[budget]    ${b}[lines][Printing]    amount_requested=600
    ${r}=    Budget Of    ${treasurer}    ${b}[budget]
    ${heads}=    Evaluate    {l['head']: float(l['amount_requested']) for l in $r.json()['lines']}
    Should Be Equal    ${heads}    ${{ {'Sound': 4500.0, 'Stage lights': 2500.0, 'Printing': 600.0} }}
    Should Be Equal As Numbers    ${r.json()}[total_requested]    7600
    ${lines}=    Stored Lines    ${b}[budget]
    ${stored}=    Evaluate    [(l['head'], float(l['amount_requested'])) for l in $lines]
    Should Be Equal    ${stored}    ${{ [('Sound', 4500.0), ('Stage lights', 2500.0), ('Printing', 600.0)] }}

Removing a line keeps the others in order
    Remove Line    ${treasurer}    ${b}[budget]    ${b}[lines][Refreshments]
    ${lines}=    Stored Lines    ${b}[budget]
    ${heads}=    Evaluate    [l['head'] for l in $lines]
    Should Be Equal    ${heads}    ${{ ['Sound', 'Printing'] }}
    ${gone}=    Count Rows    budget_budgetline    id = replace(?, '-', '')    ${b}[lines][Refreshments]
    Should Be Equal As Integers    ${gone}    0

A CSV replaces the lines
    [Tags]    smoke
    ${r}=    Import Lines    ${treasurer}    ${b}[budget]    ${FIXTURES}/budget_ok.csv    mode=replace
    Should Be Equal As Numbers    ${r.json()}[total_requested]    15000
    ${lines}=    Stored Lines    ${b}[budget]
    ${stored}=    Evaluate    [(l['head'], float(l['amount_requested']), l['basis']) for l in $lines]
    Should Be Equal    ${stored}    ${{ [('Sound & lighting', 12000.0, 'lump_sum'), ('Refreshments', 3000.0, 'lump_sum')] }}
    Should Be True    ${lines}[0][position] < ${lines}[1][position]

A CSV can add to the lines instead
    ${r}=    Import Lines    ${treasurer}    ${b}[budget]    ${FIXTURES}/budget_append.csv    mode=append
    Should Be Equal As Numbers    ${r.json()}[total_requested]    15800
    ${lines}=    Stored Lines    ${b}[budget]
    ${heads}=    Evaluate    [l['head'] for l in $lines]
    Should Be Equal    ${heads}    ${{ ['Sound & lighting', 'Refreshments', 'Printing'] }}

One bad row saves nothing and names the row
    [Tags]    smoke
    ${before}=    Stored Lines    ${b}[budget]
    ${r}=    Import Lines    ${treasurer}    ${b}[budget]    ${FIXTURES}/budget_bad_row.csv    mode=replace    expected=422
    Problem Code Should Be    ${r}    BUDGET_IMPORT_INVALID
    ${fields}=    Evaluate    [e['field'] for e in $r.json()['errors']]
    Should Be Equal    ${fields}    ${{ ['row 3: amount'] }}
    ${after}=    Stored Lines    ${b}[budget]
    Should Be Equal    ${before}    ${after}

A file without the head and amount columns is refused
    ${r}=    Import Lines    ${treasurer}    ${b}[budget]    ${FIXTURES}/budget_missing_columns.csv    expected=422
    Problem Code Should Be    ${r}    BUDGET_IMPORT_COLUMNS
    ${lines}=    Stored Lines    ${b}[budget]
    Length Should Be    ${lines}    3

A member never finds the budget, so cannot edit or import
    ${r}=    Budget Of    ${member}    ${b}[budget]    expected=404
    Problem Code Should Be    ${r}    NOT_FOUND
    ${r}=    Edit Line    ${member}    ${b}[budget]    ${b}[lines][Sound]    expected=404    amount_requested=1
    Problem Code Should Be    ${r}    NOT_FOUND
    ${r}=    Import Lines    ${member}    ${b}[budget]    ${FIXTURES}/budget_ok.csv    expected=404
    Problem Code Should Be    ${r}    NOT_FOUND

Only the Dean sets the club's envelope, and the budget then shows it
    ${r}=    Set Envelope    ${treasurer}    ${music}    300000    expected=403
    Problem Code Should Be    ${r}    BUDGET_ENVELOPE_DENIED
    # The envelope a budget draws on is the calendar year of its event's start (budget/services.py envelope_year_of).
    ${year}=    Evaluate    (datetime.date.today() + datetime.timedelta(days=86)).year    modules=datetime
    Set Envelope    ${dean}    ${music}    300000    year=${year}
    ${rows}=    Query    select amount from budget_clubbudgetenvelope where club_id = replace(?, '-', '') and year = ?    ${music}    ${year}
    Length Should Be    ${rows}    1
    Should Be Equal As Numbers    ${rows}[0][amount]    300000
    ${r}=    Budget Of    ${treasurer}    ${b}[budget]
    Should Not Be Equal    ${r.json()}[envelope]    ${None}
    Should Be Equal As Integers    ${r.json()}[envelope][year]    ${year}
    Should Be Equal As Numbers    ${r.json()}[envelope][amount]    300000

Once sent for approval nothing on the budget moves
    POST As    ${treasurer}    /events/${b}[event]/submit
    ${lines}=    Stored Lines    ${b}[budget]
    ${sound}=    Evaluate    str(uuid.UUID($lines[0]['id']))    modules=uuid
    ${r}=    Edit Line    ${treasurer}    ${b}[budget]    ${sound}    expected=409    amount_requested=1
    Problem Code Should Be    ${r}    BUDGET_LOCKED
    ${r}=    Import Lines    ${treasurer}    ${b}[budget]    ${FIXTURES}/budget_ok.csv    expected=409
    Problem Code Should Be    ${r}    BUDGET_LOCKED
    ${r}=    Remove Line    ${treasurer}    ${b}[budget]    ${sound}    expected=409
    Problem Code Should Be    ${r}    BUDGET_LOCKED
    ${lines}=    Stored Lines    ${b}[budget]
    Length Should Be    ${lines}    3


*** Keywords ***
Treasurer Drafts Two Budgets
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${member}
    Set Suite Variable    ${dean}
    ${music}=    My First Club    ${treasurer}
    Set Suite Variable    ${music}
    ${a}=    Draft With Lines    E2E Line Edits    ${85}    Sound=1000    Printing=200
    ${b}=    Draft With Lines    E2E Edit All And CSV    ${86}    Sound=3000    Refreshments=2000    Printing=500
    Set Suite Variable    ${a}
    Set Suite Variable    ${b}

Draft With Lines
    [Documentation]    A draft in the Music Room with these heads (head=amount), not sent. Line ids by head, as Propose does.
    [Arguments]    ${title}    ${days}    &{heads}
    ${event}=    Create Draft Event    ${treasurer}    ${title}    Music Room    ${days}    capacity=30    expected=25
    FOR    ${head}    ${amount}    IN    &{heads}
        ${r}=    Add Budget Line    ${treasurer}    ${event}[budget][id]    ${head}    ${amount}
    END
    ${lines}=    Evaluate    {l['head']: l['id'] for l in $r.json()['lines']}
    ${d}=    Create Dictionary    event=${event}[id]    budget=${event}[budget][id]    lines=${lines}
    RETURN    ${d}
