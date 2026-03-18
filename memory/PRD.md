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
| admin | Full access - creates deployments, manages users/kits/items/BnBs, sees all dashboards |
| deployment_manager | Sees only assigned BnBs, logs shifts, transfers, reports damage, creates requests |

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
- item_name
- tracking_type (individual / quantity)
- status (active / damaged / lost / repair)
- current_kit (for individual items)

### Deployments
- date
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
- data_collected (optional)
- timestamp

### Requests
- requested_by
- item
- quantity
- status (pending / fulfilled / rejected)

## UI Structure

### Pages
1. **My Deployments** - View assigned work for today
2. **Actions** - 5 buttons: Start Shift, End Shift, Transfer Item, Report Damage, Request Item
3. **Live Dashboard** - Today's stats (active shifts, events, data collected, by location)
4. **Inventory** - View items with status/location
5. **Requests** - List with status update
6. **Admin Panel** - Manage users, kits, items, BnBs, deployments (admin only)

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
- `GET/POST/DELETE /api/items`
- `GET/POST/PUT/DELETE /api/deployments`
- `GET/POST /api/events`
- `GET/POST/PUT /api/requests`

### Dashboard
- `GET /api/dashboard/live` - Today's stats

## Test Credentials
- **Admin**: `Admin` / `admin123`

## Last Updated
2026-03-18 - Complete rebuild with simplified data model and UI
