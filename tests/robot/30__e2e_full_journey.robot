*** Settings ***
Documentation       The whole workflow in one run, the way the pilot asks testers to walk
...                 it: the Treasurer requests a budget; the Cultural Society, the Dean,
...                 the Vice-Chancellor and Management approve it in turn; a student
...                 registers; the President checks them in at the door, closes the event
...                 and settles the accounts; and the semester report counts it.
Resource            resources/culturals.resource
Suite Setup         Open Culturals
Test Setup          Fresh Pilot
Test Tags           e2e    journey


*** Variables ***
${EVENT}            Founders Day Concert


*** Test Cases ***
From Budget Request To Settled Accounts
    Request The Budget
    Take It Through All Four Gates
    A Student Registers And Is Checked In At The Door
    Close The Event With Evidence
    Settle The Budget With Receipts
    The Semester Report Counts It
    The Guided Journey Shows Every Step Done


*** Keywords ***
Request The Budget
    Sign In As    treasurer
    Create Event    ${EVENT}    template=Fest night    days_ahead=28
    ...    venue=Main Auditorium    expected=80
    Get Text    css=#msg    *=
    ...    Cultural Society → Dean of Student Affairs → Vice-Chancellor → Management

Take It Through All Four Gates
    Approve At Gate    society    ${EVENT}
    Approve At Gate    dean    ${EVENT}
    Approve At Gate    vc    ${EVENT}
    Approve At Gate    management    ${EVENT}
    Sign In As    treasurer
    Open Page    club-events.html
    ${row}=    Club Event Row    ${EVENT}
    Get Text    ${row}    *=    Published
    # Four gates and the publication itself, all done.
    Get Element Count    ${row} >> css=.route-step.done    ==    5

A Student Registers And Is Checked In At The Door
    Sign In As    student
    Register For    ${EVENT}
    ${token}=    Pass Token For    ${EVENT}
    Sign In As    president
    Open Page    organiser-scan.html
    Select Options By    id=ev    label    ${EVENT}
    Get Text    id=where    *=    ${EVENT}
    Scan At Door    ${token}    accepted
    Scan At Door    ${token}    duplicate

Close The Event With Evidence
    Open Page    club-events.html
    ${row}=    Club Event Row    ${EVENT}
    Click    ${row} >> css=button[data-close]
    ${form}=    Set Variable    css=form[data-dialog="close-event"]
    Wait For Elements State    ${form}    visible
    Fill Text    ${form} >> css=input[name="photos"]    0
    Click    ${form} >> css=button[data-dlg-ok]
    Get Text    id=dlgMsg    *=    at least one photo
    Fill Text    ${form} >> css=input[name="photos"]    12
    Fill Text    ${form} >> css=input[name="link"]    https://www.instagram.com/p/founders-day
    Click    ${form} >> css=button[data-dlg-ok]
    Toast Should Mention    Closed and reported
    Get Text    ${row}    *=    Reported

Settle The Budget With Receipts
    Open Page    club-budget.html
    Record Spend As Sanctioned    ${EVENT}
    Attach Receipts Where Needed    ${EVENT}
    ${card}=    Budget Card    ${EVENT}
    Click    ${card} >> css=button[data-settle]
    Toast Should Mention    Budget settled
    Get Attribute    ${card}    data-stage    ==    settled

The Semester Report Counts It
    Sign In As    dean
    Open Page    vc-report.html
    Get Text    css=main table    *=    ${EVENT}

The Guided Journey Shows Every Step Done
    Go To    ${BASE_URL}/index.html
    Get Attribute    css=[data-journey-progress]    data-journey-progress    ==    8
