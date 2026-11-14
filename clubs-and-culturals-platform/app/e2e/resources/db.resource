*** Settings ***
Documentation     What the backend stored, read straight from its database (see db.py).
Library           db.py
Library           Collections


*** Keywords ***
Stored Event
    [Arguments]    ${event_id}
    ${e}=    Row    select e.status, e.description, e.expected_attendance, b.stage as budget_stage from events_event e join budget_budget b on b.event_id = e.id where e.id = replace(?, '-', '')    ${event_id}
    RETURN    ${e}

Event Status Should Be
    [Arguments]    ${event_id}    ${status}
    ${e}=    Stored Event    ${event_id}
    Should Be Equal    ${e}[status]    ${status}

Stored Requests
    [Arguments]    ${event_id}
    ${rows}=    Query    select state, current_stage, amount_requested from governance_approvalrequest where event_id = replace(?, '-', '') order by created_at    ${event_id}
    RETURN    ${rows}

Stored Steps
    [Arguments]    ${approval_id}
    ${rows}=    Query    select stage, decision, comment, actor_role, mfa_verified, amount_sanctioned from governance_approvalstep where request_id = replace(?, '-', '') order by created_at    ${approval_id}
    RETURN    ${rows}

Step Should Be
    [Arguments]    ${step}    ${stage}    ${decision}    ${actor_role}
    Should Be Equal    ${step}[stage]    ${stage}
    Should Be Equal    ${step}[decision]    ${decision}
    Should Be Equal    ${step}[actor_role]    ${actor_role}

Line Should Be
    [Documentation]    Requested and sanctioned, as stored. ${None} means nothing has been sanctioned.
    [Arguments]    ${line_id}    ${requested}    ${sanctioned}
    ${l}=    Row    select head, amount_requested, amount_sanctioned from budget_budgetline where id = replace(?, '-', '')    ${line_id}
    Should Be Equal As Numbers    ${l}[amount_requested]    ${requested}
    IF    $sanctioned is None
        Should Be Equal    ${l}[amount_sanctioned]    ${None}    msg=${l}[head]: sanctioned ${l}[amount_sanctioned], expected nothing
    ELSE
        Should Be True    $l['amount_sanctioned'] is not None and float($l['amount_sanctioned']) == float($sanctioned)
        ...    msg=${l}[head]: sanctioned ${l}[amount_sanctioned], expected ${sanctioned}
    END

Audit Should Read
    [Documentation]    The submission and decision entries for this event, oldest first.
    [Arguments]    ${event_id}    @{actions}
    ${rows}=    Query    select action from governance_auditentry where target_id = ? and (action = 'event.submitted' or action like 'approval.%') order by created_at    ${event_id}
    ${got}=    Evaluate    [r['action'] for r in $rows]
    Lists Should Be Equal    ${got}    ${actions}

Club Should Be Told
    [Documentation]    One notification of this kind to the Treasurer, linked to this event, mentioning the text.
    [Arguments]    ${event_id}    ${kind}    ${text}
    ${rows}=    Query    select n.subject, n.body from governance_notification n join identity_user u on u.id = n.user_id where u.email = ? and n.kind = ? and n.link like ?    ${TREASURER_EMAIL}    ${kind}    %${event_id}
    Length Should Be    ${rows}    1
    Should Contain    ${rows}[0][subject] ${rows}[0][body]    ${text}

# ---- added with the regression pack (api/09+, ui/16+) ----
Tables Should Include
    [Documentation]    Every name in the list is a table in the file.
    [Arguments]    @{expected}
    ${actual}=    Tables
    ${missing}=    Evaluate    sorted(set($expected) - set($actual))
    Should Be Empty    ${missing}    msg=tables missing from ${DB_PATH}: ${missing}

Count Rows
    [Arguments]    ${table}    ${where}=1=1    @{params}
    ${n}=    Scalar    select count(*) from ${table} where ${where}    @{params}
    RETURN    ${n}

Table Should Hold At Least
    [Arguments]    ${table}    ${minimum}
    ${n}=    Count Rows    ${table}
    Should Be True    ${n} >= ${minimum}    msg=${table} holds ${n} rows, expected at least ${minimum}

Row By Id
    [Arguments]    ${table}    ${id}
    ${r}=    Row    select * from ${table} where id = replace(?, '-', '')    ${id}
    RETURN    ${r}

Club Of Event
    [Arguments]    ${event_id}
    ${club}=    Scalar    select club_id from events_event where id = replace(?, '-', '')    ${event_id}
    RETURN    ${club}

Stored Lines
    [Documentation]    The budget's lines in sheet order.
    [Arguments]    ${budget_id}
    ${rows}=    Query    select id, head, basis, amount_requested, amount_sanctioned, amount_spent, position from budget_budgetline where budget_id = replace(?, '-', '') order by position    ${budget_id}
    RETURN    ${rows}

Stored Membership
    [Documentation]    The person's active membership rows in this club (one, or none).
    [Arguments]    ${email}    ${club_id}
    ${rows}=    Query    select m.id, m.role from clubs_membership m join identity_student s on s.id = m.student_id join identity_user u on u.id = s.user_id where u.email = ? and m.club_id = replace(?, '-', '') and m.ended_at is null    ${email}    ${club_id}
    RETURN    ${rows}

Stored Join Request
    [Arguments]    ${request_id}
    ${r}=    Row    select state, note, decided_at, decided_by_id from clubs_joinrequest where id = replace(?, '-', '')    ${request_id}
    RETURN    ${r}

Notifications For
    [Documentation]    This person's notifications of one kind whose link mentions the text (an event id, usually), oldest first.
    [Arguments]    ${email}    ${kind}    ${link_like}=${EMPTY}
    ${rows}=    Query    select n.subject, n.body, n.link, n.read_at, n.created_at from governance_notification n join identity_user u on u.id = n.user_id where u.email = ? and n.kind = ? and n.link like ? order by n.created_at    ${email}    ${kind}    %${link_like}%
    RETURN    ${rows}

Should Be Told
    [Arguments]    ${email}    ${kind}    ${link_like}    ${text}=${EMPTY}
    ${rows}=    Notifications For    ${email}    ${kind}    ${link_like}
    Should Not Be Empty    ${rows}    msg=${email} was not told ${kind} about ${link_like}
    IF    $text    Should Contain    ${rows}[-1][subject] ${rows}[-1][body]    ${text}
    RETURN    ${rows}

Should Not Be Told
    [Arguments]    ${email}    ${kind}    ${link_like}
    ${rows}=    Notifications For    ${email}    ${kind}    ${link_like}
    Should Be Empty    ${rows}    msg=${email} was told ${kind} about ${link_like}, and should not have been

Emails With Role In Club
    [Arguments]    ${club_id}    @{roles}
    ${marks}=    Evaluate    ','.join('?' for _ in $roles)
    ${rows}=    Query    select u.email from clubs_membership m join identity_student s on s.id = m.student_id join identity_user u on u.id = s.user_id where m.club_id = replace(?, '-', '') and m.ended_at is null and m.role in (${marks}) order by m.role    ${club_id}    @{roles}
    ${emails}=    Evaluate    [r['email'] for r in $rows]
    RETURN    ${emails}

Email Of Role
    [Arguments]    ${club_id}    ${role}
    ${emails}=    Emails With Role In Club    ${club_id}    ${role}
    Length Should Be    ${emails}    1    msg=${role} in club ${club_id}: ${emails}
    RETURN    ${emails}[0]

Officers Should Be Told
    [Documentation]    President, Vice-President, Secretary and Treasurer of the event's club, each exactly once.
    [Arguments]    ${event_id}    ${kind}    ${text}=${EMPTY}
    ${club}=    Club Of Event    ${event_id}
    ${officers}=    Emails With Role In Club    ${club}    club_president    club_vice_president    club_secretary    club_treasurer
    Should Not Be Empty    ${officers}
    FOR    ${email}    IN    @{officers}
        ${rows}=    Notifications For    ${email}    ${kind}    ${event_id}
        Length Should Be    ${rows}    1    msg=${email}: ${kind} about ${event_id}
        IF    $text    Should Contain    ${rows}[0][subject] ${rows}[0][body]    ${text}
    END

Budget Viewers Should Be Told
    [Documentation]    President, Vice-President and Treasurer (the roles that may see money), each exactly once.
    [Arguments]    ${event_id}    ${kind}    ${text}=${EMPTY}
    ${club}=    Club Of Event    ${event_id}
    ${viewers}=    Emails With Role In Club    ${club}    club_president    club_vice_president    club_treasurer
    Should Not Be Empty    ${viewers}
    FOR    ${email}    IN    @{viewers}
        ${rows}=    Notifications For    ${email}    ${kind}    ${event_id}
        Length Should Be    ${rows}    1    msg=${email}: ${kind} about ${event_id}
        IF    $text    Should Contain    ${rows}[0][subject] ${rows}[0][body]    ${text}
    END

Stored Reassignments
    [Arguments]    ${event_id}
    ${rows}=    Query    select from_venue_id, to_venue_id, reason, actor_label from events_venuereassignment where event_id = replace(?, '-', '') order by created_at    ${event_id}
    RETURN    ${rows}

Event Times Should Be
    [Documentation]    starts_at and ends_at as stored, compared as instants.
    [Arguments]    ${event_id}    ${starts}    ${ends}
    ${r}=    Row    select starts_at, ends_at from events_event where id = replace(?, '-', '')    ${event_id}
    ${ok}=    Same Instant    ${r}[starts_at]    ${starts}
    Should Be True    ${ok}    msg=stored start ${r}[starts_at], expected ${starts}
    ${ok}=    Same Instant    ${r}[ends_at]    ${ends}
    Should Be True    ${ok}    msg=stored end ${r}[ends_at], expected ${ends}

Audit Should Contain
    [Arguments]    ${target_id}    ${action}
    ${rows}=    Query    select id from governance_auditentry where target_id = ? and action = ?    ${target_id}    ${action}
    Should Not Be Empty    ${rows}    msg=no audit entry ${action} for ${target_id}

Club-less Student
    [Documentation]    The email of a seeded student in no club with no pending request, skipping the named personas; `n` picks the n-th in PRN order. seed_demo makes the email prn.lower()@college.edu.
    [Arguments]    ${n}=0
    ${rows}=    Query    select u.email from identity_student s join identity_user u on u.id = s.user_id where not exists (select 1 from clubs_membership m where m.student_id = s.id and m.ended_at is null) and not exists (select 1 from clubs_joinrequest j where j.student_id = s.id and j.state = 'pending') and u.email not in (?, ?, ?, ?, ?, ?) order by s.prn    ${STUDENT_EMAIL}    ${STUDENT_2_EMAIL}    ${STUDENT_3_EMAIL}    ${DOOR_STUDENT_EMAIL}    ${SYNC_STUDENT_EMAIL}    ${UI_DOOR_STUDENT_EMAIL}
    RETURN    ${rows}[${n}][email]

# ---- added with api/18–19 and ui/23–24 ----
Stored Global Roles
    [Documentation]    The person's global roles as stored (a list).
    [Arguments]    ${email}
    ${raw}=    Scalar    select global_roles from identity_user where email = ?    ${email}
    ${roles}=    Evaluate    json.loads($raw)    modules=json
    RETURN    ${roles}

User Id Of
    [Documentation]    The user's id with dashes, as the API writes it.
    [Arguments]    ${email}
    ${raw}=    Scalar    select id from identity_user where email = ?    ${email}
    ${id}=    Evaluate    str(uuid.UUID($raw))    modules=uuid
    RETURN    ${id}

Stored Proposal Documents
    [Documentation]    Every version attached to the event, oldest first; the last is the current one.
    [Arguments]    ${event_id}
    ${rows}=    Query    select file_name, content_type, byte_size, sha256, uploaded_by_label from events_eventproposaldocument where event_id = replace(?, '-', '') order by created_at    ${event_id}
    RETURN    ${rows}

Stored Approval
    [Arguments]    ${approval_id}
    ${r}=    Row    select state, current_stage from governance_approvalrequest where id = replace(?, '-', '')    ${approval_id}
    RETURN    ${r}
