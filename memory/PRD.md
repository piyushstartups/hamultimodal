# Ops Management System - Product Requirements Document

## Overview
Clean, minimal, web-based internal operations system for managing daily deployments, shifts, and inventory with **automatic time tracking**.

**Core Principles:**
1. Every action takes under 10 seconds
2. Users don't think — only perform simple actions
3. All tracking comes from Events (single source of truth)
4. Show users only what is relevant to them
5. **Clear separation of responsibilities between pages**
6. **All time tracking is automatic - NO manual input**

## User Roles

| Role | Access |
|------|--------|
| admin | Full control: Inventory (CRUD), Deployments (planning), Admin Panel (users/bnbs/kits). Does NOT see Quick Actions page. |
| deployment_manager | Can: Use Quick Actions (Transfer/Damage/Request), Control shifts via Deployments page, View inventory. Cannot: Edit inventory, access Admin Panel |

## Page Structure (Strict Separation)

### Deployments Page
- **Purpose:** Planning AND shift control
- **Calendar view** with daily deployments
- Click deployment → Expand to show **Kit Cards**
- **Kit Card** shows:
  - Kit ID
  - Status (Not Started / Active / Paused / Completed)
  - Control buttons: Start / Pause / Resume / Stop
- **Start Collection** dialog requires only: SSD + Activity Type
- Context is auto-populated: deployment_id, kit, bnb, date, user

### Quick Actions Page (Manager Only)
- **Purpose:** Quick inventory actions (NO shift controls)
- **Contains ONLY:**
  - Transfer Item
  - Report Damage
  - Request Item
- Note: "To start a collection shift, go to Deployments"

### Inventory Page
- **Purpose:** PRIMARY inventory management
- **Admin Can:** Add/Edit/Delete items, update status
- **Manager Can:** View items, Transfer, Report Damage
- **Grouped by Category:** SSDs, Cameras, Gloves, Tools, General
- **Location Types:** kit:X, bnb:X, station:X

### Live Dashboard
- Shows ONLY auto-calculated values from shifts

### Admin Panel (Admin Only)
- **Contains ONLY:** Users, BnBs, Kits
- **NOT included:** Items (use Inventory), Deployments

## Data Model

### Shifts (Context-Aware)
- **deployment_id** (required)
- **date** (from deployment)
- **bnb** (from deployment)
- kit
- user, user_name
- ssd_used
- activity_type
- status (active/paused/completed)
- start_time (auto)
- pauses [{pause_time, resume_time}]
- end_time (auto)
- total_duration_seconds/hours (calculated)

### Items
- item_name (UNIQUE)
- **category** (ssd, camera, gloves, tools, general)
- tracking_type (individual/quantity)
- status (active/damaged/lost/repair)
- **current_location** (e.g., "kit:KIT-01", "bnb:BnB-01", "station:Storage")
- quantity (for quantity-tracked items)

### Events
- event_type (transfer, damage)
- item
- **from_location** (e.g., "kit:KIT-01")
- **to_location** (e.g., "bnb:BnB-02")
- quantity
- notes
- user, timestamp

### Deployments
- date, bnb, shift
- assigned_kits (array)
- deployment_managers (array)

## API Endpoints

### Shift Tracking (Context-Aware)
- `GET /api/shifts/by-deployment/{deployment_id}` - Get kit shifts for deployment
- `POST /api/shifts/start` - Requires: deployment_id, kit, ssd_used, activity_type
- `POST /api/shifts/{id}/pause`
- `POST /api/shifts/{id}/resume`
- `POST /api/shifts/{id}/stop`

### Items
- `GET /api/items` - Returns items with category and current_location
- `POST /api/items` - Admin only, includes category field
- `PUT /api/items/{name}` - Admin only
- `DELETE /api/items/{name}` - Admin only

### Events
- `POST /api/events` - transfer/damage with from_location/to_location

## Test Credentials
- **Admin**: `Admin` / `admin123`
- **Manager**: `TestManager1` / `test123`

## Completed Features (2026-03-18)
- [x] Shift controls moved to Deployments → Kit cards
- [x] Quick Actions page: Transfer/Damage/Request only
- [x] Context-aware shifts (deployment_id required)
- [x] Inventory grouped by category
- [x] Location types: kit:X, bnb:X, station:X
- [x] Role-based inventory permissions
- [x] Auto-calculated shift durations
- [x] Multiple deployment managers per deployment

## Architecture
```
/app
├── backend/
│   └── server.py
└── frontend/
    └── src/pages/
        ├── Actions.js       # Quick Actions (Transfer/Damage/Request)
        ├── Dashboard.js     # Role-based navigation
        ├── Deployments.js   # Calendar + Kit cards with shift controls
        ├── Inventory.js     # Grouped by category, role-based actions
        ├── LiveDashboard.js # Auto-calculated stats
        ├── AdminPanel.js    # Users/BnBs/Kits only
        └── Requests.js
```

## Last Updated
2026-03-18 - Shift controls in Deployments, Quick Actions simplified, Inventory categories
