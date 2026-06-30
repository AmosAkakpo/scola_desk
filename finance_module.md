# Finance & Attendance Module — Implementation Spec

> **App:** scola_desk_v1.0 (Electron + Express + SQLite)  
> **Access:** PRO tier only (except Mon Abonnement = all tiers)  
> **UI text:** French | **Code:** English  
> **Last updated:** 2026-06-25

---

## 1. Overview

```
IN:   Student tuition & fee payments from parents
OUT:  Teacher salaries + operational expenses
INFO: ScolaDesk subscription (read-only, no local payment processing)
```

Everything posts to `ledger_transactions` for unified reporting.  
Receipts generated for every IN and OUT transaction.  
Teacher attendance is PRO-only and feeds directly into payroll.

### Key Design Decisions

| Decision | Resolution |
|----------|------------|
| System fee (frais informatique) | Appears on student bills (locked, from license payload). Mon Abonnement shows aggregate school-level view. School pays ScolaDesk back and records as expense under "Abonnement ScolaDesk" category. |
| Fee structure | Per-level pricing via `fee_type_amounts` join table. NOT per-classroom. |
| Mandatory vs optional fees | `is_mandatory = 1` auto-applied at enrollment. Optional fees toggled per student by secretary. |
| Trimestre/semestre on fees | NOT used. All fees are annual. Period deadlines only for visual indicators. |
| Payment alerts | Simple: student not fully paid = red badge on tuition list. Sortable by amount owed. No deadline-based logic. |
| Overpayment | Blocked. Secretary enters amount received. System caps at total owed, shows "Monnaie à rendre" for the difference. |
| Salary calculation | Always hourly: `hours_credited × hourly_rate = calculated`. Presented to accountant with editable input. They type final amount. Both values stored. |
| Salary type | No fixed/hourly distinction in UI. Always compute from hours. Editable final amount handles all cases. |
| Teacher hourly_rate | One rate per teacher (on teachers table), not per-assignment. |
| Attendance statuses | Present (auto-fill scheduled hours, editable) + Absent (0 hours). No "permission" status. |
| Substitute hours | "Ajouter des heures" action — credit any teacher with extra hours + note on any date. |
| Student payment view | Dedicated page (`/finance/tuition/:studentId`), not modal. |
| Receipts | 3 modes: État des frais (billing statement), Reçu de paiement, Reçu de salaire. |
| Fee carry-forward | Auto-copy fee_types to new academic year. Future feature (built with promotion engine). |
| Old tables | `fee_structures` + `student_dues` replaced entirely by new system. |
| Bilan financier | Deferred to future features. |
| Tier gating | Finance + attendance = PRO only. Mon Abonnement = all tiers. |
| Permissions | Secretary: attendance. Accountant: finance. Admin: everything. |
| Fee ordering | Numeric `display_order` input. Controls receipt line order + allocation priority. |
| expected_tuition | Auto-updated from sum of mandatory fees for classroom's level. Quick reference on classroom cards. |
| Onboarding Step 12 | Reworked to create fee_types (skippable). System fee auto-created. |

---

## 2. Database Changes

### Migration 009 — Fee System (REWORK)

Replaces current migration 009. Also replaces `fee_structures` + `student_dues` from migration 001.

```sql
CREATE TABLE IF NOT EXISTS fee_types (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  name             TEXT NOT NULL,
  is_mandatory     INTEGER NOT NULL DEFAULT 0,
  is_system        INTEGER NOT NULL DEFAULT 0,
  is_active        INTEGER NOT NULL DEFAULT 1,
  display_order    INTEGER NOT NULL DEFAULT 0,
  created_at       TEXT DEFAULT (datetime('now')),
  UNIQUE(academic_year_id, name)
);

CREATE INDEX IF NOT EXISTS idx_fee_types_year
  ON fee_types(academic_year_id, is_active);

CREATE TABLE IF NOT EXISTS fee_type_amounts (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  fee_type_id INTEGER NOT NULL REFERENCES fee_types(id) ON DELETE CASCADE,
  level_id    INTEGER REFERENCES levels(id),
  amount      REAL NOT NULL,
  UNIQUE(fee_type_id, level_id)
);

CREATE INDEX IF NOT EXISTS idx_fee_amounts_type
  ON fee_type_amounts(fee_type_id, level_id);

CREATE TABLE IF NOT EXISTS student_fee_selections (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id       INTEGER NOT NULL REFERENCES students(id),
  fee_type_id      INTEGER NOT NULL REFERENCES fee_types(id),
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  opted_in         INTEGER NOT NULL DEFAULT 1,
  opted_in_at      TEXT DEFAULT (datetime('now')),
  opted_in_by      INTEGER REFERENCES users(id),
  UNIQUE(student_id, fee_type_id, academic_year_id)
);

CREATE INDEX IF NOT EXISTS idx_fee_selections_student
  ON student_fee_selections(student_id, academic_year_id);

CREATE TABLE IF NOT EXISTS payment_allocations (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  payment_id  INTEGER NOT NULL REFERENCES payments(id) ON DELETE CASCADE,
  fee_type_id INTEGER NOT NULL REFERENCES fee_types(id),
  amount      REAL NOT NULL,
  created_at  TEXT DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_allocations_payment
  ON payment_allocations(payment_id);
CREATE INDEX IF NOT EXISTS idx_allocations_fee
  ON payment_allocations(fee_type_id);

CREATE TABLE IF NOT EXISTS receipt_sequences (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id),
  prefix           TEXT NOT NULL,
  last_number      INTEGER NOT NULL DEFAULT 0,
  UNIQUE(academic_year_id, prefix)
);
```

### Payments & salary_entries additions (same migration)

```sql
ALTER TABLE payments ADD COLUMN payment_method TEXT DEFAULT 'especes';
ALTER TABLE payments ADD COLUMN receipt_number TEXT;
ALTER TABLE payments ADD COLUMN payer_name TEXT;
ALTER TABLE payments ADD COLUMN receiver_name TEXT;
ALTER TABLE payments ADD COLUMN reference TEXT;

ALTER TABLE salary_entries ADD COLUMN payment_method TEXT DEFAULT 'especes';
ALTER TABLE salary_entries ADD COLUMN receipt_number TEXT;
ALTER TABLE salary_entries ADD COLUMN payer_name TEXT;
ALTER TABLE salary_entries ADD COLUMN receiver_name TEXT;
ALTER TABLE salary_entries ADD COLUMN reference TEXT;

ALTER TABLE expenses ADD COLUMN receipt_ref TEXT;

ALTER TABLE expense_categories ADD COLUMN is_system INTEGER DEFAULT 0;
ALTER TABLE expense_categories ADD COLUMN is_active INTEGER DEFAULT 1;
INSERT OR IGNORE INTO expense_categories (name, description, is_system)
  VALUES ('Abonnement ScolaDesk', 'Frais d''abonnement au système ScolaDesk', 1);
```

### Teacher hourly_rate (same migration)

```sql
ALTER TABLE teachers ADD COLUMN hourly_rate REAL DEFAULT 0;
```

### Teacher daily_log constraint update (same migration)

Remove 'permission' from the CHECK constraint on `teacher_daily_log.status`:

```sql
-- SQLite doesn't support ALTER CHECK, so:
-- 1. Create new table with updated constraint
-- 2. Copy data
-- 3. Drop old, rename new
CREATE TABLE teacher_daily_log_new (
  id               INTEGER PRIMARY KEY AUTOINCREMENT,
  teacher_id       INTEGER NOT NULL REFERENCES teachers(id) ON DELETE RESTRICT,
  log_date         TEXT NOT NULL,
  academic_year_id INTEGER NOT NULL REFERENCES academic_years(id) ON DELETE RESTRICT,
  status           TEXT NOT NULL CHECK(status IN ('present','absent')),
  hours_credited   REAL DEFAULT 0,
  notes            TEXT,
  recorded_by      INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at       TEXT DEFAULT (datetime('now')),
  UNIQUE(teacher_id, log_date)
);
INSERT INTO teacher_daily_log_new SELECT * FROM teacher_daily_log;
DROP TABLE teacher_daily_log;
ALTER TABLE teacher_daily_log_new RENAME TO teacher_daily_log;
CREATE INDEX IF NOT EXISTS idx_daily_log_teacher
  ON teacher_daily_log(teacher_id, log_date);
```

### Salary entries — store calculated amount

```sql
ALTER TABLE salary_entries ADD COLUMN calculated_amount REAL DEFAULT 0;
ALTER TABLE salary_entries ADD COLUMN adjustment_reason TEXT;
```

### Timetable — Already exists (migration 008)

No changes needed. `timetable_entries` has everything required.

---

## 3. Core Logic

### 3A — Fee Amount Lookup

```javascript
function getFeeAmountForStudent(feeTypeId, levelId, db) {
  // Level-specific row takes priority over NULL (default) row
  const specific = db.prepare(
    'SELECT amount FROM fee_type_amounts WHERE fee_type_id = ? AND level_id = ?'
  ).get(feeTypeId, levelId)
  if (specific) return specific.amount

  const fallback = db.prepare(
    'SELECT amount FROM fee_type_amounts WHERE fee_type_id = ? AND level_id IS NULL'
  ).get(feeTypeId)
  return fallback?.amount ?? 0
}
```

### 3B — Student Fee Summary

Always computed dynamically. Never stored as a static total.

**Fee amounts are ALWAYS read live from `fee_type_amounts` at query time.
Never cached or stored on `student_fee_selections`. Price changes take
effect immediately for all future balance calculations regardless of
when the fee was set up or when the student enrolled.**

Example: Scolarité was 75,000 when student enrolled and paid 40,000.
School changes it to 80,000 in November. Student now owes 80,000 − 40,000 = 40,000.

```
Input: studentId, academicYearId, levelId
Output: { fees[], totalDue, totalPaid, remaining, status }

1. Get fee_types WHERE student has student_fee_selections.opted_in = 1
2. For each fee: amount = getFeeAmountForStudent(feeTypeId, levelId)  ← live lookup
3. For each fee: amount_paid = SUM(payment_allocations) for this student+fee
4. status: 'impaye' (0 paid) | 'partiel' (some paid) | 'solde' (all paid)
```

### 3C — Auto-Allocation

```
Input: paymentAmount (capped at total remaining), student's unpaid fees ordered by display_order
Output: allocation array [{fee_type_id, amount}]

For each fee (by display_order ASC):
  owed = fee.amount - fee.amount_paid
  allocated = min(remaining_payment, owed)
  remaining_payment -= allocated

No overpayment possible (input capped at total owed).
```

### 3D — Receipt Number Generation

```
Atomic UPSERT on receipt_sequences table.
Format: {PREFIX}-{YYYY}-{NNNN}
  REC-2026-0042  → tuition receipt
  SAL-2026-0012  → salary receipt
Sequential per academic year per prefix.
```

### 3E — Payment Recording Flow

```
1. Secretary enters amount_received (what parent handed over)
2. System computes: total_remaining = sum of all unpaid fees
3. amount_to_record = min(amount_received, total_remaining)
4. change_to_return = amount_received - amount_to_record
5. Display: "Montant à enregistrer: X" and "Monnaie à rendre: Y"
6. On confirm: create payment (amount = amount_to_record)
   + payment_allocations (auto-allocated by display_order)
   + ledger_transaction (income)
   + generate receipt number
```

### 3F — Salary Recording Flow

```
1. System computes:
   - H. prévues = weekly timetable hours × 4 (reference only, NOT used for pay)
   - H. réelles = SUM(hours_credited) from teacher_daily_log for the month
   - calculated_amount = H. réelles × teachers.hourly_rate
2. Present to accountant with editable amount field (pre-filled with calculated)
3. Accountant adjusts if needed, adds adjustment_reason if different
4. On confirm: create salary_entry with:
   - calculated_amount (system value)
   - amount (what accountant entered)
   - adjustment_reason (if amount ≠ calculated_amount)
   + ledger_transaction (expense)
   + generate receipt number
```

### 3G — Enrollment Auto-Fee

```
When student is enrolled (assigned to classroom):
  1. Get all fee_types WHERE is_mandatory = 1 AND academic_year_id = current
  2. INSERT INTO student_fee_selections (student_id, fee_type_id, academic_year_id, opted_in=1)
     ON CONFLICT DO NOTHING
  3. Update classroom.expected_tuition = SUM of mandatory fee amounts for that level
```

---

## 4. Pages

### 4A — Finance Dashboard (`/finance`)

**KPI cards:**
| Card | Value | Color |
|------|-------|-------|
| Total attendu | SUM of all student total_due | — |
| Total encaissé | SUM of all payments | Green |
| Reste à percevoir | attendu − encaissé | Orange if > 0 |
| Élèves impayés | COUNT students with 0 paid | Red if > 0 |
| Total dépenses | SUM expenses | Red |
| Salaires versés | SUM paid salary_entries | — |
| Solde net | encaissé − dépenses − salaires | Green/Red |

**Charts:** Collection progress bar, monthly revenue vs expenses bars.  
**Table:** Per-class collection rates.

**Navigation:**
```
[Paiements scolarité] [Salaires] [Dépenses]
[Mon abonnement] [Paramètres financiers]
```

**Status:** Backend ✅ | Frontend ✅ — needs salaires nav link

---

### 4B — Paiements Scolarité (`/finance/tuition`)

**Filters:** Classe, Statut (soldé/partiel/impayé), Search (nom/matricule)  
**Sortable by:** amount owed (most → least or least → most)

**Table:** Élève, Matricule, Classe, Total dû, Payé, Reste, Statut, [Voir/Payer]

**Status badges:**
- Soldé → green
- Partiel → amber
- Impayé → red (this IS the alert — no separate deadline logic)

**Action:** Click navigates to `/finance/tuition/:studentId` (dedicated page)

**Status:** Backend ✅ | Frontend ✅ — needs: sort by owed, navigate to page instead of modal

---

### 4C — Student Receipt Page (`/finance/tuition/:studentId`)

**Dedicated full page.** Replaces the current StudentPaymentModal.

**Header:**
```
← Retour
KOUASSI Jean-Marie
Matricule: A4P3-2026-0001 | Classe: 4ème A | Année: 2025-2026
```

**Fee breakdown table:**
```
Frais                    | Montant  | Payé    | Reste   | Statut
Inscription              | 15 000   | 15 000  | 0       | ✓ Soldé
Scolarité                | 75 000   | 40 000  | 35 000  | Partiel
Frais gestion scolaire   | 3 000    | 0       | 3 000   | Impayé
TOTAL                    | 93 000   | 55 000  | 38 000  |
```

**Optional fees section** (if optional fee_types exist):
```
Frais optionnels disponibles:
  ☐ Cantine — 12 000 XOF  [Ajouter]
  ☐ Transport — 8 000 XOF [Ajouter]
(Can remove optional fee only if 0 paid on it)
```

**Payment form (inline at bottom):**
```
Montant reçu:        [          ] XOF
→ Montant à enregistrer: 38 000 XOF
→ Monnaie à rendre:       0 XOF

Mode de paiement:  ○ Espèces ○ Mobile Money ○ Virement ○ Autre
Référence:         [          ] (optionnel)
Nom du payeur:     [          ] (optionnel)
Notes:             [          ] (optionnel)

Live allocation preview:
  Scolarité:              35 000 XOF → soldé
  Frais gestion scolaire:  3 000 XOF → soldé
  Total:                  38 000 XOF

[Enregistrer et imprimer]  [Enregistrer sans imprimer]
```

**Payment history:** Date, Montant, Mode, Référence, Reçu N°, [Voir reçu]

**Top-right action:** [Imprimer état des frais] (billing statement, no payment)

**Status:** Backend partly done | Frontend 🔲 (rebuild from modal to page)

---

### 4D — Receipt Print View (3 modes)

Opens `window.open()` → `window.print()`. Styled for thermal (80mm) and A4.

**Mode 1 — ÉTAT DES FRAIS** (billing statement, no payment)
```
[SCHOOL NAME] — [City]
ÉTAT DES FRAIS SCOLAIRES — 2025-2026
Élève: ... | Matricule: ... | Classe: ...
Fee table with amounts + already paid + remaining
Date + émis par
```

**Mode 2 — REÇU DE PAIEMENT** (after tuition payment)
```
[SCHOOL NAME] — [City]
REÇU DE PAIEMENT — N° REC-2026-0042
Date, student info
Line items from allocations
Total paid, method, payer/receiver
Remaining balance + status
```

**Mode 3 — REÇU DE SALAIRE** (after salary payment)
```
[SCHOOL NAME]
REÇU DE SALAIRE — N° SAL-2026-0012
Teacher info, month
Hours, rate, calculated, adjustment, net amount
Payment method, payer
Signature line
```

**Receipt number format:** `{PREFIX}-{YYYY}-{NNNN}` — sequential per year per prefix.

**Status:** Mode 2 basic ✅ | Mode 1 🔲 | Mode 3 basic ✅

---

### 4E — Salaires (`/finance/salaries`)

**Month selector:** ← / → navigation

**Summary cards:** Total à verser, Déjà versé, Reste à payer, Payés X / Total Y

**Table:**
```
Enseignant | Matricule | H. prévues | H. réelles | Calculé | Statut | Action
Agossou J. | A4P3-T-.. | 52h        | 48h        | 144 000 | Non payé| [Payer]
Kouassi M. | A4P3-T-.. | 60h        | 60h        | 180 000 | Payé ✓  | [Reçu]
```

- **H. prévues:** total weekly hours from `timetable_entries` × 4 (fixed multiplier). Reference figure only — not used in payroll.
- **H. réelles:** SUM of `hours_credited` from `teacher_daily_log` for the month. This is what payroll uses.
- **Calculé:** H. réelles × `teachers.hourly_rate`

**Pay modal:**
```
Enseignant:        M. Agossou Jean
Mois:              Septembre 2026
Heures prévues:    52h
Heures créditées:  48h
Taux horaire:      3 000 XOF/h
Montant calculé:   144 000 XOF

Montant à payer:   [144 000    ] XOF  ← editable, pre-filled with calculated
Motif ajustement:  [           ] (obligatoire si montant ≠ calculé)

Mode de paiement:  ○ Espèces ○ Mobile Money ○ Virement ○ Autre
Référence:         [          ]
Nom du payeur:     [          ]

[Enregistrer et imprimer le reçu]
```

**New endpoint:** `GET /api/finance/salaries/preview/:teacherId?pay_period=YYYY-MM`

**Status:** Backend ✅ | Frontend ✅ — needs: preview endpoint, hours columns, editable amount, adjustment reason, summary cards

---

### 4F — Dépenses (`/finance/expenses`)

**Month filter tabs** (computed from data):
```
Tous | Sep | Oct | Nov | Déc | Jan | ...
(● = has data, greyed = no data)
```

**Category filter, summary cards per category, expense table, add modal.**

**Status:** Backend ✅ | Frontend ✅ — needs month filter tabs + /months endpoint

---

### 4G — Paramètres Financiers (`/finance/settings`)

**Tab 1 — Frais scolaires**

Fee list:
```
Nom                    | Portée | Obligatoire | Ordre | Actions
Inscription            | Tous   | Oui         | 1     | [✏] [×]
Scolarité              | Niveau | Oui         | 2     | [✏] [×]
Frais gestion scolaire | Tous   | Oui (sys)   | 99    | [✏ label only]
Cantine                | Tous   | Non         | 4     | [✏] [×]
```

Add/Edit fee form:
```
Nom:           [                    ]
Obligatoire:   ● Oui  ○ Non
Ordre:         [  ]

Montants par niveau:
┌──────────────┬──────────┐
│ Tous niveaux │ [60 000] │  ← default fallback
├──────────────┼──────────┤
│ 6ème         │ [75 000] │  ← level-specific override
│ 5ème         │ [75 000] │
│ ...          │          │
└──────────────┴──────────┘
(Only show active levels. Leave blank = use default.)
```

System fee (is_system = 1): amount locked, label editable, cannot delete.

**Tab 2 — Catégories dépenses** (unchanged)

**Status:** Backend needs rework | Frontend 🔲

---

### 4H — Mon Abonnement (`/finance/subscription`)

**Access:** ALL roles, ALL tiers. Accessible from expired license lock screen.

**License info bar:** Plan, Tarif/élève/an, Expiration, Montant déjà versé

**Table 1 — Effectif déclaré:**
```
Effectif déclaré:          400
Coût total:                600 000 XOF
75% avant 1ère échéance:  450 000 XOF (date)
Reste au renouvellement:   150 000 XOF
```

**Table 2 — Effectif actuel:** same structure with live student count.

**Footer:** Montant déjà versé, reste à régulariser, frais d'installation status, reconciliation rule, contact info.

**Status:** Backend ✅ | Frontend ✅ — needs polish (amount_paid, installation fee, contact)

---

### 4I — Emploi du Temps (`/timetable`)

Enhance existing. Migration 008 + routes already exist.

**Tab 1 — Par classe:** Classroom dropdown → weekly grid, assign/edit/clear slots, conflict detection.  
**Tab 2 — Par enseignant:** Teacher dropdown → weekly grid showing all their assignments, total hours summary.  
**Print button** on both tabs.

**Status:** Backend ✅ | Frontend partly done — needs teacher view tab + print

---

### 4J — Présences Enseignants (`/teachers/attendance`)

**Access:** PRO only. Secretary records, accountant views.

**Date selector:** ← / → navigation (no future dates, 30 days back max)

**Attendance grid:**
```
[Tous présents]                          [Enregistrer]

Enseignant     | H. prévues | Statut       | H. créditées | Notes
Agossou Jean   | 3h         | ● Présent ▼  | [3h       ]  | [          ]
Kouassi Marie  | 4h         | ○ Absent  ▼  | 0h           | [          ]
Sabi Emmanuel  | 0h         | — Aucun cours| —            | —
```

**Status behavior:**
- **Présent** → `hours_credited` defaults to scheduled hours, editable (for partial attendance)
- **Absent** → `hours_credited = 0`
- Teachers with no slots → "Aucun cours", greyed out, no action

**"Ajouter des heures" action:**
- Button on attendance page to credit any teacher with extra hours + note for any date
- Used for substitute teachers: "M. Agossou a remplacé M. Kouassi — +3h"
- Creates/updates `teacher_daily_log` entry

**Month summary tab:**
```
Enseignant | H. prévues | H. réelles | Taux | [Aller aux salaires →]
```

**API endpoints:**
```
GET  /api/attendance?date=YYYY-MM-DD&academic_year_id=
POST /api/attendance  { entries: [{ teacher_id, log_date, status, hours_credited, notes }] }
GET  /api/attendance/monthly-summary?pay_period=YYYY-MM&academic_year_id=
```

**Status:** Backend 🔲 | Frontend 🔲 (table exists from migration 001)

---

## 5. Enrollment Integration

When a student is enrolled (assigned to a classroom), the system:

1. Auto-inserts `student_fee_selections` for ALL mandatory fee_types (opted_in = 1)
2. Shows optional fees for secretary to toggle per parent's choice
3. Creates entries in same transaction as enrollment

**Optional fee removal rule:**
- Can remove if `SUM(payment_allocations.amount) = 0` for that fee
- Cannot remove if any payment allocated → "Ce frais a déjà reçu un paiement."

**Both paths:** Fee selection appears during enrollment AND can be modified on `/finance/tuition/:studentId`.

---

## 6. Onboarding Integration

**Step 12 — Fee Structures (reworked):**

- Skippable (school can set up later in /finance/settings)
- PRO only (STANDARD auto-skips)
- Add fee types: name, is_mandatory, amounts per level
- System fee auto-created:

```sql
INSERT INTO fee_types
  (academic_year_id, name, is_mandatory, is_system, is_active, display_order)
VALUES (?, 'Frais de gestion scolaire', 1, 1, 1, 99)

INSERT INTO fee_type_amounts (fee_type_id, level_id, amount)
VALUES (last_insert_id, NULL, license_state.rate_per_student)
```

- Amount from `license_state.rate_per_student`, locked
- Label editable, amount and deletion blocked
- `display_order = 99` → last on receipts

---

## 7. Report Card Integration

When generating a report card, if the student has unpaid fees (`remaining > 0`):

```
⚠ Cet élève a un solde impayé de 38 000 XOF
[Imprimer quand même]  [Annuler]
```

- Non-blocking amber banner. Secretary can always choose to print.
- Payment status computed live (same `getStudentFeeSummary` as tuition page).
- This is information, not a block — schools handle unpaid students differently.

---

## 8. API Endpoints

### Dashboard
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/dashboard` | KPIs, charts, class collection rates |

### Fee Types
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/fee-types` | Fee types with level amounts |
| POST | `/api/finance/fee-types` | Create `{ name, is_mandatory, display_order, amounts: [{level_id, amount}] }` |
| PUT | `/api/finance/fee-types/:id` | Update (amount blocked if is_system) |
| DELETE | `/api/finance/fee-types/:id` | Soft-deactivate/hard delete (blocked if is_system) |

### Tuition
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/tuition?classroom_id=&status=&search=&sort=` | Student list with fee summary |
| GET | `/api/finance/tuition/:studentId` | Full fee breakdown + payment history |
| POST | `/api/finance/tuition/:studentId/pay` | Record payment `{ amount_received, payment_method, payer_name, reference, notes }` |
| GET | `/api/finance/tuition/:studentId/fee-selections` | Mandatory (locked) + optional toggle state |
| PUT | `/api/finance/tuition/:studentId/fee-selections` | Toggle optional `{ fee_type_id, opted_in }` (blocked if paid) |
| GET | `/api/finance/receipt/statement/:studentId` | État des frais print data |

### Salaries
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/salaries?pay_period=YYYY-MM` | Teacher list with hours + status |
| GET | `/api/finance/salaries/preview/:teacherId?pay_period=YYYY-MM` | Hours + calculated amount |
| POST | `/api/finance/salaries/pay` | Record `{ teacher_id, pay_period, amount, calculated_amount, adjustment_reason, payment_method, payer_name, reference }` |

### Expenses
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/expenses?month=&category_id=` | Expense list + totals |
| GET | `/api/finance/expenses/months` | Distinct months with data + totals |
| POST | `/api/finance/expenses` | Record expense |
| DELETE | `/api/finance/expenses/:id` | Soft-delete |

### Expense Categories
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/expense-categories` | Active categories |
| POST | `/api/finance/expense-categories` | Create |
| DELETE | `/api/finance/expense-categories/:id` | Delete (blocked if is_system) |

### Receipts
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/receipt/payment/:id` | Tuition receipt print data |
| GET | `/api/finance/receipt/salary/:id` | Salary receipt print data |

### Subscription
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/finance/subscription` | License info — no PRO gate |

### Attendance
| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/attendance?date=&academic_year_id=` | Teachers + scheduled hours + log |
| POST | `/api/attendance` | UPSERT `{ entries: [{teacher_id, log_date, status, hours_credited, notes}] }` |
| POST | `/api/attendance/add-hours` | Credit extra hours `{ teacher_id, log_date, hours, notes }` |
| GET | `/api/attendance/monthly-summary?pay_period=&academic_year_id=` | Per-teacher monthly summary |

---

## 9. What This Module Does NOT Do

| Thing | Reason |
|-------|--------|
| Process ScolaDesk subscription payment | School pays ScolaDesk directly, records as expense |
| SMS/notifications for unpaid parents | Future feature |
| Late payment penalties / interest | Not V1 |
| Excel export | Future feature |
| Auto-post salary without confirmation | Accountant always confirms |
| Online payment processing | Secretary records manually |
| Bilan financier annuel | Future feature (before V1 launch) |

---

## 10. Build Status

| Feature | Backend | Frontend | Status |
|---------|---------|----------|--------|
| Migration 009 rework | 🔲 | — | fee_type_amounts, student_fee_selections, receipt_sequences, hourly_rate on teachers, daily_log constraint |
| Finance Dashboard | ✅ | ✅ | Needs salaires nav link |
| Tuition list | ✅ | ✅ | Needs sort-by-owed, navigate to page |
| Student receipt page | 🔲 | 🔲 | Rebuild from modal to dedicated page |
| Receipt — État des frais | 🔲 | 🔲 | Not started |
| Receipt — Reçu paiement | ✅ | ✅ | Basic done, needs polish |
| Receipt — Reçu salaire | ✅ | ✅ | Basic done, needs polish |
| Salaries | ✅ | ✅ | Needs preview, hours columns, editable amount |
| Expenses | ✅ | ✅ | Needs month filter tabs |
| Mon Abonnement | ✅ | ✅ | Needs polish |
| Finance Settings — fees | 🔲 | 🔲 | Full rebuild for level amounts + mandatory |
| Finance Settings — categories | ✅ | ✅ | Done |
| Enrollment fee selection | 🔲 | 🔲 | Auto-create mandatory + optional toggle |
| Onboarding Step 12 rework | 🔲 | 🔲 | Rewire for fee_types |
| System fee auto-creation | 🔲 | 🔲 | At onboarding |
| Timetable — teacher view | 🔲 | 🔲 | Add tab to existing page |
| Timetable — print | 🔲 | 🔲 | Print button |
| Teacher Attendance | 🔲 | 🔲 | Full build (table exists) |
| Attendance — add hours | 🔲 | 🔲 | Substitute teacher flow |
| Attendance — monthly summary | 🔲 | 🔲 | Summary tab |
| Salary preview endpoint | 🔲 | — | Hours + calculated amount |
| expected_tuition auto-update | 🔲 | — | Hook into fee changes |
| Report card payment banner | 🔲 | 🔲 | Amber warning if student has unpaid fees |

---

## 11. Priority Build Order

```
 1. Migration 009 rework
 2. Finance Settings — fee types with level amounts
 3. Onboarding Step 12 rework + system fee auto-creation
 4. Enrollment fee selection (auto-create mandatory + optional toggle)
 5. Student receipt page (rebuild from modal)
 6. Payment flow (amount received → change → cap → allocations)
 7. Receipt print — all 3 modes
 8. Teacher attendance page + API
 9. Attendance add-hours action (substitutes)
10. Salary preview endpoint + pay modal rework
11. Expense month filter tabs
12. Timetable teacher view + print
13. Mon Abonnement polish
14. Tuition list sort-by-owed + red badges
```

---

*Version: 3.0 — All decisions resolved via interview*  
*Read alongside: phases_completion.md, CONTEXT.md*
