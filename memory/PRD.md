# HA Multimodal Management - Product Requirements Document

## Last Updated
2026-03-22 - **Hardware Check Shift Mapping - ROOT CAUSE FIXED**

### Root Cause Analysis:
- Records in `shifts` collection were missing `shift` or `shift_type` field (13 legacy records)
- Frontend helper functions (`getKitStatus`, `getActiveRecord`, `getCompletedRecords`) were not filtering by shift

### Fix Applied:
1. Added `recordMatchesShift(record, shiftType)` helper function that checks both `shift` and `shift_type` fields
2. Updated `getKitStatus(kit, shiftType)` to filter by current shift tab
3. Updated `getActiveRecord(kit, shiftType)` to filter by current shift tab
4. Updated `getCompletedRecords(kit, shiftType)` to filter by current shift tab
5. Updated `getTotalKitHours(kit, shiftType)` to filter by current shift tab
6. Kit cards now pass `shiftType` parameter based on `currentTab`

### Verified in Preview:
- Morning tab only shows morning records ✓
- Night tab only shows night records ✓
- No cross-shift data leakage ✓

**⚠️ REQUIRES REDEPLOYMENT to fix Production**

2026-03-22 - **Task Categories & Hardware Check Shift Mapping Fix**

### Task Categories System (Database-Driven) ✅
- Task categories now stored in MongoDB `task_categories` collection
- CRUD API endpoints: GET/POST/PUT/DELETE /api/task-categories
- Admin Panel: New "Task Categories" tab with Add/Edit/Delete functionality
- Default categories seeded: Cooking, Cleaning, Organizing, Outdoor, Other
- All dropdowns (Deployments, EventDialog) now fetch from API
- Past records keep old category name (only future affected by edits)

### Hardware Check Shift Mapping Fix (Critical Bug) ✅
- Fixed: Morning shift checks were appearing under Night shift
- Root cause: Kit status/records were not filtered by shift_type
- Fix: Added `recordMatchesShift()` helper function
- Fix: Updated `getKitStatus()`, `getActiveRecord()`, `getCompletedRecords()`, `getTotalKitHours()` to accept optional `shiftType` parameter
- Kit cards now strictly filter records by current shift tab
- No cross-shift data leakage
- Hardware check status display only shows current shift's completion

### Testing (iteration_21) ✅
- Backend: 13/13 tests passed (100%)
- Frontend: All UI flows verified
- Bug fixed: AdminPanel.js `openAddDialog` function was incorrectly handling 'task-categories' tab name

2026-03-22 - **MAJOR: Inventory System Overhaul Complete (Phases 1-5)**

### Phase 1: Category Management Backend ✅
- Categories now stored in MongoDB `categories` collection (dynamic, not hardcoded)
- CRUD API endpoints: GET/POST/PUT/DELETE /api/categories
- Each category has `type`: "unique" or "non_unique"
- Delete protection: blocks deletion if items exist in category
- Auto-seeding from defaults on first run

### Phase 2: Category Management Frontend ✅
- New "Categories" tab in Inventory page
- Shows categories with type badges (Unique/Quantity-based)
- Item counts displayed per category
- Admin controls: Add/Edit/Delete category buttons
- Expandable categories showing items with status controls

### Phase 3: Transfer Flow Fix ✅
- NON-UNIQUE categories: Only Category + Quantity + From/To (no item selection)
- UNIQUE categories: Category → Select specific item ID
- New backend endpoint: POST /api/events/transfer-quantity

### Phase 4: Damage/Lost Flow Fix ✅
- UNIQUE items: Auto-detect location from item record
- NON-UNIQUE items: User selects source location + quantity
- New backend endpoint: POST /api/events/damage-lost-quantity
- Correct deduction from the right source (Kit/Hub/BnB)

### Phase 5: SSD Return Flow Enhancement ✅
- "Reason for Transfer" dropdown when transferring SSD:
  - SSD Full (marks as "Ready for Offload")
  - Routine Return
  - Issue/Damage
  - Other
- Data Offload page highlights "Ready for Offload" SSDs prominently

### Phase 6: Data Consistency Verification ✅
- All 16 backend tests passed (100%)
- All frontend UI flows verified
- Distribution excludes damaged/lost/ready_for_offload items

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
- **Green highlighting only** for dates with deployments (green background + green dot)
- **No "today" or selection highlighting** - calendar is purely deployment-driven
- Collapsed view shows selected date in neutral slate color

### BnB Click Experience  
- Click **entire header block** (dark header OR team section) → Immediate expand/collapse
- Cursor changes to pointer on entire clickable area
- Team section has hover effect for visual feedback
- Shows all assigned kit cards when expanded
- "View History" and admin buttons work independently (don't trigger collapse)
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
- [x] **Remove "Today" Concept** - Simplified date handling:
  - Calendar no longer highlights "today" with blue
  - Live Dashboard "Today" button removed
  - Date is fully user-controlled, not system-driven
- [x] **Simplify Handover Logic** - Handovers are now independent:
  - Collection can start anytime without handover completion
  - Handover is only for tracking and accountability
  - All handover buttons enabled (no dependencies)
- [x] **Fix Deployment Visibility Bug** - Deployment managers can now see their deployments:
  - Calendar indicator checks morning_managers OR evening_managers
  - Both morning and night shift users see green indicator for their deployments
- [x] **Explicit Shift Completion Flow** - End Shift requires all collections stopped:
  - Added "End Morning Shift" / "End Evening Shift" buttons in each shift tab
  - Click triggers check: if any kit has active/paused collection → show error toast
  - If all collections stopped → opens handover popup automatically
  - Collection records now include shift_type (morning/evening) for proper aggregation
  - Handover NOT required to start collection, only at shift end

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
2026-03-22 - Damage/Lost Item Flow Verified & Actions.js Cleanup:
**VERIFIED (Testing Agent iteration_19):**
- Backend /api/items/distribution excludes items with status 'damaged' or 'lost' ✓
- Distribution tab shows only active items in the count ✓
- Kit Completeness calculation filters items with status 'active' only ✓
- Transfer Item dialog only shows items with status 'active' in dropdown ✓
- Report Damage dialog (UNIQUE category): select specific item → marks as 'damaged' ✓
- Report Lost dialog (NON-UNIQUE category): enter quantity → marks items as 'lost' ✓
- After marking item as damaged, it disappears from Distribution count ✓
- After marking item as damaged, Kit Completeness shows 'missing' for that category ✓
- Damaged items cannot be selected in Transfer Item dialog ✓

**CLEANUP:**
- Deleted orphaned file: /app/frontend/src/pages/Actions.js (Quick Actions page was removed)
- No references to Actions.js remain in App.js or Dashboard.js

2026-03-21 - Inventory System Verification After Production Rollback:
**VERIFIED (Testing Agent iteration_17):**
- Backend /api/categories returns all 12 master categories with unique/non-unique classification ✓
- Backend /api/items/distribution returns distribution matrix with all 12 categories ✓
- Backend POST /api/items rejects invalid categories ✓
- Backend POST /api/items requires item_name for UNIQUE categories ✓
- Backend POST /api/items auto-generates name for NON-UNIQUE categories ✓
- Frontend shows only 3 tabs: Distribution, Kit Completeness, Movement Log ✓
- Add Item dialog has two-step flow (Category → Item ID/Quantity) ✓
- Transfer Item dialog has two-step flow with category-based selection ✓
- Kit Completeness shows all 12 master categories ✓
- Movement Log shows "Moved by [User Name]" ✓

2026-03-21 - Quick Actions Transfer Flow Unified:
- Updated Actions.js (Quick Actions page for deployment managers) to match Admin's Inventory transfer flow
- Two-step flow: Step 1 (Select Category) → Step 2 (Select Item ID for UNIQUE / Select Item + Quantity for NON-UNIQUE)
- All 12 master categories available in both Admin and Manager transfer flows
- User attribution captured via backend (user_name stored in event record)

2026-03-21 - Hardware Check Flow Restored After Rollback:
- Removed EMERGENCY bypass in openStartShift function that was skipping hardware checks
- Restored proper flow: First Start Collection click → Hardware Check popup (if not done for this shift)
- Subsequent clicks (same kit + same shift) → Skip hardware check, go directly to collection form
- Shift-specific tracking: hardwareCheckStatus tracks {kit: {morning: bool, evening: bool}}
- Backend validated: /api/hardware-checks/status returns shift-specific status
- All 10 backend tests passed (iteration_18.json)

2026-03-21 - End Shift Button Logic Fixed:
- Fixed bug where "End Shift" button was showing for Night Shift even when no night collections existed
- Added shift-specific filtering: End Shift button now only appears if there are collections FOR THAT SPECIFIC SHIFT
- Logic checks both active records AND completed records for matching shift type
- Handles 'night'/'evening' alias correctly
- Morning Shift: Shows "End Morning Shift" only if morning collections exist
- Night Shift: Shows "End Night Shift" only if night collections exist

2026-03-21 - Shift Naming Standardization (MAJOR):
**Standardized shift naming across entire system to use ONLY "morning" and "night"**
- Removed ALL uses of "evening" from frontend UI labels, buttons, tabs, badges
- Updated backend models: evening_managers → night_managers
- Updated all API endpoints and validation logic
- Updated frontend state: hardwareCheckStatus now uses {morning, night} not {morning, evening}
- Created data migration endpoint: POST /api/admin/migrate-evening-to-night
- Ran migration: 1 shift record converted from "evening" to "night"
- Backend still accepts "evening" for backward compatibility but normalizes to "night"
- All new data will be stored with "night" not "evening"

2026-03-22 - Shift Permissions Fix (SYMMETRIC ACCESS):
**Made shift permissions symmetric between Morning and Night managers - NOW ENFORCED**
- Removed legacy `deployment_managers` fallback that was giving full access to both shifts
- STRICT enforcement: managers MUST be explicitly in morning_managers OR night_managers
- Morning managers: FULL access to Morning shift, VIEW-ONLY access to Night shift
- Night managers: FULL access to Night shift, VIEW-ONLY access to Morning shift
- Admins: FULL access to both shifts
- View-only mode: Can see kits/data/status, but cannot Start/Pause/Resume/Stop
- Added view-only banner notification: "You can view this shift's data but cannot perform actions"
- Kit cards show: "View only - you cannot start collections on this shift"
- Backend already enforces permissions on API endpoints

2026-03-22 - Inventory & Data Offload Improvements:
**Inventory Access:**
- Removed admin-only restriction for adding items - all users can now add items
- Admin retains edit/delete permissions

**Data Offload Page Access - NOW VISIBLE TO ALL USERS:**
- Removed admin-only restriction from Dashboard navigation
- Data Offload page now accessible to deployment managers
- Managers can: select SSD, select HDD, perform offload

**Removed Quick Actions (SIMPLIFICATION):**
- Removed Quick Actions page from deployment manager view
- Removed /actions route from App.js
- All actions now handled through Inventory page only
- Inventory handles: Transfer Item, Report Damage, Report Lost, Add Item

**Data Offload SSD Selection Bug Fix:**
- Fixed: All SSDs are now selectable (removed condition that only allowed pending data SSDs)
- Fixed: Checkboxes now visible on ALL SSDs, not just ones with pending data

**New Feature: SSD Tracker Tab**
- Added new "SSD Tracker" tab to Data Offload page
- Shows: SSD ID, Current Location, Status, Last Offloaded, Pending Data, BnBs Used

**ZERO BREAKING CHANGES:** All existing flows preserved, permissions now stricter.

**ISOLATION CONFIRMED:** Only fixed shift naming. No changes to collection start/stop/pause flows.

2026-03-21 - Hardware Check Shift-Specific Logic Fix:
**Backend:**
- Added `shift_type` field to HardwareCheckCreate model (required: "morning" or "evening")
- Updated POST /api/hardware-checks to store shift_type and validate
- Updated GET /api/hardware-checks/status/{deployment_id}/{kit} to return shift-specific status
- Updated GET /api/hardware-checks to support shift_type filtering

**Frontend:**
- Hardware check status now tracks per-shift: `{kit: {morning: bool, evening: bool}}`
- Hardware check dialog shows shift type badge (Morning Shift / Evening Shift)
- "Start Collection" checks hardware status for CURRENT shift only
- Hardware check status badge shows "Morning ✓" / "Evening ✓" separately

**Data Schema:**
- hardware_checks: kit_id, shift_type (morning/evening), deployment_date, images, checked_by, timestamp

2026-03-21 - Category Consistency Fix (SINGLE SOURCE OF TRUTH):
**Backend:**
- Created MASTER_CATEGORIES constant with 12 standard categories
- Added /api/categories endpoint to expose master list
- Added category normalization function for legacy data mapping
- Updated /api/items/distribution to use master list (not derived from items)
- Added category validation on item creation

**Frontend:**
- Item Distribution table now shows ALL 12 master categories
- Kit Completeness uses same master categories
- Transfer Item dialog uses same master categories
- Add Item dialog uses same master categories

**UNIQUE vs NON-UNIQUE logic preserved:**
- UNIQUE (require ID): glove_left, glove_right, head_camera, wrist_camera, laptop, power_bank, ssd
- NON-UNIQUE (quantity-based): usb_hub, imu, l_shaped_wire, laptop_charger, bluetooth_adapter

2026-03-21 - Flow Cleanup (Data Offload, Inventory, Hardware Check):
**Data Offload:**
- Fixed SSD list to show ALL SSDs from inventory (no filters)
- Simplified flow: Select SSD(s) → Select HDD → Enter size → Submit
- HDD shows capacity tracking (total, used, remaining)

**Inventory:**
- Removed HDD from Add Item categories (HDDs managed in HDD Dashboard only)
- Fixed Add Item flow: Category first, then Item Code only for UNIQUE categories
- Removed unused tabs (Hub, Kit-wise, BnB-level), kept Distribution, Kit Completeness, Movement Log

**Hardware Check:**
- Changed layout to 2-column: Morning Shift (left), Evening Shift (right)
- Both visible simultaneously, kits expandable independently

2026-03-21 - Analytics Calculations Fix:
- Single source of truth: collection_records (shifts table) only
- Uses deployment_date for date filtering (respects operational day 11AM-5AM)
- Includes BOTH completed AND active/paused records
- Proper pause handling: duration = end_time - start_time - paused_time
- No double counting between shifts
- Added debug mode (?debug=true) for validation
- Now matches Live Dashboard exactly

2026-03-21 - HDD Status Tracking:
- Added status workflow: In Hub → Sent to DC → At Data Centre → Returned
- Status summary cards on HDD Dashboard showing count per status
- Quick status change buttons in expanded HDD view
- Reset HDD Storage prompt when status is "Returned"

2026-03-21 - Inventory System Refactor:
- Fixed category dropdown: 13 specific categories (Glove Left, Glove Right, USB Hub, IMUs, Head Camera, L-Shaped Wire, Wrist Camera, Laptop, Laptop Charger, Power Bank, SSD, Bluetooth Adapter, HDD)
- Removed vague categories (General, Tools)
- Improved Transfer UX: Two-step flow (Category → Item)
- UNIQUE categories show item ID dropdown
- NON-UNIQUE categories show item + quantity input
- Added accountability: "Moved by [User Name]" in Movement Log
- Added "Data Offload" button on Dashboard (admin only)

## Inventory Categories
### UNIQUE (individual item ID tracking)
- Glove Left, Glove Right
- Head Camera, Wrist Camera
- Laptop, Power Bank
- SSD, HDD

### NON-UNIQUE (quantity-based tracking)
- USB Hub, IMUs
- L-Shaped Wire, Laptop Charger
- Bluetooth Adapter
