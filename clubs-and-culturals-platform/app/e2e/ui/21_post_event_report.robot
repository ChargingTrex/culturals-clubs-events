*** Settings ***
Documentation     After the night, on screen: the President opens the live event, sees the counted attendance,
...               adds a photo and a post link, writes the outcomes and submits the report; the event reads
...               Reported, the report and photo are in the database, a student sees the gallery, and a plain
...               member is not offered the panel.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       A Live Event With One Registration
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    report


*** Variables ***
${TITLE}          E2E UI Report Night


*** Test Cases ***
The President fills in the post-event report and submits it
    [Tags]    smoke
    Sign In As    ${PRESIDENT_EMAIL}
    Open Club Event    ${event_id}    ${TITLE}
    Status Pill Should Read    Live
    Wait For Elements State    section[aria-label="Post-event report"]    visible
    Get Text    [data-testid="report-attendance"]    contains    Registered
    Get Text    [data-testid="report-attendance"]    contains    1
    Get Element States    section[aria-label="Post-event report"] >> role=button[name="Submit report"]    contains    disabled
    Upload File By Selector    \#report-photos    ${PHOTO_FIXTURE}
    Wait For Elements State    [data-testid="report-photo"]    visible
    Fill Field    Post link (Instagram, LinkedIn or other)    https://instagram.com/p/e2e-report-night
    Click Button    Add link
    Wait For Elements State    [data-testid="report-post"]    visible
    Fill Text    section[aria-label="Outcomes and learnings"] textarea >> nth=0    Forty came; the new sound desk held up all night.
    Fill Text    section[aria-label="Outcomes and learnings"] textarea >> nth=1    Open the doors fifteen minutes earlier.
    Snapshot    21-president-report
    Click Button    Submit report
    Toast Should Read    Report submitted
    Status Pill Should Read    Reported
    Event Status Should Be    ${event_id}    reported
    ${report}=    Row    select outcomes, learnings from events_eventreport where event_id = replace(?, '-', '')    ${event_id}
    Should Be Equal    ${report}[outcomes]    Forty came; the new sound desk held up all night.
    Should Be Equal    ${report}[learnings]    Open the doors fifteen minutes earlier.
    ${photos}=    Count Rows    events_eventphoto    event_id = replace(?, '-', '')    ${event_id}
    Should Be Equal As Integers    ${photos}    1
    ${posts}=    Count Rows    events_eventsocialpost    event_id = replace(?, '-', '')    ${event_id}
    Should Be Equal As Integers    ${posts}    1
    Audit Should Contain    ${event_id}    event.closed

A student sees the photo gallery on the reported event
    Sign In As    ${STUDENT_EMAIL}
    Wait For Heading    Feed
    Go To    ${WEB_BASE}/events/${event_id}
    Wait For Heading    ${TITLE}
    Wait For Elements State    section[aria-label="Photos"]    visible
    Get Element Count    [data-testid="gallery-photo"]    ==    1
    Wait For Elements State    role=button[name="Request removal"]    visible

A plain member is not offered the report panel
    Sign In As    ${MEMBER_EMAIL}
    Open Club Event    ${event_id}    ${TITLE}
    Status Pill Should Read    Reported
    Get Element Count    section[aria-label="Post-event report"]    ==    0


*** Keywords ***
A Live Event With One Registration
    Open API
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${p}=    Publish A Proposal    ${president}    ${TITLE}    Music Room    ${115}    Sound=3000    Printing=500
    Set Suite Variable    ${event_id}    ${p}[event]
    Go Live    ${president}    ${event_id}
    ${email}=    Club-less Student    7
    ${guest}=    Login As    ${email}
    Register For    ${guest}    ${event_id}
