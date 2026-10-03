*** Settings ***
Documentation       Smoke: hiding a page is not the permission. Opened directly by a role
...                 that may not use it, every page is refused by the rule — and says which.
Resource            resources/culturals.resource
Suite Setup         Run Keywords    Open Culturals    AND    Fresh Pilot
Test Template       Page Should Refuse
Test Tags           smoke


*** Test Cases ***                                  PERSONA       PAGE                      SAYS
A member cannot open the budget                     member        club-budget.html          BUDGET_NOT_VISIBLE
A student cannot open the venue calendar            student       dean-venues.html          EVENTS_CALENDAR_DENIED
The Treasurer has no door to work                   treasurer     organiser-scan.html       No door to work
The Dean does not work a door                       dean          organiser-scan.html       No door to work
The VC cannot decide at the Dean's gate             vc            dean-approvals.html       GOVERNANCE_NOT_APPROVER
The Dean cannot decide at Management's gate         dean          management-queue.html     GOVERNANCE_NOT_APPROVER
Management has no club roster                       management    club-roster.html          No club
A student cannot read the semester report           student       vc-report.html            REPORTING_DENIED


*** Keywords ***
Page Should Refuse
    [Arguments]    ${persona}    ${file}    ${says}
    Sign In As    ${persona}
    Open Refused Page    ${file}
    Refusal Should Say    ${says}
