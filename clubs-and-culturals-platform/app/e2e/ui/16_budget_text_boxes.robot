*** Settings ***
Documentation     AR-04 on screen: the Treasurer turns every budget line into text boxes with Edit all and saves them
...               with one Save all; replaces the lines from a CSV, adds to them from another, and sees a bad file
...               refused with nothing changed. Each outcome is read back from the database.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Treasurer Prices Three Lines
Test Setup        Open The Budget
Test Teardown     Close Context
Test Tags         ui    budget


*** Test Cases ***
Edit all turns every line into text boxes and Save all stores them together
    [Tags]    smoke
    Click Button    Edit all
    Get Element Count    [data-testid="budget-line-edit"]    ==    3
    Fill Field    Amount of entry 1    4500
    Fill Field    Head of entry 2    Stage lights
    Fill Field    Amount of entry 3    800
    Snapshot    16-treasurer-edit-all
    Click Button    Save all
    Toast Should Read    3 entries saved
    Get Text    [data-testid="total-requested"]    contains    7,300
    Line Should Be    ${lines}[Sound]    4500    ${None}
    ${second}=    Row By Id    budget_budgetline    ${lines}[Lights]
    Should Be Equal    ${second}[head]    Stage lights
    Should Be Equal As Numbers    ${second}[amount_requested]    2000
    Line Should Be    ${lines}[Chairs]    800    ${None}

A CSV replaces the lines
    [Tags]    smoke
    Upload File    Or upload a CSV (columns head, amount, basis optional)    ${FIXTURES}/budget_ok.csv
    Select Option    Existing entries    Replace them
    Click Button    Upload
    Toast Should Read    Entries imported from the CSV
    Wait For Text    Sound & lighting
    Get Text    [data-testid="total-requested"]    contains    15,000
    ${stored}=    Stored Lines    ${budget}
    Length Should Be    ${stored}    2
    Should Be Equal    ${stored}[0][head]    Sound & lighting
    Should Be Equal As Numbers    ${stored}[0][amount_requested]    12000
    Should Be Equal    ${stored}[1][head]    Refreshments
    Should Be Equal As Numbers    ${stored}[1][amount_requested]    3000

A second CSV adds to the lines when the Treasurer keeps the existing ones
    Upload File    Or upload a CSV (columns head, amount, basis optional)    ${FIXTURES}/budget_append.csv
    Select Option    Existing entries    Keep them, add these
    Click Button    Upload
    Toast Should Read    Entries imported from the CSV
    Wait For Text    Printing
    ${stored}=    Stored Lines    ${budget}
    Length Should Be    ${stored}    3
    Should Be Equal    ${stored}[2][head]    Printing
    Should Be Equal As Numbers    ${stored}[2][amount_requested]    800

A file with one bad row is refused by row and changes nothing
    ${before}=    Stored Lines    ${budget}
    Upload File    Or upload a CSV (columns head, amount, basis optional)    ${FIXTURES}/budget_bad_row.csv
    Select Option    Existing entries    Replace them
    Click Button    Upload
    Expect Problem Banner    BUDGET_IMPORT_INVALID
    Wait For Text    row 3
    ${after}=    Stored Lines    ${budget}
    Should Be Equal    ${{ [(l['head'], str(l['amount_requested'])) for l in $before] }}    ${{ [(l['head'], str(l['amount_requested'])) for l in $after] }}

The template download is a ready-made CSV
    ${link}=    Get Element By Role    link    name=Download template    exact=${True}
    Get Attribute    ${link}    download    ==    budget-template.csv
    Get Attribute    ${link}    href    contains    head%2Camount


*** Keywords ***
Treasurer Prices Three Lines
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${event}=    Create Draft Event    ${treasurer}    E2E UI Edit All    Music Room    ${100}    capacity=30    expected=25
    ${budget}=    Set Variable    ${event}[budget][id]
    FOR    ${head}    ${amount}    IN    Sound    10000    Lights    2000    Chairs    500
        ${r}=    Add Budget Line    ${treasurer}    ${budget}    ${head}    ${amount}
    END
    ${lines}=    Evaluate    {l['head']: l['id'] for l in $r.json()['lines']}
    Set Suite Variable    ${event_title}    E2E UI Edit All
    Set Suite Variable    ${budget}
    Set Suite Variable    ${lines}

Open The Budget
    Open App
    Sign In As    ${TREASURER_EMAIL}
    Wait For Elements State    [data-testid="nav-sidebar"]    visible
    Go To    ${WEB_BASE}/club/budget/${budget}
    Wait For Heading    ${event_title}
    Wait For Elements State    [data-testid="budget-line"] >> nth=0    visible
