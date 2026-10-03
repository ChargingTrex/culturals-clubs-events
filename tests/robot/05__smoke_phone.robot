*** Settings ***
Documentation       Smoke: on a phone, no page scrolls sideways. Most pilot testers will
...                 use a phone, and a page wider than the screen hides its own buttons.
Resource            resources/culturals.resource
Suite Setup         Run Keywords    Open Culturals    AND    Fresh Pilot On A Phone
Test Template       Page Should Fit A Phone
Test Tags           smoke    phone


*** Test Cases ***                              PERSONA       PAGE
Sign-in page                                    ${EMPTY}      index.html
What's on                                       student       student-events.html
My passes                                       student       student-passes.html
Profile QR                                      student       student-profile.html
Club events                                     treasurer     club-events.html
New event                                       treasurer     club-new-event.html
Budget                                          treasurer     club-budget.html
Members and roles                               president     club-roster.html
Scan station                                    organiser     organiser-scan.html
Cultural Society approvals                      society       society-approvals.html
Dean approvals                                  dean          dean-approvals.html
Venues                                          dean          dean-venues.html
This semester                                   dean          dean-overview.html
Semester report                                 dean          vc-report.html
Vice-Chancellor approvals                       vc            vc-queue.html
Management approvals                            management    management-queue.html


*** Keywords ***
Page Should Fit A Phone
    [Arguments]    ${persona}    ${file}
    IF    $persona    Sign In As    ${persona}
    Go To    ${BASE_URL}/${file}
    Wait For Elements State    css=main h1    visible
    ${page}=    Evaluate JavaScript    ${None}
    ...    () => document.documentElement.scrollWidth
    ${screen}=    Evaluate JavaScript    ${None}    () => window.innerWidth
    Should Be True    ${page} <= ${screen}
    ...    ${file} is ${page}px wide on a ${screen}px screen
