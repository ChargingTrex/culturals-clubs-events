*** Settings ***
Documentation       Smoke: each role's sidebar offers exactly its own pages, in order —
...                 the same expectation the Node smoke test holds, checked in the DOM.
Resource            resources/culturals.resource
Suite Setup         Run Keywords    Open Culturals    AND    Fresh Pilot
Test Template       Sidebar Should Offer Exactly
Test Tags           smoke


*** Test Cases ***       PERSONA       PAGES
Student                  student       What's on    My passes    Profile QR
Club member              member        What's on    My passes    Profile QR    Club events
...                                    Members & roles
Secretary                secretary     What's on    My passes    Profile QR    Club events
...                                    New event    Members & roles    Scan station
Treasurer                treasurer     What's on    My passes    Profile QR    Club events
...                                    New event    Budget    Members & roles
President                president     What's on    My passes    Profile QR    Club events
...                                    New event    Budget    Members & roles    Scan station
Organiser                organiser     What's on    My passes    Profile QR    Club events
...                                    New event    Budget    Members & roles    Scan station
Cultural Society         society       Society approvals    This semester    Semester report
Dean                     dean          Dean approvals    Venues    This semester    Semester report
Vice-Chancellor          vc            VC approvals    Semester report
Management               management    Management approvals    Semester report


*** Keywords ***
Sidebar Should Offer Exactly
    [Arguments]    ${persona}    @{expected}
    Sign In As    ${persona}
    ${offered}=    Sidebar Pages
    Lists Should Be Equal    ${offered}    ${expected}
