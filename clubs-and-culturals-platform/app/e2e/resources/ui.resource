*** Settings ***
Documentation     Drive the React app the way a person does: by label, role and visible text, never by class.
Library           Browser    timeout=20s    run_on_failure=Take Screenshot \ fullPage=True
Library           Collections


*** Keywords ***
Open App
    [Arguments]    ${width}=${1280}    ${height}=${800}
    New Browser    chromium    headless=${True}
    ${viewport}=    Create Dictionary    width=${width}    height=${height}
    New Context    viewport=${viewport}
    New Page    ${WEB_BASE}/signin
    Wait For Heading    Sign in

Sign In As
    [Documentation]    Fills the form; staff pass a code and the Authenticator field is opened first.
    [Arguments]    ${email}    ${mfa_code}=${EMPTY}
    Fill Field    Institutional email    ${email}
    Fill Field    Password    ${SEED_PASSWORD}
    IF    $mfa_code
        Click Button    I have an authenticator code
        Fill Field    Authenticator code    ${mfa_code}
    END
    Click Button    Sign in

Sign Out
    Click Button    Sign out
    Wait For Heading    Sign in

Fill Field
    [Arguments]    ${label}    ${value}
    ${field}=    Get Element By    Label    ${label}
    Fill Text    ${field}    ${value}

Select Option
    [Documentation]    By visible option label.
    [Arguments]    ${field_label}    ${option_label}
    ${field}=    Get Element By    Label    ${field_label}
    Select Options By    ${field}    label    ${option_label}

Click Button
    [Arguments]    ${name}
    ${button}=    Get Element By Role    button    name=${name}    exact=${True}
    Click    ${button}

Click Link
    [Arguments]    ${name}
    ${link}=    Get Element By Role    link    name=${name}    exact=${True}
    Click    ${link}

Wait For Heading
    [Arguments]    ${name}
    ${heading}=    Get Element By Role    heading    name=${name}    exact=${True}
    Wait For Elements State    ${heading}    visible

Wait For Text
    [Arguments]    ${text}
    ${el}=    Get Element By    Text    ${text}
    Wait For Elements State    ${el}    visible

Expect Problem Banner
    [Documentation]    The app renders a refusal as itself, with the API's code on it.
    [Arguments]    ${code}
    Wait For Elements State    [data-testid="problem"][data-code="${code}"]    visible

Offered Pages
    [Documentation]    Link titles in the navigation (sidebar on desktop, bottom bar on phones).
    [Arguments]    ${nav}=nav-sidebar
    Wait For Elements State    [data-testid="${nav}"]    visible
    ${links}=    Get Elements    [data-testid="${nav}"] a
    ${titles}=    Create List
    FOR    ${link}    IN    @{links}
        ${t}=    Get Text    ${link}
        Append To List    ${titles}    ${t}
    END
    RETURN    ${titles}

Pages Should Be
    [Arguments]    @{expected}
    ${titles}=    Offered Pages
    Lists Should Be Equal    ${titles}    ${expected}

Snapshot
    [Documentation]    One deliberate screenshot per suite, into results/.
    [Arguments]    ${name}
    Take Screenshot    ${OUTPUT DIR}/${name}    fullPage=${True}
