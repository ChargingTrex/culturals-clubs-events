*** Settings ***
Documentation     The post-event report, one rule per test: evidence waits until a proposal is approved; a photo is stored
...               and counted, a wrong file type is refused, a member may add none; a post link is stored once; closing
...               needs a photo and an operator, stores the report and marks the event reported; a reported event stays
...               closed; students see the photos; and the semester report picks the event, its photo and its outreach up.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Everyone Signs In
Test Tags         api    report    unit


*** Test Cases ***
Evidence cannot be added to a proposal still under review
    ${e2}=    Propose    ${treasurer}    E2E Evidence Too Early    Music Room    ${97}    Tea=100
    ${r}=    Upload Photo    ${president}    ${e2}[event]    expected=409
    Problem Code Should Be    ${r}    EVENTS_EVIDENCE_NOT_OPEN
    ${n}=    Count Rows    events_eventphoto    event_id = replace(?, '-', '')    ${e2}[event]
    Should Be Equal As Integers    ${n}    0

A photo upload is stored and counted
    [Tags]    smoke
    ${r}=    Upload Photo    ${president}    ${p1}[event]    caption=Full house
    Set Suite Variable    ${photo_id}    ${r.json()}[id]
    Should Be Equal    ${r.json()}[caption]    Full house
    ${row}=    Row By Id    events_eventphoto    ${photo_id}
    Should Be Equal    ${row}[content_type]    image/png
    Should Be Equal    ${row}[caption]    Full house
    Should Be Equal    ${row}[removed_at]    ${None}
    ${event}=    GET As    ${president}    /events/${p1}[event]
    Should Be Equal As Integers    ${event.json()}[photo_count]    1
    Should Contain    ${event.json()}[highlight_photo_url]    /photos/${photo_id}/file

A file that is not an image is refused
    ${note}=    Evaluate    ('notes.txt', b'not a picture', 'text/plain')
    ${files}=    Create Dictionary    file=${note}
    ${headers}=    Bearer    ${president}
    ${r}=    POST On Session    api    /events/${p1}[event]/photos    files=${files}    headers=${headers}    expected_status=422
    Problem Code Should Be    ${r}    EVENTS_FILE_TYPE
    ${n}=    Count Rows    events_eventphoto    event_id = replace(?, '-', '')    ${p1}[event]
    Should Be Equal As Integers    ${n}    1

A member may not add evidence
    ${r}=    Upload Photo    ${member}    ${p1}[event]    expected=403
    Problem Code Should Be    ${r}    EVENTS_EVIDENCE_DENIED
    ${r}=    Add Social Post    ${member}    ${p1}[event]    https://www.instagram.com/p/e2e-member/    expected=403
    Problem Code Should Be    ${r}    EVENTS_EVIDENCE_DENIED

A social post link is stored once, with its platform
    [Tags]    smoke
    ${r}=    Add Social Post    ${president}    ${p1}[event]    https://www.instagram.com/p/e2e-report/
    Should Be Equal    ${r.json()}[platform]    instagram
    ${posts}=    Query    select platform, url from events_eventsocialpost where event_id = replace(?, '-', '')    ${p1}[event]
    Length Should Be    ${posts}    1
    Should Be Equal    ${posts}[0][url]    https://www.instagram.com/p/e2e-report/
    ${r}=    Add Social Post    ${president}    ${p1}[event]    https://www.instagram.com/p/e2e-report/    expected=409
    Problem Code Should Be    ${r}    EVENTS_SOCIAL_POST_DUPLICATE
    ${event}=    GET As    ${student}    /events/${p1}[event]
    Lists Should Be Equal    ${event.json()}[social_links]    ${{ ['https://www.instagram.com/p/e2e-report/'] }}

Closing without a photo is refused
    ${e3}=    Publish A Proposal    ${treasurer}    E2E No Photo No Report    Music Room    ${98}    Tea=100
    ${r}=    Close Event    ${president}    ${e3}[event]    It went well    expected=409
    Problem Code Should Be    ${r}    EVENTS_EVIDENCE_REQUIRED
    Event Status Should Be    ${e3}[event]    published
    ${n}=    Count Rows    events_eventreport    event_id = replace(?, '-', '')    ${e3}[event]
    Should Be Equal As Integers    ${n}    0

A member may not close the event
    ${r}=    Close Event    ${member}    ${p1}[event]    Not mine to say    expected=403
    Problem Code Should Be    ${r}    EVENTS_CLOSE_DENIED
    Event Status Should Be    ${p1}[event]    published

Closing stores the report and marks the event reported
    [Tags]    smoke
    Go Live    ${president}    ${p1}[event]
    ${r}=    Close Event    ${president}    ${p1}[event]    Sixty came and stayed to the end.    learnings=Open the doors earlier
    Should Be Equal    ${r.json()}[status]    reported
    Should Not Be Equal    ${r.json()}[closed_at]    ${None}
    ${report}=    Row    select outcomes, learnings from events_eventreport where event_id = replace(?, '-', '')    ${p1}[event]
    Should Be Equal    ${report}[outcomes]    Sixty came and stayed to the end.
    Should Be Equal    ${report}[learnings]    Open the doors earlier
    Event Status Should Be    ${p1}[event]    reported
    Audit Should Contain    ${p1}[event]    event.closed
    ${read}=    GET As    ${president}    /events/${p1}[event]/report
    Should Be Equal    ${read.json()}[outcomes]    Sixty came and stayed to the end.

A reported event cannot be closed again
    ${r}=    Close Event    ${president}    ${p1}[event]    Once more    expected=409
    Problem Code Should Be    ${r}    EVENTS_NOT_CLOSEABLE
    ${n}=    Count Rows    events_eventreport    event_id = replace(?, '-', '')    ${p1}[event]
    Should Be Equal As Integers    ${n}    1

Students see the photos of a reported event
    ${r}=    GET As    ${student}    /events/${p1}[event]/photos
    ${ids}=    Evaluate    [p['id'] for p in ($r.json()['results'] if isinstance($r.json(), dict) else $r.json())]
    List Should Contain Value    ${ids}    ${photo_id}

The semester report picks up the event, its highlight photo and its outreach
    ${r}=    PATCH As    ${president}    /events/${p1}[event]/photos/${photo_id}    ${{ {'is_highlight': True} }}
    Should Be True    ${r.json()}[is_highlight]
    ${photo}=    Row By Id    events_eventphoto    ${photo_id}
    Should Be Equal As Integers    ${photo}[is_highlight]    1
    ${report}=    Semester Report    ${vc}
    ${mine}=    Evaluate    [e for e in $report.json()['events'] if e['id'] == $p1['event']]
    Length Should Be    ${mine}    1
    Should Be Equal As Integers    ${mine}[0][photos]    1
    Lists Should Be Equal    ${mine}[0][social_links]    ${{ ['https://www.instagram.com/p/e2e-report/'] }}
    ${gallery}=    Evaluate    [g for g in $report.json()['gallery'] if g['event_id'] == $p1['event']]
    Length Should Be    ${gallery}    1
    Should Be Equal    ${gallery}[0][caption]    Full house
    Should Be True    ${report.json()}[outreach][events_promoted] >= 1
    Should Be True    ${report.json()}[outreach][instagram] >= 1


*** Keywords ***
Everyone Signs In
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${president}
    Set Suite Variable    ${member}
    Set Suite Variable    ${student}
    Set Suite Variable    ${vc}
    # The day before the seeded semester ends, so the semester report can see it; Seminar Hall B at 14:00 keeps
    # it clear of every other suite's Music Room 10:00 bookings whatever the offset works out to.
    ${ends_on}=    Scalar    select ends_on from identity_semester where is_current = 1
    ${offset}=    Evaluate    (datetime.date.fromisoformat($ends_on) - datetime.date.today()).days - 1    modules=datetime
    Should Be True    ${offset} > 0    msg=the seeded semester has ended (${ends_on}); seed_demo needs a current semester
    ${event}=    Create Draft Event    ${treasurer}    E2E Reported Evening    Seminar Hall B    ${offset}    capacity=30    expected=25    start_hour=14
    ${r}=    Add Budget Line    ${treasurer}    ${event}[budget][id]    Sound    1000
    ${lines}=    Evaluate    {l['head']: l['id'] for l in $r.json()['lines']}
    ${sent}=    POST As    ${treasurer}    /events/${event}[id]/submit
    ${p1}=    Create Dictionary    event=${event}[id]    budget=${event}[budget][id]    approval=${sent.json()}[id]    lines=${lines}
    Approve Through Every Gate    ${p1}[event]
    Set Suite Variable    ${p1}
