*** Settings ***
Documentation     The dashboards show what the API and the database hold: the Dean's "This semester" tiles and
...               chase lists equal the overview endpoint, the Vice-Chancellor's semester report tiles equal the
...               report and its CSV downloads with the same headline, and the Treasurer's Budget page shows the
...               envelope the Dean set and one row per club budget.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Library           OperatingSystem
Suite Setup       Figures Are Read From The API
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    dashboards


*** Test Cases ***
The Dean's tiles and chase lists equal the overview API
    [Tags]    smoke
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Click Link    This semester
    Wait For Heading    This semester
    Tile Should Show    Pending approvals    ${overview}[pending_approvals]
    Tile Should Show    Venue clashes    ${overview}[venue_clashes]
    Tile Should Show    Active clubs    ${overview}[clubs_active]/${overview}[clubs_total]
    Tile Should Show    Past SLA    ${{ len($overview['escalated_approvals']) }}
    ${pending_db}=    Count Rows    governance_approvalrequest    state = 'pending'
    Should Be Equal As Integers    ${overview}[pending_approvals]    ${pending_db}
    Chase List Should Count    No report yet    ${{ len($overview['events_missing_report']) }}
    Chase List Should Count    Missing evidence    ${{ len($overview['missing_evidence']) }}
    Chase List Should Count    No photos    ${{ len($overview['events_missing_photos']) }}
    Snapshot    20-dean-overview

The Vice-Chancellor's report tiles equal the API and the CSV carries the same headline
    Sign In As    ${VC_EMAIL}    ${MFA_CODE}
    Wait For Heading    Vice-Chancellor approvals
    Click Link    Semester report
    Wait For Heading    Semester report
    Tile Should Show    Events run    ${report}[events_run]
    Tile Should Show    Participation    ${report}[total_participation]
    Tile Should Show    Unique students    ${report}[unique_students]
    ${reported_db}=    Count Rows    events_event    status in ('completed', 'reported')
    Should Be True    ${report}[events_run] <= ${reported_db}
    ${download}=    Promise To Wait For Download    ${OUTPUT DIR}/20-semester-report.csv
    Click Button    Download CSV
    ${file}=    Wait For    ${download}
    ${csv}=    Get File    ${file}[saveAs]
    Should Contain    ${csv}    unique_students
    Should Contain    ${csv}    ${{ str($report['unique_students']) }}

The Treasurer's Budget page shows the envelope the Dean set and one row per club budget
    Sign In As    ${TREASURER_EMAIL}
    Wait For Heading    Feed
    Click Link    Budget
    Wait For Heading    Budget
    Wait For Elements State    [data-testid="envelope"]    visible
    Get Text    [data-testid="envelope"]    contains    left of
    Get Text    [data-testid="envelope"]    contains    3,00,000
    Wait For Elements State    [data-testid="budget-row"] >> nth=0    visible
    Get Element Count    [data-testid="budget-row"]    ==    ${budget_count}
    ${env}=    Row    select amount from budget_clubbudgetenvelope where club_id = replace(?, '-', '') and year = ?    ${music}    ${year}
    Should Be Equal As Numbers    ${env}[amount]    300000


*** Keywords ***
Figures Are Read From The API
    Open API
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${music}=    My First Club    ${treasurer}
    Set Suite Variable    ${music}
    ${year}=    Evaluate    datetime.date.today().year    modules=datetime
    Set Suite Variable    ${year}
    Set Envelope    ${dean}    ${music}    300000    year=${year}
    ${o}=    Overview    ${dean}
    Set Suite Variable    ${overview}    ${o.json()}
    ${r}=    Semester Report    ${vc}
    Set Suite Variable    ${report}    ${r.json()}
    ${budgets}=    GET As    ${treasurer}    /budget/budgets    page_size=200
    Set Suite Variable    ${budget_count}    ${budgets.json()}[count]

Tile Should Show
    [Documentation]    The figure (the dd) on the stat tile with this label.
    [Arguments]    ${label}    ${value}
    ${text}=    Get Text    [data-testid="tile"]:has(dt:text-is("${label}")) >> dd
    Should Be Equal As Strings    ${text}    ${value}    msg=tile "${label}" reads ${text}, the API says ${value}

Chase List Should Count
    [Documentation]    The count chip in the chase list's heading.
    [Arguments]    ${title}    ${n}
    ${text}=    Get Text    h3:has-text("${title}")
    ${count}=    Evaluate    re.sub(r'\\D', '', $text.replace($title, ''))
    Should Be Equal As Strings    ${count}    ${n}    msg="${title}" lists ${count}, the API says ${n}
