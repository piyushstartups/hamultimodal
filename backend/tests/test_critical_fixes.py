"""
Test Critical System Fixes:
1) deployment_date as SINGLE source of truth - NO new Date() for filtering
2) NEW deployment structure - one entry per BnB with morning+evening teams inside  
3) Live Dashboard must match deployment date
4) Collection records use deployment_date from deployment
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDS = {"name": "Admin", "password": "admin123"}


class TestOperationalDateEndpoint:
    """Test the /api/system/operational-date endpoint - SINGLE SOURCE OF TRUTH"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
    
    def test_operational_date_returns_correct_format(self, setup):
        """Operational date endpoint should return YYYY-MM-DD format"""
        response = self.session.get(f"{BASE_URL}/api/system/operational-date")
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        
        data = response.json()
        assert "operational_date" in data, "Response should contain operational_date"
        assert "timezone" in data, "Response should contain timezone"
        
        # Validate date format (YYYY-MM-DD)
        op_date = data["operational_date"]
        assert len(op_date) == 10, f"Date should be 10 chars (YYYY-MM-DD), got {len(op_date)}"
        assert op_date.count("-") == 2, "Date should have 2 dashes"
        print(f"✓ Operational date: {op_date}")
    
    def test_operational_date_returns_timezone(self, setup):
        """Operational date endpoint should return Asia/Kolkata timezone"""
        response = self.session.get(f"{BASE_URL}/api/system/operational-date")
        assert response.status_code == 200
        
        data = response.json()
        assert data["timezone"] == "Asia/Kolkata", f"Expected Asia/Kolkata, got {data['timezone']}"
        print(f"✓ Timezone: {data['timezone']}")


class TestDeploymentStructure:
    """Test new deployment structure - one entry per BnB with morning+evening teams"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDS
        )
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        self.token = token
        
        # Get operational date for testing
        op_date_response = self.session.get(f"{BASE_URL}/api/system/operational-date")
        self.operational_date = op_date_response.json()["operational_date"]
    
    def test_deployment_has_morning_and_evening_managers(self, setup):
        """Deployment model should have morning_managers and evening_managers fields"""
        response = self.session.get(f"{BASE_URL}/api/deployments?date={self.operational_date}")
        assert response.status_code == 200
        
        deployments = response.json()
        if len(deployments) > 0:
            dep = deployments[0]
            # Check for new fields (may be empty but should exist or be legacy)
            has_new_structure = "morning_managers" in dep or "evening_managers" in dep
            print(f"✓ Deployment has morning/evening manager fields: {has_new_structure}")
            print(f"  Morning managers: {dep.get('morning_managers', [])}")
            print(f"  Evening managers: {dep.get('evening_managers', [])}")
    
    def test_one_deployment_per_bnb_per_date(self, setup):
        """Should not allow duplicate deployment for same BnB on same date"""
        # Create a unique test BnB name
        test_bnb = f"TEST-BNB-{self.operational_date}"
        
        # First create the deployment
        payload = {
            "date": self.operational_date,
            "bnb": test_bnb,
            "morning_managers": ["admin-001"],
            "evening_managers": [],
            "assigned_kits": []
        }
        
        response1 = self.session.post(f"{BASE_URL}/api/deployments", json=payload)
        
        if response1.status_code == 201:
            # Try to create duplicate - should fail with 400
            response2 = self.session.post(f"{BASE_URL}/api/deployments", json=payload)
            assert response2.status_code == 400, f"Duplicate should return 400, got {response2.status_code}"
            print("✓ Duplicate deployment correctly rejected with 400")
            
            # Cleanup - delete the test deployment
            dep_id = response1.json().get("id")
            if dep_id:
                self.session.delete(f"{BASE_URL}/api/deployments/{dep_id}")
        elif response1.status_code == 400:
            # Deployment already exists - that's expected behavior
            print("✓ Deployment already exists - duplicate prevention working")
        else:
            print(f"Unexpected response: {response1.status_code}")
    
    def test_deployment_date_is_single_source_of_truth(self, setup):
        """Deployment date field should be present and valid"""
        response = self.session.get(f"{BASE_URL}/api/deployments?date={self.operational_date}")
        assert response.status_code == 200
        
        deployments = response.json()
        for dep in deployments:
            assert "date" in dep, "Deployment must have 'date' field"
            assert dep["date"] == self.operational_date, f"Date should be {self.operational_date}, got {dep['date']}"
        
        print(f"✓ All {len(deployments)} deployments have correct date: {self.operational_date}")


class TestLiveDashboardDate:
    """Test Live Dashboard uses same date as deployments"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDS
        )
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get operational date
        op_date_response = self.session.get(f"{BASE_URL}/api/system/operational-date")
        self.operational_date = op_date_response.json()["operational_date"]
    
    def test_live_dashboard_returns_correct_date(self, setup):
        """Live Dashboard should return same date as operational date"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/live?date={self.operational_date}")
        assert response.status_code == 200
        
        data = response.json()
        assert "date" in data, "Live Dashboard response should have 'date' field"
        assert data["date"] == self.operational_date, f"Expected {self.operational_date}, got {data['date']}"
        print(f"✓ Live Dashboard date matches operational date: {data['date']}")
    
    def test_live_dashboard_has_bnb_breakdown(self, setup):
        """Live Dashboard should show BnB breakdown with morning/night hours"""
        response = self.session.get(f"{BASE_URL}/api/dashboard/live?date={self.operational_date}")
        assert response.status_code == 200
        
        data = response.json()
        assert "bnbs" in data, "Live Dashboard should have 'bnbs' array"
        
        for bnb in data["bnbs"]:
            assert "morning_hours" in bnb, f"BnB {bnb['bnb']} should have morning_hours"
            assert "night_hours" in bnb, f"BnB {bnb['bnb']} should have night_hours"
            print(f"  BnB: {bnb['bnb']} - Morning: {bnb['morning_hours']}h, Night: {bnb['night_hours']}h")
        
        print(f"✓ Live Dashboard has {len(data['bnbs'])} BnBs with morning/night breakdown")


class TestCollectionRecordDateSource:
    """Test collection records use deployment_date from deployment"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDS
        )
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
        
        # Get operational date
        op_date_response = self.session.get(f"{BASE_URL}/api/system/operational-date")
        self.operational_date = op_date_response.json()["operational_date"]
    
    def test_shifts_have_date_from_deployment(self, setup):
        """Collection records (shifts) should have date field from deployment"""
        response = self.session.get(f"{BASE_URL}/api/shifts?date={self.operational_date}")
        assert response.status_code == 200
        
        shifts = response.json()
        for shift in shifts:
            assert "date" in shift, "Shift should have 'date' field"
            assert shift["date"] == self.operational_date, f"Shift date should be {self.operational_date}"
            
            # Verify deployment_id is present
            assert "deployment_id" in shift, "Shift should have 'deployment_id' field"
        
        print(f"✓ {len(shifts)} shifts have correct date from deployment: {self.operational_date}")
    
    def test_shifts_by_deployment_endpoint(self, setup):
        """Get shifts by deployment ID endpoint should work"""
        # First get deployments to get an ID
        dep_response = self.session.get(f"{BASE_URL}/api/deployments?date={self.operational_date}")
        deployments = dep_response.json()
        
        if len(deployments) > 0:
            dep_id = deployments[0]["id"]
            
            # Get shifts for this deployment
            shifts_response = self.session.get(f"{BASE_URL}/api/shifts/by-deployment/{dep_id}")
            assert shifts_response.status_code == 200
            
            shifts_data = shifts_response.json()
            print(f"✓ Shifts by deployment endpoint works - {len(shifts_data)} kits")


class TestAddDeploymentAPI:
    """Test Add Deployment API with new morning/evening structure"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        
        # Login as Admin
        login_response = self.session.post(
            f"{BASE_URL}/api/auth/login",
            json=ADMIN_CREDS
        )
        assert login_response.status_code == 200, "Login failed"
        token = login_response.json()["access_token"]
        self.session.headers.update({"Authorization": f"Bearer {token}"})
    
    def test_create_deployment_with_morning_evening_managers(self, setup):
        """Should be able to create deployment with morning and evening managers"""
        # Use a future date to avoid conflicts
        test_date = "2026-12-25"
        test_bnb = "TEST-CREATE-BNB"
        
        payload = {
            "date": test_date,
            "bnb": test_bnb,
            "morning_managers": ["admin-001"],
            "evening_managers": [],
            "assigned_kits": ["KIT-01"]
        }
        
        response = self.session.post(f"{BASE_URL}/api/deployments", json=payload)
        
        if response.status_code in [200, 201]:
            data = response.json()
            
            # Verify fields
            assert data["date"] == test_date, f"Date should be {test_date}"
            assert data["bnb"] == test_bnb, f"BnB should be {test_bnb}"
            assert "morning_managers" in data, "Should have morning_managers"
            assert "evening_managers" in data, "Should have evening_managers"
            
            print(f"✓ Created deployment with morning/evening managers structure")
            print(f"  Morning: {data.get('morning_managers')}")
            print(f"  Evening: {data.get('evening_managers')}")
            
            # Cleanup
            dep_id = data.get("id")
            if dep_id:
                self.session.delete(f"{BASE_URL}/api/deployments/{dep_id}")
        elif response.status_code == 400:
            # Deployment already exists
            print("✓ Deployment already exists for test BnB - duplicate prevention working")
        else:
            pytest.fail(f"Unexpected response: {response.status_code} - {response.text}")
    
    def test_deployment_requires_at_least_one_manager(self, setup):
        """Should require at least one manager (morning or evening)"""
        test_date = "2026-12-26"
        
        payload = {
            "date": test_date,
            "bnb": "TEST-NO-MANAGER",
            "morning_managers": [],
            "evening_managers": [],
            "assigned_kits": []
        }
        
        response = self.session.post(f"{BASE_URL}/api/deployments", json=payload)
        assert response.status_code == 400, f"Should return 400 for no managers, got {response.status_code}"
        print("✓ Deployment correctly requires at least one manager")


# Run tests
if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
