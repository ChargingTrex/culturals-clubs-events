*** Settings ***
Documentation     AR-02 and AR-03 on screen: a club president reads the calendar with other clubs' pending bookings
...               shown only as "Requested" and no Move control; the Dean moves a booking to a later hour from the
...               Calendar page (the club and registered students are told), is refused a move into an occupied hour,
...               and the Photography Club president books the Wednesday open block, which the calendar shades at once.
Resource          ../resources/ui.resource
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Clubs Book Their Evenings
Test Setup        Open App
Test Teardown     Close Context
Test Tags         ui    calendar


*** Variables ***
${MUSIC_TITLE}    E2E Cal Music Rehearsal
${DANCE_TITLE}    E2E Cal Dance Rehearsal
${MOVE_TITLE}     E2E Cal Move Me
${OTHER_TITLE}    E2E Cal Holds The Amphitheatre


*** Test Cases ***
A president sees their own booking by name, another club's request only as Requested, and no Move
    Sign In As    ${PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Click Link    Calendar
    Wait For Heading    Semester event calendar
    Open Calendar Day    ${pending_day}
    Wait For Elements State    [data-testid="slot"][data-venue="Music Room"][data-hour="10"] >> [data-testid="slot-booking"]:has-text("${MUSIC_TITLE}")    visible
    ${other}=    Get Text    [data-testid="slot"][data-venue="Seminar Hall B"][data-hour="10"] >> [data-testid="slot-booking"]
    Should Contain    ${other}    Requested
    Should Contain    ${other}    · requested
    Should Not Contain    ${other}    ${DANCE_TITLE}
    Get Element Count    role=button[name=/^Move /]    ==    0

The Dean moves a booking an hour later from the calendar, and the club and its students are told
    [Tags]    smoke
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Click Link    Calendar
    Wait For Heading    Semester event calendar
    Open Calendar Day    ${move_day}
    Wait For Elements State    [data-testid="slot"][data-venue="Music Room"][data-hour="10"] >> [data-testid="slot-booking"]:has-text("${MOVE_TITLE}")    visible
    Click    role=button[name="Move ${MOVE_TITLE}"]
    Wait For Elements State    form[aria-label="Move ${MOVE_TITLE}"]    visible
    Pick    From    11:00
    Pick    To    13:00
    Fill Field    Reason (the club is shown this)    The sound check in the earlier slot overran
    Snapshot    18-dean-move-form
    Click Button    Move
    Toast Should Read    moved; the club and registered students are told
    Wait For Elements State    [data-testid="slot"][data-venue="Music Room"][data-hour="11"] >> [data-testid="slot-booking"]:has-text("${MOVE_TITLE}")    visible
    ${starts}=    Campus Time    ${104}    11
    ${ends}=    Campus Time    ${104}    13
    Event Times Should Be    ${moved}[event]    ${starts.isoformat()}    ${ends.isoformat()}
    ${moves}=    Stored Reassignments    ${moved}[event]
    Length Should Be    ${moves}    1
    Should Be Equal    ${moves}[0][reason]    The sound check in the earlier slot overran
    Should Be Told    ${TREASURER_EMAIL}    event.venue_changed    ${moved}[event]    was moved to
    Should Be Told    ${STUDENT_2_EMAIL}    event.venue_changed    ${moved}[event]

A move into an hour another club holds is refused on screen
    Sign In As    ${DEAN_EMAIL}    ${MFA_CODE}
    Wait For Heading    Dean approvals
    Click Link    Calendar
    Wait For Heading    Semester event calendar
    Open Calendar Day    ${move_day}
    Click    role=button[name="Move ${MOVE_TITLE}"]
    Wait For Elements State    form[aria-label="Move ${MOVE_TITLE}"]    visible
    Pick    Venue    Amphitheatre
    Fill Field    Reason (the club is shown this)    Trying the bigger hall
    Click Button    Move
    Expect Problem Banner    EVENTS_VENUE_UNAVAILABLE
    ${moves}=    Stored Reassignments    ${moved}[event]
    Length Should Be    ${moves}    1

The Photography Club president books the Wednesday open block and the calendar shows it at once
    ${late}=    Evaluate    (lambda n: n.weekday() == 2 and n.hour >= 15)(datetime.datetime.now(zoneinfo.ZoneInfo('Asia/Kolkata')))    modules=datetime,zoneinfo
    Skip If    ${late}    The Club events card shows only the next Wednesday; after 15:00 on a Wednesday that block has started.
    Sign In As    ${LENS_PRESIDENT_EMAIL}
    Wait For Heading    Feed
    Click Link    Club events
    Wait For Heading    Club events
    Wait For Elements State    section[aria-label="Open block"]    visible
    Click Button Matching    ^Book
    Toast Should Read    Booked:
    Wait For Elements State    section[aria-label="Open block"] >> text=Photography Club has    visible
    ${rows}=    Query    select e.id, e.status, e.starts_at, v.name as venue from events_event e join events_venue v on v.id = e.venue_id join clubs_club c on c.id = e.club_id where e.kind = 'open_block' and c.name = 'Photography Club'
    Length Should Be    ${rows}    1
    Should Be Equal    ${rows}[0][status]    published
    ${block}=    Open Block    ${lens}
    Click Link    Calendar
    Wait For Heading    Semester event calendar
    Open Calendar Day    ${block.json()}[date]
    Wait For Elements State    [data-testid="slot"][data-venue="${rows}[0][venue]"][data-hour="15"][data-open-block="true"] >> [data-testid="slot-booking"]:has-text("open block")    visible
    Snapshot    18-open-block-booked


*** Keywords ***
Pick
    [Documentation]    Choose an option in the move form's From, To or Venue select. Their labels wrap the select, so the
    ...    accessible label text includes every option; the selects are addressed by their order in the form instead.
    [Arguments]    ${label}    ${option}
    ${index}=    Evaluate    {'From': 0, 'To': 1, 'Venue': 2}[$label]
    Select Options By    form[aria-label^="Move "] >> select >> nth=${index}    label    ${option}

Clubs Book Their Evenings
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${dance}=    Login As    ${DANCE_TREASURER_EMAIL}
    ${lens}=    Login As    ${LENS_PRESIDENT_EMAIL}
    ${student}=    Login As    ${STUDENT_2_EMAIL}
    Set Suite Variable    ${lens}
    # Two pending requests on one day, in different halls: the Music president sees one by name, one as Requested.
    ${a}=    Propose    ${treasurer}    ${MUSIC_TITLE}    Music Room    ${103}    Sound=1500
    ${b}=    Propose    ${dance}    ${DANCE_TITLE}    Seminar Hall B    ${103}    Stage=1500
    ${day}=    Campus Time    ${103}    10
    Set Suite Variable    ${pending_day}    ${day.date().isoformat()}
    # A published booking for the Dean to move, with a registered student, and another club holding the Amphitheatre.
    ${moved}=    Publish A Proposal    ${treasurer}    ${MOVE_TITLE}    Music Room    ${104}    Sound=2500
    Register For    ${student}    ${moved}[event]
    ${other}=    Publish A Proposal    ${dance}    ${OTHER_TITLE}    Amphitheatre    ${104}    Stage=2500
    ${day}=    Campus Time    ${104}    10
    Set Suite Variable    ${move_day}    ${day.date().isoformat()}
    Set Suite Variable    ${moved}
