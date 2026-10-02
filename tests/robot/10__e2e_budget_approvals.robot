*** Settings ***
Documentation       End to end: requesting a budget, and the gates that decide on it —
...                 the Cultural Society, the Dean, the Vice-Chancellor and Management —
...                 driven through the pages exactly as each role would use them.
Resource            resources/culturals.resource
Suite Setup         Open Culturals
Test Setup          Fresh Pilot
Test Tags           e2e    budget    approvals


*** Test Cases ***
The Treasurer Raises An Unpriced Draft, Prices It And Sends It
    Sign In As    treasurer
    Create Event    Monsoon Ragas    days_ahead=30    venue=Music Room    expected=30
    Get Text    css=#msg    *=    Created as an unpriced draft
    Open Page    club-budget.html
    ${card}=    Budget Card    Monsoon Ragas
    Get Text    ${card}    *=    Nothing priced yet
    Add Budget Line    Monsoon Ragas    Sound    9000
    Add Budget Line    Monsoon Ragas    Refreshments    3500
    Get Text    ${card} >> css=table    *=    ₹12,500
    Send For Approval    Monsoon Ragas
    ${row}=    Club Event Row    Monsoon Ragas
    Get Text    ${row}    *=    With the Cultural Society now
    Get Attribute    ${row} >> css=.route-step.now    data-stage    ==    cultural_society
    # Under review the requested figures are frozen: no more entries.
    Open Page    club-budget.html
    Get Text    ${card}    *=    With the Cultural Society
    Get Element Count    ${card} >> css=button[data-add]    ==    0

An Unpriced Draft Cannot Be Sent
    Sign In As    treasurer
    Create Event    Unpriced Idea    days_ahead=31    venue=Music Room    expected=20
    Open Page    club-events.html
    ${row}=    Club Event Row    Unpriced Idea
    Get Text    ${row}    *=    Unpriced
    Get Element Count    ${row} >> css=button[data-submit]    ==    0

A Fest-Sized Budget Travels All Four Gates And Is Published
    [Tags]    four-gates
    Sign In As    treasurer
    Create Event    Monsoon Fest Finale    template=Fest night    days_ahead=35
    ...    venue=Open Air Theatre    expected=80
    Get Text    css=#msg    *=    Management
    Approve At Gate    society    Monsoon Fest Finale
    # The Dean sanctions the money, and trims the artist fee.
    Sign In As    dean
    Open Page    dean-approvals.html
    ${card}=    Approval Card    Monsoon Fest Finale
    Fill Text    ${card} >> css=input[data-sanc] >> nth=0    140000
    Decide At Gate    Monsoon Fest Finale    approve
    Toast Should Mention    Vice-Chancellor
    # The VC sees what the Dean sanctioned, not what was asked for.
    Sign In As    vc
    Open Page    vc-queue.html
    ${card}=    Approval Card    Monsoon Fest Finale
    Get Text    ${card} >> css=table.sanction    *=    ₹1,40,000
    Decide At Gate    Monsoon Fest Finale    approve
    Toast Should Mention    now with Management
    Sign In As    management
    Open Page    management-queue.html
    ${card}=    Approval Card    Monsoon Fest Finale
    Get Text    ${card}    *=    Yours is the last gate
    Decide At Gate    Monsoon Fest Finale    approve
    Toast Should Mention    published
    Get Text    css=[data-decided="Monsoon Fest Finale"]    *=    published
    # Published: students can register, and the club sees the money sanctioned.
    Sign In As    student
    Open Page    student-events.html
    Get Element Count    css=li[data-event-title="Monsoon Fest Finale"]    ==    1
    Sign In As    treasurer
    Open Page    club-budget.html
    Get Text    css=.budget-card[data-budget-title="Monsoon Fest Finale"]    *=    Sanctioned

Each Approver Sees Only What Is Waiting At Their Gate
    Queue Should Hold    society    Culturals Night 2026
    Queue Should Not Hold    dean    Culturals Night 2026
    Queue Should Hold    dean    Kalam Debating Championship
    Queue Should Not Hold    vc    Kalam Debating Championship
    Queue Should Hold    vc    Natya Dance Drama
    Queue Should Hold    management    Inter-College Dance Championship
    Queue Should Not Hold    management    Natya Dance Drama

Returning Needs A Comment, And The Club Sees It
    Sign In As    society
    Open Page    society-approvals.html
    Decide At Gate    Culturals Night 2026    return
    ${card}=    Approval Card    Culturals Night 2026
    Get Text    ${card} >> css=.decision-msg    *=    GOVERNANCE_COMMENT_REQUIRED
    Decide At Gate    Culturals Night 2026    return    Trim the artist fee and find a sponsor.
    Toast Should Mention    Returned
    # The Treasurer reads the approver's own words on the returned proposal.
    Sign In As    treasurer
    Open Page    club-events.html
    ${row}=    Club Event Row    Culturals Night 2026
    Get Text    ${row}    *=    Returned
    Get Text    ${row}    *=    Trim the artist fee and find a sponsor.
    # A member follows the club's work but not its money, comment included.
    Sign In As    member
    Open Page    club-events.html
    Get Text    ${row}    *=    Returned
    Get Text    ${row}    not contains    artist fee
    # Revise and send again: it starts the route from the first gate.
    Sign In As    treasurer
    Open Page    club-budget.html
    ${budget}=    Budget Card    Culturals Night 2026
    Fill Text    ${budget} >> css=input[data-req] >> nth=0    120000
    Keyboard Key    press    Tab
    Wait For Elements State    ${budget} >> css=input[data-req][value="120000"]    attached
    Send For Approval    Culturals Night 2026
    Get Text    ${row}    *=    With the Cultural Society now

A Rejection Is Final
    Sign In As    society
    Open Page    society-approvals.html
    Decide At Gate    Swara Open Mic    reject    Not this semester: the calendar is full.
    Toast Should Mention    Rejected
    Sign In As    treasurer
    Open Page    club-events.html
    ${row}=    Club Event Row    Swara Open Mic
    Get Text    ${row}    *=    Rejected
    Get Text    ${row}    *=    the calendar is full
    Get Element Count    ${row} >> css=button[data-submit]    ==    0

A Later Gate May Cut The Dean's Sanction But Never Restore It
    Sign In As    vc
    Open Page    vc-queue.html
    ${card}=    Approval Card    Natya Dance Drama
    # The Dean cut Sound & lighting from 12,000 to 10,800 in the seed.
    Fill Text    ${card} >> css=input[data-sanc] >> nth=0    12000
    Decide At Gate    Natya Dance Drama    approve
    Get Text    ${card} >> css=.decision-msg    *=    BUDGET_SANCTION_RAISED
    Fill Text    ${card} >> css=input[data-sanc] >> nth=0    10000
    Decide At Gate    Natya Dance Drama    approve
    Toast Should Mention    published

A Venue Clash Blocks Approval Until The Dean Moves One
    Sign In As    society
    Open Page    society-approvals.html
    Decide At Gate    Swara Open Mic    approve
    ${card}=    Approval Card    Swara Open Mic
    Get Text    ${card} >> css=.decision-msg    *=    GOVERNANCE_CLASH_UNRESOLVED
    Sign In As    dean
    Open Page    dean-venues.html
    Click    css=button[data-move][data-title="Swara Open Mic"]
    Wait For Elements State    css=form[data-dialog="move-event"]    visible
    Click    css=form[data-dialog="move-event"] button[data-dlg-ok]
    Toast Should Mention    Moved to
    Approve At Gate    society    Swara Open Mic

A Free Event Says So Instead Of Showing Blank Figures
    Sign In As    treasurer
    Create Event    Reading Circle    days_ahead=32    venue=Music Room    expected=20
    Open Page    club-budget.html
    ${card}=    Budget Card    Reading Circle
    Fill Text    ${card} >> css=input[id^="n-"]    n/a
    Click    ${card} >> css=button[data-nil]
    Get Text    ${card}    *=    BUDGET_NIL_REASON_REQUIRED
    Fill Text    ${card} >> css=input[id^="n-"]    The Music Room is free and members bring their own books.
    Click    ${card} >> css=button[data-nil]
    Get Text    ${card}    *=    No budget required
    Send For Approval    Reading Circle
    Sign In As    society
    Open Page    society-approvals.html
    ${proposal}=    Approval Card    Reading Circle
    Get Text    ${proposal}    *=    No budget required
    Get Text    ${proposal}    *=    members bring their own books

Drafts Created On Separate Page Loads Stay Separate
    [Documentation]    Regression: the id counter restarted on every page load, so two
    ...    events made on two pages were both ev_0001 and shared one budget.
    [Tags]    regression
    Sign In As    treasurer
    Create Event    First Draft    days_ahead=40    venue=Music Room    expected=20
    Create Event    Second Draft    days_ahead=41    venue=Music Room    expected=20
    Open Page    club-budget.html
    Get Element Count    css=.budget-card[data-budget-title="First Draft"]    ==    1
    Get Element Count    css=.budget-card[data-budget-title="Second Draft"]    ==    1
    Add Budget Line    Second Draft    Printing    800
    Get Text    css=.budget-card[data-budget-title="First Draft"]    *=    Nothing priced yet
    ${duplicates}=    Evaluate JavaScript    ${None}
    ...    () => { const s = JSON.parse(localStorage.getItem("culturals.v1"));
    ...    const ids = [...s.events, ...s.budgets].map(x => x.id);
    ...    return ids.length - new Set(ids).size; }
    Should Be Equal As Integers    ${duplicates}    0

Members Follow Their Club But Never See Its Money
    Sign In As    member
    ${offered}=    Sidebar Pages
    List Should Not Contain Value    ${offered}    Budget
    Open Page    club-events.html
    Get Text    css=main    not contains    ₹
    Open Refused Page    club-budget.html
    Refusal Should Say    BUDGET_NOT_VISIBLE

Settlement Comes Last And Clears Once Receipts Are In
    [Documentation]    The Lens photowalk is sanctioned and live, so it can be settled.
    Sign In As    organiser
    Open Page    club-budget.html
    ${card}=    Budget Card    Lens Heritage Photowalk
    Get Text    ${card}    *=    Enter what was actually spent
    Click    ${card} >> css=button[data-settle]
    Get Text    ${card} >> css=.card-msg    *=    BUDGET_SETTLEMENT_INCOMPLETE
    Record Spend As Sanctioned    Lens Heritage Photowalk
    Get Text    ${card}    *=    needs a receipt
    Attach Receipts Where Needed    Lens Heritage Photowalk
    Click    ${card} >> css=button[data-settle]
    Toast Should Mention    Budget settled
    Get Attribute    ${card}    data-stage    ==    settled
