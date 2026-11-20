# CivicPlexus — Municipal HRIS

A hire-to-retire human resources information system purpose-built for city and county government.

Created by the **City of McKinney**.

## Overview

CivicPlexus covers the full employee lifecycle in one system:

- **Recruit & Hire** — Requisitions, job postings, applications, interviews, AI screening, and offers
- **Onboard & Provision** — Worker-type playbooks, equipment, credentials, and day-zero routing
- **Core HR & Records** — Employee profiles, positions, personnel action forms (PAF), org chart, and document management
- **Pay & Benefits** — Compensation grades, review cycles, market data, and benefits administration
- **Perform & Develop** — Performance reviews, calibration, goals, 1-on-1 templates, and training
- **Comply & Govern** — Policy campaigns, FLSA/EEO tracking, TCOLE, TMRS, grievances, and offboarding
- **Time & Leave** — Clock in/out, overtime/comp-time calculations, exempt schedules, and public-safety shift rotations (including FLSA 207(k) support)
- **ID Badges** — Photo capture and CR80 badge generation with public QR verification

## Tech Stack

- **Frontend:** React 19, TanStack Start, TanStack Router, TanStack Query, Tailwind CSS, shadcn/ui
- **Backend:** Server functions via TanStack Start, Lovable Cloud database
- **PDF / Images:** pdf-lib, html-to-image, bwip-js
- **Testing:** Vitest

## Getting Started

```bash
# Install dependencies
bun install

# Run the dev server
bun run dev

# Run tests
bun run test
```

## License

License: MIT, see [LICENSE](LICENSE).

Copyright (c) 2026 Spencer Smith
