*** Settings ***
Documentation       End to end: QR attendance. A student registers and holds a one-time
...                 pass; the organiser scans the student — never the reverse — and every
...                 outcome at the door is recorded, including every failure.
...
...                 The door used here is the Lens Heritage Photowalk, which is live, and the
...                 organiser is the Lens president, who staffs it.
Resource            resources/culturals.resource
Suite Setup         Open Culturals
Test Setup          Fresh Pilot
Test Tags           e2e    attendance    qr


*** Variables ***
${DOOR}             Lens Heritage Photowalk


*** Test Cases ***
A Student Registers And Holds A One-Time Pass
    Sign In As    student
    Register For    Kalam Lit Quiz
    Open Page    student-passes.html
    ${ticket}=    Set Variable    css=.ticket[data-pass-title="Kalam Lit Quiz"]
    # Drawn by the vendored QR library, not a CDN.
    Wait For Elements State    ${ticket} >> css=img[alt="Pass QR"]    visible
    Get Text    ${ticket}    *=    Valid — not yet used
    Open Page    student-events.html
    Get Text    css=li[data-event-title="Kalam Lit Quiz"]    *=    View pass

The Door Admits A Pass Once, Then Calls It A Duplicate
    Sign In As    student
    ${student}=    Get Text    css=.whoami strong
    Register For    ${DOOR}
    ${token}=    Pass Token For    ${DOOR}
    Sign In As    organiser
    Open Page    organiser-scan.html
    ${before}=    Checked In Count
    Scan At Door    ${token}    accepted
    Verdict Should Be    Checked in
    Get Text    id=gate    *=    ${student}
    ${after}=    Checked In Count
    Should Be Equal As Integers    ${after}    ${{ int($before) + 1 }}
    # The same pass again is a fact about the door, not an error.
    Scan At Door    ${token}    duplicate
    Verdict Should Be    Already checked in
    Get Text    id=gate    *=    First scanned at
    # And the student's wallet shows the pass as used.
    Sign In As    student
    Open Page    student-passes.html
    Get Text    css=.ticket[data-pass-title="${DOOR}"]    *=    Checked in

A Forged Code Is Refused And Still Counted
    Sign In As    organiser
    Open Page    organiser-scan.html
    ${before}=    Scan Attempts
    Clear The Gate
    Click    id=forge
    Wait For Elements State    css=#gate[data-result="unknown_code"]    visible
    Verdict Should Be    Code not recognised
    # The failure is recorded: it is what makes the capture rate mean anything.
    ${after}=    Scan Attempts
    Should Be Equal As Integers    ${after}    ${{ int($before) + 1 }}

A Walk-In Is Registered And Admitted With One Scan Of Their Profile QR
    Sign In As    organiser
    Open Page    organiser-scan.html
    Clear The Gate
    Click    css=#whoHere [data-walkin]
    Wait For Elements State    css=#gate[data-result="spot_registered"]    visible
    Verdict Should Be    Registered and checked in

A Pass For Another Event Sends Them To The Right Hall
    Sign In As    student
    Register For    Kalam Lit Quiz
    ${token}=    Pass Token For    Kalam Lit Quiz
    Sign In As    organiser
    Open Page    organiser-scan.html
    Scan At Door    ${token}    wrong_event
    Verdict Should Be    Wrong event
    Get Text    id=gate    *=    Kalam Lit Quiz

A Reissued Profile QR Stops The Old One Working
    Sign In As    student
    Open Page    student-profile.html
    ${old}=    Get Text    id=profileToken
    Click    id=reissue
    Toast Should Mention    Reissued
    Get Text    id=profileToken    !=    ${old}
    ${new}=    Get Text    id=profileToken
    Sign In As    organiser
    Open Page    organiser-scan.html
    Scan At Door    ${old}    unknown_code
    Get Text    id=gate    *=    Code was replaced
    # The new code works — and, unregistered, admits them as a walk-in.
    Scan At Door    ${new}    spot_registered

The Desk Checks Someone In By PRN When A Phone Is Flat
    Sign In As    student
    Open Page    student-profile.html
    ${line}=    Get Text    css=main .head p
    ${prn}=    Evaluate    $line.split("·")[0].strip()
    Sign In As    organiser
    Open Page    organiser-scan.html
    Fill Text    id=q    ${prn}
    Wait For Elements State    css=#hits button[data-manual]    visible
    Clear The Gate
    Click    css=#hits button[data-manual] >> nth=0
    Wait For Elements State    css=#gate[data-result="spot_registered"]    visible
    Get Text    id=gate    *=    Manual entry by PRN lookup

Simulated Passes From The Queue Panel Work Too
    Sign In As    organiser
    Open Page    organiser-scan.html
    # Clicking elsewhere first used to disarm these buttons until the next scan.
    Click    id=tok
    Clear The Gate
    Click    css=#whoHere [data-pass] >> nth=0
    Wait For Elements State    css=#gate[data-result="accepted"]    visible
    Clear The Gate
    Click    css=#whoHere [data-pass] >> nth=0
    Wait For Elements State    css=#gate[data-result="accepted"]    visible

Only The Club's Door Staff May Work A Door
    Sign In As    treasurer
    ${offered}=    Sidebar Pages
    List Should Not Contain Value    ${offered}    Scan station
    Open Refused Page    organiser-scan.html
    Refusal Should Say    No door to work
    Sign In As    student
    Open Refused Page    organiser-scan.html
    Refusal Should Say    No door to work
