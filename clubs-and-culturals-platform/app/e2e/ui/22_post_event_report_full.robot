*** Settings ***
Documentation     The whole post-event report form, on screen, against a night that really happened at the door:
...               the attendance tiles equal what the scans and the desk recorded; photos go up several at once, a
...               file that is not a picture is refused, one is starred and one taken down; post links are named by
...               platform, keep a screenshot, and a repeat or a non-web link is refused; spend and a bill go against
...               the budget lines; the report submits only with a photo and outcomes, and reads back the same after
...               a reload, through the API and to a student, whose removal request reaches the President.
...               The tests run in order and share one event (ui/21 is the short smoke version of this).
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       A Live Event With A Night At The Door
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    report


*** Variables ***
${TITLE}          E2E Full Report Night
${PANEL}          section[aria-label="Post-event report"]
${INSTAGRAM}      https://www.instagram.com/p/e2e-full-report/
${LINKEDIN}       https://www.linkedin.com/posts/e2e-full-report
${BLOG}           https://example.org/blog/e2e-full-report
${OUTCOMES}       Three came through the door, one of them a walk-in; the new sound desk held up all night.
${LEARNINGS}      Open the doors fifteen minutes earlier and print fewer posters.


*** Test Cases ***
The attendance tiles are what the door counted
    The President Opens The Report
    Status Pill Should Read    Live
    # Three registered in advance, two of them were scanned in, and one more walked in at the desk.
    Attendance Tile Should Read    Registered    4
    Attendance Tile Should Read    Attended    3
    Attendance Tile Should Read    Walk-ins    1
    Attendance Tile Should Read    No-shows    1
    Get Text    ${PANEL}    contains    Counted at the door by the scan station.
    ${rows}=    Query    select source, attended from participation_registration where event_id = replace(?, '-', '') and cancelled_at is null and waitlisted = 0    ${event_id}
    Length Should Be    ${rows}    4
    Length Should Be    ${{ [r for r in $rows if r['attended']] }}    3
    Length Should Be    ${{ [r for r in $rows if r['source'] in ('spot', 'manual')] }}    1
    # Nothing is typed into this step: the only number fields on the panel belong to the budget lines.
    Get Element Count    [data-testid="report-attendance"] input    ==    0
    # An empty report cannot be submitted, and the form says why.
    Checklist Should Ask For    Add a photo
    Checklist Should Ask For    Write the outcomes
    Get Text    ul[aria-label="Checklist"]    contains    A social post link (optional)
    Submit Should Be    disabled
    Get Text    [data-testid="report-submit-hint"]    ==    Still needed: at least one photo and the outcomes.

Photos go up together, a wrong file is refused, one is starred and one is taken down
    The President Opens The Report
    Upload File By Selector    \#report-photos    ${PHOTO_STAGE_FIXTURE}    ${PHOTO_CROWD_FIXTURE}
    Photos On The Form Should Be    2
    Checklist Should Tick    At least one photo
    ${stored}=    Query    select content_type, file_name from events_eventphoto where event_id = replace(?, '-', '') order by file_name    ${event_id}
    Should Be Equal    ${{ [(r['file_name'], r['content_type']) for r in $stored] }}    ${{ [('photo_crowd.jpg', 'image/jpeg'), ('photo_stage.png', 'image/png')] }}
    # The picker's `accept` is advice to the browser; the API is what refuses a file that is not a picture.
    Upload File By Selector    \#report-photos    ${NOT_A_PHOTO_FIXTURE}
    Expect Problem Banner    EVENTS_FILE_TYPE
    Photos On The Form Should Be    2
    Live Photos Stored Should Be    2
    # A highlight for the semester report.
    Click    [data-testid="report-photo"] >> nth=0 >> role=button[name="Highlight"]
    Wait For Elements State    [data-testid="report-photo"] >> nth=0 >> button[aria-pressed="true"]    visible
    Get Text    ${PANEL}    contains    1 starred so far.
    Get Element Count    [data-testid="report-photo"] button[aria-pressed="true"]    ==    1
    ${starred}=    Count Rows    events_eventphoto    event_id = replace(?, '-', '') and is_highlight = 1    ${event_id}
    Should Be Equal As Integers    ${starred}    1
    # A third goes up and a plain one comes down: taken down, not deleted.
    Upload File By Selector    \#report-photos    ${PHOTO_FIXTURE}
    Photos On The Form Should Be    3
    # Removing asks first: Keep leaves the photo where it is, Remove takes it down.
    ${plain}=    Set Variable    [data-testid="report-photo"]:has(button[aria-pressed="false"]) >> nth=0
    Click    ${plain} >> role=button[name="Remove photo"]
    Click    role=group[name="Remove this photo?"] >> role=button[name="Keep"]
    Photos On The Form Should Be    3
    Live Photos Stored Should Be    3
    Click    ${plain} >> role=button[name="Remove photo"]
    Click    role=group[name="Remove this photo?"] >> role=button[name="Remove"]
    Photos On The Form Should Be    2
    Get Element Count    [data-testid="report-photo"] button[aria-pressed="true"]    ==    1
    Live Photos Stored Should Be    2
    ${all}=    Count Rows    events_eventphoto    event_id = replace(?, '-', '')    ${event_id}
    Should Be Equal As Integers    ${all}    3
    Audit Should Contain    ${event_id}    event.photo_removed

Post links are named by platform, keep a screenshot, and repeats and non-web links are refused
    The President Opens The Report
    Get Element States    ${PANEL} >> role=button[name="Add link"]    contains    disabled
    Add Post Link    ${INSTAGRAM}
    Posts On The Form Should Be    1
    Post Row Should Read    ${INSTAGRAM}    Instagram
    Checklist Should Tick    A social post link
    # LinkedIn, with a screenshot of the post.
    Upload File    Screenshot (optional)    ${POST_SCREENSHOT_FIXTURE}
    Add Post Link    ${LINKEDIN}
    Posts On The Form Should Be    2
    Post Row Should Read    ${LINKEDIN}    LinkedIn
    Add Post Link    ${BLOG}
    Posts On The Form Should Be    3
    Post Row Should Read    ${BLOG}    Other
    # A link opens in a new tab and never hands the app's window to the other site.
    ${link}=    Set Variable    [data-testid="report-post"] >> a[href="${INSTAGRAM}"]
    Get Attribute    ${link}    target    ==    _blank
    Get Attribute    ${link}    rel    contains    noopener
    # The same link twice.
    Add Post Link    ${INSTAGRAM}
    Expect Problem Banner    EVENTS_SOCIAL_POST_DUPLICATE
    Posts On The Form Should Be    3
    # Something that is not a web address at all.
    Add Post Link    javascript:alert(1)
    Expect Problem Banner    VALIDATION_FAILED
    Posts On The Form Should Be    3
    # A wrongly pasted link goes outright.
    Click    ${PANEL} >> role=button[name="Remove ${BLOG}"]
    Click    role=group[name="Remove this link?"] >> role=button[name="Remove"]
    Posts On The Form Should Be    2
    ${posts}=    Query    select platform, url, screenshot_key from events_eventsocialpost where event_id = replace(?, '-', '') order by platform    ${event_id}
    Should Be Equal    ${{ [(p['platform'], p['url']) for p in $posts] }}    ${{ [('instagram', $INSTAGRAM), ('linkedin', $LINKEDIN)] }}
    Should Be Empty    ${posts}[0][screenshot_key]
    Should Not Be Empty    ${posts}[1][screenshot_key]

Spend and a bill go against the budget lines from the report
    The President Opens The Report
    Get Element Count    ${PANEL} >> [data-testid="spend-line"]    ==    2
    # Nothing spent yet: settlement has one thing outstanding, and the report says it does not wait for it.
    Wait For Elements State    ul[aria-label="Checklist"] >> li:has-text("Bills outstanding (1) (optional)")    visible
    Enter Spend    Sound    2800
    Toast Should Read    Spend saved
    Checklist Should Tick    Bills and spend
    ${sound}=    Row By Id    budget_budgetline    ${lines}[Sound]
    Should Be Equal As Numbers    ${sound}[amount_spent]    2800
    Upload File    Receipt for Sound    ${BILL_FIXTURE}
    Click    ${PANEL} >> [data-testid="spend-line"]:has(strong:text-is("Sound")) >> role=button[name="Attach"]
    Toast Should Read    Receipt attached
    Wait For Elements State    ${PANEL} >> [data-testid="spend-line"]:has(strong:text-is("Sound")) >> button:has-text("bill.pdf")    visible
    ${bills}=    Query    select file_name, content_type from budget_receiptdocument where line_id = replace(?, '-', '')    ${lines}[Sound]
    Length Should Be    ${bills}    1
    Should Be Equal    ${bills}[0][content_type]    application/pdf
    # Printing went over what was sanctioned: the note becomes required and settlement waits for it.
    Enter Spend    Printing    700
    Wait For Elements State    ul[aria-label="Checklist"] >> li:has-text("Bills outstanding (1) (optional)")    visible
    ${row}=    Set Variable    ${PANEL} >> [data-testid="spend-line"]:has(strong:text-is("Printing"))
    Wait For Elements State    ${row} >> text=Over sanctioned    visible
    Get Text    ${row}    contains    Why it went over (required)
    Fill Text    ${row} >> input:not([type]) >> nth=0    Reprinted after a date change
    Click    ${row} >> role=button[name="Save"]
    Checklist Should Tick    Bills and spend
    ${printing}=    Row By Id    budget_budgetline    ${lines}[Printing]
    Should Be Equal As Numbers    ${printing}[amount_spent]    700
    Should Be Equal    ${printing}[variance_note]    Reprinted after a date change

The report submits only with outcomes, then reads back the same
    [Tags]    db
    The President Opens The Report
    # A photo is there, the words are not, and the form says so.
    Submit Should Be    disabled
    Get Text    [data-testid="report-submit-hint"]    ==    Still needed: the outcomes.
    Fill Text    ${PANEL} >> section[aria-label="Outcomes and learnings"] textarea >> nth=0    ${SPACE * 3}
    Submit Should Be    disabled
    Fill Text    ${PANEL} >> section[aria-label="Outcomes and learnings"] textarea >> nth=0    ${OUTCOMES}
    Fill Text    ${PANEL} >> section[aria-label="Outcomes and learnings"] textarea >> nth=1    ${LEARNINGS}
    Checklist Should Tick    Outcomes written
    # Half-written words survive a reload: the draft is kept in this tab until the report is submitted.
    Reload
    Wait For Elements State    ${PANEL}    visible
    Get Text    ${PANEL} >> section[aria-label="Outcomes and learnings"] textarea >> nth=0    ==    ${OUTCOMES}
    Get Text    ${PANEL} >> section[aria-label="Outcomes and learnings"] textarea >> nth=1    ==    ${LEARNINGS}
    Get Text    ${PANEL}    contains    Your draft is kept on this device until you submit.
    Submit Should Be    enabled
    Snapshot    22-full-report-before-submit
    Click Button    Submit report
    Toast Should Read    Report submitted
    Status Pill Should Read    Reported
    The Submitted Report Should Be On Screen
    # Stored.
    Event Status Should Be    ${event_id}    reported
    ${report}=    Row    select outcomes, learnings, submitted_at from events_eventreport where event_id = replace(?, '-', '')    ${event_id}
    Should Be Equal    ${report}[outcomes]    ${OUTCOMES}
    Should Be Equal    ${report}[learnings]    ${LEARNINGS}
    Should Not Be Equal    ${report}[submitted_at]    ${None}
    Audit Should Contain    ${event_id}    event.closed
    # The same after a reload: nothing on the panel lived only in the browser.
    Reload
    Wait For Heading    ${TITLE}
    The Submitted Report Should Be On Screen
    Attendance Tile Should Read    Registered    4
    Attendance Tile Should Read    Attended    3
    Photos On The Form Should Be    2
    Posts On The Form Should Be    2
    Snapshot    22-full-report-submitted
    # And the same through the API, number for number.
    ${read}=    GET As    ${president}    /events/${event_id}/report
    ${r}=    Set Variable    ${read.json()}
    Should Be Equal    ${{ [$r[k] for k in ('registered', 'attended', 'walk_ins', 'no_show', 'photos', 'highlights', 'social_posts')] }}    ${{ [4, 3, 1, 1, 2, 1, 2] }}
    Should Be Equal    ${r}[outcomes]    ${OUTCOMES}
    Should Be Equal    ${r}[learnings]    ${LEARNINGS}
    Should Be Equal As Numbers    ${r}[budget][total_spent]    3500
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${event}=    GET As    ${student}    /events/${event_id}
    Should Be Equal As Integers    ${event.json()}[photo_count]    2
    Lists Should Be Equal    ${event.json()}[social_links]    ${{ [$INSTAGRAM, $LINKEDIN] }}    ignore_order=${True}

A student asks for a photo to come down and the President sees the request on the report
    Sign In As    ${STUDENT_EMAIL}
    Wait For Heading    Feed
    Go To    ${WEB_BASE}/events/${event_id}
    Wait For Heading    ${TITLE}
    Wait For Elements State    section[aria-label="Photos"]    visible
    Get Element Count    [data-testid="gallery-photo"]    ==    2
    Click    [data-testid="gallery-photo"] >> nth=0 >> role=button[name="Request removal"]
    Toast Should Read    Removal requested
    Wait For Elements State    [data-testid="gallery-photo"]:has-text("Removal requested")    visible
    Get Element Count    role=button[name="Request removal"]    ==    1
    ${asked}=    Count Rows    events_eventphoto    event_id = replace(?, '-', '') and removal_requested_at is not null    ${event_id}
    Should Be Equal As Integers    ${asked}    1
    Close Context
    Open App
    The President Opens The Report
    ${flagged}=    Set Variable    [data-testid="report-photo"]:has-text("A student asked for this to be removed")
    Wait For Elements State    ${flagged}    visible
    Get Element Count    ${flagged}    ==    1
    # The club takes it down; the report keeps its other photo.
    Click    ${flagged} >> role=button[name="Remove photo"]
    Click    role=group[name="Remove this photo?"] >> role=button[name="Remove"]
    Photos On The Form Should Be    1
    Live Photos Stored Should Be    1
    Event Status Should Be    ${event_id}    reported

The Treasurer is not offered the report but finds the bills on the budget page
    Sign In As    ${TREASURER_EMAIL}
    Open Club Event    ${event_id}    ${TITLE}
    Status Pill Should Read    Reported
    Get Element Count    ${PANEL}    ==    0
    Go To    ${WEB_BASE}/club/budget/${budget_id}
    Wait For Heading    ${TITLE}
    Wait For Elements State    [data-testid="spend-line"] >> nth=0    visible
    Get Element Count    [data-testid="spend-line"]    ==    2
    Get Property    [data-testid="spend-line"]:has(strong:text-is("Sound")) >> input[type="number"]    value    ==    2800
    Wait For Elements State    [data-testid="spend-line"]:has(strong:text-is("Sound")) >> button:has-text("bill.pdf")    visible


*** Keywords ***
A Live Event With A Night At The Door
    [Documentation]    Published and live, three registrations, two of them scanned in, and one walk-in entered at the desk
    ...    by PRN: registered 4, attended 3, walk-ins 1, no-shows 1.
    Open API
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    Set Suite Variable    ${president}
    ${p}=    Publish A Proposal    ${president}    ${TITLE}    Music Room    ${120}    Sound=3000    Printing=500
    Set Suite Variable    ${event_id}    ${p}[event]
    Set Suite Variable    ${budget_id}    ${p}[budget]
    Set Suite Variable    ${lines}    ${p}[lines]
    Go Live    ${president}    ${event_id}
    FOR    ${n}    ${comes}    IN    8    ${True}    9    ${True}    10    ${False}
        ${email}=    Club-less Student    ${n}
        ${guest}=    Login As    ${email}
        ${reg}=    Register For    ${guest}    ${event_id}
        IF    ${comes}
            ${scan}=    Scan    ${president}    ${event_id}    ${reg.json()}[pass_token]
            Should Be Equal    ${scan.json()}[result]    accepted
        END
    END
    ${walk_in}=    Club-less Student    11
    ${prn}=    Evaluate    $walk_in.split('@')[0].upper()
    ${desk}=    POST As    ${president}    /participation/events/${event_id}/check-in    ${{ {'prn': $prn, 'station_id': 'E2E-desk'} }}
    Should Be Equal    ${desk.json()}[result]    spot_registered

The President Opens The Report
    Sign In As    ${PRESIDENT_EMAIL}
    Open Club Event    ${event_id}    ${TITLE}
    Wait For Elements State    ${PANEL}    visible

Attendance Tile Should Read
    [Arguments]    ${label}    ${figure}
    Get Text    [data-testid="report-attendance"] >> dl:has(dt:text-is("${label}")) >> dd    ==    ${figure}

Checklist Should Tick
    [Arguments]    ${label}
    Wait For Elements State    ul[aria-label="Checklist"] >> li[data-done="true"]:has-text("${label}")    visible

Checklist Should Ask For
    [Documentation]    An unmet required item reads as the thing to do.
    [Arguments]    ${todo}
    Wait For Elements State    ul[aria-label="Checklist"] >> li[data-done="false"]:has-text("${todo}")    visible

Submit Should Be
    [Arguments]    ${state}
    Get Element States    ${PANEL} >> role=button[name="Submit report"]    contains    ${state}

Photos On The Form Should Be
    [Arguments]    ${n}
    Get Element Count    [data-testid="report-photo"]    ==    ${n}

Live Photos Stored Should Be
    [Arguments]    ${n}
    ${live}=    Count Rows    events_eventphoto    event_id = replace(?, '-', '') and removed_at is null    ${event_id}
    Should Be Equal As Integers    ${live}    ${n}

Add Post Link
    [Arguments]    ${url}
    Fill Field    Post link (Instagram, LinkedIn or other)    ${url}
    Click Button    Add link

Posts On The Form Should Be
    [Arguments]    ${n}
    Get Element Count    [data-testid="report-post"]    ==    ${n}

Post Row Should Read
    [Arguments]    ${url}    ${platform}
    Get Text    [data-testid="report-post"]:has(a[href="${url}"])    contains    ${platform}

Enter Spend
    [Arguments]    ${head}    ${amount}
    ${row}=    Set Variable    ${PANEL} >> [data-testid="spend-line"]:has(strong:text-is("${head}"))
    Fill Text    ${row} >> input[type="number"]    ${amount}
    Click    ${row} >> role=button[name="Save"]

The Submitted Report Should Be On Screen
    Wait For Elements State    ${PANEL} >> text=/^Submitted/    visible
    Get Text    ${PANEL} >> section[aria-label="Outcomes and learnings"]    contains    ${OUTCOMES}
    Get Text    ${PANEL} >> section[aria-label="Outcomes and learnings"]    contains    ${LEARNINGS}
    Get Text    ${PANEL} >> section[aria-label="Outcomes and learnings"]    contains    The report is final
    Get Element Count    ${PANEL} >> textarea    ==    0
    Get Element Count    ${PANEL} >> role=button[name="Submit report"]    ==    0
