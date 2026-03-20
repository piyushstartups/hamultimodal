# HA Multimodal Management - Product Requirements Document

## Overview
Clean, minimal, web-based internal operations system for managing daily deployments, collection records, inventory, and handovers with **automatic time tracking**.

**Application Name:** HA Multimodal Management

**Core Principles:**
1. Every action takes under 10 seconds
2. Users don't think — only perform simple actions
3. All tracking comes from Events (single source of truth)
4. Show users only what is relevant to them
5. **Clear separation of responsibilities between pages**
6. **All time tracking is automatic - NO manual input**
7. **Collection records are the primary unit** - No shift dependency
8. **Operational Day**: 11:00 AM (Day 1) to 5:00 AM (Day 2) = Day 1
9. **Single Timezone**: All times in IST (Asia/Kolkata)

## Operational Day Rules
- **Start**: 11:00 AM IST
- **End**: 5:00 AM IST (next calendar day)
- All data created during this window belongs to the STARTING day's deployment
- Example: March 21, 2026 at 2:00 AM IST → belongs to March 20 operational day

## Shift Classification
- **DO NOT infer shift from time**
- **USE**: `deployment.shift` assignment (stored on collection record at creation)
- If kit is assigned to morning deployment → all its data = morning
- If assigned to evening deployment → all its data = evening

## User Roles

| Role | Access |
|------|--------|
| admin | Full control: Inventory (CRUD), Deployments (planning), Admin Panel (users/bnbs/kits). Does NOT see Quick Actions page. Can control any collection. |
| deployment_manager | Can: Use Quick Actions (Transfer/Damage/Lost), Control collections via Deployments page, Submit handovers, View inventory. Cannot: Edit inventory, access Admin Panel. Can control any collection on their assigned deployments. |

## Key UX Patterns

### Navigation Flow (Manager)
```
Date → BnB (click to expand) → Kit Cards → Actions
```

### Calendar Behavior
- For managers: Calendar **collapses** after date selection
- Shows "Change Date" button when collapsed
- Green dots indicate days with assignments

### BnB Click Experience  
- Click BnB header → Immediate expansion
- Shows all assigned kit cards
- No additional navigation required

## Page Structure

### Deployments Page
- **Calendar view** with date selection
- **BnB cards** that expand on click
- **Kit cards** inside each BnB with:
  - Status: Not Started / Active / Paused / Completed
  - Timer display for active/paused
  - Duration display for completed
  - Control buttons: Start / Pause / Resume / Stop
  - **Hardware check required** before first collection of the day
- **Handover buttons**: End Shift Handover, Start Shift Handover
- **Collection Records list** showing completed collections for each kit

### Live Dashboard
- **Real-time tracking** with auto-updating timers (HH:MM:SS)
- **Status badges** for each kit: Active (green pulse), Paused (amber), Idle (grey)
- **Date picker** for historical data viewing
- **BnB breakdown** with morning/night shift hours
- **Kit-level status** showing active collection details
- Auto-refreshes every 30 seconds

### Quick Actions Page (Manager Only)
- **Transfer Item** (kit↔kit, kit↔bnb, kit↔station)
- **Report Damage** (marks item as damaged)
- **Report Lost Item** (marks item as lost / reduces quantity)

### Inventory Page
- Admin: Full CRUD
- Manager: View + Transfer/Damage actions
- Grouped by category

### Analytics Dashboard
- **Total Hours Collected** - sum of all collection durations
- **Total Deployments** - count of deployments in date range
- **Collection Records** - count of collection records
- **Hours per Category** - breakdown by activity type
- **Daily Trend** - day-by-day hours chart
- Date range selector with quick presets (7/14/30 days)

### Admin Panel (Admin Only)
- Users, BnBs, Kits management

## Collection System (Context-Aware)

### Data Model
```json
{
  "deployment_id": "required",
  "date": "from deployment",
  "bnb": "from deployment",
  "kit": "selected kit",
  "user": "auto from session",
  "ssd_used": "user input",
  "activity_type": "user input",
  "status": "active|paused|completed",
  "start_time": "auto",
  "pauses": [{"pause_time", "resume_time"}],
  "end_time": "auto",
  "total_duration_hours": "calculated"
}
```

### Stop Button Behavior
1. Captures end timestamp
2. Calculates total paused time
3. Computes: `duration = (end - start) - paused_time`
4. Updates status to "completed"
5. Persists all data

## Handover System

### When to Use
- End of morning shift (outgoing)
- Before evening shift starts (incoming)

### Location
Deployments → Date → BnB → Handover buttons

### Kit-Level Checklist (for each kit)
| Field | Type |
|-------|------|
| Gloves | number |
| USB Hub | number |
| IMUs | number |
| Head Camera | number |
| L-Shaped Wire | number |
| Laptop | number |
| Laptop Charger | number |
| Power Bank | number |
| SSDs | number |

### BnB-Level Checklist (shared items)
| Field | Type |
|-------|------|
| Charging Station | number |
| 8 Port Power Strip | number |
| 4-5 Port Strip | number |

### Missing Items Flow
1. Add missing item
2. Select item, quantity, location (kit or BnB)
3. Optionally check "Lost?"
4. If "Lost?" checked → Creates lost event automatically

## Loss Tracking

### Quick Actions → Report Lost Item
1. Select item
2. Enter quantity (for quantity-tracked items)
3. Select location where lost
4. Add optional notes
5. Submit

### Behavior
- **Individual items**: Status → "lost"
- **Quantity items**: Reduces count by specified amount

## API Endpoints

### Shifts
- `GET /api/shifts/by-deployment/{id}` - Kit shifts for deployment
- `POST /api/shifts/start` - Requires deployment_id, kit, ssd_used, activity_type
- `POST /api/shifts/{id}/pause`
- `POST /api/shifts/{id}/resume`
- `POST /api/shifts/{id}/stop` - Calculates duration

### Handovers
- `GET /api/handovers/by-deployment/{id}`
- `POST /api/handovers` - Creates handover with checklists

### Events
- `POST /api/events` - type: transfer, damage, lost

## Test Credentials
- **Admin**: `Admin` / `admin123`
- **Manager**: `TestManager1` / `test123`

## Completed Features (2026-03-20)
- [x] **Collection System Fix** - Removed shift dependency, all actions work on collection records
- [x] **Authorization Fix** - Any deployment manager can pause/resume/stop collections on their deployments
- [x] **Live Dashboard Real-Time Timers** - HH:MM:SS timers that update every second
- [x] **Live Dashboard Status Badges** - Active/Paused/Idle status for each kit
- [x] **Analytics Cleanup** - Removed "Hours per BnB" and "Total shifts", added "Total Deployments"
- [x] **UI Cleanup** - Removed redundant "Request" section from main Dashboard
- [x] **CRITICAL: Date Mismatch Fix** - Live Dashboard now queries by deployment_id (not date field) to avoid timezone issues
- [x] **CRITICAL: Live Counters Fix** - Total hours now include BOTH completed AND active collection records
- [x] **CRITICAL: Pause/Resume Logic Fix** - Paused time correctly excluded from duration calculation
- [x] **UI: Compact Kit Cards** - Kit cards reduced from full-width to 2-4 per row grid layout
- [x] **Operational Day Logic** - System now uses 11 AM - 5 AM operational day (IST timezone)
- [x] **Shift Classification Fix** - Shift is stored on collection record from deployment.shift, NOT inferred from time
- [x] **Grouped Deployments API** - New endpoint `/api/deployments/grouped/{date}` returns deployments grouped by BnB
- [x] **Inventory Transfer** - Transfer button already available for all users (admins and managers)
- [x] **CRITICAL: Deployment Date as Single Source of Truth** - All records use deployment.date, NOT timestamp-derived dates
- [x] **CRITICAL: New Deployment Structure** - One deployment per BnB per date (morning_managers + evening_managers in same deployment)
- [x] **CRITICAL: Shift from User Selection** - Collection record shift comes from user request, NOT inferred
- [x] **Admin Transfer Item Button** - Prominent "Transfer Item" button in Inventory header for Admin
- [x] **CRITICAL: Frontend Date Fix (Complete)** - ALL frontend pages now fetch operational date from backend `/api/system/operational-date` endpoint instead of using browser's `new Date()`. Verified pages: Incidents, Analytics, HardwareDashboard, MyDeployments, DeploymentPlanning, AdminAnalytics, Handover, LiveDashboard, Deployments. This ensures production date handling is correct regardless of server/browser timezone.
- [x] **CRITICAL: No new Date() Fallbacks** - Removed all `new Date()` fallbacks for operational date. Deployments page now uses retry logic (3 attempts) and shows error state if fetch fails, ensuring no incorrect dates are ever displayed.
- [x] **Live Dashboard Kit Cards Fix** - Kit cards now show TOTAL collection hours for the day (completed + active) instead of only current session timer. When active, shows a small live indicator with current session timer below the total.
- [x] **Live Dashboard Shift-Wise Breakdown** - BnB view now shows separate Morning Shift and Night Shift sections, each displaying assigned managers and kit-wise hours for that shift. Same kits appear in both sections with shift-filtered data. Total BnB output shown at bottom.
- [x] **Deployment Shift Discipline** - Implemented tabbed shift view (Morning/Night) with access control:
  - Users see which shifts they have access to (green dot indicator)
  - Morning team can only control kits in Morning tab
  - Night team can only control kits in Night tab
  - Handover status tracking with visual indicators
  - Morning must complete "End Shift Handover" before Night can start collection
  - Collection records display shift badge (AM/PM) for clarity
- [x] **Hardware Upload Popup Fix** - Compact 3-column layout with sticky footer
- [x] **CRITICAL: toISOString() Date Bug** - Fixed timezone issue where `toISOString()` was converting local dates to UTC, causing date mismatch. Replaced with local date formatting in Deployments.js, LiveDashboard.js, Analytics.js, AdminAnalytics.js, DeploymentPlanning.js
- [x] **All Popup/Modal UI Fix** - Applied consistent styling across all dialogs:
  - max-h-[85vh] with flex layout
  - Scrollable content area (overflow-y-auto)
  - Sticky footer with action buttons always visible
  - Compact spacing and smaller form elements
  - Files fixed: Actions.js, AdminPanel.js, DeploymentPlanning.js, Deployments.js, Incidents.js, Inventory.js

## Completed Features (2026-03-18)
- [x] Improved deployment UX (BnB click expansion)
- [x] Calendar collapse for managers
- [x] Reliable Stop button (fixed UI state update issue)
- [x] Report Lost Item in Quick Actions
- [x] Handover system with kit/BnB checklists
- [x] Missing item tracking with auto-loss reporting
- [x] Context-aware shifts (deployment_id required)
- [x] Role-based permissions
- [x] Analytics Dashboard with date range support
- [x] Admin Historical Live Dashboard with date picker
- [x] App name updated to "HA Multimodal Management"
- [x] Hardware Health Checks before first collection
- [x] BnB Day View for historical traceability

## Architecture
```
/app
├── backend/
│   └── server.py   # Shifts, handovers, events, items, analytics
└── frontend/
    └── src/pages/
        ├── Actions.js       # Quick Actions (Transfer/Damage/Lost)
        ├── Analytics.js     # Date range analytics with charts
        ├── Dashboard.js     # Role-based navigation
        ├── Deployments.js   # Calendar + BnB + Kit cards + Handover
        ├── Inventory.js     # Grouped by category
        ├── LiveDashboard.js # Auto-calculated stats + Admin date picker
        └── AdminPanel.js    # Users/BnBs/Kits
```

## Last Updated
2026-03-20 - CRITICAL FIX: Frontend date handling complete. All pages now use backend operational date.
