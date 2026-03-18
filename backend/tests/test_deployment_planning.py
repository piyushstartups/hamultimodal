"""
Test Suite for Phase 2 Deployment Planning Features
- Deployment Planning endpoints
- Assignment CRUD operations  
- Enhanced End Shift with inventory health
- Start Shift with kit filtering for deployers
- Deployment summary endpoint
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestDeploymentPlanningAuth:
    """Test role-based access to deployment planning endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup tokens for different user roles"""
        # Admin login
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        assert resp.status_code == 200, f"Admin login failed: {resp.text}"
        self.admin_token = resp.json()["access_token"]
        
        # Deployer login
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        assert resp.status_code == 200, f"Deployer login failed: {resp.text}"
        self.deployer_token = resp.json()["access_token"]
        
        # Station login
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Sarah Station",
            "password": "password123"
        })
        assert resp.status_code == 200, f"Station login failed: {resp.text}"
        self.station_token = resp.json()["access_token"]
    
    def test_admin_can_access_deployment_summary(self):
        """Admin should have access to deployment-summary endpoint"""
        today = datetime.now().strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/api/admin/deployment-summary?shift_date={today}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        assert "total_bnbs" in data
        assert "active_bnbs" in data
        assert "total_kits" in data
        assert "deployed_kits" in data
        assert "total_workers" in data
        assert "assigned_workers" in data
        assert "shifts_started" in data
        assert "shifts_ended" in data
        assert "assignments" in data
        print(f"✓ Admin accessed deployment summary - {data['total_bnbs']} BnBs, {data['total_kits']} kits")
    
    def test_deployer_cannot_access_deployment_summary(self):
        """Deployer should not have access to admin endpoints"""
        today = datetime.now().strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/api/admin/deployment-summary?shift_date={today}",
            headers={"Authorization": f"Bearer {self.deployer_token}"}
        )
        assert resp.status_code == 403, f"Expected 403 for deployer, got {resp.status_code}"
        print("✓ Deployer correctly denied access to deployment summary")
    
    def test_deployer_cannot_create_assignment(self):
        """Deployer should not be able to create assignments"""
        today = datetime.now().strftime("%Y-%m-%d")
        resp = requests.post(
            f"{BASE_URL}/api/admin/assignments",
            headers={"Authorization": f"Bearer {self.deployer_token}"},
            json={
                "bnb_id": "BNB-01",
                "kit_ids": ["KIT-01"],
                "shift_date": today,
                "morning_team": [],
                "night_team": []
            }
        )
        assert resp.status_code == 403, f"Expected 403 for deployer, got {resp.status_code}"
        print("✓ Deployer correctly denied access to create assignment")


class TestDeploymentSummaryEndpoint:
    """Test deployment summary endpoint data structure and values"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        self.admin_token = resp.json()["access_token"]
    
    def test_summary_returns_correct_structure(self):
        """Verify deployment summary returns all expected fields"""
        today = datetime.now().strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/api/admin/deployment-summary?shift_date={today}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        
        # Verify required fields
        required_fields = [
            "date", "total_bnbs", "active_bnbs", "total_kits", 
            "deployed_kits", "total_workers", "assigned_workers",
            "shifts_started", "shifts_ended", "assignments", "bnbs",
            "available_kits", "available_workers"
        ]
        for field in required_fields:
            assert field in data, f"Missing field: {field}"
        
        # Verify types
        assert isinstance(data["total_bnbs"], int)
        assert isinstance(data["total_kits"], int)
        assert isinstance(data["assignments"], list)
        print(f"✓ Summary structure verified with all {len(required_fields)} required fields")
    
    def test_summary_for_different_dates(self):
        """Verify summary works for different dates"""
        # Today
        today = datetime.now().strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/api/admin/deployment-summary?shift_date={today}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert resp.status_code == 200
        
        # Tomorrow
        tomorrow = (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/api/admin/deployment-summary?shift_date={tomorrow}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["date"] == tomorrow
        print(f"✓ Summary works for multiple dates (today and tomorrow)")


class TestAssignmentCRUD:
    """Test CRUD operations for assignments"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        self.admin_token = resp.json()["access_token"]
        self.created_assignment_id = None
    
    def test_create_assignment(self):
        """Admin can create a new assignment"""
        # Use a future date to avoid conflicts
        future_date = (datetime.now() + timedelta(days=30)).strftime("%Y-%m-%d")
        
        resp = requests.post(
            f"{BASE_URL}/api/admin/assignments",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={
                "bnb_id": "BNB-01",
                "kit_ids": ["KIT-01", "KIT-02"],
                "shift_date": future_date,
                "morning_team": ["user_1"],
                "night_team": ["user_2"]
            }
        )
        assert resp.status_code == 200, f"Expected 200, got {resp.status_code}: {resp.text}"
        data = resp.json()
        
        assert "id" in data
        assert data["bnb_id"] == "BNB-01"
        assert data["kit_ids"] == ["KIT-01", "KIT-02"]
        assert data["shift_date"] == future_date
        assert "user_1" in data["morning_team"]
        self.created_assignment_id = data["id"]
        print(f"✓ Created assignment {data['id']} for {future_date}")
        
        # Verify by getting the assignment
        resp = requests.get(
            f"{BASE_URL}/api/admin/assignments?shift_date={future_date}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert resp.status_code == 200
        assignments = resp.json()
        found = any(a["id"] == self.created_assignment_id for a in assignments)
        assert found, "Created assignment not found in GET response"
        print(f"✓ Verified assignment exists via GET")
    
    def test_get_assignments_by_date(self):
        """Get assignments filtered by date"""
        today = datetime.now().strftime("%Y-%m-%d")
        resp = requests.get(
            f"{BASE_URL}/api/admin/assignments?shift_date={today}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        # All returned assignments should have the correct date
        for assignment in data:
            assert assignment["shift_date"] == today, f"Wrong date: {assignment['shift_date']}"
        print(f"✓ Got {len(data)} assignments for {today}")
    
    def test_get_assignments_range(self):
        """Get assignments for date range"""
        start_date = datetime.now().strftime("%Y-%m-%d")
        end_date = (datetime.now() + timedelta(days=7)).strftime("%Y-%m-%d")
        
        resp = requests.get(
            f"{BASE_URL}/api/admin/assignments/range?start_date={start_date}&end_date={end_date}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert isinstance(data, list)
        print(f"✓ Got {len(data)} assignments for range {start_date} to {end_date}")
    
    def test_update_assignment(self):
        """Admin can update an existing assignment"""
        # First create an assignment
        future_date = (datetime.now() + timedelta(days=31)).strftime("%Y-%m-%d")
        
        create_resp = requests.post(
            f"{BASE_URL}/api/admin/assignments",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={
                "bnb_id": "BNB-02",
                "kit_ids": ["KIT-04"],
                "shift_date": future_date,
                "morning_team": [],
                "night_team": []
            }
        )
        assert create_resp.status_code == 200
        assignment_id = create_resp.json()["id"]
        
        # Update the assignment
        update_resp = requests.put(
            f"{BASE_URL}/api/admin/assignments/{assignment_id}",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={
                "bnb_id": "BNB-02",
                "kit_ids": ["KIT-04", "KIT-05"],
                "shift_date": future_date,
                "morning_team": ["user_2"],
                "night_team": ["user_1"]
            }
        )
        assert update_resp.status_code == 200, f"Update failed: {update_resp.text}"
        updated = update_resp.json()
        
        assert updated["kit_ids"] == ["KIT-04", "KIT-05"]
        assert "user_2" in updated["morning_team"]
        assert "user_1" in updated["night_team"]
        print(f"✓ Updated assignment {assignment_id}")
    
    def test_delete_assignment(self):
        """Admin can delete an assignment"""
        # Create an assignment to delete
        future_date = (datetime.now() + timedelta(days=32)).strftime("%Y-%m-%d")
        
        create_resp = requests.post(
            f"{BASE_URL}/api/admin/assignments",
            headers={"Authorization": f"Bearer {self.admin_token}"},
            json={
                "bnb_id": "BNB-01",
                "kit_ids": ["KIT-01"],
                "shift_date": future_date,
                "morning_team": [],
                "night_team": []
            }
        )
        assignment_id = create_resp.json()["id"]
        
        # Delete the assignment
        delete_resp = requests.delete(
            f"{BASE_URL}/api/admin/assignments/{assignment_id}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assert delete_resp.status_code == 200, f"Delete failed: {delete_resp.text}"
        
        # Verify deletion
        get_resp = requests.get(
            f"{BASE_URL}/api/admin/assignments?shift_date={future_date}",
            headers={"Authorization": f"Bearer {self.admin_token}"}
        )
        assignments = get_resp.json()
        found = any(a["id"] == assignment_id for a in assignments)
        assert not found, "Deleted assignment still exists"
        print(f"✓ Deleted assignment {assignment_id}")


class TestEnhancedShiftEvents:
    """Test enhanced end shift with inventory health checklist"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # Login as deployer
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        self.deployer_token = resp.json()["access_token"]
        
        # Get deployer user info
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {self.deployer_token}"}
        )
        self.user = resp.json()
    
    def test_create_start_shift_event(self):
        """Deployer can create start shift event with SSD"""
        resp = requests.post(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {self.deployer_token}"},
            json={
                "event_type": "start_shift",
                "user_id": self.user["id"],
                "from_kit": "KIT-01",
                "ssd_id": "SSD-001",
                "notes": "Test start shift"
            }
        )
        assert resp.status_code == 200, f"Start shift failed: {resp.text}"
        data = resp.json()
        
        assert data["event_type"] == "start_shift"
        assert data["ssd_id"] == "SSD-001"
        assert data["from_kit"] == "KIT-01"
        print(f"✓ Created start shift event with SSD tracking")
    
    def test_create_end_shift_with_inventory_health(self):
        """Deployer can create end shift event with extended data"""
        resp = requests.post(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {self.deployer_token}"},
            json={
                "event_type": "end_shift",
                "user_id": self.user["id"],
                "from_kit": "KIT-01",
                "ssd_id": "SSD-001",
                "ssd_space_gb": 750,
                "hours_recorded": 4.5,
                "data_category": "cooking",
                "notes": "Hours: 4.5 | Category: cooking | Inventory Issues: Left Glove: wear, Head Cam: damaged"
            }
        )
        assert resp.status_code == 200, f"End shift failed: {resp.text}"
        data = resp.json()
        
        assert data["event_type"] == "end_shift"
        assert data["ssd_id"] == "SSD-001"
        assert data["ssd_space_gb"] == 750
        assert data["hours_recorded"] == 4.5
        assert data["data_category"] == "cooking"
        print(f"✓ Created end shift event with inventory health data")
    
    def test_get_shift_events(self):
        """Get shift events filtered by type"""
        resp = requests.get(
            f"{BASE_URL}/api/events?event_type=end_shift",
            headers={"Authorization": f"Bearer {self.deployer_token}"}
        )
        assert resp.status_code == 200
        events = resp.json()
        
        # All should be end_shift events
        for event in events:
            assert event["event_type"] == "end_shift"
        print(f"✓ Got {len(events)} end_shift events")


class TestDeployerKitFiltering:
    """Test that deployers see only kits assigned to their BnB"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        # Login as deployer (John Deployer - assigned to BNB-01)
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        self.deployer_token = resp.json()["access_token"]
        
        # Login as admin
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        self.admin_token = resp.json()["access_token"]
    
    def test_deployer_has_assigned_bnb(self):
        """Verify deployer has assigned_bnb set"""
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {self.deployer_token}"}
        )
        assert resp.status_code == 200
        user = resp.json()
        
        # Deployer should have an assigned BnB (either BNB-01 or BNB-02)
        assert user.get("assigned_bnb") is not None, "Deployer should have assigned_bnb"
        assert user["assigned_bnb"].startswith("BNB-"), f"assigned_bnb should be a BnB: {user['assigned_bnb']}"
        assert user["role"] == "deployer"
        self.deployer_bnb = user["assigned_bnb"]
        print(f"✓ Deployer {user['name']} is assigned to {user['assigned_bnb']}")
    
    def test_get_kits_returns_all_for_filtering(self):
        """Deployer can get all kits (filtering happens in frontend)"""
        resp = requests.get(
            f"{BASE_URL}/api/kits",
            headers={"Authorization": f"Bearer {self.deployer_token}"}
        )
        assert resp.status_code == 200
        kits = resp.json()
        
        # Check that kits have assigned_bnb field
        kit_kits = [k for k in kits if k["type"] == "kit"]
        bnb01_kits = [k for k in kit_kits if k.get("assigned_bnb") == "BNB-01"]
        
        assert len(bnb01_kits) > 0, "Should have kits assigned to BNB-01"
        print(f"✓ Got {len(kit_kits)} kits total, {len(bnb01_kits)} assigned to BNB-01")
    
    def test_my_bnb_dashboard(self):
        """Deployer can access their BnB dashboard"""
        resp = requests.get(
            f"{BASE_URL}/api/my-bnb/dashboard",
            headers={"Authorization": f"Bearer {self.deployer_token}"}
        )
        assert resp.status_code == 200
        data = resp.json()
        
        # BnB should be a valid BnB 
        assert data["bnb"]["kit_id"].startswith("BNB-"), f"Expected BnB, got {data['bnb']['kit_id']}"
        assert "kits" in data
        assert "assignment" in data or data["assignment"] is None  # May not have assignment
        print(f"✓ Deployer BnB dashboard shows {data['bnb']['kit_id']} with {len(data['kits'])} kits")


class TestSSDTracking:
    """Test SSD tracking in shift events"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        self.deployer_token = resp.json()["access_token"]
    
    def test_get_ssds(self):
        """Get all SSDs for shift tracking"""
        resp = requests.get(
            f"{BASE_URL}/api/items/ssds",
            headers={"Authorization": f"Bearer {self.deployer_token}"}
        )
        assert resp.status_code == 200
        ssds = resp.json()
        
        # All should be SSD category
        for ssd in ssds:
            assert ssd["category"] == "ssd"
            assert "total_capacity_gb" in ssd
        print(f"✓ Got {len(ssds)} SSDs for shift tracking")
    
    def test_end_shift_updates_ssd_space(self):
        """End shift event includes SSD space tracking"""
        # Get user
        resp = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers={"Authorization": f"Bearer {self.deployer_token}"}
        )
        user = resp.json()
        
        # Create end shift with SSD space
        resp = requests.post(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {self.deployer_token}"},
            json={
                "event_type": "end_shift",
                "user_id": user["id"],
                "from_kit": "KIT-01",
                "ssd_id": "SSD-001",
                "ssd_space_gb": 500,
                "notes": "Test SSD space tracking"
            }
        )
        assert resp.status_code == 200
        event = resp.json()
        
        assert event["ssd_id"] == "SSD-001"
        assert event["ssd_space_gb"] == 500
        print(f"✓ End shift recorded SSD-001 with 500GB available")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
