*** Settings ***
Documentation     The decisions made on screen, and what the club then sees: the Dean returns one proposal and
...               cuts a head on another; the Treasurer reads the Dean's comment, edits the budget and sends it
...               again; the Vice-Chancellor rejects one; each outcome is checked in the database and on the
...               club's event page. Last, the links in the notifications are opened.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Clubs Send Three Proposals
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    decisions    approvals    notifications


*** Test Cases ***
The Dean cannot return without a comment, then returns it with one
    [Tags]    smoke
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Review    ${RETURN_TITLE}
    Click Button    Return for changes
    Expect Problem Banner    GOVERNANCE_COMMENT_REQUIRED
    Fill Field    Comment    Get a second quote for sound
    Click Button    Return for changes
    Wait For Text    Returned to the club: ${RETURN_TITLE}
    Event Status Should Be    ${back}[event]    returned

The Treasurer reads the comment, cuts the head and sends it again
    [Tags]    smoke
    Sign In As    ${TREASURER_EMAIL}
    Open Club Event    ${back}[event]    ${RETURN_TITLE}
    Status Pill Should Read    Returned
    Wait For Text    Get a second quote for sound
    Click Link    Open budget
    Click    [data-testid="budget-line"]:has-text("Sound") >> button:has-text("Edit")
    Fill Text    input[aria-label="Amount"]    7000
    Click Button    Save
    Wait For Text    Entry updated
    Click Button    Send for approval
    Wait For Text    Sent for approval — 2 gates
    Line Should Be    ${back}[lines][Sound]    7000    ${None}
    ${requests}=    Stored Requests    ${back}[event]
    Should Be Equal    ${requests}[-1][state]    pending
    Should Be Equal    ${requests}[-1][current_stage]    cultural_society
    Snapshot    15-treasurer-resent

The Dean cuts a head on screen and approves
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Review    ${CUT_TITLE}
    Fill Field    Sanction for Sound    9000
    Click Button    Approve
    Wait For Text    Approved: ${CUT_TITLE}
    Event Status Should Be    ${cut}[event]    published
    Line Should Be    ${cut}[lines][Sound]    12000    9000
    Line Should Be    ${cut}[lines][Printing]    2000    2000

The Treasurer sees it published with the Dean's figure
    Sign In As    ${TREASURER_EMAIL}
    Open Club Event    ${cut}[event]    ${CUT_TITLE}
    Status Pill Should Read    Published
    # The Dean's cut is drawn as old → new on the Dean's step, in the Admin edit colour.
    Wait For Elements State    section[aria-label="Approval trail"] >> ins.cc-edit--admin:has-text("₹11,000")    visible
    Wait For Elements State    section[aria-label="Approval trail"] >> del.cc-edit--admin    visible
    Snapshot    15-treasurer-published

The Vice-Chancellor has no sanction inputs, needs a reason, and rejects
    [Tags]    smoke
    Sign In As    ${VC_EMAIL}    ${MFA_CODE}
    Wait For Heading    Vice-Chancellor approvals
    Review    ${REJECT_TITLE}
    Get Element Count    [aria-label^="Sanction for"]    ==    0
    Click Button    Reject
    Expect Problem Banner    GOVERNANCE_COMMENT_REQUIRED
    Fill Field    Comment    Too large for one evening; fold it into the fest
    Click Button    Reject
    Wait For Text    Rejected: ${REJECT_TITLE}
    Event Status Should Be    ${no}[event]    rejected

The Treasurer sees the rejection and its reason, and may only delete
    Sign In As    ${TREASURER_EMAIL}
    Open Club Event    ${no}[event]    ${REJECT_TITLE}
    Status Pill Should Read    Rejected
    Wait For Text    Too large for one evening; fold it into the fest
    Get Element Count    role=button[name="Send for approval"]    ==    0
    Wait For Heading    Delete this proposal
    Snapshot    15-treasurer-rejected

The club's notification link opens the event
    [Documentation]    The link stored with "is approved and published" for the Treasurer.
    ${n}=    Row    select n.link from governance_notification n join identity_user u on u.id = n.user_id where u.email = ? and n.kind = 'approval.approved' and n.link like ?    ${TREASURER_EMAIL}    %${cut}[event]
    Sign In As    ${TREASURER_EMAIL}
    Wait For Elements State    [data-testid="nav-sidebar"]    visible
    Go To    ${WEB_BASE}${n}[link]
    Wait For Heading    ${CUT_TITLE}

The approver's notification link opens the proposal
    [Documentation]    The link stored with "sent for approval" for the Vice-Chancellor: /staff/approvals/<approval id>.
    ${n}=    Row    select n.link from governance_notification n join identity_user u on u.id = n.user_id where u.email = ? and n.kind = 'approval.pending' and n.link like ?    ${VC_EMAIL}    %${no}[approval]
    Sign In As    ${VC_EMAIL}    ${MFA_CODE}
    Wait For Heading    Vice-Chancellor approvals
    Go To    ${WEB_BASE}${n}[link]
    Wait For Heading    ${REJECT_TITLE}


*** Variables ***
${RETURN_TITLE}       E2E Screen Return For Quote
${CUT_TITLE}            E2E Screen Dean Cut
${REJECT_TITLE}       E2E Screen Above Threshold


*** Keywords ***
Clubs Send Three Proposals
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${back}=    Propose    ${treasurer}    ${RETURN_TITLE}    Music Room    ${71}    Sound=10000    Printing=1500
    Decide    ${society}    ${back}[approval]    approve
    ${cut}=    Propose    ${treasurer}    ${CUT_TITLE}    Music Room    ${72}    Sound=12000    Printing=2000
    Decide    ${society}    ${cut}[approval]    approve
    ${no}=    Propose    ${treasurer}    ${REJECT_TITLE}    Main Auditorium    ${73}    Stage=60000
    Decide    ${society}    ${no}[approval]    approve
    Decide    ${dean}    ${no}[approval]    approve
    Set Suite Variable    ${back}
    Set Suite Variable    ${cut}
    Set Suite Variable    ${no}
