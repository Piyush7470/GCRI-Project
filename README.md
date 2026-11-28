# GRAICE Assessment Platform

Built with **Next.js 15 (App Router)**, **TypeScript**, and **MongoDB**.

## Overview
The GRAICE Assessment Platform digitizes the GCRAI/GRAICE Responsible AI governance assessment methodology, replacing manual Excel workbook and Word-based questionnaire processes with a secure, persistent, database-backed application.

## Documentation

- **[End-to-end guide (users, roles, relationships, UAT)](docs/E2E_APPLICATION_GUIDE.md)** — use for demos, QA, and deployment sign-off.
- **[Client demo logins](backend/CLIENT_DEMO_ACCESS.md)** — seeded Super Admin, Admin, and Assessor accounts.

## Key Features
- **7 GRAICE Pillars**: Full evaluation engine across Governance, Risk, Accountability, Integrity, Compliance, Ethics & Safety.
- **Light & Full Assessments**: Flexible evaluation paths for rapid triage or comprehensive audits.
- **Automated Maturity Scoring**: Deterministic scoring and level classification (Initial, Emerging, Established, Advanced).
- **Role-Based Access Control (RBAC)**: Enforced boundaries across Admin, Assessor, and upcoming Membership Approver roles.
- **Multi-Factor Authentication (MFA)**: TOTP-based verification with recovery keys.
- **Verification Engine**: Automated domain and company data validation.

## Project Structure
- `backend/`: Standalone Express + TypeScript + MongoDB API service (Port 5000)
- `frontend/`: Next.js (App Router) + TypeScript user interface (Port 3000)

## Getting Started

### Recommended — run both (frontend + backend)

From the repo root:

```bash
npm run install:all
cp backend/.env.example backend/.env   # set MONGODB_URI, JWT_SECRET, PORT, etc.
npm run dev
```

Windows: you can also run `.\start-dev.ps1` (installs deps if needed, then starts both).

`npm run dev` will:

- Read `PORT` from `backend/.env` and sync `frontend/.env.local` (`NEXT_PUBLIC_API_URL`)
- Free ports **3000** and your backend port if something is already listening
- Start backend (tsx) and frontend (Next.js **webpack** with extra heap — avoids Turbopack/PostCSS crashes on Windows)

- Frontend: `http://localhost:3000`
- Backend health: `http://localhost:<PORT>/api/v1/health` (default port **5000** if unset)

### Manual — separate terminals

#### 1. Backend Service
```bash
cd backend
npm install
cp .env.example .env
npm run dev
```

#### 2. Frontend Application
```bash
cd frontend
npm install
cp .env.example .env.local
# Set NEXT_PUBLIC_API_URL to match backend PORT (e.g. http://localhost:5090/api/v1)
npm run dev
```

