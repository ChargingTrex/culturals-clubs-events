*** Settings ***
Documentation       Shared keywords for the Culturals browser suites.
...
...                 These suites drive the real pages in a real browser, the way a tester
...                 would: sign in from the role buttons, click what they would click, read
...                 what they would read. The Node suites (tests/*.mjs) already prove the
...                 rules without a DOM; these prove the screens let people follow them.
...
...                 Every test starts from a fresh browser context, so storage is empty and
...                 the app seeds the same starting world each time.
Library             Browser    timeout=15s
Library             Collections
Library             DateTime
Library             String


*** Variables ***
${BASE_URL}         http://127.0.0.1:4173
${HEADLESS}         ${True}
${BROWSER}          chromium
# A Chromium binary to use instead of the one `rfbrowser init` downloads.
# Empty means Playwright's own.
${CHROMIUM}         ${EMPTY}
${RECEIPT}          ${CURDIR}${/}..${/}fixtures${/}receipt.pdf
&{QUEUE}            society=society-approvals.html    dean=dean-approvals.html
...                 vc=vc-queue.html    management=management-queue.html


*** Keywords ***
Open Culturals
    [Documentation]    One browser for the whole suite.
    IF    $CHROMIUM
        New Browser    ${BROWSER}    headless=${HEADLESS}    executablePath=${CHROMIUM}
    ELSE
        New Browser    ${BROWSER}    headless=${HEADLESS}
    END

Fresh Pilot
    [Documentation]    A new context has empty storage, so the app seeds a fresh dataset
    ...    on first load: every test starts from the same world.
    New Context    viewport={'width': 1280, 'height': 900}    acceptDownloads=${True}
    New Page    ${BASE_URL}/index.html
    Wait For Elements State    css=#roles button.role-btn >> nth=0    visible    timeout=30s

Fresh Pilot On A Phone
    [Documentation]    As Fresh Pilot, at the size most pilot testers will use.
    New Context    viewport={'width': 390, 'height': 844}    isMobile=${True}
    ...    hasTouch=${True}
    New Page    ${BASE_URL}/index.html
    Wait For Elements State    css=#roles button.role-btn >> nth=0    visible    timeout=30s

Sign In As
    [Documentation]    Sign in from the role buttons and wait for the role's own page.
    [Arguments]    ${persona}
    Go To    ${BASE_URL}/index.html
    Click    css=#roles button[data-persona="${persona}"]
    Wait For Elements State    css=header.top .whoami    visible
    Wait For Elements State    css=main h1, main .err    visible

Open Page
    [Documentation]    Open a page by file name, as the signed-in role.
    [Arguments]    ${file}
    Go To    ${BASE_URL}/${file}
    Wait For Elements State    css=main h1    visible

Open Refused Page
    [Documentation]    Open a page the signed-in role may not use; the rule answers.
    [Arguments]    ${file}
    Go To    ${BASE_URL}/${file}
    Wait For Elements State    css=main .err    visible

Heading Should Be
    [Arguments]    ${text}
    Get Text    css=main h1    ==    ${text}

Page Should Show No Error
    Get Element Count    css=.err    ==    0

Refusal Should Say
    [Arguments]    ${text}
    Get Text    css=main .err    *=    ${text}

Toast Should Mention
    [Documentation]    Toasts fade after a few seconds, so wait for the one we expect —
    ...    the newest, since an earlier one with the same words may still be showing.
    [Arguments]    ${text}
    Wait For Elements State    css=.toasts .toast >> text=${text} >> nth=-1    visible

Sidebar Pages
    [Documentation]    The titles the sidebar offers the signed-in role, in order.
    ${titles}=    Evaluate JavaScript    css=#nav
    ...    (nav) => [...nav.querySelectorAll(".nav-group a")].map(a => a.textContent.trim())
    RETURN    ${titles}

Date In Days
    [Arguments]    ${days}
    ${date}=    Get Current Date    increment=${days} days    result_format=%Y-%m-%d
    RETURN    ${date}

# --- proposals and budgets ------------------------------------------------

Create Event
    [Documentation]    On the New event page, as the signed-in office bearer. With a
    ...    template the budget is filled in and sent; without, it is an unpriced draft.
    [Arguments]    ${title}    ${template}=${EMPTY}    ${days_ahead}=21
    ...    ${venue}=Main Auditorium    ${expected}=80
    Open Page    club-new-event.html
    Fill Text    id=t    ${title}
    IF    $template    Select Options By    id=k    value    ${template}
    ${date}=    Date In Days    ${days_ahead}
    Fill Text    id=d    ${date}
    ${venue_id}=    Get Attribute    css=#v option[data-name="${venue}"]    value
    Select Options By    id=v    value    ${venue_id}
    Fill Text    id=x    ${expected}
    Click    id=go
    Wait For Elements State    css=#msg [data-created="${title}"]    visible

Club Event Row
    [Arguments]    ${title}
    RETURN    css=li.club-event[data-event-title="${title}"]

Send For Approval
    [Arguments]    ${title}
    Open Page    club-events.html
    ${row}=    Club Event Row    ${title}
    Click    ${row} >> css=button[data-submit]
    Toast Should Mention    Sent

Budget Card
    [Arguments]    ${title}
    RETURN    css=.budget-card[data-budget-title="${title}"]

Add Budget Line
    [Arguments]    ${title}    ${head}    ${amount}
    ${card}=    Budget Card    ${title}
    Fill Text    ${card} >> css=input[id^="h-"]    ${head}
    Fill Text    ${card} >> css=input[id^="a-"]    ${amount}
    Click    ${card} >> css=button[data-add]
    Wait For Elements State    ${card} >> css=input[data-head][value="${head}"]    attached

Record Spend As Sanctioned
    [Documentation]    Enter what was spent on every line — exactly what was sanctioned —
    ...    one line at a time, because each entry redraws the page.
    [Arguments]    ${title}
    ${card}=    Budget Card    ${title}
    ${count}=    Get Element Count    ${card} >> css=input[data-spend]
    FOR    ${index}    IN RANGE    ${count}
        ${field}=    Set Variable    ${card} >> css=input[data-spend] >> nth=${index}
        ${sanctioned}=    Get Attribute    ${field}    data-sanctioned
        Fill Text    ${field}    ${sanctioned}
        Keyboard Key    press    Tab
        Wait For Elements State    ${card} >> css=input[data-spend][value="${sanctioned}"] >> nth=0
        ...    attached
    END

Attach Receipts Where Needed
    [Documentation]    Upload the receipt fixture to every line the settlement rules say
    ...    needs one, until none is left.
    [Arguments]    ${title}
    ${card}=    Budget Card    ${title}
    ${needed}=    Get Element Count    ${card} >> css=input[data-needs-receipt="true"]
    WHILE    ${needed} > 0    limit=12
        Upload File By Selector    ${card} >> css=input[data-needs-receipt="true"] >> nth=0
        ...    ${RECEIPT}
        Toast Should Mention    Attached
        ${after}=    Get Element Count    ${card} >> css=input[data-needs-receipt="true"]
        Should Be True    ${after} < ${needed}    The receipt did not register
        ${needed}=    Set Variable    ${after}
    END

# --- approvals ------------------------------------------------------------

Approval Card
    [Arguments]    ${title}
    RETURN    css=li.approval-card[data-event-title="${title}"]

Decide At Gate
    [Documentation]    Click a decision on one proposal in the open queue.
    [Arguments]    ${title}    ${decision}    ${comment}=${EMPTY}
    ${card}=    Approval Card    ${title}
    IF    $comment    Fill Text    ${card} >> css=textarea[data-comment]    ${comment}
    Click    ${card} >> css=button[data-go^="${decision}:"]

Approve At Gate
    [Documentation]    Sign in as an approver, open their queue and approve one proposal.
    [Arguments]    ${persona}    ${title}
    Sign In As    ${persona}
    Open Page    ${QUEUE}[${persona}]
    Decide At Gate    ${title}    approve
    Toast Should Mention    Approved
    ${card}=    Approval Card    ${title}
    Get Element Count    ${card}    ==    0

Queue Should Hold
    [Arguments]    ${persona}    ${title}
    Sign In As    ${persona}
    Open Page    ${QUEUE}[${persona}]
    ${card}=    Approval Card    ${title}
    Get Element Count    ${card}    ==    1

Queue Should Not Hold
    [Arguments]    ${persona}    ${title}
    Sign In As    ${persona}
    Open Page    ${QUEUE}[${persona}]
    ${card}=    Approval Card    ${title}
    Get Element Count    ${card}    ==    0

# --- the door -------------------------------------------------------------

Register For
    [Documentation]    As the signed-in student, register from What's on.
    [Arguments]    ${title}
    Open Page    student-events.html
    Click    css=li[data-event-title="${title}"] >> css=button[data-register]
    Toast Should Mention    Registered

Pass Token For
    [Documentation]    The code on the student's pass, read from My passes as their phone
    ...    would show it.
    [Arguments]    ${title}
    Open Page    student-passes.html
    ${token}=    Get Attribute    css=.ticket[data-pass-title="${title}"] .stub    data-qr
    Should Not Be Empty    ${token}
    RETURN    ${token}

Clear The Gate
    [Documentation]    Forget the previous verdict, so the next wait sees only the new one.
    Evaluate JavaScript    id=gate    (gate) => gate.removeAttribute("data-result")

Scan At Door
    [Documentation]    Present a code at the open scan station and wait for its verdict.
    [Arguments]    ${token}    ${expected_result}
    Clear The Gate
    Fill Text    id=tok    ${token}
    Click    id=scan
    Wait For Elements State    css=#gate[data-result="${expected_result}"]    visible

Scan Attempts
    ${attempts}=    Get Attribute    id=captureLine    data-attempts
    RETURN    ${attempts}

Checked In Count
    ${count}=    Get Text    css=[data-count="checked-in"]
    RETURN    ${count}

Verdict Should Be
    [Arguments]    ${text}
    Get Text    css=#gate .verdict    ==    ${text}
