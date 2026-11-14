*** Settings ***
Documentation     The proposal document and its preview (AR-10, AR-11), one rule per test: an office bearer attaches a
...               PDF or Word proposal to a draft, with the stored row, the audit entry and the bytes that come back
...               checked; who may read it (the club's office bearers and the reviewing staff, never a plain member or
...               the student body); a replacement keeps the earlier version on record; the document locks when the
...               proposal is submitted and opens again when it is returned; a Word proposal is previewed as text, a
...               PDF as the file itself and a legacy .doc not at all; and the two ways to price the budget alongside it —
...               the uploaded sheet, or the Treasurer's own entries.
Resource          ../resources/api.resource
Resource          ../resources/db.resource
Suite Setup       The Club Drafts Its Events
Test Tags         api    proposal    unit


*** Test Cases ***
The Treasurer attaches a PDF proposal to a draft: the row, the audit entry and the event all show it
    [Tags]    smoke
    ${r}=    Upload Proposal    ${treasurer}    ${draft}[id]    ${PROPOSAL_PDF_FIXTURE}
    Should Be Equal    ${r.json()}[file_name]    proposal.pdf
    Should Be Equal    ${r.json()}[preview]    pdf
    Should Be Equal    ${r.json()}[file_url]    /api/v1/events/${draft}[id]/proposal-document/file
    ${size}=    Get File Size    ${PROPOSAL_PDF_FIXTURE}
    ${rows}=    Stored Proposal Documents    ${draft}[id]
    Length Should Be    ${rows}    1
    Should Be Equal    ${rows}[0][file_name]    proposal.pdf
    Should Be Equal    ${rows}[0][content_type]    application/pdf
    Should Be Equal As Integers    ${rows}[0][byte_size]    ${size}
    Length Should Be    ${rows}[0][sha256]    64
    Should Not Be Empty    ${rows}[0][uploaded_by_label]
    Audit Should Contain    ${draft}[id]    event.proposal_document_set
    ${doc}=    Proposal On Event    ${president}    ${draft}[id]
    Should Be Equal    ${doc}[file_name]    proposal.pdf
    Should Be Equal As Integers    ${doc}[byte_size]    ${size}
    # Attaching a document does not send the proposal anywhere.
    Event Status Should Be    ${draft}[id]    draft

The file comes back byte for byte to the club's office bearers
    ${bytes}=    Get Binary File    ${PROPOSAL_PDF_FIXTURE}
    FOR    ${token}    IN    ${treasurer}    ${president}    ${secretary}
        ${r}=    Proposal File    ${token}    ${draft}[id]
        Should Be Equal    ${r.content}    ${bytes}
        Should Be Equal    ${r.headers}[Cache-Control]    private, no-store
        Should Be Equal    ${r.headers}[X-Content-Type-Options]    nosniff
    END

A PDF is previewed as the file itself, so it has no text preview
    ${r}=    Proposal Preview    ${treasurer}    ${draft}[id]    expected=422
    Problem Code Should Be    ${r}    EVENTS_PREVIEW_UNAVAILABLE

A plain club member can neither attach the proposal nor read it
    ${r}=    Upload Proposal    ${member}    ${draft}[id]    ${PROPOSAL_PDF_V2_FIXTURE}    expected=403
    Problem Code Should Be    ${r}    EVENTS_EDIT_DENIED
    ${doc}=    Proposal On Event    ${member}    ${draft}[id]
    Should Be Equal    ${doc}    ${None}
    Proposal File    ${member}    ${draft}[id]    expected=404
    Proposal Preview    ${member}    ${draft}[id]    expected=404
    ${rows}=    Stored Proposal Documents    ${draft}[id]
    Length Should Be    ${rows}    1

A student outside the club and another club's president cannot reach a draft's proposal at all
    FOR    ${token}    IN    ${student}    ${lens}
        Upload Proposal    ${token}    ${draft}[id]    ${PROPOSAL_PDF_V2_FIXTURE}    expected=404
        Proposal File    ${token}    ${draft}[id]    expected=404
    END
    ${rows}=    Stored Proposal Documents    ${draft}[id]
    Length Should Be    ${rows}    1

A text file, a spreadsheet, a photo renamed .pdf, an empty file and no file are all refused
    ${r}=    Upload Proposal    ${treasurer}    ${draft}[id]    ${NOT_A_PHOTO_FIXTURE}    expected=422
    Problem Code Should Be    ${r}    EVENTS_FILE_TYPE
    ${r}=    Upload Proposal    ${treasurer}    ${draft}[id]    ${BUDGET_CSV_FIXTURE}    expected=422
    Problem Code Should Be    ${r}    EVENTS_FILE_TYPE
    # The extension says PDF, the browser says image: the two must agree.
    ${r}=    Upload Proposal    ${treasurer}    ${draft}[id]    ${PROPOSAL_PDF_FIXTURE}    content_type=image/png    expected=422
    Problem Code Should Be    ${r}    EVENTS_FILE_TYPE
    ${r}=    Upload Proposal    ${treasurer}    ${draft}[id]    ${EMPTY_PDF_FIXTURE}    expected=422
    Problem Code Should Be    ${r}    EVENTS_FILE_EMPTY
    ${r}=    POST As    ${treasurer}    /events/${draft}[id]/proposal-document    expected=422
    Problem Code Should Be    ${r}    EVENTS_FILE_MISSING
    ${rows}=    Stored Proposal Documents    ${draft}[id]
    Length Should Be    ${rows}    1

A Word proposal replaces the PDF: it becomes the current one and the first stays on record
    [Tags]    smoke
    ${r}=    Upload Proposal    ${president}    ${draft}[id]    ${PROPOSAL_DOCX_FIXTURE}
    Should Be Equal    ${r.json()}[preview]    text
    ${rows}=    Stored Proposal Documents    ${draft}[id]
    Length Should Be    ${rows}    2
    Should Be Equal    ${rows}[0][file_name]    proposal.pdf
    Should Be Equal    ${rows}[1][file_name]    proposal.docx
    ${doc}=    Proposal On Event    ${treasurer}    ${draft}[id]
    Should Be Equal    ${doc}[file_name]    proposal.docx
    ${bytes}=    Get Binary File    ${PROPOSAL_DOCX_FIXTURE}
    ${r}=    Proposal File    ${treasurer}    ${draft}[id]
    Should Be Equal    ${r.content}    ${bytes}

A Word proposal is previewed as its text: heading, paragraph and table row
    [Tags]    smoke
    ${r}=    Proposal Preview    ${treasurer}    ${draft}[id]
    Should Be Equal    ${r.json()}[file_name]    proposal.docx
    Should Not Be True    ${r.json()}[truncated]
    ${want}=    Evaluate    [{'kind': 'heading', 'text': 'E2E Proposal Heading'}, {'kind': 'paragraph', 'text': 'An acoustic evening for eighty students.'}, {'kind': 'row', 'text': 'Sound | 12000'}]
    Lists Should Be Equal    ${r.json()}[blocks]    ${want}

A browser that does not name the type is trusted on the extension
    ${r}=    Upload Proposal    ${treasurer}    ${scratch}[id]    ${PROPOSAL_DOCX_FIXTURE}    content_type=application/octet-stream
    Should Be Equal    ${r.json()}[preview]    text
    ${rows}=    Stored Proposal Documents    ${scratch}[id]
    Should Be Equal    ${rows}[0][content_type]    application/vnd.openxmlformats-officedocument.wordprocessingml.document

A legacy .doc is accepted and downloads, and is not previewed
    ${r}=    Upload Proposal    ${treasurer}    ${scratch}[id]    ${PROPOSAL_DOC_FIXTURE}
    Should Be Equal    ${r.json()}[preview]    none
    ${r}=    Proposal Preview    ${treasurer}    ${scratch}[id]    expected=422
    Problem Code Should Be    ${r}    EVENTS_PREVIEW_UNAVAILABLE
    ${bytes}=    Get Binary File    ${PROPOSAL_DOC_FIXTURE}
    ${r}=    Proposal File    ${treasurer}    ${scratch}[id]
    Should Be Equal    ${r.content}    ${bytes}

A file named .docx that is not a Word document is refused a preview, not crashed on
    Upload Proposal    ${treasurer}    ${scratch}[id]    ${NOT_A_DOCX}
    ${r}=    Proposal Preview    ${treasurer}    ${scratch}[id]    expected=422
    Problem Code Should Be    ${r}    EVENTS_PREVIEW_UNREADABLE

The budget sheet is uploaded with the proposal and the event is sent for approval
    [Tags]    smoke    budget
    # The upload route of New event: draft, proposal, sheet, send.
    Upload Proposal    ${treasurer}    ${sheet}[id]    ${PROPOSAL_PDF_FIXTURE}
    ${r}=    Import Lines    ${treasurer}    ${sheet}[budget][id]    ${BUDGET_CSV_FIXTURE}
    Should Be Equal As Numbers    ${r.json()}[total_requested]    15000
    ${lines}=    Stored Lines    ${sheet}[budget][id]
    Length Should Be    ${lines}    2
    Should Be Equal    ${lines}[0][head]    Sound & lighting
    ${sent}=    POST As    ${treasurer}    /events/${sheet}[id]/submit
    Set Suite Variable    ${sheet_approval}    ${sent.json()}[id]
    Event Status Should Be    ${sheet}[id]    submitted
    ${requests}=    Stored Requests    ${sheet}[id]
    Should Be Equal As Numbers    ${requests}[0][amount_requested]    15000
    # The sheet itself is not kept: only the proposal is a stored document.
    ${rows}=    Stored Proposal Documents    ${sheet}[id]
    Length Should Be    ${rows}    1

The Society, the Dean and the Vice-Chancellor read the proposal on the approval and download it
    [Tags]    smoke    approvals
    ${bytes}=    Get Binary File    ${PROPOSAL_PDF_FIXTURE}
    FOR    ${token}    IN    ${society}    ${vice}    ${dean}    ${vc}
        ${a}=    GET As    ${token}    /governance/approvals/${sheet_approval}
        Should Be Equal    ${a.json()}[proposal_document][file_name]    proposal.pdf
        Should Be Equal    ${a.json()}[proposal_document][preview]    pdf
        ${r}=    Proposal File    ${token}    ${sheet}[id]
        Should Be Equal    ${r.content}    ${bytes}
    END
    # In the queue as well, so the card can link to it.
    ${q}=    Approval Queue    ${society}
    ${row}=    Evaluate    [r for r in $q.json()['results'] if r['id'] == $sheet_approval][0]
    Should Be Equal    ${row}[proposal_document][file_name]    proposal.pdf

Once submitted the document is locked: approvers read what was sent
    [Tags]    smoke
    ${r}=    Upload Proposal    ${treasurer}    ${sheet}[id]    ${PROPOSAL_PDF_V2_FIXTURE}    expected=409
    Problem Code Should Be    ${r}    EVENTS_LOCKED
    ${rows}=    Stored Proposal Documents    ${sheet}[id]
    Length Should Be    ${rows}    1
    Should Be Equal    ${rows}[0][file_name]    proposal.pdf

A returned proposal can have its document replaced, and locks again when resubmitted
    Decide    ${society}    ${sheet_approval}    return    comment=Please add the sound vendor's quote to the proposal
    Event Status Should Be    ${sheet}[id]    returned
    Upload Proposal    ${treasurer}    ${sheet}[id]    ${PROPOSAL_PDF_V2_FIXTURE}
    ${rows}=    Stored Proposal Documents    ${sheet}[id]
    Length Should Be    ${rows}    2
    ${sent}=    POST As    ${treasurer}    /events/${sheet}[id]/submit
    Set Suite Variable    ${sheet_approval}    ${sent.json()}[id]
    ${a}=    GET As    ${society}    /governance/approvals/${sheet_approval}
    Should Be Equal    ${a.json()}[proposal_document][file_name]    proposal_v2.pdf
    Upload Proposal    ${treasurer}    ${sheet}[id]    ${PROPOSAL_PDF_FIXTURE}    expected=409

A published event is open to every student, and its proposal is not
    [Tags]    smoke    feed
    Approve Through Every Gate    ${sheet}[id]
    Event Status Should Be    ${sheet}[id]    published
    ${e}=    GET As    ${student}    /events/${sheet}[id]
    Should Be Equal    ${e.json()}[title]    E2E Doc With Sheet
    Should Be Equal    ${e.json()}[proposal_document]    ${None}
    Proposal File    ${student}    ${sheet}[id]    expected=404
    Proposal Preview    ${student}    ${sheet}[id]    expected=404
    ${doc}=    Proposal On Event    ${member}    ${sheet}[id]
    Should Be Equal    ${doc}    ${None}
    # The club's office bearers and the staff still read it after publication.
    ${doc}=    Proposal On Event    ${president}    ${sheet}[id]
    Should Be Equal    ${doc}[file_name]    proposal_v2.pdf
    Proposal File    ${dean}    ${sheet}[id]

The other route: the Treasurer enters the budget by hand and sends it with the document attached
    [Tags]    budget
    Upload Proposal    ${secretary}    ${typed}[id]    ${PROPOSAL_DOCX_FIXTURE}
    # A club Secretary may attach the proposal but may not write budget lines, by sheet or by hand.
    # (The budget is hidden from them altogether, so the refusal is "not found".)
    ${doc}=    Proposal On Event    ${secretary}    ${typed}[id]
    Should Be Equal    ${doc}[file_name]    proposal.docx
    ${r}=    Import Lines    ${secretary}    ${typed}[budget][id]    ${BUDGET_CSV_FIXTURE}    expected=any
    Should Be True    ${r.status_code} in (403, 404)    msg=a club Secretary imported a budget sheet: ${r.status_code}
    ${r}=    Add Budget Line    ${secretary}    ${typed}[budget][id]    Sound    4000    expected=any
    Should Be True    ${r.status_code} in (403, 404)    msg=a club Secretary added a budget line: ${r.status_code}
    ${lines}=    Stored Lines    ${typed}[budget][id]
    Should Be Empty    ${lines}
    Add Budget Line    ${treasurer}    ${typed}[budget][id]    Sound    4000
    Add Budget Line    ${treasurer}    ${typed}[budget][id]    Printing    500
    ${sent}=    POST As    ${treasurer}    /events/${typed}[id]/submit
    ${a}=    GET As    ${society}    /governance/approvals/${sent.json()}[id]
    Should Be Equal As Numbers    ${a.json()}[amount_requested]    4500
    Should Be Equal    ${a.json()}[proposal_document][file_name]    proposal.docx
    ${r}=    Proposal Preview    ${society}    ${typed}[id]
    Should Be Equal    ${r.json()}[blocks][0][text]    E2E Proposal Heading

A proposal can be sent with no document at all: it is optional
    ${p}=    Propose    ${treasurer}    E2E Doc None Attached    Seminar Hall A    ${133}    Sound=1000
    ${a}=    GET As    ${society}    /governance/approvals/${p}[approval]
    Should Be Equal    ${a.json()}[proposal_document]    ${None}
    Proposal File    ${society}    ${p}[event]    expected=404


*** Keywords ***
The Club Drafts Its Events
    Open API
    ${treasurer}=    Login As    ${TREASURER_EMAIL}
    ${president}=    Login As    ${PRESIDENT_EMAIL}
    ${secretary}=    Login As    ${SECRETARY_EMAIL}
    ${member}=    Login As    ${MEMBER_EMAIL}
    ${student}=    Login As    ${STUDENT_EMAIL}
    ${lens}=    Login As    ${LENS_PRESIDENT_EMAIL}
    ${society}=    Staff Login As    ${SOCIETY_EMAIL}
    ${vice}=    Staff Login As    ${SOCIETY_VICE_EMAIL}
    ${dean}=    Staff Login As    ${DEAN_EMAIL}
    ${vc}=    Staff Login As    ${VC_EMAIL}
    FOR    ${name}    IN    treasurer    president    secretary    member    student    lens    society    vice    dean    vc
        Set Suite Variable    ${${name}}
    END
    ${draft}=    Create Draft Event    ${treasurer}    E2E Doc Draft    Seminar Hall A    ${130}
    ${scratch}=    Create Draft Event    ${treasurer}    E2E Doc Scratch    Seminar Hall B    ${130}
    ${sheet}=    Create Draft Event    ${treasurer}    E2E Doc With Sheet    Seminar Hall A    ${131}
    ${typed}=    Create Draft Event    ${treasurer}    E2E Doc Typed Budget    Seminar Hall A    ${132}
    FOR    ${name}    IN    draft    scratch    sheet    typed
        Set Suite Variable    ${${name}}
    END
    # A text file carrying a .docx name: accepted on upload by its type, unreadable as a Word document.
    ${fake}=    Set Variable    ${OUTPUT DIR}${/}not_really.docx
    Create File    ${fake}    This is plain text, not a zip.
    Set Suite Variable    ${NOT_A_DOCX}    ${fake}
