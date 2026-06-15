# OptiSched Frontend

OptiSched is the React frontend for course scheduling, academic schedule
viewing, course management, and classroom reservations.

## Requirements

- Node.js 20 or newer
- npm

## Setup

```bash
npm install
cp .env.example .env
npm run dev
```

The application runs in demo mode when `VITE_API_BASE_URL` is not set. Set the
variable in `.env` to connect it to a backend:

```env
VITE_API_BASE_URL=http://localhost:8000/api
```

## Commands

```bash
npm run dev        # Start the Vite development server
npm run typecheck  # Run the TypeScript compiler without emitting files
npm run build      # Create a production build
npm run check      # Run type checking and a production build
```

## Project Structure

```text
src/
├── app/
│   ├── context/          # Global auth, theme, UI, and scheduler state
│   ├── data/             # Shared scheduling data and constants
│   ├── features/
│   │   ├── auth/         # Login UI and authentication types
│   │   ├── courses/      # Course catalog and management
│   │   ├── reservations/ # Classroom reservation feature
│   │   └── scheduler/    # Schedule generation, display, and exports
│   ├── i18n/             # Turkish and English translations
│   ├── pages/            # Route-level page components
│   ├── services/         # Backend API and demo-mode adapters
│   ├── shared/           # Components shared by multiple features
│   ├── types/            # Cross-feature backend types
│   ├── App.tsx
│   └── routes.ts
├── styles/               # Application-wide styles and theme
└── main.tsx              # Browser entry point
```

Feature-specific components, hooks, types, styles, data, and utilities stay
inside their feature folder. Cross-feature imports use the `@/` alias, which
maps to `src/`.

Additional project material is separated from application source:

- `docs/`: handoff notes, analysis, and technical plans
- `artifacts/legacy/`: temporary or generated files retained for reference
- `tools/`: standalone development binaries

## Routes

| Path | Screen |
| --- | --- |
| `/` | Landing page |
| `/admin` | Scheduling administration |
| `/academic` | Academic schedule view |
| `/courses` | Course catalog |
| `/reservations` | Classroom reservations |

## Backend Integration

All HTTP calls go through `src/app/services/apiClient.ts`. It adds the configured
API base URL and the bearer token stored under `optisched-token`.

The service modules are grouped by backend capability:

- `authService.ts`
- `courseService.ts`
- `lookupService.ts`
- `reservationService.ts`
- `schedulerService.ts`
- `scheduleStore.ts`

Demo data lives in `demoData.ts` and is used only when
`VITE_API_BASE_URL` is absent.

## Notes

Historical implementation notes are available in `docs/`. Some of those files
describe earlier folder layouts and should be treated as reference material,
not as the current source-of-truth. This README and the current `src/` tree
define the active structure.
