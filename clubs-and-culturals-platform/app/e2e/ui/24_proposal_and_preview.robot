*** Settings ***
Documentation     AR-10 and AR-11 on screen, with the two visibility fixes: on New event the venue fills the capacity
...               (which stays editable), a President attaches the proposal, uploads the budget sheet, previews both and
...               sends it; a club Secretary is not offered the sheet, saves a draft with a Word proposal, reads it as
...               text on the event page and replaces it; the Society's Secretary previews the proposal on the approval
...               page; the Dean sees a proposal still with the Society under "On the way to you"; and the calendar's
...               "Upcoming events" list holds every booking, approved or pending, and jumps to one weeks away.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       A Proposal With A Document Waits At The Society
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    proposal


*** Variables ***
${SHEET_TITLE}     E2E UI Doc Sheet Night
${DRAFT_TITLE}     E2E UI Doc Draft Evening
${REVIEW_TITLE}    E2E UI Doc Waiting
${APPROVED_TITLE}    E2E UI Doc Approved Weeks Out


*** Test Cases ***
A President picks a venue, attaches the proposal, uploads the budget sheet, previews both and sends it
    [Tags]    smoke    budget
    Sign In As    ${PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Click Link    New event
    Wait For Heading    New event
    Fill Field    Title    ${SHEET_TITLE}
    # Choosing the venue fills Capacity with what it seats; the club may lower it.
    Select Option    Venue    Music Room · seats 40
    Get Property    \#ne-capacity    value    ==    40
    Fill Text    \#ne-capacity    30
    Fill Field    Expected attendance    25
    Fill Text    \#ne-start    ${day140}
    Upload File By Selector    \#ne-proposal    ${PROPOSAL_PDF_FIXTURE}
    Click Button    Preview the proposal
    Wait For Elements State    role=dialog[name="proposal.pdf"] >> iframe[title="proposal.pdf"]    visible
    Close The Preview
    Select Option    Template    Upload the budget sheet (CSV)
    # In this mode nothing can be saved until a sheet is chosen.
    Get Element States    role=button[name="Save draft"]    contains    disabled
    Wait For Elements State    role=link[name="Download the budget template"]    visible
    Upload File By Selector    \#ne-sheet    ${BUDGET_CSV_FIXTURE}
    Click Button    Preview the sheet
    Wait For Elements State    role=dialog[name="budget_ok.csv"] >> role=columnheader[name="amount"]    visible
    Wait For Elements State    role=dialog[name="budget_ok.csv"] >> role=cell[name="Sound & lighting"]    visible
    Wait For Elements State    role=dialog[name="budget_ok.csv"] >> role=cell[name="12000"]    visible
    Snapshot    24-budget-sheet-preview
    Close The Preview
    Click Button    Propose and send
    Toast Should Read    Sent for approval
    Wait For Heading    ${SHEET_TITLE}
    Status Pill Should Read    Awaiting approval
    Wait For Elements State    section[aria-label="Proposal document"] >> role=button[name="Preview proposal.pdf"]    visible
    # Locked once sent: there is nothing to replace it with.
    Get Element Count    \#proposal-doc    ==    0
    ${e}=    Row    select id, status, capacity from events_event where title = ?    ${SHEET_TITLE}
    Should Be Equal    ${e}[status]    submitted
    Should Be Equal As Integers    ${e}[capacity]    30
    ${lines}=    Query    select l.head, l.amount_requested from budget_budgetline l join budget_budget b on b.id = l.budget_id where b.event_id = ? order by l.position    ${e}[id]
    Length Should Be    ${lines}    2
    Should Be Equal    ${lines}[0][head]    Sound & lighting
    Should Be Equal As Numbers    ${lines}[1][amount_requested]    3000
    ${docs}=    Query    select file_name from events_eventproposaldocument where event_id = ?    ${e}[id]
    Length Should Be    ${docs}    1
    Should Be Equal    ${docs}[0][file_name]    proposal.pdf

A club Secretary is not offered the sheet, saves a draft with a Word proposal, reads it and replaces it
    [Tags]    smoke
    Sign In As    ${SECRETARY_EMAIL}
    Wait For Heading    Feed
    Click Link    New event
    Wait For Heading    New event
    ${options}=    Get Select Options    \#ne-template
    ${labels}=    Evaluate    [o['label'] for o in $options]
    List Should Contain Value    ${labels}    None — the Treasurer enters it
    List Should Not Contain Value    ${labels}    Upload the budget sheet (CSV)
    Fill Field    Title    ${DRAFT_TITLE}
    Select Option    Venue    Seminar Hall B · seats 120
    Get Property    \#ne-capacity    value    ==    120
    Fill Text    \#ne-start    ${day141}
    Upload File By Selector    \#ne-proposal    ${PROPOSAL_DOCX_FIXTURE}
    # A Word file is read as text by the server, so it previews once it is attached, not before.
    Get Element Count    role=button[name="Preview the proposal"]    ==    0
    Click Button    Save draft
    Toast Should Read    Saved as a draft
    Wait For Heading    ${DRAFT_TITLE}
    Status Pill Should Read    Draft
    Click    section[aria-label="Proposal document"] >> role=button[name="Preview proposal.docx"]
    Wait For Elements State    role=dialog[name="proposal.docx"] >> role=heading[name="E2E Proposal Heading"]    visible
    Wait For Elements State    role=dialog[name="proposal.docx"] >> text=An acoustic evening for eighty students.    visible
    Wait For Elements State    role=dialog[name="proposal.docx"] >> text=Sound | 12000    visible
    Wait For Elements State    role=dialog[name="proposal.docx"] >> role=button[name="Download"]    visible
    Snapshot    24-word-proposal-preview
    Close The Preview
    # Still a draft, so the document can be replaced; the first version stays on record.
    Upload File By Selector    \#proposal-doc    ${PROPOSAL_PDF_V2_FIXTURE}
    Toast Should Read    Proposal document attached
    Wait For Elements State    section[aria-label="Proposal document"] >> role=button[name="Preview proposal_v2.pdf"]    visible
    ${e}=    Row    select id, status, capacity from events_event where title = ?    ${DRAFT_TITLE}
    Should Be Equal    ${e}[status]    draft
    Should Be Equal As Integers    ${e}[capacity]    120
    ${docs}=    Query    select file_name from events_eventproposaldocument where event_id = ? order by created_at    ${e}[id]
    Length Should Be    ${docs}    2
    Should Be Equal    ${docs}[1][file_name]    proposal_v2.pdf

A file over the type rule is refused on the event page and the earlier document stays
    Sign In As    ${TREASURER_EMAIL}
    Wait For Heading    Feed
    Open Club Event    ${spare}[id]    E2E UI Doc Spare Draft
    Upload File By Selector    \#proposal-doc    ${NOT_A_PHOTO_FIXTURE}
    Expect Problem Banner    EVENTS_FILE_TYPE
    ${docs}=    Stored Proposal Documents    ${spare}[id]
    Should Be Empty    ${docs}

The Society's Secretary previews the club's proposal on the approval page
    [Tags]    smoke    approvals
    Sign In As    ${SOCIETY_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Review    ${REVIEW_TITLE}
    Click    section[aria-label="Proposal document"] >> role=button[name="Preview proposal.pdf"]
    Wait For Elements State    role=dialog[name="proposal.pdf"] >> iframe[title="proposal.pdf"]    visible
    Wait For Elements State    role=dialog[name="proposal.pdf"] >> role=button[name="Download"]    visible
    Snapshot    24-approver-proposal-preview
    Close The Preview

A proposal with no document says so on the approval page
    [Tags]    approvals
    Sign In As    ${SOCIETY_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Review    E2E UI Doc None Attached
    Wait For Elements State    section[aria-label="Proposal document"] >> text=None attached by the club.    visible

The Dean sees a proposal still with the Society as on its way, and can open it
    [Tags]    smoke    approvals
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    ${row}=    Set Variable    section[aria-label="On the way to you"] >> [data-testid="upcoming-row"]:has-text("${REVIEW_TITLE}")
    Wait For Elements State    ${row}    visible
    ${text}=    Get Text    ${row}
    Should Contain    ${text}    With the Cultural Society
    Should Contain    ${text}    Music Club
    # It is not in the queue the Dean decides from.
    Get Element Count    [data-testid="queue-row"]:has-text("${REVIEW_TITLE}")    ==    0
    Snapshot    24-dean-on-the-way
    Click    ${row} >> role=link[name="${REVIEW_TITLE}"]
    Wait For Heading    ${REVIEW_TITLE}
    Wait For Elements State    section[aria-label="Proposal document"] >> role=button[name="Preview proposal.pdf"]    visible

The calendar lists every upcoming event, approved or pending, and jumps to one weeks away
    [Tags]    smoke    calendar
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Click Link    Calendar
    Wait For Heading    Semester event calendar
    # This week's grid does not hold it.
    Get Element Count    [data-testid="slot-booking"]:has-text("${REVIEW_TITLE}")    ==    0
    Wait For Elements State    section[aria-label="Upcoming events"]    visible
    ${pending}=    Get Text    section[aria-label="Upcoming events"] >> role=button[name=/^Show ${REVIEW_TITLE} on /]
    Should Contain    ${pending}    Awaiting approval
    # An approved event weeks away is on the list as well: the page holds everything the Venues page lists.
    ${approved}=    Get Text    section[aria-label="Upcoming events"] >> role=button[name=/^Show ${APPROVED_TITLE} on /]
    Should Contain    ${approved}    Approved
    Should Not Contain    ${approved}    Awaiting approval
    # Every booking the Venues page would list from today on is here.
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${today}=    Evaluate    datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Kolkata')).date().isoformat()    modules=datetime,zoneinfo
    ${until}=    Evaluate    (datetime.date.fromisoformat($today) + datetime.timedelta(days=120)).isoformat()    modules=datetime
    ${cal}=    Venue Calendar    ${dean}    from=${today}    to=${until}
    Get Element Count    section[aria-label="Upcoming events"] >> li    ==    ${{ len($cal.json()['bookings']) }}
    Click    section[aria-label="Upcoming events"] >> role=button[name=/^Show ${APPROVED_TITLE} on /]
    Wait For Elements State    [data-testid="slot"][data-venue="Seminar Hall B"][data-hour="10"] >> [data-testid="slot-booking"]:has-text("${APPROVED_TITLE}")    visible
    Click    section[aria-label="Upcoming events"] >> role=button[name=/^Show ${REVIEW_TITLE} on /]
    Wait For Elements State    [data-testid="slot"][data-venue="Amphitheatre"][data-hour="10"] >> [data-testid="slot-booking"]:has-text("${REVIEW_TITLE}")    visible
    Snapshot    24-calendar-upcoming-events

The calendar steps a month at a time and jumps to a chosen date
    [Tags]    calendar
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Click Link    Calendar
    Wait For Heading    Semester event calendar
    ${this}=    Evaluate    datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Kolkata')).date()    modules=datetime,zoneinfo
    ${next}=    Evaluate    (lambda t, y, m: datetime.date(y, m, min(t.day, calendar.monthrange(y, m)[1])))($this, $this.year + $this.month // 12, $this.month % 12 + 1)    modules=datetime,calendar
    Click Button    Next month
    Get Property    label:has-text("Go to date") >> input    value    ==    ${next.isoformat()}
    Get Text    [data-testid="calendar-month"]    ==    ${next.strftime('%B %Y')}
    Click Button    Previous month
    Get Text    [data-testid="calendar-month"]    ==    ${this.strftime('%B %Y')}
    Click Button    Today
    Get Property    label:has-text("Go to date") >> input    value    ==    ${this.isoformat()}
    # A chosen date opens its week with that day selected: the approved event on day 118.
    ${target}=    Evaluate    (datetime.date.today() + datetime.timedelta(days=118)).isoformat()    modules=datetime
    Fill Text    label:has-text("Go to date") >> input    ${target}
    Wait For Elements State    [data-testid="slot"][data-venue="Seminar Hall B"][data-hour="10"] >> [data-testid="slot-booking"]:has-text("${APPROVED_TITLE}")    visible


*** Keywords ***
Close The Preview
    Click    role=dialog >> role=button[name="Close"]
    Wait For Elements State    role=dialog    detached

A Proposal With A Document Waits At The Society
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    # Submitted with a PDF proposal and left with the Society: for the approver's preview, the Dean's look-ahead
    # and the calendar's Upcoming events list.
    # Day 118: inside the calendar's 120-day look-ahead, and weeks past the grid's opening week.
    ${review}=    Create Draft Event    ${treasurer}    ${REVIEW_TITLE}    Amphitheatre    ${118}
    Upload Proposal    ${treasurer}    ${review}[id]    ${PROPOSAL_PDF_FIXTURE}
    Add Budget Line    ${treasurer}    ${review}[budget][id]    Sound    2500
    POST As    ${treasurer}    /events/${review}[id]/submit
    # Approved and weeks away: the calendar must list it although this week's grid does not show it.
    Publish A Proposal    ${treasurer}    ${APPROVED_TITLE}    Seminar Hall B    ${118}    Sound=1000
    # One sent with no document at all.
    Propose    ${treasurer}    E2E UI Doc None Attached    Seminar Hall A    ${142}    Sound=1000
    # A draft with no document, for the refused upload.
    ${spare}=    Create Draft Event    ${treasurer}    E2E UI Doc Spare Draft    Seminar Hall A    ${143}
    Set Suite Variable    ${spare}
    ${day140}=    Evaluate    (datetime.date.today() + datetime.timedelta(days=140)).isoformat()    modules=datetime
    ${day141}=    Evaluate    (datetime.date.today() + datetime.timedelta(days=141)).isoformat()    modules=datetime
    Set Suite Variable    ${day140}
    Set Suite Variable    ${day141}
