*** Settings ***
Documentation     Step 5: two clubs want Seminar Hall A the same evening. No gate may approve over
...               the clash; the Dean moves one with a reason, and then the approval goes through.
Resource          ../resources/api.resource
Suite Setup       Dean And Society Sign In
Test Tags         api


*** Test Cases ***
Nobody approves the Open Mic over the clash
    [Tags]    smoke
    Should Not Be Empty    ${mic}[clashes]
    ${r}=    Decide    ${dean}    ${mic}[id]    approve    expected=409
    Problem Code Should Be    ${r}    GOVERNANCE_CLASH_UNRESOLVED
    # Finding: the pre-check runs at every gate, so the Society is refused too — the item never reaches the Dean's queue until moved.
    ${r}=    Decide    ${society}    ${mic}[id]    approve    expected=409
    Problem Code Should Be    ${r}    GOVERNANCE_CLASH_UNRESOLVED

A move needs a reason the club will read
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    ${r}=    POST As    ${dean}    /events/${workshop_event}[id]/reassign    ${{ {'to_venue': $amphi['id'], 'reason': ''} }}    422

The Dean moves the workshop and the clash is gone
    [Tags]    smoke
    ${amphi}=    Find Venue    ${dean}    Amphitheatre
    ${body}=    Create Dictionary    to_venue=${amphi}[id]    reason=Open Mic booked the hall first; the Amphitheatre is free
    ${r}=    POST As    ${dean}    /events/${workshop_event}[id]/reassign    ${body}
    Should Be Equal    ${r.json()}[to_venue_name]    Amphitheatre
    Should Be Equal    ${r.json()}[from_venue_name]    Seminar Hall A
    ${moved}=    GET As    ${dean}    /events/${workshop_event}[id]
    Should Be Equal    ${moved.json()}[venue_name]    Amphitheatre
    ${now}=    GET As    ${dean}    /governance/approvals/${mic}[id]
    Should Be Empty    ${now.json()}[clashes]

Then the Open Mic is approved through both gates
    ${r}=    Decide    ${society}    ${mic}[id]    approve
    Should Be Equal    ${r.json()}[request][current_stage]    dean
    ${r}=    Decide    ${dean}    ${mic}[id]    approve
    Should Be Equal    ${r.json()}[request][state]    approved

The venue calendar for that evening shows the move
    ${date}=    Set Variable    ${mic}[starts_at][:10]
    ${cal}=    GET As    ${dean}    /venue-calendar    date=${date}
    ${workshop}=    Evaluate    [b for b in $cal.json()['bookings'] if b['id'] == $workshop_event['id']][0]
    Should Be Equal    ${workshop}[venue_name]    Amphitheatre
    Should Not Be True    ${workshop}[clash]
    ${open_mic}=    Evaluate    [b for b in $cal.json()['bookings'] if b['id'] == $mic['event']][0]
    Should Be True    ${open_mic}[confirmed]
    Should Not Be True    ${open_mic}[clash]


*** Keywords ***
Dean And Society Sign In
    Open API
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    Set Suite Variable    ${dean}
    Set Suite Variable    ${society}
    ${event}=    Find Event    ${dean}    ${OPEN_MIC}
    ${mic}=    Find Approval For Event    ${dean}    ${event}[id]
    Set Suite Variable    ${mic}
    ${workshop_event}=    Find Event    ${dean}    ${DANCE_WORKSHOP}
    Set Suite Variable    ${workshop_event}
