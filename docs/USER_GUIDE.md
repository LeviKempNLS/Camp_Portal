# Faith Adventures Camp Portal — User guide

**For:** parents/guardians, registrars, directors, counselors, medical staff and camp finance operators  
**Reference version:** source baseline October 30, 2026 (`70672e8`).  
**Important:** The currently hosted portal is a **development/demo** application. Use **fictitious information only**; do not enter real campers, emergency contacts, medical records, payment information or staff personal information before the camp approves the production launch.

This guide describes the **implemented interface**, not proposed features. Navigation links appear only when your account has the necessary role/permission. Screens, labels and workflows may change as the launch backlog progresses.

## 1. Getting started

- Open the camp's demo portal: [https://camp-portal-33on.onrender.com](https://camp-portal-33on.onrender.com).
- Select **Create account** (`/sign-up`) if you are a new parent/guardian, or **Sign in** (`/sign-in`) if you already have an account.
- After authentication open **Dashboard** (`/dashboard`). A guardian with household access can also open **Household** (`/household`). Assigned staff members may instead see **Staff workspace**, **Medical workspace**, or **Camp administration**.
- A household guardian can also be camp staff; the same account retains both access types if explicitly authorized.
- Sign out using the site navigation when done, especially on shared devices.

**Demo caveats:** outbound email, password reset and verification are not ready for public use. Do not rely on invitations being emailed. An administrator must provision staff roles; creating a family account does not grant registrar or staff authority.

## 2. Parents and guardians

### A. Set up your household

1. From Dashboard select **Household**.
2. Select **Edit household** to review/edit the household name and mailing address.
3. Select **Save household**; verify the save confirmation.
4. Select **Add household member** and enter a camper's fictitious details; use the appropriate **Camper** relationship.
5. Select an existing member from the list to review their member profile. Repeat for each camper.

The household persists server-side, so information is available after signing out and signing back in. For testing, create two fictitious campers and verify their profiles remain separate.

### B. Start or resume camp registration

1. Choose **Start or resume registration** on Dashboard or go to `/registrations/new`.
2. Select the camper. If more than one eligible session is open, choose the desired camp session.
3. The wizard prepopulates available household/camper information and any saved draft.
4. Complete the requested sections. The client uses server-backed autosave; look for save feedback before navigating away. Data is persisted in PostgreSQL, not solely in the browser.
5. You can leave and return to the same camper/session draft. Another camper has a separate draft.
6. When the form is complete, use **Submit registration**. Correct any required-field validation errors and submit again.

After submission the form is normally read-only. The status page shows the selected session and the registration state. **Submitted** means the camp received it; **Approved** means the registrar approved it; **Waitlisted** means a place is not yet confirmed. If status changes to **Needs information**, return to the registration, make corrections and resubmit. **Cancelled**, **Checked in** and **Completed** are additional operational states.

If registration is unavailable, confirm that the season/session is open, its registration window is active and the selected camper is eligible. Full sessions may waitlist when enabled, or reject new registrations. Contact camp staff if the status appears wrong.

### C. Invite another authorized adult

The codebase has a secure household invitation workflow for an additional adult, including a time-limited single-use invitation and email-match checking. The demo may preview an invitation link because outbound email is not configured. Only invite an adult authorized to access the household. Do not share invitation links publicly. If you cannot find the invitation control or it is unavailable, ask the administrator to enable/test the workflow—do not create duplicate household accounts as a workaround.

### D. Payment status

**You do not need to pay online to submit a registration.** Live online checkout is **not** implemented in this demo. The registrar can record an offline check/cash payment or scholarship/church sponsor against the registration's ledger. A registration can be approved while a financial balance remains. For now, confirm any payment questions directly with camp staff outside the demo.

### E. Common family questions

| Symptom | What to check |
| --- | --- |
| No camper to select | Add a household member with Camper relationship |
| No available camp session | Season/session must be configured open, within its registration window |
| A saved draft seems missing | Check the same camper **and** session; sign in with the same authorized account |
| Form says information is missing | Complete the specifically indicated required fields |
| Form is read-only | Submission/approval normally locks editing; only `NEEDS_INFORMATION` permits requested corrections |
| Parent sees Admin or Staff link unexpectedly | Roles are additive; ask administrator to check explicit assignments/permissions |
| Access denied to another household | Expected ownership protection; do not use someone else's login |
| No email received | Real outbound messaging is not configured in the baseline |

## 3. Registrar workflow

Use an explicitly provisioned registrar account. Navigate from Dashboard to **Camp administration** (`/admin`). The administrator/registrar workspace may show links to registration queue, rosters, finances, reports, communications and check-in depending on permissions.

### A. Review and process registrations

1. Open **Camp administration** → **Registration review**, or the registrar queue at `/admin`.
2. Open a camper's registration detail (`/admin/registrations/[registrationId]`).
3. Review allowable registration and operational details. **Medical answers are not exposed merely by being a registrar**.
4. Take a valid review action—**Approve**, **Request information**, **Waitlist**, or **Cancel**—based on the current status, available capacity and camp policy.
5. For **Needs information**, tell the parent what requires correction through an approved communications channel; parent can edit and resubmit.
6. For waitlisted campers, recheck capacity before approval. Approval over capacity is blocked by server-side checks.

The portal audits review transitions. Never manipulate registration state through manual SQL to bypass validation.

### B. Roster, T-shirt and cabin assignments

Open **Camp administration → Camp roster** (`/admin/roster`).

- Search/filter/sort by camper, season/session, operational group, cabin, age/grade, registration status and T-shirt size.
- Use shirt totals for ordering or distribution.
- Assign or change camper group/cabin placement if you have `roster.manage`; only eligible active registrations can be assigned.
- All placement targets must belong to the same session, and capacity is enforced.
- Use roster CSV for operational lists. It intentionally omits raw forms, medical information, emergency contact details and finances.

A staff member may see a narrower subset of the roster. The registrar's full safe roster is not automatically available to counselors.

### C. Offline finances, scholarships and church sponsors

Open **Camp administration → Camp finances** (`/admin/finance`), if authorized.

1. Use filters for session, camper search, paid/partial/unpaid status, sponsoring church or scholarship program.
2. Read the totals for charges, household paid, church paid, scholarships and outstanding balance.
3. For a camper, open **Payment**, enter the **amount**, method (**Check**, **Cash**, **Other**) and a reference/note, then choose **Record payment**.
4. Use **Scholarship** to select an existing scholarship program and apply the correct credit.
5. Use **Church sponsorship** to record a commitment tied to a church; use church payment tools to record **actual church funds received** separately.
6. Authorized finance users can create/update program/church records and perform adjustments, refunds or reversals where the relevant controls are available.
7. Recheck totals and the activity history after each entry. A **church commitment is not a received payment**.

**Important accounting rules:** the financial ledger is append-only, with corrections made as separate reversal/adjustment entries. Do not record a payment again to “fix” an incorrect entry. Finance read and record permissions are separate; counselors, most directors and medical users should not see this workspace without explicit authorization. This is **internal tracking only**, not bank/card processing or a live receipt service.

### D. Check-in and check-out

Open `/admin/check-in` from **Camp administration → Check-in & attendance**.

1. Filter by session or search camper name.
2. Confirm the camper has **Approved** status.
3. Optionally record an arrival note, then select **Check in**.
4. For a **Checked in** camper, select **Check out** when camp's actual release/check-out procedures have been satisfied.
5. The system records check-in and check-out timestamps; completed records show as **Completed**.

The page does **not** display medical or financial fields. The software is not a substitute for confirming the identity/authorization of the adult collecting a camper. Camp should establish its physical safeguarding and pickup procedures before real-world use.

### E. Registrar reports and export

Open `/admin/reports`. Select the relevant session/status/search filters and use the available registration/contact reports or CSV export. Reports intentionally avoid medical and financial details, and the generated CSV neutralizes spreadsheet formula injection. Store exported files in a protected location and delete them when no longer needed; downloaded copies are outside portal access controls.

### F. Communications (demo only)

Open `/admin/communications`.

1. Choose audience: all households, one session, a registration status, or active staff.
2. Enter a message subject and body, queue it, and inspect the outbox/recipient count.
3. **Simulate sent** changes demo status only. It **does not email anyone**.
4. Treat recipient selection and recorded message bodies as test data only. Do not use demo messages for real emergencies or official camp notices.

Actual delivery, failure handling, consent/preference management and postal mailer enhancements are planned under backlog #23 and #27.

## 4. Camp directors and administrators

### Configure seasons and sessions

Open **Camp administration → Camp setup** at `/admin/configuration` with `camp.configure`.

- Create/manage the appropriate season and sessions.
- Configure session names/descriptions, start/end dates, minimum/maximum age or grade, capacity, base price and optional deposit.
- Set season/session status and registration opening/closing times.
- Enable waitlisting if desired. Validate dates against the camp's configured timezone (normally America/Chicago).
- Use a fictitious test session before announcing opening dates publicly.

The setup form blocks invalid date windows and capacity states. Camp Directors do **not** automatically inherit every administrative permission.

### Configure groups, cabins, staff assignments

Open `/admin/operations` with `operations.manage`.

- Create session-bound operational groups and cabins, with capacities.
- Assign or remove staff in roles such as **Camp Director**, **Group Director**, **Counselor**, **Medical**, **Registrar**.
- Choose appropriate session and, where required, group/cabin scope.
- Remember: staff accounts and family guardian identities can refer to the same Person; avoid duplicate people.
- A cabin/group and its staff/registrations must belong to the same session.

Camper-to-cabin placements are handled in **Camp roster**, not in the staff-assignment setup screen. Changing staff roles can affect data access immediately.

### Administration readiness

Before each session: verify capacity and roster totals; review unassigned campers; verify staff assignment scope; rehearse arrival/check-out procedures; reconcile scholarship/church/payment balances; test reports using fictitious data; and confirm sensitive-data access is appropriate.

## 5. Counselors and group directors

Open **Staff workspace** at `/staff` when you have an active staff assignment. Your view is limited by your assigned session/group/cabin. Counselors generally see their assigned group or cabin, group directors their group, and camp-wide roles can be allowed a broader *operational* roster. This workspace excludes raw medical forms and finance details.

If an expected camper is absent, ask the registrar to check the current placement or the director to confirm your assignment. Do not ask for someone else's credentials or bypass assigned scope.

## 6. Medical staff

Open **Medical workspace** at `/medical` only if your account has explicit medical permission and any required active medical/session assignment. Its data is intentionally separate from the registrar roster and general staff workspace.

Use camp-approved medical safeguarding, verification and confidentiality procedures. The medical screen is a scoped view of registration care information, not an electronic health-record system or emergency-response service. Do not enter real health details in the demo. If medical data is missing, have the authorized registrar/guardian follow the approved correction process rather than exposing entire form answers in a general report.

## 7. Permissions by task

The following is a practical guide, **not** a substitute for the current permission table/configuration.

| Activity | Typical authorized role / requirement |
| --- | --- |
| View/edit household, add own campers | Authenticated household guardian with portal access |
| Edit/resubmit own draft after requested correction | Household guardian, allowed state and session |
| Review registration and decide status | Registrar / `registration.approve` |
| Configure sessions/seasons | `camp.configure` |
| Create cabins/groups and assign staff | `operations.manage` |
| View/manage full safe roster and placements | `roster.read` / `roster.manage` |
| Assigned camper operational roster | Active staff assignment scope |
| View/record finances | `finance.read` / `finance.record` |
| Check-in/out | `attendance.read` / `attendance.manage` |
| Medical view | Explicit medical permission and required assignment scope |
| Registrar reports | `reports.read` |
| Queue communications | `communications.read` / write permission |

When a link does not appear or a route refuses access, that can be **expected**. Ask the designated administrator to examine the required permission and assignment rather than attempting to bypass it.

## 8. Working safely during the pilot

- Use only invented names and `@example.test` addresses; do not reuse real camper, parent, medical or payment information.
- Test guardian and registrar permissions with separate fictitious identities.
- Confirm a two-camper household can save separate drafts, reload and sign in again.
- Test role denial: a guardian should not gain `/admin` merely by signing in.
- Test group/cabin limits, waitlists, scholarship/church ledger behavior and attendance transitions.
- Confirm simulated email does not create any external delivery assumption.
- Keep demo seeding away from any future production database.

## 9. Troubleshooting and escalation

| Issue | First response |
| --- | --- |
| Sign-in fails | Verify the test account exists and use the correct email/password; reset email is not yet a supported public recovery path |
| Page says not found/unauthorized | Verify intended role and active session/assignment; do not share accounts |
| Changes not visible | Return to Dashboard and reopen the same person/session; look for save confirmation |
| Registration cannot submit | Resolve required-field errors and verify season/session registration window |
| Waitlisted instead of approved | Check session capacity and waitlist settings; registrar handles status |
| Payment totals appear wrong | Inspect ledger events, sponsorship commitments vs received payments and reversals; do not edit rows manually |
| Email not received | Outbox only simulates delivery |
| Site does not load | Check `/api/health` only for non-sensitive service availability; report deployment issues to maintainer |

## 10. Before using the portal with real families

The public launch requires validated production deployment and backup/restore, security/privacy review for children's information, approved forms and consent, test evidence, real account verification/recovery, transactional mail, and an operations policy. Payment integration is a goal but **online payment cannot be made a prerequisite to registration**. Track status in [roadmap #18](https://github.com/LeviKempNLS/Camp_Portal/issues/18).

**Related:** [README](../README.md) · [Technical reference](TECHNICAL_REFERENCE.md) · [Deployment guide](operations/deployment.md).
