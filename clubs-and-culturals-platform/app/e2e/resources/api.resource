*** Settings ***
Documentation     Talk to the module API as a person would: sign in, then act with that bearer.
Library           RequestsLibrary
Library           Collections


*** Keywords ***
Open API
    Create Session    api    ${API_BASE}

Login As
    [Documentation]    Password sign-in. Pass the MFA code for staff. Returns the access token.
    [Arguments]    ${email}    ${mfa_code}=${EMPTY}
    ${body}=    Create Dictionary    email=${email}    password=${SEED_PASSWORD}
    IF    $mfa_code    Set To Dictionary    ${body}    mfa_code=${mfa_code}
    ${r}=    POST On Session    api    /module/auth/login    json=${body}
    RETURN    ${r.json()}[access_token]

Staff Login As
    [Arguments]    ${email}
    ${token}=    Login As    ${email}    ${MFA_CODE}
    RETURN    ${token}

Bearer
    [Arguments]    ${token}
    ${headers}=    Create Dictionary    Authorization=Bearer ${token}
    RETURN    ${headers}

GET As
    [Arguments]    ${token}    ${path}    ${expected}=200    &{params}
    ${headers}=    Bearer    ${token}
    ${r}=    GET On Session    api    ${path}    headers=${headers}    params=${params}    expected_status=${expected}
    RETURN    ${r}

POST As
    [Arguments]    ${token}    ${path}    ${json}=${None}    ${expected}=200
    ${headers}=    Bearer    ${token}
    ${r}=    POST On Session    api    ${path}    json=${json}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

PATCH As
    [Arguments]    ${token}    ${path}    ${json}    ${expected}=200
    ${headers}=    Bearer    ${token}
    ${r}=    PATCH On Session    api    ${path}    json=${json}    headers=${headers}    expected_status=${expected}
    RETURN    ${r}

Problem Code Should Be
    [Documentation]    RFC 9457 body: the `code` names the rule that refused.
    [Arguments]    ${response}    ${code}
    Should Be Equal    ${response.json()}[code]    ${code}    msg=${response.text}

Me
    [Arguments]    ${token}
    ${r}=    GET As    ${token}    /module/auth/me
    RETURN    ${r.json()}

My First Club
    [Arguments]    ${token}
    ${me}=    Me    ${token}
    RETURN    ${me}[capabilities][clubs][0]

Find Event
    [Documentation]    By exact title, among what this caller can see.
    [Arguments]    ${token}    ${title}
    ${r}=    GET As    ${token}    /events    page_size=200
    ${event}=    Evaluate    [e for e in $r.json()['results'] if e['title'] == $title][0]
    RETURN    ${event}

Find Venue
    [Arguments]    ${token}    ${name}
    ${r}=    GET As    ${token}    /venues    page_size=200
    ${venue}=    Evaluate    [v for v in $r.json()['results'] if v['name'] == $name][0]
    RETURN    ${venue}

Find Approval For Event
    [Arguments]    ${token}    ${event_id}
    ${r}=    GET As    ${token}    /governance/approvals    page_size=200    state=pending
    ${approval}=    Evaluate    [a for a in $r.json()['results'] if a['event'] == $event_id][0]
    RETURN    ${approval}

Decide
    [Arguments]    ${token}    ${approval_id}    ${decision}    ${comment}=${EMPTY}    ${sanctioned}=${None}    ${expected}=200
    ${body}=    Create Dictionary    decision=${decision}    comment=${comment}
    IF    $sanctioned is not None    Set To Dictionary    ${body}    sanctioned=${sanctioned}
    ${r}=    POST As    ${token}    /governance/approvals/${approval_id}/decide    ${body}    ${expected}
    RETURN    ${r}

Approve Through Every Gate
    [Documentation]    Society then Dean, so a fresh proposal ends up published.
    [Arguments]    ${event_id}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${approval}=    Find Approval For Event    ${society}    ${event_id}
    Decide    ${society}    ${approval}[id]    approve
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    Decide    ${dean}    ${approval}[id]    approve

Create Draft Event
    [Documentation]    A priced-later draft: empty budget, not submitted. Starts `days_ahead` days out at 04:00 UTC.
    [Arguments]    ${token}    ${title}    ${venue_name}    ${days_ahead}    ${capacity}=50    ${expected}=40    ${club}=${None}
    IF    $club is None
        ${club}=    My First Club    ${token}
    END
    ${venue}=    Find Venue    ${token}    ${venue_name}
    ${starts}=    Evaluate    (datetime.datetime.now(datetime.timezone.utc) + datetime.timedelta(days=int($days_ahead))).replace(hour=4, minute=0, second=0, microsecond=0)    modules=datetime
    ${ends}=    Evaluate    $starts + datetime.timedelta(hours=2)    modules=datetime
    # Finding: the docs call `kind` optional, but omitting it is a 500 (events/views.py create: payload["kind"]).
    ${body}=    Create Dictionary    title=${title}    club=${club}    venue=${venue}[id]    kind=performance
    ...    starts_at=${starts.isoformat()}    ends_at=${ends.isoformat()}    capacity=${capacity}
    ...    expected_attendance=${expected}    submit=${False}
    ${r}=    POST As    ${token}    /events    ${body}    201
    RETURN    ${r.json()}

Add Budget Line
    [Arguments]    ${token}    ${budget_id}    ${head}    ${amount}    ${expected}=201
    ${body}=    Create Dictionary    head=${head}    amount_requested=${amount}
    ${r}=    POST As    ${token}    /budget/budgets/${budget_id}/lines    ${body}    ${expected}
    RETURN    ${r}

Register For
    [Arguments]    ${token}    ${event_id}    ${expected}=201
    ${body}=    Create Dictionary    event=${event_id}
    ${r}=    POST As    ${token}    /participation/registrations    ${body}    ${expected}
    RETURN    ${r}

Scan
    [Arguments]    ${token}    ${event_id}    ${code}    ${expected}=200
    ${body}=    Create Dictionary    token=${code}    station_id=E2E
    ${r}=    POST As    ${token}    /participation/events/${event_id}/scan    ${body}    ${expected}
    RETURN    ${r}
