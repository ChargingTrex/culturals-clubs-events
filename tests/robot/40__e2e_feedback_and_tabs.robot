*** Settings ***
Documentation       The pilot's feedback loop, and the browser behaviour testers lean on:
...                 feedback arrives with its role, page and build attached, and two tabs
...                 can hold two roles without overwriting each other's work.
Resource            resources/culturals.resource
Suite Setup         Open Culturals
Test Setup          Fresh Pilot
Test Tags           e2e    feedback


*** Test Cases ***
Feedback Opens A Prefilled GitHub Issue With Role And Page Attached
    Sign In As    management
    Capture Opened Windows
    Click    css=header.top button.feedback-btn
    Wait For Elements State    id=fbForm    visible
    Click    css=#fbForm label.chip >> text=Confusing
    Fill Text    id=fbTried    Approve the championship but cut the artist fee
    Fill Text    id=fbHappened    It was not clear the sanction column could be edited
    Click    css=#fbForm button[data-fb="github"]
    Toast Should Mention    Opened GitHub
    ${url}=    Evaluate JavaScript    ${None}    () => window.__opened[0]
    Should Start With    ${url}
    ...    https://github.com/ChargingTrex/culturals-clubs-events/issues/new?
    Should Contain    ${url}    template=pilot-feedback.yml
    Should Contain    ${url}    role=Management
    Should Contain    ${url}    page=Management+approvals
    Should Contain    ${url}    kind=Confusing
    Should Contain    ${url}    tried=Approve+the+championship
    # A copy stays in the browser in case the tester closes GitHub without sending.
    ${kept}=    Evaluate JavaScript    ${None}
    ...    () => JSON.parse(localStorage.getItem("culturals.feedback")).length
    Should Be Equal As Integers    ${kept}    1

Feedback Asks For The Two Things Only A Person Can Say
    Sign In As    dean
    Capture Opened Windows
    Click    css=header.top button.feedback-btn
    Wait For Elements State    id=fbForm    visible
    Click    css=#fbForm button[data-fb="github"]
    Get Text    id=fbMsg    *=    Say what you were trying to do
    ${opened}=    Evaluate JavaScript    ${None}    () => window.__opened.length
    Should Be Equal As Integers    ${opened}    0

Feedback Works Before Signing In
    Click    css=.login-foot button[data-feedback]
    Wait For Elements State    id=fbForm    visible
    Click    css=#fbForm details summary
    Get Text    id=fbContext    *=    Role: not signed in
    Get Text    id=fbContext    *=    Page: sign-in

Two Tabs Hold Two Roles And Stay In Step
    Sign In As    treasurer
    Open Page    club-events.html
    ${treasurer_tab}=    Get Page Ids    ACTIVE    ACTIVE    ACTIVE
    New Page    ${BASE_URL}/index.html
    Sign In As    society
    Open Page    society-approvals.html
    Decide At Gate    Culturals Night 2026    approve
    Toast Should Mention    Approved
    Switch Page    ${treasurer_tab}[0]
    Catch Up With The Other Tab
    ${row}=    Club Event Row    Culturals Night 2026
    Get Text    ${row}    *=    With the Dean now
    # Each tab keeps its own role.
    Get Text    css=.whoami    *=    Treasurer


*** Keywords ***
Capture Opened Windows
    [Documentation]    Record what the page would open in a new tab instead of opening
    ...    it: the test checks the GitHub link without needing GitHub.
    Evaluate JavaScript    ${None}
    ...    () => { window.__opened = []; window.open = url => { window.__opened.push(url); return null; }; }

Catch Up With The Other Tab
    [Documentation]    A visible tab offers a Refresh; a tab coming back into view
    ...    refreshes itself. Either way it ends up showing the other tab's change.
    ${offered}=    Run Keyword And Return Status
    ...    Wait For Elements State    id=stale    visible    timeout=5s
    IF    ${offered}    Click    id=staleRefresh
    Wait For Elements State    css=header.top .whoami    visible
