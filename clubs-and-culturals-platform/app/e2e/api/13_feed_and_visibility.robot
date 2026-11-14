*** Settings ***
Documentation     What a student sees and when (F-07): a new proposal is in the approvers' queue and the club's own
...               list but not the campus feed; after the last gate it is in the feed and found by search; a member's
...               feed puts their own clubs first; a club-less student gets date order; search matches club names;
...               a returned or rejected proposal never reaches a student.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       Everyone Signs In And The Treasurer Proposes
Test Tags         api    feed    unit


*** Test Cases ***
A new proposal is in the Society's queue and the club's own list, not the campus feed
    [Tags]    smoke
    Find Approval For Event    ${society}    ${p}[event]
    ${campus}=    Events Seen By    ${student}
    Should Not Contain    ${campus}    E2E Feed New Show
    ${own}=    Events Seen By    ${member}    mine=true
    Should Contain    ${own}    E2E Feed New Show
    ${status}=    Scalar    select status from events_event where id = replace(?, '-', '')    ${p}[event]
    Should Be Equal    ${status}    submitted

After the Society and the Dean approve, the student finds it in the feed and by search
    [Tags]    smoke
    Approve Through Every Gate    ${p}[event]
    Event Status Should Be    ${p}[event]    published
    ${campus}=    Events Seen By    ${student}    status=published,live
    Should Contain    ${campus}    E2E Feed New Show
    ${found}=    Events Seen By    ${student}    search=Feed New
    Lists Should Be Equal    ${found}    ${{ ['E2E Feed New Show'] }}

mine=true gives a Music Club member Music Club events only
    ${r}=    GET As    ${member}    /events    200    page_size=200    mine=true
    Should Not Be Empty    ${r.json()}[results]
    ${clubs}=    Evaluate    sorted({e['club_name'] for e in $r.json()['results']})
    Lists Should Be Equal    ${clubs}    ${{ ['Music Club'] }}

The feed ordering puts a member's own clubs first, each block in date order
    ${r}=    GET As    ${member}    /events    200    page_size=200    ordering=feed    status=published,live
    ${results}=    Set Variable    ${r.json()}[results]
    Should Be True    len($results) >= 3
    ${flags}=    Evaluate    [e['club_name'] == 'Music Club' for e in $results]
    Should Be True    $flags == sorted($flags, reverse=True)    msg=another club's event sits above a Music Club one: ${flags}
    Should Be True    $flags[0] and not $flags[-1]    msg=the feed should hold both Music Club and other events: ${flags}
    ${mine}=    Evaluate    [e['starts_at'] for e in $results if e['club_name'] == 'Music Club']
    ${rest}=    Evaluate    [e['starts_at'] for e in $results if e['club_name'] != 'Music Club']
    Should Be True    $mine == sorted($mine) and $rest == sorted($rest)

A student in no club gets plain date order from the feed ordering
    ${feed}=    Events Seen By    ${student}    ordering=feed    status=published,live
    ${dated}=    Events Seen By    ${student}    ordering=starts_at    status=published,live
    Lists Should Be Equal    ${feed}    ${dated}
    ${r}=    GET As    ${student}    /events    200    page_size=200    ordering=feed    status=published,live
    ${starts}=    Evaluate    [e['starts_at'] for e in $r.json()['results']]
    Should Be True    $starts == sorted($starts)

Search matches the club's name as well as the title
    ${r}=    GET As    ${student}    /events    200    page_size=200    search=music club
    Should Not Be Empty    ${r.json()}[results]
    ${clubs}=    Evaluate    sorted({e['club_name'] for e in $r.json()['results']})
    Lists Should Be Equal    ${clubs}    ${{ ['Music Club'] }}
    ${by_title}=    Events Seen By    ${student}    search=FEED NEW SHOW
    Lists Should Be Equal    ${by_title}    ${{ ['E2E Feed New Show'] }}

A rejected proposal never reaches a student, and the club still sees it
    ${no}=    Propose    ${treasurer}    E2E Feed Rejected    Music Room    ${91}    Printing=400
    Decide    ${society}    ${no}[approval]    reject    comment=Not this term
    Event Status Should Be    ${no}[event]    rejected
    ${campus}=    Events Seen By    ${student}
    Should Not Contain    ${campus}    E2E Feed Rejected
    ${own}=    Events Seen By    ${member}    mine=true
    Should Contain    ${own}    E2E Feed Rejected

A returned proposal never reaches a student until it is sent again and approved
    ${back}=    Propose    ${treasurer}    E2E Feed Returned    Music Room    ${92}    Printing=400
    Decide    ${society}    ${back}[approval]    return    comment=Add the venue layout
    Event Status Should Be    ${back}[event]    returned
    ${campus}=    Events Seen By    ${student}
    Should Not Contain    ${campus}    E2E Feed Returned
    ${again}=    POST As    ${treasurer}    /events/${back}[event]/submit
    ${campus}=    Events Seen By    ${student}
    Should Not Contain    ${campus}    E2E Feed Returned
    Decide    ${society}    ${again.json()}[id]    approve
    Decide    ${dean}    ${again.json()}[id]    approve
    ${campus}=    Events Seen By    ${student}
    Should Contain    ${campus}    E2E Feed Returned


*** Keywords ***
Everyone Signs In And The Treasurer Proposes
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    Set Suite Variable    ${treasurer}
    Set Suite Variable    ${member}
    Set Suite Variable    ${student}
    Set Suite Variable    ${society}
    Set Suite Variable    ${dean}
    ${p}=    Propose    ${treasurer}    E2E Feed New Show    Music Room    ${90}    Sound=3000
    Set Suite Variable    ${p}
