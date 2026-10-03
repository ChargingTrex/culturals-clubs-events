*** Settings ***
Documentation       Smoke: every page renders for a role that may open it — its heading
...                 shows and no error box does.
Resource            resources/culturals.resource
Suite Setup         Run Keywords    Open Culturals    AND    Fresh Pilot
Test Template       Page Should Render For
Test Tags           smoke


*** Test Cases ***                              PERSONA       PAGE                      SHOWS
Student — What's on                             student       student-events.html       What's on
Student — My passes                             student       student-passes.html       My passes
Student — Profile QR                            student       student-profile.html      css=#profileToken
Treasurer — Club events                         treasurer     club-events.html          Club events
Treasurer — New event                           treasurer     club-new-event.html       New event
Treasurer — Budget                              treasurer     club-budget.html          Budget
President — Members and roles                   president     club-roster.html          Swara members
Organiser — Scan station                        organiser     organiser-scan.html       Scan station
Cultural Society — approvals                    society       society-approvals.html    Cultural Society approvals
Dean — approvals                                dean          dean-approvals.html       Dean approvals
Dean — venues                                   dean          dean-venues.html          Venues
Dean — this semester                            dean          dean-overview.html        This semester
Dean — semester report                          dean          vc-report.html            report
Vice-Chancellor — approvals                     vc            vc-queue.html             Vice-Chancellor approvals
Vice-Chancellor — semester report               vc            vc-report.html            report
Management — approvals                          management    management-queue.html     Management approvals
Management — semester report                    management    vc-report.html            report


*** Keywords ***
Page Should Render For
    [Arguments]    ${persona}    ${file}    ${shows}
    Sign In As    ${persona}
    Go To    ${BASE_URL}/${file}
    IF    $shows.startswith("css=")
        Wait For Elements State    ${shows}    visible
    ELSE
        Wait For Elements State    css=main h1    visible
        Get Text    css=main h1    *=    ${shows}
    END
    Page Should Show No Error
