# OptiSched Frontend — Transfer / Context (for Claude Code)

> Hand-off context so a new Claude Code session can continue without re-deriving
> everything. Read this first, then `README.md` (has the full Backend API Contract).

---

## 1. Snapshot

- **Stack:** React 18 + Vite 6 + TypeScript, React Router 7, Tailwind 4 (CSS vars),
  lucide-react icons. Inline `style={{}}` styling is the norm (not utility classes).
- **Purpose:** University course-scheduling frontend — admin/secretary dashboard,
  academic (instructor) view, course catalog, classroom reservations, weekly grid.
- **Backend:** separate repo `KNCn23/OptiSchedule` (Python + OR-Tools CP-SAT +
  PostgreSQL, currently a CLI/Excel tool — needs a REST API wrapper). Frontend
  talks to it through `src/app/services/` + `apiClient`.

## 2. CURRENT LOCAL STATE (important)

- This working folder is the **DEMO build**. `demoData.ts` is present and
  `DEMO_MODE` is wired.
- **No `.env` → `DEMO_MODE` is ON → `npm run dev` runs fully offline with demo data.**
- `npx tsc --noEmit` is **clean (0 errors)**.
- A separate **clean (no-demo) build** was zipped for the backend dev
  (`optisched-frontend-clean.zip`, produced outside this folder). Do NOT confuse
  the two: this folder = demo; the zip = backend-ready, demo removed.

### Demo logins (DEMO_MODE only)
| username | password | role → portal |
|---|---|---|
| `dekan` | `dekan` | dept_chair → admin portal |
| `bilsek` | `bil` | secretary → admin (BİL dept) |
| `admin` | `admin` | admin → admin portal |
| `esumer` | `esumer` | instructor → academic portal |
| other lecturers | username = first-initial+lastname, pwd = username | instructor |

After login click **“Algoritmayı Çalıştır”** to populate the weekly grid.
If anything looks stale, hard-refresh and/or clear `localStorage`
(`optisched-user`, `optisched-token`, `optisched-dark`).

### Connect a real backend (turns demo OFF)
Create `.env`:
```
VITE_API_BASE_URL=http://localhost:8000/api
```
`DEMO_MODE = !VITE_API_BASE_URL`, so any value here disables demo and routes all
calls to the real API.

## 3. What has been done (this project's recent history)

1. **Light theme → Başkent BUOBS / AdminLTE blue** (`#3C8DBC` primary, aqua accent,
   `#ECF0F5` page bg, etc.). Implemented via CSS variables in `src/styles/theme.css`
   (`:root` = light/BUOBS, `.dark` = original violet/indigo, **untouched**).
   `COURSE_COLORS` light palette retuned to AdminLTE state colors. ~17 component
   files had inline `darkMode ? 'x' : 'y'` light-side literals replaced with
   `var(--brand-*)`. **Dark mode was deliberately left as-is.**
2. **Removed all hand-made mock data** for backend handoff:
   deleted `mockAccounts.ts`, `algorithmData.ts`, `courseCatalogMockData.ts`,
   `roomReservationMockData.ts`, `modules/schedulerEngine.ts`. Stripped
   `LECTURERS/DEPARTMENTS/CLASS_LEVELS` from `mockData.ts` and `ELECTIVE_SUBSTITUTES`
   from `CourseManagementModal`.
3. **Added a service layer** (`src/app/services/`): `apiClient` (fetch + Bearer
   token), `authService`, `schedulerService`, `lookupService`, `reservationService`,
   `courseService`. Contexts (`AuthContext`, `SchedulerContext`) call services
   (async login, loads inputs on mount, async run).
4. **Aligned all types to the backend PostgreSQL schema** (`5may_db_nobugs.sql`):
   - `src/app/types/backendTypes.ts` = canonical 1:1 DB mirror.
   - `DbCourse` ↔ `Courses` (course_code, course_name, course_semester, is_service,
     weekly_hours, t_hour, l_hour, +joined department_id/department_name).
   - `AlgorithmInput` ↔ `Courses`+`Sections` (course_code, course_name,
     weekly_hours, course_semester, section_count, instructor_full_name, …).
   - `Account` ↔ `Users`+`Roles` (user_id, username, full_name, role, department_id,
     department_name). **Roles:** `admin | dept_chair | instructor | secretary | viewer`
     (old dean→dept_chair, department_secretary→secretary, academic→instructor).
   - All consumers updated (CourseDataTable, CourseCatalog, CourseManagementModal,
     Header, AcademicView, AdminDashboard, DynamicFilters, WeeklyGrid, etc.).
5. **DEMO_MODE** added so the frontend is usable without a backend (this folder).
6. **README** has a full “Backend API Contract” + “Backend Developer START HERE”.

## 4. Architecture map

```
src/app/
  pages/        Landing, AdminDashboard, AcademicView, CourseCatalog,
                ClassroomReservation, Root
  components/   Header, WeeklyGrid (central grid — do not break layout),
                DynamicFilters, StatusPanel, Course{Detail,Management}Modal,
                CourseDataTable, LoginScreen, reservation/*
  context/      AppProvider → Theme → Auth → UI → Scheduler (order matters!);
                useApp() aggregates all four
  services/     apiClient + auth/scheduler/course/lookup/reservation (+ demoData)
  types/        backendTypes (DB mirror), authTypes, schedulerTypes, courseTypes,
                reservationTypes
  data/         mockData.ts (now only Course/Lecturer types, DAYS, DAY_LABELS,
                COURSE_COLORS — no mock records)
  hooks/        useCourseData, useCourseFilters
  i18n/         tr/en translations
  styles/       theme.css (brand CSS variables), tailwind.css, etc.
```

## 5. Conventions & rules (MUST follow)

- **Theming is via CSS variables** in `theme.css` (`--brand-*`, `--bg-*`,
  `--text-*`, `--border-*`). Use `var(--…)` in inline styles, not new hex literals.
  Light = BUOBS blue; **never change dark mode** unless asked.
- **Don't break `WeeklyGrid`** layout constants (`SLOT_HEIGHT`, `START_HOUR=9`,
  `END_HOUR=17`, overlap union-find). It's the central scheduling view.
- **Provider order** in `AppProvider` is load-bearing: Theme → Auth → UI → Scheduler.
- **Keep types as the backend contract.** If the backend changes a field, update
  `backendTypes.ts` (+ the derived type) and its consumers together.
- **Protected files — do not touch/delete:** `cloudflared.exe`, `*_tunnel.log`,
  `tunnel_output.txt`, `hesap_listesi.txt`, `algo_full_data.txt`, temp/`analyze_ui.cjs`,
  and `src/app/components/ui/*` (if present). Only touch `package-lock.json` on real
  install/uninstall.
- **No backend → empty state is expected** (login fails, lists empty). That's not
  a bug; it means demo is off and no API is connected.

## 6. Known gotchas

- **Stale `localStorage` account** can crash the app after the Account shape
  changed. `AuthContext` now validates the cached shape and ignores bad ones; if you
  see weird auth behavior, clear `optisched-user`.
- **Online evening slots gap:** backend `config.json` has online slots 18:00–22:00,
  but `WeeklyGrid` only renders 09:00–17:00. Online courses won't show until the
  grid is extended. (Decision pending.)
- **Reservations** still use a temporary `localStorage` store in
  `utils/reservationUtils.ts` (`ROOMS` is empty without demo). Move to
  `reservationService` / `lookupService` when those endpoints exist.
- **Repo cruft:** `cloudflared.exe` (~65MB) and assorted logs/temp files are tracked
  in git in this working folder. Consider `.gitignore` + `git rm --cached` for a
  clean public repo (the handoff zip already excludes them).

## 7. Backend API Contract

See `README.md` → “Backend API Contract”. Endpoints: `/auth/*`, `/scheduler/*`,
`/courses`, `/departments|lecturers|class-levels|blocks|rooms`, `/reservations`,
`/rooms/availability`. The one non-trivial mapping: `POST /scheduler/run` must
return the solver's `Schedules` rows mapped into the `Course` render model
(join Sections→Courses→Instructors→Classrooms; `day_of_week`→`Mon..Fri`;
times→`HH:MM`).

## 8. Recommended next steps (prioritized)

1. **Backend integration** (friend): wrap the OR-Tools solver in FastAPI/Flask to
   serve the contract; then connect via `.env` and verify end-to-end.
2. **Decide demo strategy for the repo:** keep demo behind an explicit
   `VITE_DEMO_MODE=true` flag (so the default clone is clean), or keep two builds.
3. **Extend WeeklyGrid** to cover evening/online slots (18:00–22:00) if online
   courses are used.
4. **Move reservations to the API** (drop the localStorage store).
5. **Repo hygiene:** remove tracked binaries/logs; add `.env.example` (done in the
   clean zip); add basic tests (none exist) and a CI `tsc --noEmit` check.
6. **Optional:** add a `student` role/view (original brief mentioned students should
   not see admin details — no student role exists yet).

---

*Last verified: `npx tsc --noEmit` clean; demo runs offline; clean no-demo build
zipped for the backend developer.*
