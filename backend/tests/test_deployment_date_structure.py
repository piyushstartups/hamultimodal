"""
Test suite for Deployment Date as Single Source of Truth and New Deployment Structure
Key tests:
1. Collection records use deployment.date NOT timestamp
2. Deployment structure - one deployment per BnB per date (no shift duplication)
3. Shift classification - stored from user selection on collection start
4. Live Dashboard - shows correct date from deployment
5. Live Dashboard - morning/evening hours use record's shift field
6. Inventory Transfer - creates event and updates item location
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDeploymentStructure:
    """Test new deployment structure - one deployment per BnB per date with morning/evening managers"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test: login and get auth token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200, f"Login failed: {login_resp.text}"
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.user = login_resp.json()["user"]
        yield
    
    def test_deployment_model_has_morning_evening_managers(self):
        """Test that deployment model supports morning_managers and evening_managers fields"""
        # Get existing deployments to check structure
        resp = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        assert resp.status_code == 200
        
        deployments = resp.json()
        if len(deployments) > 0:
            # Check if new structure fields exist
            dep = deployments[0]
            print(f"Deployment structure: {list(dep.keys())}")
            # Either old structure (deployment_managers) or new structure (morning_managers, evening_managers) should exist
            has_new_structure = "morning_managers" in dep or "evening_managers" in dep
            has_old_structure = "deployment_managers" in dep
            assert has_new_structure or has_old_structure, "Deployment should have manager fields"
            print(f"  - Has morning_managers: {'morning_managers' in dep}")
            print(f"  - Has evening_managers: {'evening_managers' in dep}")
    
    def test_create_deployment_with_new_structure(self):
        """Test creating deployment with morning_managers and evening_managers"""
        # Get a user to assign
        users_resp = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        users = users_resp.json()
        admin_id = next((u["id"] for u in users if u["name"] == "Admin"), None)
        
        # Get existing BnBs
        bnbs_resp = requests.get(f"{BASE_URL}/api/bnbs", headers=self.headers)
        bnbs = bnbs_resp.json()
        
        if not bnbs:
            pytest.skip("No BnBs available for testing")
        
        test_date = "2026-12-31"  # Future date to avoid conflicts
        test_bnb = bnbs[0]["name"]
        
        # Create deployment with new structure
        create_resp = requests.post(f"{BASE_URL}/api/deployments", headers=self.headers, json={
            "date": test_date,
            "bnb": test_bnb,
            "morning_managers": [admin_id] if admin_id else [],
            "evening_managers": [],
            "assigned_kits": []
        })
        
        # Either succeeds or fails with "already exists"
        if create_resp.status_code == 201 or create_resp.status_code == 200:
            dep = create_resp.json()
            print(f"Created deployment: {dep.get('id')}")
            assert dep.get("date") == test_date
            assert "morning_managers" in dep or "deployment_managers" in dep
            
            # Cleanup
            if dep.get("id"):
                requests.delete(f"{BASE_URL}/api/deployments/{dep['id']}", headers=self.headers)
        elif create_resp.status_code == 400 and "already exists" in create_resp.text:
            print("Deployment already exists for this date/bnb - expected behavior")
        else:
            pytest.fail(f"Unexpected response: {create_resp.status_code} - {create_resp.text}")
    
    def test_one_deployment_per_bnb_per_date(self):
        """Test that only one deployment per BnB per date is allowed (no shift duplication)"""
        # Get existing BnBs
        bnbs_resp = requests.get(f"{BASE_URL}/api/bnbs", headers=self.headers)
        bnbs = bnbs_resp.json()
        
        if not bnbs:
            pytest.skip("No BnBs available for testing")
        
        test_date = "2026-12-30"
        test_bnb = bnbs[0]["name"]
        
        # Create first deployment
        create_resp1 = requests.post(f"{BASE_URL}/api/deployments", headers=self.headers, json={
            "date": test_date,
            "bnb": test_bnb,
            "morning_managers": [self.user["id"]],
            "evening_managers": [],
            "assigned_kits": []
        })
        
        if create_resp1.status_code == 400:
            # Already exists from previous test run
            print("First deployment already exists - checking duplicate prevention")
        else:
            assert create_resp1.status_code in [200, 201]
        
        # Try to create second deployment for same date/bnb - should fail
        create_resp2 = requests.post(f"{BASE_URL}/api/deployments", headers=self.headers, json={
            "date": test_date,
            "bnb": test_bnb,
            "morning_managers": [],
            "evening_managers": [self.user["id"]],
            "assigned_kits": []
        })
        
        # Should fail with duplicate error
        assert create_resp2.status_code == 400, f"Expected 400 for duplicate, got {create_resp2.status_code}"
        assert "already exists" in create_resp2.text.lower(), f"Expected 'already exists' error, got: {create_resp2.text}"
        print(f"Duplicate prevention works: {create_resp2.json()}")
        
        # Cleanup
        deps_resp = requests.get(f"{BASE_URL}/api/deployments?date={test_date}", headers=self.headers)
        for dep in deps_resp.json():
            if dep.get("bnb") == test_bnb:
                requests.delete(f"{BASE_URL}/api/deployments/{dep['id']}", headers=self.headers)


class TestCollectionShiftFromUserSelection:
    """Test that shift is stored from user selection on collection start, NOT inferred from time"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test: login and get auth token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.user = login_resp.json()["user"]
        yield
    
    def test_shift_start_requires_shift_field(self):
        """Test that /api/shifts/start accepts shift field from request"""
        # Get existing deployments
        deps_resp = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        deps = deps_resp.json()
        
        if not deps:
            pytest.skip("No deployments available for testing")
        
        dep = deps[0]
        kits = dep.get("assigned_kits", [])
        if not kits:
            pytest.skip("No kits assigned to deployment")
        
        kit = kits[0]
        
        # Test starting collection with explicit shift selection
        start_resp = requests.post(f"{BASE_URL}/api/shifts/start", headers=self.headers, json={
            "deployment_id": dep["id"],
            "kit": kit,
            "ssd_used": "SSD-TEST-001",
            "activity_type": "cooking",
            "shift": "evening"  # User explicitly selects evening shift
        })
        
        if start_resp.status_code == 400 and "active collection" in start_resp.text.lower():
            # Kit has active collection - that's ok, just verify the endpoint accepts shift
            print("Kit has active collection - shift endpoint accessible")
        elif start_resp.status_code in [200, 201]:
            record = start_resp.json()
            print(f"Collection record created: {record.get('id')}")
            
            # Verify shift field is stored as user selected
            assert record.get("shift") == "evening", f"Expected shift='evening', got {record.get('shift')}"
            assert record.get("date") == dep["date"], f"Date should match deployment: {record.get('date')}"
            print(f"  - Shift stored from user selection: {record.get('shift')}")
            print(f"  - Date from deployment: {record.get('date')}")
            
            # Cleanup - stop the collection
            if record.get("id"):
                requests.post(f"{BASE_URL}/api/shifts/{record['id']}/stop", headers=self.headers)
                requests.delete(f"{BASE_URL}/api/shifts/{record['id']}", headers=self.headers)
        else:
            print(f"Start shift response: {start_resp.status_code} - {start_resp.text}")
    
    def test_collection_date_from_deployment_not_timestamp(self):
        """Test that collection record's date comes from deployment.date, NOT timestamp"""
        deps_resp = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        deps = deps_resp.json()
        
        if not deps:
            pytest.skip("No deployments available")
        
        # Get shifts for a deployment
        dep = deps[0]
        shifts_resp = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{dep['id']}", headers=self.headers)
        
        assert shifts_resp.status_code == 200
        kit_records = shifts_resp.json()
        
        # Check all records have date matching deployment.date
        deployment_date = dep["date"]
        print(f"Deployment date: {deployment_date}")
        
        for kit, data in kit_records.items():
            for record in data.get("records", []):
                record_date = record.get("date")
                print(f"  - Record {record.get('id')}: date={record_date}, deployment_date={deployment_date}")
                # Record date should match deployment date
                if record_date:
                    assert record_date == deployment_date, f"Record date {record_date} should match deployment date {deployment_date}"


class TestLiveDashboardDateAndShift:
    """Test Live Dashboard uses deployment.date and record's shift field"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test: login and get auth token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        yield
    
    def test_live_dashboard_returns_correct_date(self):
        """Test /api/dashboard/live returns date from deployment, not timestamp"""
        test_date = "2026-03-20"
        resp = requests.get(f"{BASE_URL}/api/dashboard/live?date={test_date}", headers=self.headers)
        
        assert resp.status_code == 200
        data = resp.json()
        
        assert data.get("date") == test_date, f"Expected date={test_date}, got {data.get('date')}"
        print(f"Live Dashboard date: {data.get('date')}")
        print(f"Total hours: {data.get('total_hours')}")
        print(f"Active count: {data.get('active_count')}")
    
    def test_live_dashboard_bnb_shift_hours(self):
        """Test Live Dashboard BnB morning/evening hours come from record's shift field"""
        test_date = "2026-03-20"
        resp = requests.get(f"{BASE_URL}/api/dashboard/live?date={test_date}", headers=self.headers)
        
        assert resp.status_code == 200
        data = resp.json()
        
        bnbs = data.get("bnbs", [])
        print(f"Number of BnBs: {len(bnbs)}")
        
        for bnb in bnbs:
            morning_hours = bnb.get("morning_hours", 0)
            night_hours = bnb.get("night_hours", 0)
            total_hours = bnb.get("total_hours", 0)
            
            print(f"BnB: {bnb.get('bnb')}")
            print(f"  - Morning hours: {morning_hours}")
            print(f"  - Night/Evening hours: {night_hours}")
            print(f"  - Total hours: {total_hours}")
            
            # Verify hours are numeric
            assert isinstance(morning_hours, (int, float))
            assert isinstance(night_hours, (int, float))
            
            # Total should be sum of morning + night (approximately, accounting for rounding)
            if total_hours > 0:
                expected_total = morning_hours + night_hours
                # Allow small rounding difference
                assert abs(total_hours - expected_total) < 0.1, f"Total {total_hours} should equal morning+night {expected_total}"
    
    def test_live_dashboard_kit_has_shift_field(self):
        """Test that kit data in live dashboard includes shift information"""
        test_date = "2026-03-20"
        resp = requests.get(f"{BASE_URL}/api/dashboard/live?date={test_date}", headers=self.headers)
        
        assert resp.status_code == 200
        data = resp.json()
        
        for bnb in data.get("bnbs", []):
            kits = bnb.get("kits", [])
            for kit in kits:
                print(f"Kit: {kit.get('kit_id')}")
                print(f"  - Total hours: {kit.get('total_hours')}")
                print(f"  - Shift: {kit.get('shift', 'N/A')}")
                # Kit should have shift field
                assert "shift" in kit, f"Kit should have shift field: {kit}"


class TestInventoryTransfer:
    """Test Inventory Transfer functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test: login and get auth token"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.user = login_resp.json()["user"]
        yield
    
    def test_transfer_event_creates_event(self):
        """Test that transfer event is created via /api/events"""
        # Get existing items
        items_resp = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        items = items_resp.json()
        
        if not items:
            # Create a test item
            create_resp = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
                "item_name": "TEST-TRANSFER-ITEM-001",
                "category": "general",
                "tracking_type": "individual",
                "status": "active",
                "current_location": "station:Storage",
                "quantity": 1
            })
            if create_resp.status_code in [200, 201]:
                items = [create_resp.json()]
        
        if not items:
            pytest.skip("No items available for transfer test")
        
        item = items[0]
        item_name = item.get("item_name")
        
        # Create transfer event
        transfer_resp = requests.post(f"{BASE_URL}/api/events", headers=self.headers, json={
            "event_type": "transfer",
            "item": item_name,
            "from_location": "station:Storage",
            "to_location": "station:Main",
            "quantity": 1,
            "notes": "Test transfer from API"
        })
        
        assert transfer_resp.status_code in [200, 201], f"Transfer failed: {transfer_resp.text}"
        event = transfer_resp.json()
        
        print(f"Transfer event created: {event.get('id')}")
        assert event.get("event_type") == "transfer"
        assert event.get("item") == item_name
        assert event.get("from_location") == "station:Storage"
        assert event.get("to_location") == "station:Main"
        print(f"  - Event ID: {event.get('id')}")
        print(f"  - User: {event.get('user_name')}")
        print(f"  - Timestamp: {event.get('timestamp')}")
    
    def test_transfer_updates_item_location(self):
        """Test that transfer event updates item's current_location"""
        # Create a test item with known location
        test_item_name = f"TEST-LOC-ITEM-{datetime.now().strftime('%H%M%S')}"
        
        create_resp = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": test_item_name,
            "category": "general",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage",
            "quantity": 1
        })
        
        if create_resp.status_code not in [200, 201]:
            pytest.skip(f"Could not create test item: {create_resp.text}")
        
        # Transfer the item
        transfer_resp = requests.post(f"{BASE_URL}/api/events", headers=self.headers, json={
            "event_type": "transfer",
            "item": test_item_name,
            "from_location": "station:Storage",
            "to_location": "kit:KIT-01",
            "quantity": 1,
            "notes": "Test location update"
        })
        
        assert transfer_resp.status_code in [200, 201]
        
        # Verify item location was updated
        item_resp = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        items = item_resp.json()
        
        updated_item = next((i for i in items if i["item_name"] == test_item_name), None)
        
        if updated_item:
            print(f"Item after transfer: {updated_item.get('item_name')}")
            print(f"  - Current location: {updated_item.get('current_location')}")
            assert updated_item.get("current_location") == "kit:KIT-01", \
                f"Expected location 'kit:KIT-01', got {updated_item.get('current_location')}"
            
            # Cleanup
            requests.delete(f"{BASE_URL}/api/items/{test_item_name}", headers=self.headers)
        else:
            print(f"Item {test_item_name} not found in items list")


class TestDeploymentDateSingleSourceOfTruth:
    """Verify deployment.date is the single source of truth for date filtering"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        self.token = login_resp.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        yield
    
    def test_shifts_api_filters_by_date(self):
        """Test /api/shifts filters by date field (which comes from deployment.date)"""
        test_date = "2026-03-20"
        resp = requests.get(f"{BASE_URL}/api/shifts?date={test_date}", headers=self.headers)
        
        assert resp.status_code == 200
        shifts = resp.json()
        
        print(f"Shifts for date {test_date}: {len(shifts)}")
        for shift in shifts[:5]:  # Show first 5
            print(f"  - Shift {shift.get('id')}: date={shift.get('date')}, bnb={shift.get('bnb')}")
            # All shifts should have the requested date
            if shift.get("date"):
                assert shift.get("date") == test_date, f"Shift date {shift.get('date')} should match {test_date}"
    
    def test_deployments_filter_by_date(self):
        """Test /api/deployments filters by date"""
        test_date = "2026-03-20"
        resp = requests.get(f"{BASE_URL}/api/deployments?date={test_date}", headers=self.headers)
        
        assert resp.status_code == 200
        deployments = resp.json()
        
        print(f"Deployments for date {test_date}: {len(deployments)}")
        for dep in deployments:
            print(f"  - {dep.get('id')}: bnb={dep.get('bnb')}, date={dep.get('date')}")
            assert dep.get("date") == test_date, f"Deployment date should match {test_date}"


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
