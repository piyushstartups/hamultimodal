# HA Multimodal Management - Product Requirements Document

## Overview
Clean, minimal, web-based internal operations system for managing daily deployments, shifts, inventory, and handovers with **automatic time tracking**.

**Application Name:** HA Multimodal Management

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
| deployment_manager | Can: Use Quick Actions (Transfer/Damage/Lost), Control shifts via Deployments page, Submit handovers, View inventory. Cannot: Edit inventory, access Admin Panel |

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
- **Handover buttons**: End Shift Handover, Start Shift Handover

### Quick Actions Page (Manager Only)
- **Transfer Item** (kit↔kit, kit↔bnb, kit↔station)
- **Report Damage** (marks item as damaged)
- **Report Lost Item** (marks item as lost / reduces quantity)

### Inventory Page
- Admin: Full CRUD
- Manager: View + Transfer/Damage actions
- Grouped by category

### Live Dashboard
- Auto-calculated values from shifts

### Admin Panel (Admin Only)
- Users, BnBs, Kits management

## Shift System (Context-Aware)

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
2026-03-18 - Final fixes: Stop button bug fixed, Analytics dashboard added, Admin historical view added
