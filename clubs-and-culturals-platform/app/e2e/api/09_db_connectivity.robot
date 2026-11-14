*** Settings ***
Documentation     Is every table there, and does every entity the API creates land in it and read back?
...               The schema check compares the file with Django's own model registry (results/expected_tables.json,
...               written by `run.sh tables`), the seed check counts the core tables, and then one proposal is
...               walked through the module so each kind of row — event, budget line, approval, step, audit entry,
...               notification, membership, join request, registration, pass, venue move, open block, envelope,
...               receipt, photo, report — is created by its API call and found in the database.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Library           OperatingSystem
Suite Setup       Everyone Signs In
Test Tags         api    db


*** Test Cases ***
Every Django model has its table
    [Tags]    smoke
    File Should Exist    ${EXPECTED_TABLES_FILE}    msg=run `./run.sh tables` (ci.sh does) so the suite knows which tables Django expects
    ${json}=    Get File    ${EXPECTED_TABLES_FILE}
    ${expected}=    Evaluate    json.loads($json)    modules=json
    Should Be True    len($expected) >= 36    msg=only ${expected} tables expected: is the registry complete?
    Tables Should Include    @{expected}

The seed filled every core table
    [Tags]    smoke
    FOR    ${table}    ${minimum}    IN    &{SEEDED_TABLES}
        Table Should Hold At Least    ${table}    ${minimum}
    END
    ${clubs}=    Count Rows    clubs_club
    Should Be Equal As Integers    ${clubs}    23
    # The suites' own events all start with E2E; the seed's fifteen are what is counted.
    ${events}=    Count Rows    events_event    title not like 'E2E %'
    Should Be Equal As Integers    ${events}    15

A proposal is stored as an event with a budget, and its lines keep their order
    [Tags]    smoke
    ${e}=    Row By Id    events_event    ${p}[event]
    Should Be Equal    ${e}[title]    E2E DB Probe
    Should Be Equal    ${e}[kind]    performance
    Should Be Equal    ${e}[status]    submitted
    ${b}=    Row By Id    budget_budget    ${p}[budget]
    Should Be Equal    ${b}[event_id]    ${e}[id]
    ${lines}=    Stored Lines    ${p}[budget]
    Length Should Be    ${lines}    2
    Should Be Equal    ${lines}[0][head]    Sound
    Should Be Equal As Numbers    ${lines}[0][amount_requested]    5000
    Should Be Equal As Integers    ${lines}[0][position]    1
    Should Be Equal    ${lines}[1][head]    Printing
    Should Be Equal As Integers    ${lines}[1][position]    2

Submitting writes the approval request, the audit entry and the Society's notification
    ${requests}=    Stored Requests    ${p}[event]
    Length Should Be    ${requests}    1
    Should Be Equal    ${requests}[0][state]    pending
    Should Be Equal    ${requests}[0][current_stage]    cultural_society
    Should Be Equal As Numbers    ${requests}[0][amount_requested]    5500
    Audit Should Contain    ${p}[event]    event.submitted
    Should Be Told    ${SOCIETY_EMAIL}    approval.pending    ${p}[approval]    sent “E2E DB Probe” for approval

Each decision writes a step; the last one publishes and tells the club
    Decide    ${society}    ${p}[approval]    approve
    # Every line is sent, as the approver screen does (an empty map is finding #1: see api/08).
    ${all}=    Evaluate    {$p['lines']['Sound']: '5000', $p['lines']['Printing']: '500'}
    ${r}=    Decide    ${dean}    ${p}[approval]    approve    sanctioned=${all}
    Should Be Equal    ${r.json()}[request][state]    approved
    ${steps}=    Stored Steps    ${p}[approval]
    Length Should Be    ${steps}    2
    Step Should Be    ${steps}[0]    cultural_society    approve    cultural_society_secretary
    Step Should Be    ${steps}[1]    dean    approve    dean
    Event Status Should Be    ${p}[event]    published
    Line Should Be    ${p}[lines][Sound]    5000    5000
    Budget Viewers Should Be Told    ${p}[event]    approval.approved    is approved and published
    Audit Should Read    ${p}[event]    event.submitted    approval.approve    approval.approve

A registration writes the registration and its pass
    ${r}=    Register For    ${student}    ${p}[event]
    ${reg}=    Row By Id    participation_registration    ${r.json()}[id]
    Should Be Equal    ${reg}[cancelled_at]    ${None}
    ${passes}=    Count Rows    participation_eventpass    registration_id = replace(?, '-', '')    ${r.json()}[id]
    Should Be True    ${passes} >= 1
    Should Be Told    ${STUDENT_EMAIL}    registration.confirmed    /me/passes    E2E DB Probe

A role change writes the membership's role and a role-change row
    ${roster}=    Roster    ${president}    ${music}
    ${member}=    Evaluate    [m for m in $roster.json()['results'] if m['role'] == 'club_member'][0]
    Set Role    ${president}    ${member}[id]    club_core    reason=Runs the sound desk
    ${m}=    Row By Id    clubs_membership    ${member}[id]
    Should Be Equal    ${m}[role]    club_core
    ${changes}=    Query    select from_role, to_role from clubs_rolechange where membership_id = replace(?, '-', '') order by created_at desc    ${member}[id]
    Should Be Equal    ${changes}[0][from_role]    club_member
    Should Be Equal    ${changes}[0][to_role]    club_core
    Audit Should Contain    ${member}[id]    club.role_changed
    [Teardown]    Set Role    ${president}    ${member}[id]    club_member    reason=Back as before

A join request is stored pending, then accepted with who decided and when
    ${email}=    Club-less Student    0
    ${joiner}=    Login As    ${email}
    ${r}=    Join Club    ${joiner}    ${music}    expected=202
    ${jr}=    Stored Join Request    ${r.json()}[id]
    Should Be Equal    ${jr}[state]    pending
    Should Be Equal    ${jr}[decided_at]    ${None}
    Accept Join Request    ${president}    ${music}    ${r.json()}[id]    note=Welcome
    ${jr}=    Stored Join Request    ${r.json()}[id]
    Should Be Equal    ${jr}[state]    accepted
    Should Be Equal    ${jr}[note]    Welcome
    Should Not Be Equal    ${jr}[decided_at]    ${None}
    Should Not Be Equal    ${jr}[decided_by_id]    ${None}
    ${m}=    Stored Membership    ${email}    ${music}
    Length Should Be    ${m}    1
    Should Be Equal    ${m}[0][role]    club_member
    Should Be Told    ${email}    club.join_accepted    ${music}
    [Teardown]    Leave Club    ${joiner}    ${music}

The Dean's move writes the new venue on the event and a reassignment row
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    Reassign    ${dean}    ${p}[event]    to_venue=${amphi}[id]    reason=The Music Room is being repainted that week
    ${e}=    Row By Id    events_event    ${p}[event]
    Should Be Equal    ${e}[venue_id]    ${{ $amphi['id'].replace('-', '') }}
    ${moves}=    Stored Reassignments    ${p}[event]
    Length Should Be    ${moves}    1
    Should Be Equal    ${moves}[0][to_venue_id]    ${e}[venue_id]
    Should Be Equal    ${moves}[0][reason]    The Music Room is being repainted that week
    Audit Should Contain    ${p}[event]    event.venue_reassigned
    Officers Should Be Told    ${p}[event]    event.venue_changed    Amphitheatre

An open-block booking is stored as a published event with a nil budget
    ${date}=    Next Open Block Date    3
    ${slot}=    Campus Slot    ${date}    15
    ${room}=    Find Venue    ${president}    Music Room
    ${r}=    Book Open Block    ${president}    ${music}    ${room}[id]    ${slot}    title=E2E DB Probe Open Block
    ${e}=    Row By Id    events_event    ${r.json()}[id]
    Should Be Equal    ${e}[kind]    open_block
    Should Be Equal    ${e}[status]    published
    ${b}=    Row    select is_nil, nil_reason from budget_budget where event_id = replace(?, '-', '')    ${r.json()}[id]
    Should Be Equal As Integers    ${b}[is_nil]    1
    Should Contain    ${b}[nil_reason]    open block
    Audit Should Contain    ${r.json()}[id]    event.open_block_booked

The Dean's envelope is stored for the club and the year
    ${year}=    Evaluate    datetime.date.today().year    modules=datetime
    Set Envelope    ${dean}    ${music}    250000    year=${year}
    ${rows}=    Query    select amount from budget_clubbudgetenvelope where club_id = replace(?, '-', '') and year = ?    ${music}    ${year}
    Length Should Be    ${rows}    1
    Should Be Equal As Numbers    ${rows}[0][amount]    250000

Spend, a receipt, a photo and the report each land in their table
    Go Live    ${treasurer_or_president}    ${p}[event]
    PATCH As    ${treasurer}    /budget/budgets/${p}[budget]/lines/${p}[lines][Sound]    ${{ {'amount_spent': '4800.00'} }}
    ${pdf}=    Evaluate    ('sound.pdf', b'%PDF-1.4\\n1 0 obj<<>>endobj\\ntrailer<<>>\\n%%EOF', 'application/pdf')
    ${files}=    Create Dictionary    file=${pdf}
    ${headers}=    Bearer    ${treasurer}
    ${rc}=    POST On Session    api    /budget/budgets/${p}[budget]/lines/${p}[lines][Sound]/receipts    files=${files}    data=${{ {'amount': '4800.00', 'vendor': 'Sound Co'} }}    headers=${headers}    expected_status=201
    ${receipts}=    Count Rows    budget_receiptdocument    line_id = replace(?, '-', '')    ${p}[lines][Sound]
    Should Be Equal As Integers    ${receipts}    1
    ${line}=    Row By Id    budget_budgetline    ${p}[lines][Sound]
    Should Be Equal As Numbers    ${line}[amount_spent]    4800
    ${ph}=    Upload Photo    ${treasurer_or_president}    ${p}[event]    caption=The probe in full swing
    ${photos}=    Count Rows    events_eventphoto    event_id = replace(?, '-', '')    ${p}[event]
    Should Be Equal As Integers    ${photos}    1
    Close Event    ${treasurer_or_president}    ${p}[event]    Forty came, the sound held.    learnings=Book the desk earlier
    ${report}=    Row    select outcomes, learnings from events_eventreport where event_id = replace(?, '-', '')    ${p}[event]
    Should Be Equal    ${report}[outcomes]    Forty came, the sound held.
    Should Be Equal    ${report}[learnings]    Book the desk earlier
    Event Status Should Be    ${p}[event]    reported
    Audit Should Contain    ${p}[event]    event.closed


*** Keywords ***
Everyone Signs In
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${president}
    Set Suite Variable    ${treasurer_or_president}    ${president}
    Set Suite Variable    ${student}
    Set Suite Variable    ${society}
    Set Suite Variable    ${dean}
    ${music}=    My First Club    ${treasurer}
    Set Suite Variable    ${music}
    ${p}=    Propose    ${treasurer}    E2E DB Probe    Music Room    ${80}    Sound=5000    Printing=500
    Set Suite Variable    ${p}
