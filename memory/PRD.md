# Ops Management System - Product Requirements Document

## Overview
Clean, minimal, web-based internal operations system for managing daily deployments, shifts, and inventory with **automatic time tracking**.

**Core Principles:**
1. Every action takes under 10 seconds
2. Users don't think — only perform simple actions
3. All tracking comes from Events (single source of truth)
4. Show users only what is relevant to them
5. **All time tracking is automatic - NO manual input**

## User Roles

| Role | Access |
|------|--------|
| admin | Full control: Inventory (CRUD), Deployments (planning), Admin Panel (users/bnbs/kits). Does NOT see Actions page. |
| deployment_manager | Can: View deployments assigned to them, perform actions (shift logging), view inventory. Cannot: Edit inventory, access Admin Panel |

## Automatic Time Tracking System

### How It Works
- **NO manual time input** - Users never enter hours, duration, or times
- **System auto-captures** timestamps on button clicks:
  - `Start Collection` → records `start_time`
  - `Pause` → records `pause_time`
  - `Resume` → records `resume_time`
  - `Stop` → records `end_time` + calculates duration

### Duration Calculation
```
Total Duration = (end_time - start_time) - (sum of all paused periods)
```

### Shift Data Model
```json
{
  "id": "shift-xxx",
  "user": "user_id",
  "kit": "KIT-01",
  "ssd_used": "SSD-01",
  "activity_type": "cleaning",
  "status": "active|paused|completed",
  "start_time": "auto-captured",
  "pauses": [{"pause_time": "auto", "resume_time": "auto"}],
  "end_time": "auto-captured",
  "total_duration_seconds": "auto-calculated",
  "total_duration_hours": "auto-calculated"
}
```

## Page Responsibilities

### Actions Page (Manager Only)
- **Start Collection** - Opens dialog for Kit, SSD, Activity Type (required at START)
- **Active Shift Panel** - Shows live timer, Pause/Resume/Stop buttons
- **Other Actions** - Transfer Item, Report Damage, Request Item

### Live Dashboard
- Shows **ONLY auto-calculated** values:
  - Total Hours Logged (from completed shifts)
  - Shifts Completed / Active Now
  - Hours per BnB (auto-calculated from shifts)
- Note: "All durations are automatically calculated from shift start/stop times"

### Inventory Page
- **Admin**: Add/Edit/Delete items
- **Manager**: View only

### Deployments Page
- Planning only - date/BnB/Kits/Managers assignment
- Supports **multiple deployment managers** per deployment

### Admin Panel
- Users, BnBs, Kits management only

## Data Model

### Shifts (NEW - Auto Time Tracking)
- id
- user, user_name
- kit
- ssd_used
- activity_type
- status (active/paused/completed)
- start_time (auto)
- pauses (array of {pause_time, resume_time})
- end_time (auto)
- total_paused_seconds (calculated)
- total_duration_seconds (calculated)
- total_duration_hours (calculated)

### Deployments
- date, bnb, shift
- assigned_kits (array)
- **deployment_managers (array)** - Multiple managers per deployment

### Items
- item_name (UNIQUE)
- tracking_type, status, current_kit

## API Endpoints

### Shift Tracking (Auto Time)
- `GET /api/shifts/active` - Get user's active shift
- `POST /api/shifts/start` - Start shift (auto start_time)
- `POST /api/shifts/{id}/pause` - Pause (auto pause_time)
- `POST /api/shifts/{id}/resume` - Resume (auto resume_time)
- `POST /api/shifts/{id}/stop` - Stop + calculate duration
- `GET /api/shifts/today` - Today's completed shifts

### Dashboard
- `GET /api/dashboard/live` - Auto-calculated totals from shifts

## Test Credentials
- **Admin**: `Admin` / `admin123`
- **Manager**: `TestManager1` / `test123`

## Completed Features (2026-03-18)
- [x] Automatic shift time tracking (Start/Pause/Resume/Stop)
- [x] Auto-calculated durations (no manual input)
- [x] Live timer display during active shift
- [x] Dashboard shows only auto-calculated hours
- [x] Multiple deployment managers per deployment
- [x] Admin full CRUD on Inventory
- [x] Role-based permissions

## Architecture
```
/app
├── backend/
│   └── server.py   # Includes /api/shifts/* endpoints
└── frontend/
    └── src/pages/
        ├── Actions.js       # Shift control panel
        ├── LiveDashboard.js # Auto-calculated stats
        ├── Inventory.js     # Admin CRUD
        ├── Deployments.js   # Multi-manager planning
        └── AdminPanel.js    # Users/BnBs/Kits
```

## Last Updated
2026-03-18 - Automatic shift time tracking, no manual time input
