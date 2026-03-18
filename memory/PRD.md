# Ops Management System - Product Requirements Document

## Overview
Clean, minimal, web-based internal operations system for managing daily deployments, shifts, and inventory.

**Core Principles:**
1. Every action takes under 10 seconds
2. Users don't think — only perform simple actions
3. All tracking comes from Events (single source of truth)
4. Show users only what is relevant to them

## User Roles

| Role | Access |
|------|--------|
| admin | Full access - creates deployments, manages users/kits/items/BnBs, sees all dashboards. Does NOT see Actions page. |
| deployment_manager | Sees only assigned BnBs, logs shifts, transfers, reports damage, creates requests. Does NOT see Admin Panel. |

## Data Model

### Users
- name
- role (admin / deployment_manager)

### BnBs
- name
- status (active / inactive)

### Kits
- kit_id
- status (active / maintenance)

### Items
- item_name (UNIQUE)
- tracking_type (individual / quantity)
- status (active / damaged / lost / repair)
- current_kit (for individual items)

### Deployments
- date (YYYY-MM-DD)
- bnb
- shift (morning / evening)
- assigned_kits
- assigned_users
- deployment_manager

### Events (Core Table)
- event_type (shift_start, shift_end, transfer, damage, activity)
- user
- kit
- item (optional)
- to_kit (for transfers)
- quantity
- ssd_used (required for shift_end)
- activity_type (required for shift_end: cooking, cleaning, organizing, outdoor, other)
- hours_logged (optional, for shift_end)
- notes
- timestamp

### Requests
- requested_by
- item
- quantity
- status (pending / fulfilled / rejected)

## UI Structure

### Pages
1. **Deployments** - Calendar-based view for planning & viewing daily assignments (BnB, Manager, Kits, Shift). BnB management integrated.
2. **Actions** - (Deployment Manager only) 5 buttons: Start Shift, End Shift, Transfer Item, Report Damage, Request Item
3. **Live Dashboard** - Today's stats (Total Hours Logged, Shifts Completed, Hours per BnB)
4. **Inventory** - View items with status/location
5. **Requests** - List with status update
6. **Admin Panel** - (Admin only) Manage users, kits, items, BnBs

### Role-Based Navigation
- **Admin**: Deployments, Live Dashboard, Inventory, Requests, Admin Panel
- **Deployment Manager**: Deployments, Actions, Live Dashboard, Inventory, Requests

## Automations
1. When `event_type = transfer`: Update `item.current_kit = to_kit` (individual items)
2. When `event_type = damage`: Update `item.status = damaged`

## API Endpoints

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`

### CRUD
- `GET/POST/DELETE /api/users`
- `GET/POST/DELETE /api/bnbs`
- `GET/POST/DELETE /api/kits`
- `GET/POST/DELETE /api/items` (duplicate item_name prevention)
- `GET/POST/PUT/DELETE /api/deployments`
- `GET/POST /api/events`
- `GET/POST/PUT /api/requests`

### Dashboard
- `GET /api/dashboard/live` - Returns: {date, total_hours, total_shifts, per_bnb: [{bnb, shift, hours_logged}], recent_events}

## Test Credentials
- **Admin**: `Admin` / `admin123`

## Completed Features (2026-03-18)
- [x] Complete application rebuild with simplified architecture
- [x] Two-role system (admin, deployment_manager)
- [x] Card-based dashboard navigation with role-based views
- [x] Calendar-based Deployments page with day selection
- [x] BnB management integrated into Deployments page
- [x] Mandatory shift logging fields (SSD_used, activity_type) for End Shift
- [x] Simplified Live Dashboard (Total Hours, Shifts Completed, Hours per BnB)
- [x] Duplicate item prevention with unique index

## Upcoming Tasks
- None specified

## Architecture
```
/app
├── backend/
│   ├── .env
│   ├── requirements.txt
│   └── server.py
└── frontend/
    ├── .env
    ├── package.json
    ├── public/
    │   └── index.html
    └── src/
        ├── components/ui/
        ├── contexts/AuthContext.js
        ├── lib/api.js
        └── pages/
            ├── Actions.js
            ├── AdminPanel.js
            ├── Dashboard.js
            ├── Deployments.js
            ├── Inventory.js
            ├── LiveDashboard.js
            ├── Login.js
            ├── MyDeployments.js
            └── Requests.js
```

## Last Updated
2026-03-18 - Calendar-based deployments, role-based UI, mandatory shift fields, simplified dashboard
