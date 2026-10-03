*** Settings ***
Documentation       Smoke: the way in. Every role can sign in and lands on its own work,
...                 sign-out forgets the role, a deep link survives sign-in, and nothing
...                 on the way depends on anything outside the site.
Resource            resources/culturals.resource
Suite Setup         Open Culturals
Test Setup          Fresh Pilot
Test Tags           smoke


*** Test Cases ***
Sign-In Page Offers One Button Per Role In Two Groups
    Get Element Count    css=#roles button.role-btn    ==    10
    Get Element Count    css=.role-group[data-group="campus"] button.role-btn    ==    6
    Get Element Count    css=.role-group[data-group="approver"] button.role-btn    ==    4
    # Every approver has something waiting, so nobody signs in to an empty queue.
    FOR    ${persona}    IN    society    dean    vc    management
        Get Text    css=button[data-persona="${persona}"] [data-waiting]    *=    waiting
    END
    Get Text    css=[data-journey-progress]    *=    0 of 8

Every Role Signs In And Lands On Its Own Work
    [Template]    Role Should Land On
    student       What's on
    member        Club events
    secretary     Club events
    treasurer     Budget
    president     Club events
    organiser     Scan station
    society       Cultural Society approvals
    dean          Dean approvals
    vc            Vice-Chancellor approvals
    management    Management approvals

A Signed-Out Deep Link Comes Back After Sign-In
    Go To    ${BASE_URL}/dean-venues.html
    Wait For Elements State    css=#roles button.role-btn >> nth=0    visible
    Get Url    *=    index.html?next=dean-venues.html
    Get Text    css=#roles .note    *=    dean-venues.html
    Click    css=#roles button[data-persona="dean"]
    Wait For Elements State    css=header.top .whoami    visible
    Heading Should Be    Venues

Signing Out Forgets The Role
    Sign In As    treasurer
    Click    css=#nav a[data-signout]
    Wait For Elements State    css=#roles button.role-btn >> nth=0    visible
    Go To    ${BASE_URL}/club-budget.html
    Wait For Elements State    css=#roles button.role-btn >> nth=0    visible
    Get Url    *=    next=club-budget.html

The Brand Takes Each Role Home
    Sign In As    treasurer
    Open Page    club-roster.html
    Click    css=header.top a.brand
    Wait For Elements State    css=header.top .whoami    visible
    Heading Should Be    Budget

QR Codes Are Drawn By The Site Itself
    [Documentation]    The QR library is vendored. It used to load from a CDN path that
    ...    did not exist, so every pass silently fell back to raw text.
    Sign In As    student
    Open Page    student-profile.html
    Wait For Elements State    css=img[alt="Profile QR"]    visible
    ${src}=    Get Attribute    css=img[alt="Profile QR"]    src
    Should Start With    ${src}    data:image/png;base64,

Reset Data Puts Everything Back
    Sign In As    treasurer
    Create Event    Throwaway Draft    days_ahead=50    venue=Music Room    expected=20
    Click    id=reseed
    Wait For Elements State    css=form[data-dialog="confirm"]    visible
    Click    css=form[data-dialog="confirm"] button[data-dlg-ok]
    Wait For Elements State    css=header.top .whoami    visible
    Open Page    club-budget.html
    Get Element Count    css=.budget-card[data-budget-title="Throwaway Draft"]    ==    0

The Not-Found Page Leads Back To Sign-In
    Go To    ${BASE_URL}/404.html
    Get Text    css=main h1    ==    That page does not exist
    Click    css=main a[href="index.html"]
    Wait For Elements State    css=#roles button.role-btn >> nth=0    visible


*** Keywords ***
Role Should Land On
    [Arguments]    ${persona}    ${heading}
    Sign In As    ${persona}
    Heading Should Be    ${heading}
    Page Should Show No Error
