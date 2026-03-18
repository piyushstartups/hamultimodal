# Ops Management System - Product Requirements Document

## Overview
Clean, minimal, web-based internal operations system for managing daily deployments, shifts, and inventory.

**Core Principles:**
1. Every action takes under 10 seconds
2. Users don't think — only perform simple actions
3. All tracking comes from Events (single source of truth)
4. Show users only what is relevant to them
5. Clear separation of responsibilities between pages

## User Roles

| Role | Access |
|------|--------|
| admin | Full control: Inventory (CRUD), Deployments (planning), Admin Panel (users/bnbs/kits). Does NOT see Actions page. |
| deployment_manager | Can: View deployments assigned to them, perform actions (shift logging), view inventory. Cannot: Edit inventory, access Admin Panel |

## Page Responsibilities (Strict Separation)

### Inventory Page
- **Purpose:** PRIMARY place for all inventory management
- **Admin Can:** Add/Edit/Delete items, update status (active/damaged/lost/repair)
- **Manager Can:** View items only (no edit/delete buttons visible)

### Deployments Page  
- **Purpose:** PLANNING ONLY - date-based assignment
- **Admin Can:** Create/Edit/Delete deployments, assign BnBs/Kits/Managers
- **Manager Can:** View their assigned deployments only
- **NOT included:** No inventory controls, no BnB management

### Admin Panel
- **Purpose:** System CONFIGURATION only
- **Contains:** Users, BnBs, Kits management tabs
- **NOT included:** Items (managed in Inventory), Deployments (managed in Deployments page)

### Actions Page (Manager Only)
- **Purpose:** Log shifts and events
- **Contains:** Start Shift, End Shift, Transfer Item, Report Damage, Request Item

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
- current_kit (optional)

### Deployments
- date (YYYY-MM-DD)
- bnb
- shift (morning / evening)
- assigned_kits (array)
- **deployment_managers (array)** - Multiple managers per deployment
- assigned_users (array)

### Events
- event_type (shift_start, shift_end, transfer, damage, activity)
- user
- kit
- item (optional)
- to_kit (for transfers)
- ssd_used (required for shift_end)
- activity_type (required for shift_end)
- hours_logged (optional)
- notes
- timestamp

### Requests
- requested_by
- item
- quantity
- status (pending / fulfilled / rejected)

## API Endpoints

### Auth
- `POST /api/auth/login`
- `GET /api/auth/me`

### Users, BnBs, Kits
- `GET/POST/DELETE /api/users`
- `GET/POST/DELETE /api/bnbs`
- `GET/POST/DELETE /api/kits`

### Items (Full CRUD)
- `GET /api/items`
- `POST /api/items` (Admin only)
- `PUT /api/items/{item_name}` (Admin only) - Update item
- `DELETE /api/items/{item_name}` (Admin only)

### Deployments (Multiple Managers)
- `GET /api/deployments` (Managers filtered to their assignments)
- `POST /api/deployments` (Admin only, requires deployment_managers array)
- `PUT /api/deployments/{id}` (Admin only)
- `DELETE /api/deployments/{id}` (Admin only)

### Events & Requests
- `GET/POST /api/events`
- `GET/POST/PUT /api/requests`

### Dashboard
- `GET /api/dashboard/live` - Simplified: total_hours, total_shifts, per_bnb hours

## Test Credentials
- **Admin**: `Admin` / `admin123`
- **Manager**: `TestManager1` / `test123`

## Completed Features (2026-03-18)
- [x] Admin full CRUD on Inventory page (Add/Edit/Delete items)
- [x] Admin Panel limited to Users, BnBs, Kits only
- [x] Deployments page strictly for planning (no BnB management)
- [x] Multiple deployment managers per deployment
- [x] Role-based view filtering (managers see only their deployments)
- [x] Strict permissions (managers can view inventory but not edit)
- [x] Mandatory shift logging fields (SSD_used, activity_type)
- [x] Simplified Live Dashboard

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
    └── src/
        ├── components/ui/
        ├── contexts/AuthContext.js
        ├── lib/api.js
        └── pages/
            ├── Actions.js         # Manager only - shift logging
            ├── AdminPanel.js      # Admin only - Users/BnBs/Kits
            ├── Dashboard.js       # Role-based navigation
            ├── Deployments.js     # Planning with multiple managers
            ├── Inventory.js       # Full CRUD for Admin
            ├── LiveDashboard.js   # Simplified stats
            ├── Login.js
            ├── MyDeployments.js
            └── Requests.js
```

## Last Updated
2026-03-18 - Clear separation of responsibilities, multiple deployment managers, Admin inventory CRUD
