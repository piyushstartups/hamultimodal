"""
Test Collection System and Analytics Features
Tests for:
1. Collection system - Start/Pause/Resume/Stop
2. Collection system - Any deployment manager can control collections on their deployment
3. Analytics - Shows Total Deployments and Collection Records
4. Live Dashboard - Date matching and real-time status
"""
import pytest
import requests
import os
from datetime import datetime, timedelta
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestCollectionSystem:
    """Tests for the collection (shift) system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        # Login as admin first
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200, f"Admin login failed: {login_resp.text}"
        self.admin_token = login_resp.json()["access_token"]
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        
        # Try to create Test Manager if doesn't exist, otherwise login
        try:
            create_resp = requests.post(f"{BASE_URL}/api/users", json={
                "name": "Test Manager",
                "role": "deployment_manager",
                "password": "test123"
            }, headers=self.admin_headers)
        except:
            pass
        
        # Login as Test Manager
        manager_login = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Test Manager",
            "password": "test123"
        })
        if manager_login.status_code == 200:
            self.manager_token = manager_login.json()["access_token"]
            self.manager_id = manager_login.json()["user"]["id"]
            self.manager_headers = {"Authorization": f"Bearer {self.manager_token}"}
        else:
            self.manager_token = None
            self.manager_id = None
            self.manager_headers = self.admin_headers
        
        yield
    
    def test_start_collection_creates_new_record(self):
        """Test: Start Collection creates a new record"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Get existing deployments for today
        deps_resp = requests.get(f"{BASE_URL}/api/deployments?date={today}", headers=self.admin_headers)
        assert deps_resp.status_code == 200
        deployments = deps_resp.json()
        
        if not deployments:
            pytest.skip("No deployments for today - need existing deployment to test")
        
        # Use first deployment
        deployment = deployments[0]
        deployment_id = deployment["id"]
        
        # Get assigned kits
        kits = deployment.get("assigned_kits", [])
        if not kits:
            pytest.skip("No kits assigned to deployment")
        
        test_kit = kits[0]
        
        # Check for existing active records and stop them
        shifts_resp = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{deployment_id}", headers=self.admin_headers)
        if shifts_resp.status_code == 200:
            kit_data = shifts_resp.json().get(test_kit, {})
            active_record = kit_data.get("active_record")
            if active_record:
                # Stop existing active record
                requests.post(f"{BASE_URL}/api/shifts/{active_record['id']}/stop", headers=self.admin_headers)
        
        # Start a new collection
        start_resp = requests.post(f"{BASE_URL}/api/shifts/start", json={
            "deployment_id": deployment_id,
            "kit": test_kit,
            "ssd_used": "TEST-SSD-001",
            "activity_type": "cooking"
        }, headers=self.admin_headers)
        
        assert start_resp.status_code == 200, f"Failed to start collection: {start_resp.text}"
        record = start_resp.json()
        
        # Validate record structure
        assert record["status"] == "active", "New record should be active"
        assert record["kit"] == test_kit
        assert record["deployment_id"] == deployment_id
        assert record["ssd_used"] == "TEST-SSD-001"
        assert record["activity_type"] == "cooking"
        assert "id" in record
        assert "start_time" in record
        
        # Cleanup - stop the collection
        requests.post(f"{BASE_URL}/api/shifts/{record['id']}/stop", headers=self.admin_headers)
        print(f"TEST PASSED: Start Collection creates new record with ID: {record['id']}")
    
    def test_pause_button_works_and_updates_status(self):
        """Test: Pause button works and updates status to 'paused'"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Get deployments for today
        deps_resp = requests.get(f"{BASE_URL}/api/deployments?date={today}", headers=self.admin_headers)
        assert deps_resp.status_code == 200
        deployments = deps_resp.json()
        
        if not deployments:
            pytest.skip("No deployments for today")
        
        deployment = deployments[0]
        deployment_id = deployment["id"]
        kits = deployment.get("assigned_kits", [])
        if not kits:
            pytest.skip("No kits assigned")
        
        test_kit = kits[0]
        
        # Ensure no active record exists
        shifts_resp = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{deployment_id}", headers=self.admin_headers)
        if shifts_resp.status_code == 200:
            kit_data = shifts_resp.json().get(test_kit, {})
            active_record = kit_data.get("active_record")
            if active_record:
                requests.post(f"{BASE_URL}/api/shifts/{active_record['id']}/stop", headers=self.admin_headers)
        
        # Start a collection
        start_resp = requests.post(f"{BASE_URL}/api/shifts/start", json={
            "deployment_id": deployment_id,
            "kit": test_kit,
            "ssd_used": "TEST-SSD-002",
            "activity_type": "cleaning"
        }, headers=self.admin_headers)
        assert start_resp.status_code == 200
        record_id = start_resp.json()["id"]
        
        # Pause the collection
        pause_resp = requests.post(f"{BASE_URL}/api/shifts/{record_id}/pause", headers=self.admin_headers)
        assert pause_resp.status_code == 200, f"Pause failed: {pause_resp.text}"
        
        paused_record = pause_resp.json()
        assert paused_record["status"] == "paused", f"Status should be 'paused', got: {paused_record['status']}"
        assert len(paused_record.get("pauses", [])) > 0, "Should have pause entries"
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/shifts/{record_id}/stop", headers=self.admin_headers)
        print(f"TEST PASSED: Pause works correctly, status changed to 'paused'")
    
    def test_resume_button_works_after_pause(self):
        """Test: Resume button works after pause"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        deps_resp = requests.get(f"{BASE_URL}/api/deployments?date={today}", headers=self.admin_headers)
        deployments = deps_resp.json()
        
        if not deployments:
            pytest.skip("No deployments for today")
        
        deployment = deployments[0]
        deployment_id = deployment["id"]
        kits = deployment.get("assigned_kits", [])
        if not kits:
            pytest.skip("No kits assigned")
        
        test_kit = kits[0]
        
        # Ensure no active record
        shifts_resp = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{deployment_id}", headers=self.admin_headers)
        if shifts_resp.status_code == 200:
            kit_data = shifts_resp.json().get(test_kit, {})
            active_record = kit_data.get("active_record")
            if active_record:
                requests.post(f"{BASE_URL}/api/shifts/{active_record['id']}/stop", headers=self.admin_headers)
        
        # Start collection
        start_resp = requests.post(f"{BASE_URL}/api/shifts/start", json={
            "deployment_id": deployment_id,
            "kit": test_kit,
            "ssd_used": "TEST-SSD-003",
            "activity_type": "organizing"
        }, headers=self.admin_headers)
        assert start_resp.status_code == 200
        record_id = start_resp.json()["id"]
        
        # Pause
        pause_resp = requests.post(f"{BASE_URL}/api/shifts/{record_id}/pause", headers=self.admin_headers)
        assert pause_resp.status_code == 200
        assert pause_resp.json()["status"] == "paused"
        
        # Resume
        resume_resp = requests.post(f"{BASE_URL}/api/shifts/{record_id}/resume", headers=self.admin_headers)
        assert resume_resp.status_code == 200, f"Resume failed: {resume_resp.text}"
        
        resumed_record = resume_resp.json()
        assert resumed_record["status"] == "active", f"Status should be 'active' after resume, got: {resumed_record['status']}"
        
        # Check that pause entry has resume_time
        pauses = resumed_record.get("pauses", [])
        assert len(pauses) > 0
        assert pauses[-1].get("resume_time") is not None, "Last pause should have resume_time"
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/shifts/{record_id}/stop", headers=self.admin_headers)
        print(f"TEST PASSED: Resume works correctly, status changed back to 'active'")
    
    def test_stop_button_works_and_calculates_duration(self):
        """Test: Stop button works and calculates duration"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        deps_resp = requests.get(f"{BASE_URL}/api/deployments?date={today}", headers=self.admin_headers)
        deployments = deps_resp.json()
        
        if not deployments:
            pytest.skip("No deployments for today")
        
        deployment = deployments[0]
        deployment_id = deployment["id"]
        kits = deployment.get("assigned_kits", [])
        if not kits:
            pytest.skip("No kits assigned")
        
        test_kit = kits[0]
        
        # Ensure no active record
        shifts_resp = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{deployment_id}", headers=self.admin_headers)
        if shifts_resp.status_code == 200:
            kit_data = shifts_resp.json().get(test_kit, {})
            active_record = kit_data.get("active_record")
            if active_record:
                requests.post(f"{BASE_URL}/api/shifts/{active_record['id']}/stop", headers=self.admin_headers)
        
        # Start collection
        start_resp = requests.post(f"{BASE_URL}/api/shifts/start", json={
            "deployment_id": deployment_id,
            "kit": test_kit,
            "ssd_used": "TEST-SSD-004",
            "activity_type": "other"
        }, headers=self.admin_headers)
        assert start_resp.status_code == 200
        record_id = start_resp.json()["id"]
        
        # Wait a moment
        time.sleep(1)
        
        # Stop the collection
        stop_resp = requests.post(f"{BASE_URL}/api/shifts/{record_id}/stop", headers=self.admin_headers)
        assert stop_resp.status_code == 200, f"Stop failed: {stop_resp.text}"
        
        stopped_record = stop_resp.json()
        assert stopped_record["status"] == "completed", f"Status should be 'completed', got: {stopped_record['status']}"
        assert stopped_record.get("end_time") is not None, "Should have end_time"
        assert stopped_record.get("total_duration_seconds") is not None, "Should have total_duration_seconds"
        assert stopped_record.get("total_duration_hours") is not None, "Should have total_duration_hours"
        assert stopped_record["total_duration_seconds"] > 0, "Duration should be > 0"
        
        print(f"TEST PASSED: Stop works correctly, duration calculated: {stopped_record['total_duration_hours']} hours")
    
    def test_any_deployment_manager_can_control_collection(self):
        """Test: Any deployment manager can control any collection on their deployment"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        if not self.manager_token:
            pytest.skip("Manager not available for testing")
        
        # Get deployments where Test Manager is assigned
        deps_resp = requests.get(f"{BASE_URL}/api/deployments?date={today}", headers=self.manager_headers)
        assert deps_resp.status_code == 200
        deployments = deps_resp.json()
        
        # Find deployment where this manager is assigned
        manager_deployment = None
        for dep in deployments:
            if self.manager_id in dep.get("deployment_managers", []):
                manager_deployment = dep
                break
        
        if not manager_deployment:
            pytest.skip("Test Manager not assigned to any deployment today")
        
        deployment_id = manager_deployment["id"]
        kits = manager_deployment.get("assigned_kits", [])
        if not kits:
            pytest.skip("No kits assigned")
        
        test_kit = kits[0]
        
        # Ensure no active record - as admin
        shifts_resp = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{deployment_id}", headers=self.admin_headers)
        if shifts_resp.status_code == 200:
            kit_data = shifts_resp.json().get(test_kit, {})
            active_record = kit_data.get("active_record")
            if active_record:
                requests.post(f"{BASE_URL}/api/shifts/{active_record['id']}/stop", headers=self.admin_headers)
        
        # Admin starts a collection
        start_resp = requests.post(f"{BASE_URL}/api/shifts/start", json={
            "deployment_id": deployment_id,
            "kit": test_kit,
            "ssd_used": "TEST-SSD-005",
            "activity_type": "cooking"
        }, headers=self.admin_headers)
        assert start_resp.status_code == 200
        record_id = start_resp.json()["id"]
        
        # Manager should be able to pause the collection (even though admin started it)
        pause_resp = requests.post(f"{BASE_URL}/api/shifts/{record_id}/pause", headers=self.manager_headers)
        assert pause_resp.status_code == 200, f"Manager should be able to pause collection on their deployment: {pause_resp.text}"
        assert pause_resp.json()["status"] == "paused"
        
        # Manager should be able to resume
        resume_resp = requests.post(f"{BASE_URL}/api/shifts/{record_id}/resume", headers=self.manager_headers)
        assert resume_resp.status_code == 200, f"Manager should be able to resume collection: {resume_resp.text}"
        assert resume_resp.json()["status"] == "active"
        
        # Manager should be able to stop
        stop_resp = requests.post(f"{BASE_URL}/api/shifts/{record_id}/stop", headers=self.manager_headers)
        assert stop_resp.status_code == 200, f"Manager should be able to stop collection: {stop_resp.text}"
        assert stop_resp.json()["status"] == "completed"
        
        print(f"TEST PASSED: Manager can control collection started by admin on their deployment")


class TestLiveDashboard:
    """Tests for Live Dashboard"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        self.admin_token = login_resp.json()["access_token"]
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        yield
    
    def test_live_dashboard_returns_correct_date(self):
        """Test: Live Dashboard shows correct date matching selected date"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Get dashboard for today
        resp = requests.get(f"{BASE_URL}/api/dashboard/live?date={today}", headers=self.admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert data["date"] == today, f"Dashboard date should match requested date. Expected: {today}, Got: {data['date']}"
        print(f"TEST PASSED: Live Dashboard returns correct date: {data['date']}")
    
    def test_live_dashboard_has_realtime_tracking_data(self):
        """Test: Live Dashboard includes active_record data for real-time tracking"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        resp = requests.get(f"{BASE_URL}/api/dashboard/live?date={today}", headers=self.admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Check structure
        assert "bnbs" in data, "Should have bnbs array"
        assert "total_hours" in data, "Should have total_hours"
        assert "active_count" in data, "Should have active_count"
        
        # Check BnB data structure
        for bnb in data.get("bnbs", []):
            assert "kits" in bnb, "BnB should have kits array"
            for kit in bnb.get("kits", []):
                assert "kit_id" in kit, "Kit should have kit_id"
                # active_record can be null if no active collection
                # But the field should be present
                assert "active_record" in kit, "Kit should have active_record field (can be null)"
                
                # If there's an active record, verify structure
                if kit.get("active_record"):
                    ar = kit["active_record"]
                    assert "id" in ar, "active_record should have id"
                    assert "status" in ar, "active_record should have status"
                    assert "start_time" in ar, "active_record should have start_time"
                    assert "pauses" in ar, "active_record should have pauses array"
        
        print(f"TEST PASSED: Live Dashboard has real-time tracking data structure")
    
    def test_live_dashboard_shows_status_in_active_record(self):
        """Test: Live Dashboard shows status (Active/Paused/Idle) for each kit"""
        today = datetime.now().strftime("%Y-%m-%d")
        
        # Get deployments to find a kit to test
        deps_resp = requests.get(f"{BASE_URL}/api/deployments?date={today}", headers=self.admin_headers)
        deployments = deps_resp.json()
        
        if not deployments:
            pytest.skip("No deployments for today")
        
        deployment = deployments[0]
        deployment_id = deployment["id"]
        kits = deployment.get("assigned_kits", [])
        
        if not kits:
            pytest.skip("No kits assigned")
        
        test_kit = kits[0]
        
        # Ensure no active record
        shifts_resp = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{deployment_id}", headers=self.admin_headers)
        if shifts_resp.status_code == 200:
            kit_data = shifts_resp.json().get(test_kit, {})
            active_record = kit_data.get("active_record")
            if active_record:
                requests.post(f"{BASE_URL}/api/shifts/{active_record['id']}/stop", headers=self.admin_headers)
        
        # Start a collection
        start_resp = requests.post(f"{BASE_URL}/api/shifts/start", json={
            "deployment_id": deployment_id,
            "kit": test_kit,
            "ssd_used": "TEST-SSD-006",
            "activity_type": "cooking"
        }, headers=self.admin_headers)
        assert start_resp.status_code == 200
        record_id = start_resp.json()["id"]
        
        # Get live dashboard - should show 'active' status
        dashboard_resp = requests.get(f"{BASE_URL}/api/dashboard/live?date={today}", headers=self.admin_headers)
        assert dashboard_resp.status_code == 200
        
        # Find the kit in dashboard data
        bnb_name = deployment["bnb"]
        dashboard_data = dashboard_resp.json()
        kit_found = False
        
        for bnb in dashboard_data.get("bnbs", []):
            if bnb["bnb"] == bnb_name:
                for kit in bnb.get("kits", []):
                    if kit["kit_id"] == test_kit:
                        kit_found = True
                        assert kit.get("active_record") is not None, "Kit should have active_record"
                        assert kit["active_record"]["status"] == "active", f"Status should be 'active', got: {kit['active_record']['status']}"
                        break
        
        assert kit_found, f"Kit {test_kit} not found in dashboard data"
        
        # Cleanup
        requests.post(f"{BASE_URL}/api/shifts/{record_id}/stop", headers=self.admin_headers)
        print(f"TEST PASSED: Live Dashboard shows correct status for active collection")


class TestAnalytics:
    """Tests for Analytics endpoint"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup test data"""
        login_resp = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert login_resp.status_code == 200
        self.admin_token = login_resp.json()["access_token"]
        self.admin_headers = {"Authorization": f"Bearer {self.admin_token}"}
        yield
    
    def test_analytics_shows_total_deployments(self):
        """Test: Analytics shows 'Total Deployments' metric"""
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=6)).strftime("%Y-%m-%d")
        
        resp = requests.get(f"{BASE_URL}/api/analytics?start_date={week_ago}&end_date={today}", headers=self.admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        assert "total_deployments" in data, "Analytics should include total_deployments"
        assert isinstance(data["total_deployments"], int), "total_deployments should be an integer"
        
        print(f"TEST PASSED: Analytics shows Total Deployments: {data['total_deployments']}")
    
    def test_analytics_shows_collection_records(self):
        """Test: Analytics shows 'Collection Records' instead of 'Total Shifts'"""
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=6)).strftime("%Y-%m-%d")
        
        resp = requests.get(f"{BASE_URL}/api/analytics?start_date={week_ago}&end_date={today}", headers=self.admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Should have total_collection_records instead of total_shifts
        assert "total_collection_records" in data, "Analytics should include total_collection_records"
        assert isinstance(data["total_collection_records"], int), "total_collection_records should be an integer"
        
        print(f"TEST PASSED: Analytics shows Collection Records: {data['total_collection_records']}")
    
    def test_analytics_does_not_have_hours_per_bnb(self):
        """Test: Analytics does NOT show 'Hours per BnB' section"""
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=6)).strftime("%Y-%m-%d")
        
        resp = requests.get(f"{BASE_URL}/api/analytics?start_date={week_ago}&end_date={today}", headers=self.admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Should NOT have hours_per_bnb
        assert "hours_per_bnb" not in data, "Analytics should NOT include hours_per_bnb"
        
        print(f"TEST PASSED: Analytics does NOT have hours_per_bnb field")
    
    def test_analytics_structure(self):
        """Test: Analytics returns expected structure"""
        today = datetime.now().strftime("%Y-%m-%d")
        week_ago = (datetime.now() - timedelta(days=6)).strftime("%Y-%m-%d")
        
        resp = requests.get(f"{BASE_URL}/api/analytics?start_date={week_ago}&end_date={today}", headers=self.admin_headers)
        assert resp.status_code == 200
        data = resp.json()
        
        # Required fields
        required_fields = [
            "start_date",
            "end_date", 
            "total_hours",
            "total_collection_records",
            "total_deployments",
            "hours_per_activity",
            "daily_trend"
        ]
        
        for field in required_fields:
            assert field in data, f"Analytics should include '{field}'"
        
        # Verify types
        assert isinstance(data["total_hours"], (int, float))
        assert isinstance(data["hours_per_activity"], list)
        assert isinstance(data["daily_trend"], list)
        
        print(f"TEST PASSED: Analytics has correct structure with all required fields")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
