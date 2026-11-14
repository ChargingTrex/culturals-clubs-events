*** Settings ***
Documentation     The venue calendar and the Dean's moves (AR-02) and the Wednesday open block (AR-03), one rule
...               per test: who may read the calendar and what a president sees of another club's pending booking;
...               the Dean moving a booking's time, its venue, or both, with the event row, the reassignment row,
...               the audit entry and every notification checked; every refusal of a move; and the open block —
...               first come first served, one slot per club per Wednesday, Wednesdays at 15:00 or 16:00 only.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Everyone Signs In And The Clubs Book
Test Tags         api    calendar    unit


*** Test Cases ***
A president and the staff read the calendar; a student and a treasurer are refused
    [Tags]    smoke
    Venue Calendar    ${president}    from=${day86}    to=${day86}
    Venue Calendar    ${dean}    from=${day86}    to=${day86}
    Venue Calendar    ${society}    from=${day86}    to=${day86}
    ${r}=    Venue Calendar    ${student}    expected=403    from=${day86}    to=${day86}
    Problem Code Should Be    ${r}    EVENTS_CALENDAR_DENIED
    ${r}=    Venue Calendar    ${treasurer}    expected=403    from=${day86}    to=${day86}
    Problem Code Should Be    ${r}    EVENTS_CALENDAR_DENIED

Another club's pending booking is only "Requested" to a president, and its own shows its title
    ${cal}=    Venue Calendar    ${president}    from=${day86}    to=${day86}
    ${own}=    Booking In    ${cal}    ${mine}[event]
    Should Be Equal    ${own}[title]    E2E Cal Music Pending
    Should Be Equal    ${own}[club]    Music Club
    Should Not Be True    ${own}[confirmed]
    ${other}=    Booking In    ${cal}    ${theirs}[event]
    Should Be Equal    ${other}[title]    Requested
    Should Be Equal    ${other}[club]    ${EMPTY}
    Should Be Equal    ${other}[venue_name]    Seminar Hall B

The Dean sees the pending booking's title, and the stored row still has it
    ${cal}=    Venue Calendar    ${dean}    from=${day86}    to=${day86}
    ${other}=    Booking In    ${cal}    ${theirs}[event]
    Should Be Equal    ${other}[title]    E2E Cal Dance Pending
    Should Be Equal    ${other}[club]    Dance Club
    ${e}=    Row By Id    events_event    ${theirs}[event]
    Should Be Equal    ${e}[title]    E2E Cal Dance Pending

The Dean moves a booking one hour later, the row and the reassignment are written and everyone is told
    [Tags]    smoke
    ${e}=    GET As    ${dean}    /events/${pub}[event]
    ${start}=    Shifted    ${e.json()}[starts_at]    1
    ${end}=    Shifted    ${e.json()}[ends_at]    1
    ${r}=    Reassign    ${dean}    ${pub}[event]    starts_at=${start}    ends_at=${end}    reason=Sound check overran in the earlier slot
    Should Be Equal    ${r.json()}[from_venue_name]    ${r.json()}[to_venue_name]
    Event Times Should Be    ${pub}[event]    ${start}    ${end}
    ${moves}=    Stored Reassignments    ${pub}[event]
    Length Should Be    ${moves}    1
    Should Be Equal    ${moves}[0][from_venue_id]    ${moves}[0][to_venue_id]
    Should Be Equal    ${moves}[0][reason]    Sound check overran in the earlier slot
    Audit Should Contain    ${pub}[event]    event.venue_reassigned
    Officers Should Be Told    ${pub}[event]    event.venue_changed    was moved to
    ${told}=    Should Be Told    ${STUDENT_EMAIL}    event.venue_changed    ${pub}[event]    Was
    Should Be Equal    ${told}[0][link]    /events/${pub}[event]

The Dean moves venue and time together
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    ${start}=    Campus Slot    ${day87}    14
    ${end}=    Campus Slot    ${day87}    16
    ${r}=    Reassign    ${dean}    ${pub}[event]    to_venue=${amphi}[id]    starts_at=${start}    ends_at=${end}    reason=The Amphitheatre is free that afternoon
    Should Be Equal    ${r.json()}[to_venue_name]    Amphitheatre
    Event Times Should Be    ${pub}[event]    ${start}    ${end}
    ${e}=    Row By Id    events_event    ${pub}[event]
    Should Be Equal    ${e}[venue_id]    ${{ $amphi['id'].replace('-', '') }}
    ${moves}=    Stored Reassignments    ${pub}[event]
    Length Should Be    ${moves}    2
    Should Not Be Equal    ${moves}[1][from_venue_id]    ${moves}[1][to_venue_id]

A move into an hour another club has requested is refused
    ${hall}=    Find Venue    ${dean}    Seminar Hall B
    ${start}=    Campus Slot    ${day86}    10
    ${end}=    Campus Slot    ${day86}    12
    ${r}=    Reassign    ${dean}    ${pub}[event]    expected=409    to_venue=${hall}[id]    starts_at=${start}    ends_at=${end}    reason=Trying the hall the Dance Club asked for
    Problem Code Should Be    ${r}    EVENTS_VENUE_CONTESTED
    Event Times Should Not Have Moved To    ${pub}[event]    ${start}

A move into a confirmed booking is refused
    ${room}=    Find Venue    ${dean}    Music Room
    ${start}=    Campus Slot    ${day88}    10
    ${end}=    Campus Slot    ${day88}    12
    ${r}=    Reassign    ${dean}    ${pub}[event]    expected=409    to_venue=${room}[id]    starts_at=${start}    ends_at=${end}    reason=Trying the hour the blocker already holds
    Problem Code Should Be    ${r}    EVENTS_VENUE_UNAVAILABLE
    Event Times Should Not Have Moved To    ${pub}[event]    ${start}

A half-hour start is refused: bookings are whole campus-clock hours
    ${start}=    Evaluate    (datetime.datetime.fromisoformat($day87 + 'T14:30:00') .replace(tzinfo=zoneinfo.ZoneInfo('Asia/Kolkata'))).isoformat()    modules=datetime,zoneinfo
    ${end}=    Campus Slot    ${day87}    16
    Reassign    ${dean}    ${pub}[event]    expected=422    starts_at=${start}    ends_at=${end}    reason=Half past the hour is not a slot

A reason the club cannot act on is refused
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    ${start}=    Campus Slot    ${day87}    15
    ${end}=    Campus Slot    ${day87}    17
    Reassign    ${dean}    ${pub}[event]    expected=422    starts_at=${start}    ends_at=${end}    reason=ok
    Event Times Should Not Have Moved To    ${pub}[event]    ${start}

Nobody but the Dean moves a booking
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    FOR    ${token}    IN    ${society}    ${vc}    ${president}    ${treasurer}
        ${r}=    Reassign    ${token}    ${pub}[event]    expected=403    to_venue=${amphi}[id]    reason=Not my call, but trying anyway
        Problem Code Should Be    ${r}    EVENTS_REASSIGN_DENIED
    END
    ${moves}=    Stored Reassignments    ${pub}[event]
    Length Should Be    ${moves}    2

Moving to the venue it already has, at the time it already has, is refused
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    ${r}=    Reassign    ${dean}    ${pub}[event]    expected=409    to_venue=${amphi}[id]    reason=Nothing actually changes here
    Problem Code Should Be    ${r}    EVENTS_SAME_VENUE

The open block lists two one-hour slots on a Wednesday, one entry per venue
    ${r}=    Open Block    ${president}    date=${wednesday}
    Should Be Equal    ${r.json()}[date]    ${wednesday}
    Length Should Be    ${r.json()}[slots]    2
    ${hours}=    Evaluate    [datetime.datetime.fromisoformat(s['starts_at']).astimezone(zoneinfo.ZoneInfo('Asia/Kolkata')).hour for s in $r.json()['slots']]    modules=datetime,zoneinfo
    Lists Should Be Equal    ${hours}    ${{ [15, 16] }}
    ${venues}=    GET As    ${president}    /venues    page_size=200
    Length Should Be    ${r.json()}[slots][0][venues]    ${{ len([v for v in $venues.json()['results'] if v.get('active', True)]) }}

A president books the 15:00 slot: published at once, no budget, on the calendar
    [Tags]    smoke
    ${slot}=    Campus Slot    ${wednesday}    15
    ${room}=    Find Venue    ${president}    Music Room
    ${r}=    Book Open Block    ${president}    ${music}    ${room}[id]    ${slot}    title=E2E Open Block Music
    Set Suite Variable    ${block}    ${r.json()}[id]
    Should Be Equal    ${r.json()}[status]    published
    ${e}=    Row By Id    events_event    ${block}
    Should Be Equal    ${e}[kind]    open_block
    Should Be Equal    ${e}[status]    published
    ${end}=    Campus Slot    ${wednesday}    16
    Event Times Should Be    ${block}    ${slot}    ${end}
    ${b}=    Row    select is_nil from budget_budget where event_id = replace(?, '-', '')    ${block}
    Should Be Equal As Integers    ${b}[is_nil]    1
    Audit Should Contain    ${block}    event.open_block_booked
    ${cal}=    Venue Calendar    ${dean}    date=${wednesday}
    ${booked}=    Booking In    ${cal}    ${block}
    Should Be True    ${booked}[confirmed]
    ${slots}=    Open Block    ${president}    date=${wednesday}
    ${taken}=    Evaluate    [v for v in $slots.json()['slots'][0]['venues'] if v['id'] == $room['id']][0]
    Should Be Equal    ${taken}[booked_by]    Music Club

The second club to want the same venue and hour is told it is taken
    ${slot}=    Campus Slot    ${wednesday}    15
    ${room}=    Find Venue    ${lens}    Music Room
    ${r}=    Book Open Block    ${lens}    ${photography}    ${room}[id]    ${slot}    expected=409
    Problem Code Should Be    ${r}    EVENTS_VENUE_UNAVAILABLE
    ${n}=    Count Rows    events_event    kind = 'open_block' and club_id = replace(?, '-', '')    ${photography}
    Should Be Equal As Integers    ${n}    0

A club holds one slot per Wednesday
    ${slot}=    Campus Slot    ${wednesday}    16
    ${amphi}=    Find Venue    ${president}    Amphitheatre
    ${r}=    Book Open Block    ${president}    ${music}    ${amphi}[id]    ${slot}    expected=409
    Problem Code Should Be    ${r}    EVENTS_OPEN_BLOCK_ONE_PER_CLUB

Outside Wednesday 15:00–17:00 there is no open block
    ${amphi}=    Find Venue    ${lens}    Amphitheatre
    ${tuesday}=    Evaluate    (datetime.date.fromisoformat($wednesday) - datetime.timedelta(days=1)).isoformat()    modules=datetime
    ${slot}=    Campus Slot    ${tuesday}    15
    ${r}=    Book Open Block    ${lens}    ${photography}    ${amphi}[id]    ${slot}    expected=422
    Problem Code Should Be    ${r}    EVENTS_NOT_OPEN_BLOCK
    ${slot}=    Campus Slot    ${wednesday}    17
    ${r}=    Book Open Block    ${lens}    ${photography}    ${amphi}[id]    ${slot}    expected=422
    Problem Code Should Be    ${r}    EVENTS_NOT_OPEN_BLOCK

Only a club's President or Vice-President books the open block
    ${slot}=    Campus Slot    ${wednesday}    16
    ${amphi}=    Find Venue    ${president}    Amphitheatre
    ${r}=    Book Open Block    ${member}    ${music}    ${amphi}[id]    ${slot}    expected=403
    Problem Code Should Be    ${r}    EVENTS_OPEN_BLOCK_DENIED
    ${r}=    Book Open Block    ${treasurer}    ${music}    ${amphi}[id]    ${slot}    expected=403
    Problem Code Should Be    ${r}    EVENTS_OPEN_BLOCK_DENIED
    ${r}=    Open Block    ${student}    date=${wednesday}    expected=403
    Problem Code Should Be    ${r}    EVENTS_OPEN_BLOCK_DENIED


*** Keywords ***
Everyone Signs In And The Clubs Book
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${lens}=    Login As    ${LENS_PRESIDENT_EMAIL}
    ${dance}=    Login As    ${DANCE_TREASURER_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${president}
    Set Suite Variable    ${member}
    Set Suite Variable    ${lens}
    Set Suite Variable    ${student}
    Set Suite Variable    ${society}
    Set Suite Variable    ${dean}
    Set Suite Variable    ${vc}
    ${music}=    My First Club    ${president}
    ${photography}=    My First Club    ${lens}
    Set Suite Variable    ${music}
    Set Suite Variable    ${photography}
    ${day86}=    Day    86
    ${day87}=    Day    87
    ${day88}=    Day    88
    Set Suite Variable    ${day86}
    Set Suite Variable    ${day87}
    Set Suite Variable    ${day88}
    ${wednesday}=    Next Open Block Date    2
    Set Suite Variable    ${wednesday}
    # Two pending proposals the same day, in different halls: one from each club.
    ${mine}=    Propose    ${treasurer}    E2E Cal Music Pending    Music Room    ${86}    Sound=3000
    ${theirs}=    Propose    ${dance}    E2E Cal Dance Pending    Seminar Hall B    ${86}    Stage=2000
    Set Suite Variable    ${mine}
    Set Suite Variable    ${theirs}
    # The booking the Dean moves, with a registered student who must hear of it.
    ${pub}=    Publish A Proposal    ${treasurer}    E2E Cal Move Me    Music Room    ${87}    Sound=3000
    Register For    ${student}    ${pub}[event]
    Set Suite Variable    ${pub}
    # A confirmed booking the Dean must not move anything into.
    Publish A Proposal    ${treasurer}    E2E Cal Blocker    Music Room    ${88}    Sound=1000

Day
    [Arguments]    ${days_ahead}
    ${d}=    Evaluate    (datetime.date.today() + datetime.timedelta(days=int($days_ahead))).isoformat()    modules=datetime
    RETURN    ${d}

Shifted
    [Documentation]    An API datetime moved by whole hours, as ISO text.
    [Arguments]    ${iso}    ${hours}
    ${out}=    Evaluate    (datetime.datetime.fromisoformat($iso.replace('Z', '+00:00')) + datetime.timedelta(hours=int($hours))).isoformat()    modules=datetime
    RETURN    ${out}

Booking In
    [Arguments]    ${calendar}    ${event_id}
    ${b}=    Evaluate    [b for b in $calendar.json()['bookings'] if b['id'] == $event_id][0]
    RETURN    ${b}

Event Times Should Not Have Moved To
    [Arguments]    ${event_id}    ${starts}
    ${r}=    Row    select starts_at from events_event where id = replace(?, '-', '')    ${event_id}
    ${same}=    Same Instant    ${r}[starts_at]    ${starts}
    Should Not Be True    ${same}    msg=the refused move was written: ${r}[starts_at]
