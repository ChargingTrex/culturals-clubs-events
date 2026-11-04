*** Settings ***
Documentation     Steps 6–7: a student registers and holds a pass; a full event queues the next one
...               and promotes on a cancellation; the organiser's scan station gives every verdict and
...               records every attempt — and the Treasurer and the Vice-Chancellor are kept away from the door.
Resource          ../resources/api.resource
Suite Setup       People Sign In
Test Tags         api


*** Test Cases ***
A student registers for the published event and gets a pass
    [Tags]    smoke
    ${r}=    Register For    ${student}    ${quiz}[id]
    Should Not Be True    ${r.json()}[waitlisted]
    Should Not Be Empty    ${r.json()}[pass_token]
    Set Suite Variable    ${quiz_registration}    ${r.json()}[id]
    ${passes}=    GET As    ${student}    /participation/my-passes
    ${mine}=    Evaluate    [p for p in $passes.json()['passes'] if p['event_id'] == $quiz['id']]
    Length Should Be    ${mine}    1

Registering twice is refused
    ${r}=    Register For    ${student}    ${quiz}[id]    expected=409
    Problem Code Should Be    ${r}    PARTICIPATION_ALREADY_REGISTERED

Cancelling frees the place
    POST As    ${student}    /participation/registrations/${quiz_registration}/cancel    expected=204
    ${event}=    GET As    ${student}    /events/${quiz}[id]
    Should Be Equal    ${event.json()}[my_registration]    ${None}

A full event waitlists the next student, and a cancellation promotes them
    ${small}=    Publish A Two-Seat Event
    ${first}=    Register For    ${student}    ${small}
    ${second}=    Register For    ${student_2}    ${small}
    ${third}=    Register For    ${student_3}    ${small}
    Should Not Be True    ${second.json()}[waitlisted]
    Should Be True    ${third.json()}[waitlisted]
    Should Be Equal    ${third.json()}[pass_token]    ${None}
    ${r}=    POST As    ${student_3}    /participation/registrations/${third.json()}[id]/reissue-pass    expected=409
    Problem Code Should Be    ${r}    PARTICIPATION_WAITLISTED
    POST As    ${student}    /participation/registrations/${first.json()}[id]/cancel    expected=204
    ${promoted}=    GET As    ${student_3}    /participation/registrations
    ${row}=    Evaluate    [x for x in $promoted.json()['results'] if x['id'] == $third.json()['id']][0]
    Should Not Be True    ${row}[waitlisted]
    Should Not Be Empty    ${row}[pass_token]

The organiser scans a valid pass, then the same pass, then garbage
    [Tags]    smoke
    ${before}=    Attempts So Far
    ${reg}=    Register For    ${door_student}    ${live}[id]
    ${r}=    Scan    ${organiser}    ${live}[id]    ${reg.json()}[pass_token]
    Should Be Equal    ${r.json()}[result]    accepted
    Should Be True    ${r.json()}[accepted]
    Should Not Be Empty    ${r.json()}[student][prn]
    ${r}=    Scan    ${organiser}    ${live}[id]    ${reg.json()}[pass_token]
    Should Be Equal    ${r.json()}[result]    duplicate
    ${r}=    Scan    ${organiser}    ${live}[id]    not-a-token-at-all
    Should Be Equal    ${r.json()}[result]    unknown_code
    ${after}=    Attempts So Far
    Should Be Equal As Integers    ${after}    ${before + 3}

A flat phone: manual check-in by PRN is still recorded
    ${before}=    Attempts So Far
    ${roster}=    GET As    ${organiser}    /participation/events/${live}[id]/roster
    ${waiting}=    Evaluate    [x for x in $roster.json()['results'] if not x['attended'] and not x['waitlisted']][0]
    ${r}=    POST As    ${organiser}    /participation/events/${live}[id]/check-in    ${{ {'prn': $waiting['prn'], 'station_id': 'E2E-desk'} }}
    Should Be Equal    ${r.json()}[result]    accepted
    Should Be Equal    ${r.json()}[student][prn]    ${waiting}[prn]
    ${after}=    Attempts So Far
    Should Be Equal As Integers    ${after}    ${before + 1}

Replaying an offline queue twice is a no-op
    ${reg}=    Register For    ${sync_student}    ${live}[id]
    ${at}=    Evaluate    datetime.datetime.now(datetime.timezone.utc).isoformat()    modules=datetime
    ${batch}=    Evaluate    {'station_id': 'E2E-offline', 'scans': [{'token': $reg.json()['pass_token'], 'scanned_at': $at, 'ref': 'e2e-' + $reg.json()['id']}]}
    ${first}=    POST As    ${organiser}    /participation/events/${live}[id]/scan/sync    ${batch}
    Should Be Equal As Integers    ${first.json()}[accepted]    1
    ${attempts}=    Attempts So Far
    ${again}=    POST As    ${organiser}    /participation/events/${live}[id]/scan/sync    ${batch}
    Should Be Equal As Integers    ${again.json()}[accepted]    0
    ${still}=    Attempts So Far
    Should Be Equal As Integers    ${still}    ${attempts}

The Treasurer may not work a door
    ${treasurer}=    Login As    ${LENS_TREASURER_EMAIL}
    ${r}=    Scan    ${treasurer}    ${live}[id]    anything    expected=403
    Problem Code Should Be    ${r}    PERMISSION_DENIED

The Vice-Chancellor never finds a roster
    ${vc}=    Staff Login As    ${VC_EMAIL}
    ${r}=    GET As    ${vc}    /participation/events/${live}[id]/roster    expected=404
    Problem Code Should Be    ${r}    NOT_FOUND


*** Keywords ***
People Sign In
    Open API
    FOR    ${name}    ${email}    IN
    ...    student    ${STUDENT_EMAIL}
    ...    student_2    ${STUDENT_2_EMAIL}
    ...    student_3    ${STUDENT_3_EMAIL}
    ...    door_student    ${DOOR_STUDENT_EMAIL}
    ...    sync_student    ${SYNC_STUDENT_EMAIL}
    ...    organiser    ${LENS_PRESIDENT_EMAIL}
        ${token}=    Login As    ${email}
        Set Suite Variable    ${${name}}    ${token}
    END
    ${quiz}=    Find Event    ${student}    ${PUBLISHED_EVENT}
    Set Suite Variable    ${quiz}
    IF    $quiz['my_registration']
        POST As    ${student}    /participation/registrations/${quiz}[my_registration][id]/cancel    expected=204
    END
    ${live}=    Find Event    ${organiser}    ${LIVE_EVENT}
    Set Suite Variable    ${live}

Publish A Two-Seat Event
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${event}=    Create Draft Event    ${president}    E2E Two Seats Only    Music Room    ${36}    capacity=2    expected=2
    Add Budget Line    ${president}    ${event}[budget][id]    Tea    200
    POST As    ${president}    /events/${event}[id]/submit
    Approve Through Every Gate    ${event}[id]
    RETURN    ${event}[id]

Attempts So Far
    [Documentation]    Every scan writes a ScanRecord; the station's capture block counts them.
    ${station}=    GET As    ${organiser}    /participation/events/${live}[id]/scan
    RETURN    ${station.json()}[capture][attempts]
