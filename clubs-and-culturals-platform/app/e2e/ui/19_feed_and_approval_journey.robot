*** Settings ***
Documentation     A proposal's whole journey on screen: the Secretary proposes from a template and sends it; no
...               student sees it while it is with the approvers; the Society and the Dean approve it on screen;
...               then it is on the student's Feed and What's on, the search finds it, a student registers, the club
...               sees it published, and a Music Club member with the personalised feed on sees it under
...               "From your clubs". Each step is checked in the database too.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       People Sign In
Suite Teardown    Feed Preference Off Again
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    feed


*** Variables ***
${TITLE}          E2E UI Feed Journey


*** Test Cases ***
The Secretary proposes from a template and sends it for approval
    [Tags]    smoke
    Sign In As    ${SECRETARY_EMAIL}
    Wait For Heading    Feed
    Click Link    New event
    Wait For Heading    New event
    Fill Field    Title    ${TITLE}
    Select Option    Venue    Music Room · seats 40
    Fill Field    Start date    ${day}
    Select Option    Start hour    10:00
    Select Option    End hour    12:00
    Fill Field    Capacity    30
    Fill Field    Expected attendance    25
    Select Option    Template    Workshop
    Wait For Elements State    [data-testid="template-total"]    visible
    Wait For Elements State    role=switch[name="Send for approval now"][checked=true]    visible
    Click Button    Propose and send
    Wait For Heading    ${TITLE}
    Toast Should Read    Sent for approval
    ${event}=    Find Event    ${secretary}    ${TITLE}
    Set Suite Variable    ${event_id}    ${event}[id]
    Event Status Should Be    ${event_id}    submitted
    ${requests}=    Stored Requests    ${event_id}
    Length Should Be    ${requests}    1
    Should Be Equal    ${requests}[0][current_stage]    cultural_society

A student sees nothing of it while it is with the approvers
    Sign In As    ${STUDENT_EMAIL}
    Wait For Heading    Feed
    Wait For Elements State    [data-testid="feed-card"] >> nth=0    visible
    Get Element Count    [data-testid="feed-card"][data-event="${event_id}"]    ==    0
    Click Link    What's on
    Wait For Heading    What's on
    Wait For Elements State    [data-testid="event-row"] >> nth=0    visible
    Get Element Count    [data-testid="event-row"]:has-text("${TITLE}")    ==    0
    ${seen}=    Events Seen By    ${student}    search=${TITLE}
    Should Be Empty    ${seen}

The Society and then the Dean approve it on screen, and it is published
    [Tags]    smoke
    Sign In As    ${SOCIETY_EMAIL}    ${MFA_CODE}
    Wait For Heading    Cultural Society approvals
    Review    ${TITLE}
    Click Button    Approve and send to Dean
    Wait For Text    Approved: ${TITLE}
    # A fresh context for the Dean: the Society's toast would otherwise still be on screen beside the queue row.
    Close Context
    Open App
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Review    ${TITLE}
    Click Button    Approve
    Wait For Text    Approved: ${TITLE}
    Event Status Should Be    ${event_id}    published
    ${steps}=    Stored Steps    ${requests_id}
    Length Should Be    ${steps}    2
    ${lines}=    Stored Lines    ${budget_id}
    Should Not Be Empty    ${lines}
    FOR    ${l}    IN    @{lines}
        Should Be True    $l['amount_sanctioned'] is not None    msg=${l}[head] was published without a sanctioned figure
    END
    Budget Viewers Should Be Told    ${event_id}    approval.approved    is approved and published

The student now finds it on the Feed, searches for it and registers
    [Tags]    smoke
    Sign In As    ${STUDENT_EMAIL}
    Wait For Heading    Feed
    Wait For Elements State    [data-testid="feed-card"][data-event="${event_id}"]    visible
    Get Text    [data-testid="feed-card"][data-event="${event_id}"]    contains    Upcoming
    Fill Text    [aria-label="Search the feed"]    ${TITLE}
    Keyboard Key    press    Enter
    Wait Until Keyword Succeeds    10s    500ms    Get Element Count    [data-testid="feed-card"]    ==    1
    Wait For Elements State    [data-testid="feed-card"][data-event="${event_id}"]    visible
    Snapshot    19-student-feed
    Click    [data-testid="feed-card"][data-event="${event_id}"] >> a:has-text("${TITLE}")
    Wait For Heading    ${TITLE}
    Click Button    Register
    Wait For Heading    You are registered
    ${regs}=    Count Rows    participation_registration    event_id = replace(?, '-', '') and cancelled_at is null    ${event_id}
    Should Be Equal As Integers    ${regs}    1

The club sees it published
    Sign In As    ${TREASURER_EMAIL}
    Open Club Event    ${event_id}    ${TITLE}
    Status Pill Should Read    Published

A Music Club member turns on the personalised feed and sees it under From your clubs
    Sign In As    ${MEMBER_EMAIL}
    Wait For Heading    Feed
    Click Link    Profile QR
    Click    role=tab[name="Settings"]
    Click    role=switch[name="Personalised feed"]
    Wait For Elements State    role=switch[name="Personalised feed"][checked=true]    visible
    ${pref}=    GET As    ${member}    /module/auth/preferences
    Should Be True    ${pref.json()}[personalised_feed]
    Click Link    Feed
    Wait For Heading    Feed
    Wait For Elements State    h2:has-text("From your clubs")    visible
    Wait For Elements State    h2:has-text("From your clubs") + ul [data-testid="feed-card"][data-event="${event_id}"]    visible
    Get Element Count    h2:has-text("Across campus") + ul [data-testid="feed-card"][data-event="${event_id}"]    ==    0


*** Keywords ***
People Sign In
    Open API
    ${secretary}=    Login As    ${SECRETARY_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    Set Suite Variable    ${secretary}
    Set Suite Variable    ${student}
    Set Suite Variable    ${member}
    Set Preference    ${member}    ${False}
    ${day}=    Evaluate    (datetime.date.today() + datetime.timedelta(days=107)).isoformat()    modules=datetime
    Set Suite Variable    ${day}

Event Status Should Be
    [Arguments]    ${event_id}    ${status}
    ${e}=    Stored Event    ${event_id}
    Should Be Equal    ${e}[status]    ${status}
    ${ids}=    Row    select b.id as budget_id, (select r.id from governance_approvalrequest r where r.event_id = e.id order by r.created_at desc limit 1) as request_id from events_event e join budget_budget b on b.event_id = e.id where e.id = replace(?, '-', '')    ${event_id}
    Set Suite Variable    ${budget_id}    ${ids}[budget_id]
    Set Suite Variable    ${requests_id}    ${ids}[request_id]

Feed Preference Off Again
    Run Keyword And Ignore Error    Set Preference    ${member}    ${False}
