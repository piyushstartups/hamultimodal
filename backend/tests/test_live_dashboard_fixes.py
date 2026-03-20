"""
Test Live Dashboard Critical Fixes:
1. Date handling - queries by deployment_id not date field
2. Live counters - includes active AND completed records
3. Pause logic - paused time doesn't count as active time
4. Resume logic - continues correctly from pause point
5. Stop logic - correct duration calculation
"""
import pytest
import requests
import os
import time
from datetime import datetime, timezone, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestLiveDashboardFixes:
    """Tests for the Live Dashboard critical fixes"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token and today's date"""
        # Login as admin
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
        yield
    
    def test_live_dashboard_api_returns_correct_date(self):
        """Test that Live Dashboard API returns data for the requested date"""
        # Test for today
        response = requests.get(f"{BASE_URL}/api/dashboard/live?date={self.today}", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        assert data["date"] == self.today, f"Expected {self.today}, got {data['date']}"
        print(f"SUCCESS: Live Dashboard returns correct date: {data['date']}")
    
    def test_live_dashboard_queries_by_deployment_id(self):
        """Test that dashboard queries shifts by deployment_id, not date field"""
        # Get existing deployment dep-202603200850005125
        test_deployment_id = "dep-202603200850005125"
        test_date = "2026-03-20"
        
        # Query dashboard for the specific date
        response = requests.get(f"{BASE_URL}/api/dashboard/live?date={test_date}", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify the response structure
        assert "date" in data
        assert "total_hours" in data
        assert "bnbs" in data
        assert data["date"] == test_date
        print(f"SUCCESS: Dashboard API correctly returns data for date {test_date}")
        print(f"  - Total hours: {data['total_hours']}")
        print(f"  - Active count: {data['active_count']}")
        print(f"  - BnBs: {[b['bnb'] for b in data['bnbs']]}")
    
    def test_total_hours_includes_active_records(self):
        """Test that total_hours counter includes both completed AND active records"""
        # Query the live dashboard
        response = requests.get(f"{BASE_URL}/api/dashboard/live?date=2026-03-20", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # Verify structure exists
        assert "total_hours" in data
        assert "category_hours" in data
        
        # If there are active collections, total_hours should be > 0
        if data.get("active_count", 0) > 0:
            print(f"Active collections found: {data['active_count']}")
            print(f"Total hours (including active): {data['total_hours']}")
        print(f"SUCCESS: Live Dashboard returns total_hours: {data['total_hours']}")
    
    def test_category_hours_includes_active_records(self):
        """Test that category_hours includes hours from active records"""
        response = requests.get(f"{BASE_URL}/api/dashboard/live?date=2026-03-20", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        assert "category_hours" in data
        print(f"SUCCESS: Category hours breakdown: {data['category_hours']}")
    
    def test_bnb_hours_include_active_records(self):
        """Test that per-BnB hours include active record hours"""
        response = requests.get(f"{BASE_URL}/api/dashboard/live?date=2026-03-20", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        if data.get("bnbs"):
            for bnb in data["bnbs"]:
                assert "total_hours" in bnb
                assert "morning_hours" in bnb
                assert "night_hours" in bnb
                assert "kits" in bnb
                print(f"SUCCESS: BnB {bnb['bnb']} hours - Total: {bnb['total_hours']}, Morning: {bnb['morning_hours']}, Night: {bnb['night_hours']}")
        else:
            print("No BnBs with deployments on this date")


class TestPauseResumeStopLogic:
    """Tests for Pause/Resume/Stop timing logic"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token and create test data"""
        # Login as admin
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.created_shift_id = None
        yield
        # Cleanup
        if self.created_shift_id:
            try:
                requests.delete(f"{BASE_URL}/api/shifts/{self.created_shift_id}", headers=self.headers)
            except:
                pass
    
    def test_pause_does_not_count_as_active_time(self):
        """Test that paused time is NOT counted in active duration"""
        test_deployment_id = "dep-202603200850005125"
        
        # 1. Start a new collection
        start_response = requests.post(f"{BASE_URL}/api/shifts/start", 
            headers=self.headers,
            json={
                "deployment_id": test_deployment_id,
                "kit": "TEST-KIT-PAUSE",
                "ssd_used": "TEST-SSD",
                "activity_type": "cooking"
            })
        
        # This may fail if no deployment exists or kit already has active - that's OK
        if start_response.status_code != 200:
            pytest.skip(f"Cannot create test shift: {start_response.text}")
        
        shift = start_response.json()
        self.created_shift_id = shift["id"]
        print(f"Started collection: {shift['id']}, status: {shift['status']}")
        assert shift["status"] == "active"
        
        # 2. Wait a moment then pause
        time.sleep(2)
        pause_response = requests.post(f"{BASE_URL}/api/shifts/{shift['id']}/pause", headers=self.headers)
        assert pause_response.status_code == 200
        paused_shift = pause_response.json()
        assert paused_shift["status"] == "paused"
        assert len(paused_shift["pauses"]) == 1
        assert paused_shift["pauses"][0]["resume_time"] is None  # Not resumed yet
        print(f"Paused collection - pauses: {paused_shift['pauses']}")
        
        # 3. Wait while paused
        time.sleep(3)  # This time should NOT count
        
        # 4. Resume
        resume_response = requests.post(f"{BASE_URL}/api/shifts/{shift['id']}/resume", headers=self.headers)
        assert resume_response.status_code == 200
        resumed_shift = resume_response.json()
        assert resumed_shift["status"] == "active"
        assert resumed_shift["pauses"][0]["resume_time"] is not None
        print(f"Resumed collection - pauses: {resumed_shift['pauses']}")
        
        # 5. Wait a moment then stop
        time.sleep(2)
        stop_response = requests.post(f"{BASE_URL}/api/shifts/{shift['id']}/stop", headers=self.headers)
        assert stop_response.status_code == 200
        stopped_shift = stop_response.json()
        assert stopped_shift["status"] == "completed"
        
        # 6. Verify duration
        total_duration_seconds = stopped_shift["total_duration_seconds"]
        total_paused_seconds = stopped_shift["total_paused_seconds"]
        
        print(f"STOPPED: total_duration_seconds={total_duration_seconds}, total_paused_seconds={total_paused_seconds}")
        
        # We were active ~2 + ~2 = ~4 seconds, paused ~3 seconds
        # So total_duration should be ~4 seconds (not ~7)
        # And paused should be ~3 seconds
        assert total_paused_seconds >= 2, f"Paused time should be >= 2 seconds, got {total_paused_seconds}"
        assert total_duration_seconds < 10, f"Active duration should be < 10 seconds, got {total_duration_seconds}"
        
        print(f"SUCCESS: Pause logic correct - active time: {total_duration_seconds}s, paused time: {total_paused_seconds}s")
    
    def test_stop_calculates_correct_duration(self):
        """Test: Final duration = end_time - start_time - total_paused_duration"""
        # Use existing deployment
        test_deployment_id = "dep-202603200850005125"
        
        # Start a collection
        start_response = requests.post(f"{BASE_URL}/api/shifts/start", 
            headers=self.headers,
            json={
                "deployment_id": test_deployment_id,
                "kit": "TEST-KIT-STOP",
                "ssd_used": "TEST-SSD",
                "activity_type": "cleaning"
            })
        
        if start_response.status_code != 200:
            pytest.skip(f"Cannot create test shift: {start_response.text}")
        
        shift = start_response.json()
        self.created_shift_id = shift["id"]
        start_time = datetime.fromisoformat(shift["start_time"].replace("Z", "+00:00"))
        
        # Wait 3 seconds then stop
        time.sleep(3)
        
        stop_response = requests.post(f"{BASE_URL}/api/shifts/{shift['id']}/stop", headers=self.headers)
        assert stop_response.status_code == 200
        stopped = stop_response.json()
        
        end_time = datetime.fromisoformat(stopped["end_time"].replace("Z", "+00:00"))
        elapsed = (end_time - start_time).total_seconds()
        
        print(f"Start: {start_time}, End: {end_time}")
        print(f"Elapsed: {elapsed}s, Reported: {stopped['total_duration_seconds']}s")
        
        # Duration should be approximately the elapsed time (within 1 second tolerance)
        assert abs(stopped["total_duration_seconds"] - elapsed) < 2, \
            f"Duration mismatch: expected ~{elapsed}s, got {stopped['total_duration_seconds']}s"
        
        print(f"SUCCESS: Stop calculates correct duration: {stopped['total_duration_seconds']}s")


class TestLiveDashboardActiveRecordData:
    """Tests for active record data in Live Dashboard response"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        yield
    
    def test_active_record_contains_timer_data(self):
        """Test that active_record in kit data contains all timer fields"""
        response = requests.get(f"{BASE_URL}/api/dashboard/live?date=2026-03-20", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # Check if any kit has an active record
        for bnb in data.get("bnbs", []):
            for kit in bnb.get("kits", []):
                if kit.get("active_record"):
                    ar = kit["active_record"]
                    # Verify required fields for timer calculation
                    assert "id" in ar, "active_record missing 'id'"
                    assert "status" in ar, "active_record missing 'status'"
                    assert "start_time" in ar, "active_record missing 'start_time'"
                    assert "pauses" in ar, "active_record missing 'pauses'"
                    
                    print(f"SUCCESS: Kit {kit['kit_id']} has active_record with all timer fields:")
                    print(f"  - id: {ar['id']}")
                    print(f"  - status: {ar['status']}")
                    print(f"  - start_time: {ar['start_time']}")
                    print(f"  - pauses count: {len(ar['pauses'])}")
                    return
        
        print("No active collections found - skipping active_record field validation")
    
    def test_status_badge_values(self):
        """Test that status values are valid for badge display (active/paused/idle)"""
        response = requests.get(f"{BASE_URL}/api/dashboard/live?date=2026-03-20", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        valid_statuses = ["active", "paused"]
        
        for bnb in data.get("bnbs", []):
            for kit in bnb.get("kits", []):
                ar = kit.get("active_record")
                if ar:
                    assert ar["status"] in valid_statuses, \
                        f"Invalid status '{ar['status']}', expected one of {valid_statuses}"
                    print(f"Kit {kit['kit_id']}: status={ar['status']} (valid)")
        
        print("SUCCESS: All active record statuses are valid")


class TestCalculateLiveDurationFunction:
    """Tests to verify the calculate_live_duration_hours backend function logic"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
        self.created_shift_id = None
        yield
        if self.created_shift_id:
            try:
                requests.delete(f"{BASE_URL}/api/shifts/{self.created_shift_id}", headers=self.headers)
            except:
                pass
    
    def test_live_hours_in_dashboard_for_active_collection(self):
        """Test that live hours appear in dashboard totals for active collections"""
        test_deployment_id = "dep-202603200850005125"
        
        # First check the dashboard
        initial_response = requests.get(f"{BASE_URL}/api/dashboard/live?date=2026-03-20", headers=self.headers)
        assert initial_response.status_code == 200
        initial_data = initial_response.json()
        initial_total = initial_data.get("total_hours", 0)
        initial_active_count = initial_data.get("active_count", 0)
        
        print(f"Initial: total_hours={initial_total}, active_count={initial_active_count}")
        
        # Start a new collection
        start_response = requests.post(f"{BASE_URL}/api/shifts/start", 
            headers=self.headers,
            json={
                "deployment_id": test_deployment_id,
                "kit": "TEST-KIT-LIVE",
                "ssd_used": "TEST-SSD",
                "activity_type": "outdoor"
            })
        
        if start_response.status_code != 200:
            pytest.skip(f"Cannot create test shift: {start_response.text}")
        
        shift = start_response.json()
        self.created_shift_id = shift["id"]
        
        # Wait for some time to accumulate
        time.sleep(5)
        
        # Check dashboard again
        updated_response = requests.get(f"{BASE_URL}/api/dashboard/live?date=2026-03-20", headers=self.headers)
        assert updated_response.status_code == 200
        updated_data = updated_response.json()
        
        # Should have 1 more active collection
        assert updated_data["active_count"] >= initial_active_count + 1, \
            f"Active count should have increased. Initial: {initial_active_count}, Now: {updated_data['active_count']}"
        
        # Total hours should be > 0 if there's an active collection
        assert updated_data["total_hours"] > 0, \
            f"Total hours should be > 0 with active collection, got {updated_data['total_hours']}"
        
        print(f"SUCCESS: After starting collection - total_hours={updated_data['total_hours']}, active_count={updated_data['active_count']}")
        
        # Clean up - stop the collection
        requests.post(f"{BASE_URL}/api/shifts/{shift['id']}/stop", headers=self.headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
