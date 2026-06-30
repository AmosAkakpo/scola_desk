# Finance Module — Build Steps

> Step-by-step implementation order.  
> Each step lists exactly which files to create/modify.  
> Do NOT skip steps — later steps depend on earlier ones.  
> Reference: finance_module.md v3.0

---

## Step 1 — Migration 009 Rework

**Why first:** Everything depends on the new schema.

**What to do:**
- Rewrite `server/db/migration/009_finance_module.js` completely
- Delete local SQLite DB before testing (schema is destructive — drops old tables)

**Creates:**
- `fee_types` (with is_mandatory, is_system, display_order — NO amount column)
- `fee_type_amounts` (fee_type_id + level_id + amount, with NULL level = default)
- `student_fee_selections` (student + fee + opted_in)
- `payment_allocations` (payment + fee + amount, fee_type_id NOT NULL)
- `receipt_sequences` (atomic counter per prefix per year)

**Alters:**
- `payments` — add payment_method, receipt_number, payer_name, receiver_name, reference
- `salary_entries` — add payment_method, receipt_number, payer_name, receiver_name, reference, calculated_amount, adjustment_reason
- `expenses` — add receipt_ref
- `expense_categories` — add is_system, is_active, seed "Abonnement ScolaDesk"
- `teachers` — add hourly_rate REAL DEFAULT 0
- `teacher_daily_log` — rebuild table to change CHECK constraint to ('present','absent') only

**Files:**
- `server/db/migration/009_finance_module.js` — full rewrite

**Verify:** Delete DB → restart app → check all tables exist with correct columns.

---

## Step 2 — Permission Codes for Attendance

**Why now:** Attendance routes need a permission code. Secretary needs it before we build routes.

**What to do:**
- Add `attendance.view` and `attendance.edit` permission codes
- Grant to secretary role (secretary records attendance)
- Grant to accountant role (view only — they see hours in salary flow)

**Files:**
- `server/db/migration/009_finance_module.js` — add permission seeds at the end (same migration)

---

## Step 3 — Core Finance Backend (routes rewrite)

**Why now:** Frontend pages need correct endpoints before we rebuild UI.

**What to do:**
- Rewrite `server/routes/finance.js` to use new schema
- Implement all core logic functions: getFeeAmountForStudent, getStudentFeeSummary, allocatePayment, generateReceiptNumber
- Dashboard endpoint: recompute total_due from fee_type_amounts × student_fee_selections
- Fee types CRUD: create/update/delete with amounts array [{level_id, amount}]
- Tuition list: student summary with fees computed live
- Tuition student detail: fee breakdown + payment history
- Tuition pay: amount_received → cap at remaining → allocations → ledger → receipt
- Fee selections: get/toggle optional fees (block if paid)
- Statement endpoint: état des frais print data
- Salary preview: hours from daily_log + hourly_rate from teachers table
- Salary pay: store both calculated_amount and final amount
- Subscription endpoint: keep as-is (already done)
- Expenses + categories: minor updates only

**Files:**
- `server/routes/finance.js` — full rewrite

**Verify:** Test each endpoint via curl/Postman or frontend.

---

## Step 4 — Attendance Backend

**Why now:** Attendance feeds into salary flow. Build before salary UI rework.

**What to do:**
- Create `server/routes/attendance.js`
- GET daily: list teachers with scheduled hours from timetable_entries for that day_of_week
- POST daily: UPSERT teacher_daily_log entries (present/absent + hours_credited)
- POST add-hours: credit extra hours to any teacher on any date (substitutes)
- GET monthly-summary: per-teacher hours aggregation for a pay period
- Register route in `server/index.js`

**Files:**
- `server/routes/attendance.js` — new
- `server/index.js` — add `app.use('/api/attendance', require('./routes/attendance'))`

---

## Step 5 — Teacher Profile Update (hourly_rate)

**Why now:** Teachers need hourly_rate before attendance/salary pages make sense.

**What to do:**
- Add hourly_rate field to teacher GET response
- Add hourly_rate to teacher PUT (edit) endpoint
- Add hourly_rate input to TeacherDetailPage UI (in the info/edit section)

**Files:**
- `server/routes/teachers.js` — include hourly_rate in GET, allow in PUT
- `src/pages/teachers/TeacherDetailPage.jsx` — add "Taux horaire" field

---

## Step 6 — Onboarding Step 12 Rework + System Fee

**Why now:** Fee types must exist before students can be enrolled with fees.

**What to do:**
- Rework Step 12 to create fee_types + fee_type_amounts (not fee_structures)
- Auto-create system fee: "Frais de gestion scolaire" with amount = rate_per_student, is_system=1, is_mandatory=1, display_order=99
- Step 12 remains skippable — system fee is always created regardless
- Update GET /api/onboarding/fee-data to return levels (not classrooms) for amount setup
- Update POST /api/onboarding/step12 to insert fee_types + fee_type_amounts
- Update OnboardingWizard.jsx Step12 UI: show level-based fee form

**Files:**
- `server/routes/onboarding.js` — rework fee-data + step12 endpoints
- `src/pages/general/OnboardingWizard.jsx` — rework Step12Fees component

---

## Step 7 — Enrollment Fee Auto-Creation

**Why now:** When students enroll, mandatory fees must be auto-applied.

**What to do:**
- In the student creation endpoint (POST /api/students), after enrollment INSERT:
  - Get all fee_types WHERE is_mandatory=1 AND academic_year_id=current
  - INSERT INTO student_fee_selections for each (opted_in=1)
- In onboarding Step 10 (student import), same logic for bulk imports
- Update expected_tuition on classroom after enrollment

**Files:**
- `server/routes/students.js` — add auto-fee-selection after enrollment
- `server/routes/onboarding.js` — add auto-fee-selection in Step 10 student import loop

---

## Step 8 — Finance Settings Page (fee types UI)

**Why now:** School needs to configure fees before tuition page is useful.

**What to do:**
- Full rebuild of FinanceSettingsPage fee types tab
- Fee list with: name, portée (tous/niveau), obligatoire, display_order, actions
- Add/Edit form: name, is_mandatory toggle, display_order input, amounts-per-level table
- System fee: label editable only, amount + delete blocked
- Expense categories tab: unchanged (already works)

**Files:**
- `src/pages/finance/FinanceSettingsPage.jsx` — rebuild fee types tab

---

## Step 9 — Student Receipt Page (replace modal)

**Why now:** Core user flow — where secretary records payments.

**What to do:**
- Create new StudentReceiptPage at `/finance/tuition/:studentId`
- Header: student info (name, matricule, classroom, year)
- Fee breakdown table (live-computed from fee_type_amounts)
- Optional fees section: toggle opt-in/out (blocked if paid)
- Payment form: montant reçu → show montant à enregistrer + monnaie à rendre
- Live allocation preview (computed client-side from remaining per fee)
- [Enregistrer et imprimer] / [Enregistrer sans imprimer]
- Payment history list
- [Imprimer état des frais] button (top-right)
- Remove StudentPaymentModal from TuitionPage
- TuitionPage [Payer] button → navigate to this page instead of opening modal

**Files:**
- `src/pages/finance/StudentReceiptPage.jsx` — new
- `src/pages/finance/TuitionPage.jsx` — remove modal, change button to navigate
- `src/App.jsx` — add route + import

---

## Step 10 — Tuition List Updates

**Why now:** List page needs to reflect new schema + link to receipt page.

**What to do:**
- Update TuitionPage to use new fee summary data shape
- Add sort-by-owed (dropdown or clickable column header)
- Red badge for impayé students (already partially done — verify)
- [Voir/Payer] navigates to `/finance/tuition/:studentId`

**Files:**
- `src/pages/finance/TuitionPage.jsx` — update data handling, add sort, fix navigation

---

## Step 11 — Receipt Print (3 modes)

**Why now:** Receipts are used after every payment. Polish the print views.

**What to do:**
- Mode 1: État des frais — billing statement from /api/finance/receipt/statement/:studentId
- Mode 2: Reçu de paiement — polish existing, use new allocation format
- Mode 3: Reçu de salaire — polish existing, add hours + adjustment info
- All use window.open() → window.print()

**Files:**
- `src/pages/finance/StudentReceiptPage.jsx` — add buildStatementHTML + buildReceiptHTML
- `src/pages/finance/SalariesPage.jsx` — update salary receipt HTML

---

## Step 12 — Teacher Attendance Page

**Why now:** Attendance data feeds into salary. Build before salary rework.

**What to do:**
- Create AttendancePage at `/teachers/attendance`
- Date selector: ← / → navigation (no future, 30 days back)
- Grid: teachers with H. prévues, status dropdown (present/absent), editable H. créditées, notes
- [Tous présents] quick action
- [Enregistrer] → POST /api/attendance
- "Ajouter des heures" button → modal for substitute hours
- Month summary tab: per-teacher aggregation → [Aller aux salaires]
- Add route to App.jsx
- Add sidebar nav item (under Finance or separate, with attendance.view permission)

**Files:**
- `src/pages/teachers/AttendancePage.jsx` — new
- `src/App.jsx` — add route + import
- `src/components/Layout.jsx` — add nav item for attendance (PRO + attendance.view)

---

## Step 13 — Salary Page Rework

**Why now:** Attendance data now exists. Salary page can show real hours.

**What to do:**
- Add summary cards: total à verser, déjà versé, reste, payés X/Y
- Add columns: H. prévues (timetable × 4), H. réelles (daily_log), Calculé (réelles × rate)
- Rework pay modal:
  - Call salary preview endpoint → show hours + calculated
  - Editable montant à payer (pre-filled with calculated)
  - Adjustment reason (required if amount ≠ calculated)
  - Submit stores both calculated_amount and amount
- Polish salary receipt print (hours, rate, adjustment)

**Files:**
- `src/pages/finance/SalariesPage.jsx` — rework with hours + preview + adjustment

---

## Step 14 — Expense Page Updates

**Why now:** Low dependency, can be done anytime after Step 3.

**What to do:**
- Add month filter tabs (computed from data via /months endpoint)
- Add /api/finance/expenses/months endpoint to backend

**Files:**
- `server/routes/finance.js` — add /expenses/months endpoint
- `src/pages/finance/ExpensesPage.jsx` — add month tab filter UI

---

## Step 15 — Finance Dashboard Updates

**Why now:** Dashboard reads from all finance data. Do after other pages are solid.

**What to do:**
- Add [Salaires] nav button (currently missing)
- Update KPI computations to use new fee_type_amounts schema
- Remove any leftover subscription KPI references
- Verify per-class collection rates work with new schema

**Files:**
- `src/pages/finance/FinanceDashboardPage.jsx` — add nav button, verify data

---

## Step 16 — Mon Abonnement Polish

**Why now:** Low priority, existing page mostly works.

**What to do:**
- Show "Montant déjà versé" and "Reste à régulariser" section
- Show frais d'installation status
- Add contact info footer
- Ensure accessible from expired lock screen (Phase 8 work — note for later)

**Files:**
- `src/pages/finance/SubscriptionPage.jsx` — add missing sections
- `server/routes/finance.js` — ensure subscription endpoint returns installation_fee fields

---

## Step 17 — Timetable Teacher View + Print

**Why now:** Teacher view needed for attendance context. Can be done in parallel.

**What to do:**
- Add "Par enseignant" tab to existing TimetablePage
- Teacher dropdown → weekly grid showing all their slots across classrooms
- Total hours summary per class + subject
- Print button on both tabs

**Files:**
- `src/pages/timetable/TimetablePage.jsx` — add teacher view tab + print

---

## Step 18 — Report Card Payment Banner

**Why now:** Last — needs fee summary computation working.

**What to do:**
- Before generating/viewing a report card, check student payment status
- If remaining > 0: show amber banner "Cet élève a un solde impayé de X XOF"
- [Imprimer quand même] / [Annuler]
- Non-blocking — secretary always has the choice
- Uses live getStudentFeeSummary (same API as tuition page)

**Files:**
- `src/pages/reports/ReportCardsPage.jsx` — add payment check before generate
- `src/pages/reports/ReportCardViewPage.jsx` — add banner if unpaid

---

## Step 19 — PRO Gate + Smoke Test

**Why now:** Final step — verify everything is gated correctly.

**What to do:**
- Verify all /api/finance/* routes use requirePro middleware (except /subscription)
- Verify /api/attendance/* routes use requirePro
- Verify sidebar nav items hide for STANDARD tier
- Verify attendance nav shows only for secretary + admin
- End-to-end test:
  1. Onboarding → Step 12 creates fees + system fee
  2. Enroll student → mandatory fees auto-created
  3. Finance Settings → add optional fee (cantine)
  4. Student receipt page → toggle cantine on → pay partial → print receipt
  5. Record attendance for a week → salary page shows hours
  6. Pay salary → print salary receipt
  7. Record expense → check dashboard totals
  8. Generate report card → see unpaid banner
  9. Mon Abonnement → verify numbers

**Files:**
- `server/routes/finance.js` — add requirePro to router.use (except subscription)
- `server/routes/attendance.js` — add requirePro
- `src/components/Layout.jsx` — verify nav gating

---

## Summary: File Impact Map

| File | Steps |
|------|-------|
| `server/db/migration/009_finance_module.js` | 1, 2 |
| `server/db/init.js` | — (already registered) |
| `server/routes/finance.js` | 3, 14, 16 |
| `server/routes/attendance.js` | 4 (new) |
| `server/routes/teachers.js` | 5 |
| `server/routes/students.js` | 7 |
| `server/routes/onboarding.js` | 6, 7 |
| `server/index.js` | 4 |
| `src/pages/general/OnboardingWizard.jsx` | 6 |
| `src/pages/teachers/TeacherDetailPage.jsx` | 5 |
| `src/pages/teachers/AttendancePage.jsx` | 12 (new) |
| `src/pages/finance/FinanceSettingsPage.jsx` | 8 |
| `src/pages/finance/StudentReceiptPage.jsx` | 9, 11 (new) |
| `src/pages/finance/TuitionPage.jsx` | 9, 10 |
| `src/pages/finance/SalariesPage.jsx` | 11, 13 |
| `src/pages/finance/ExpensesPage.jsx` | 14 |
| `src/pages/finance/FinanceDashboardPage.jsx` | 15 |
| `src/pages/finance/SubscriptionPage.jsx` | 16 |
| `src/pages/timetable/TimetablePage.jsx` | 17 |
| `src/pages/reports/ReportCardsPage.jsx` | 18 |
| `src/pages/reports/ReportCardViewPage.jsx` | 18 |
| `src/App.jsx` | 9, 12 |
| `src/components/Layout.jsx` | 12, 19 |
| `server/middleware/requirePro.js` | 19 (verify) |

---

*19 steps. Each step is testable independently.*  
*Estimated: Steps 1-3 are the foundation. Steps 4-13 are the meat. Steps 14-19 are polish.*
