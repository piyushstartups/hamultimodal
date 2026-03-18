# Human Archive Ops Management - Product Requirements Document

## Overview
Internal web application for event-based operations and inventory management of kits, BnBs, and equipment.

## Core Principle
All inventory data is derived from logged events. Users record actions (events), and the system calculates the current state. No direct editing of inventory counts.

## User Roles
| Role | Access |
|------|--------|
| deployer/station | Field operators - log shifts, transfers, damage. See "My BnB" view |
| supervisor | Oversee operations, approve requests |
| inventory_manager | Manage master inventory list, add/edit/remove items |
| admin | Manage users, BnBs, daily shift assignments |

## Data Models
- **Users**: name, role, default_kit, assigned_bnb, shift_team
- **Kits**: kit_id, type (kit/bnb/station/data_center), status, assigned_bnb
- **Items**: item_id, item_name, tracking_type (individual/quantity), status, current_kit, category
- **Events**: event_type, user_id, from_kit, to_kit, item_id, quantity, timestamp, notes
- **Requests**: request_id, requested_by, from_kit, item_id, quantity, status
- **Assignments**: bnb_id, shift_date, morning_team, night_team
- **Handovers**: from_user, to_user, bnb_id, shift_date, checklist

## Event Types
| Event | Description |
|-------|-------------|
| start_shift | Begin work with SSD tracking |
| end_shift | End work with SSD space logging |
| pause_kit | Kit break |
| resume_kit | Kit resume |
| transfer | Move item between kits |
| damage | Report equipment damage |
| lost | Report lost item |
| check_out | Check out item from kit |
| check_in | Check in item to kit |
| wear_flag | Flag item showing wear |
| new_addition | New inventory added |

## Implemented Features

### Authentication
- [x] JWT-based username/password login
- [x] Role-based access control
- [x] Password change functionality

### Dashboard
- [x] Stats overview (Active Kits, Total Items, Active Shifts, Pending Requests)
- [x] Quick action buttons for field operators
- [x] Role-specific navigation links

### Inventory Management (Admin/Inventory Manager Only)
- [x] Master item list with search and filters
- [x] Add single item
- [x] Bulk add items
- [x] Edit item details
- [x] Delete items
- [x] Stats summary (Total, Active, Damaged/Lost, Needs Attention)

### Field Operations
- [x] Start/End Shift with SSD tracking
- [x] Pause/Resume Kit
- [x] Transfer Item
- [x] Report Damage
- [x] Create Request
- [x] Bulk Transfer Items
- [x] Check Out/Check In Items
- [x] Flag Item Wear

### Admin Panel
- [x] User management (add/edit)
- [x] BnB management
- [x] Kit management
- [x] Daily shift assignments (morning/night teams)

### Reporting
- [x] Lost Items Report
- [x] SSD Offload Dashboard
- [x] Inventory Summary (Bird's Eye View)
- [x] Damage Tracking

### Other
- [x] Shift Handover Checklist
- [x] Notifications system
- [x] Event logging

## Technical Implementation

### Performance Optimizations
- [x] MongoDB indexes on frequently queried fields
- [x] Aggregation pipelines for inventory calculations
- [x] Optimized inventory-summary endpoint

### Database Indexes
- Events: event_type+timestamp, item_id+timestamp, user_id+timestamp, from_kit, to_kit, ssd_id+event_type
- Items: item_id (unique), category, status, current_kit
- Kits: kit_id (unique), type, assigned_bnb
- Users: id (unique), name (unique), role, assigned_bnb
- Requests: status+timestamp, requested_by
- Notifications: user_id+read+timestamp
- Assignments: bnb_id+shift_date
- Handovers: bnb_id+shift_date

## Test Credentials
- Admin: `Admin Manager` / `password123`
- Supervisor: `Mike Supervisor` / `password123`
- Deployer: `John Deployer` / `password123`
- Station: `Sarah Station` / `password123`

## Future/Backlog Tasks
- [ ] Shift timeline view (showing all 4 shifts for the day)
- [ ] Kit utilization reports (active hours per kit)
- [ ] Auto-alerts for consistently flagged checklist items during handovers
- [ ] Export functionality for reports
- [ ] Dashboard analytics charts

## Last Updated
2026-03-18 - Completed Phase 2: Deployment Planning Dashboard + Admin Analytics Dashboard with charts and trends

## Recent Changes

### Phase 2 (Part 2): Admin Analytics Dashboard
- **Overview Cards** - Total Hours, Total Shifts, Active BnBs, Active Workers
- **Date Range Selector** - Last 7/14/30/90 days presets + custom date pickers
- **Daily Hours Captured** - Area chart showing trends over time
- **Hours by Category** - Donut/pie chart (cooking, cleaning, organizing, mixed, other)
- **Performance by BnB** - Horizontal bar chart comparing BnBs
- **Top Workers Leaderboard** - Ranked list with progress bars and shift counts
- **Inventory Health Issues** - Bar chart showing wear/damaged reports by item type
- **Category Summary** - Footer with color-coded breakdown

**Backend Analytics Endpoints:**
- `GET /admin/analytics/overview` - Comprehensive summary
- `GET /admin/analytics/daily-hours` - Daily trend data
- `GET /admin/analytics/bnb-performance` - Per-BnB metrics
- `GET /admin/analytics/category-breakdown` - Category distribution
- `GET /admin/analytics/worker-performance` - Worker rankings
- `GET /admin/analytics/inventory-health` - Health issue tracking

### Phase 2 (Part 1): Deployment Planning Dashboard
- **Calendar/Week View** - Navigate between dates with 7-day week display
- **Summary Stats** - Active BnBs, Deployed Kits, Workers Assigned, Shifts Logged
- **Assignment Cards** - Display BnB with assigned kits and morning/night teams
- **New Assignment Dialog** - Create daily deployments with:
  - BnB location selection
  - Multi-select kits to deploy
  - Morning shift team selection
  - Night shift team selection
- **Edit/Delete Assignments** - Modify or remove existing assignments
- **Backend Endpoints**:
  - `GET /admin/deployment-summary` - Comprehensive daily summary
  - `GET /admin/assignments/range` - Get assignments for date range
  - `PUT /admin/assignments/{id}` - Update assignment
  - `DELETE /admin/assignments/{id}` - Delete assignment

### Phase 1: Enhanced Shift Logging
- **End Shift form** now captures:
  - Hours recorded
  - Data category (cooking, cleaning, organizing, mixed, other)
  - SSD used and space available (GB)
  - Inventory health check: Left Glove, Right Glove, Head Camera (OK/Wear/Damaged)
  - Issues faced during shift
  
### Deployer UX Improvements
- **Kits auto-filtered** to only show kits assigned to deployer's BnB
- **SSDs auto-filtered** to show only SSDs at deployer's BnB location
- Shows "Your BnB: [BNB-ID]" label for clarity

### Font Update
- Changed to DM Sans (Google Sans alternative) across entire app
