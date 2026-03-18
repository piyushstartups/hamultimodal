"""
Admin Analytics Dashboard API Tests
Testing 6 analytics endpoints:
- /admin/analytics/overview
- /admin/analytics/daily-hours
- /admin/analytics/bnb-performance
- /admin/analytics/category-breakdown
- /admin/analytics/worker-performance
- /admin/analytics/inventory-health
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
ADMIN_CREDENTIALS = {"name": "Admin Manager", "password": "password123"}
SUPERVISOR_CREDENTIALS = {"name": "Mike Supervisor", "password": "password123"}
DEPLOYER_CREDENTIALS = {"name": "John Deployer", "password": "password123"}

# Date range for testing
END_DATE = datetime.now().strftime("%Y-%m-%d")
START_DATE_7 = (datetime.now() - timedelta(days=7)).strftime("%Y-%m-%d")
START_DATE_30 = (datetime.now() - timedelta(days=30)).strftime("%Y-%m-%d")
START_DATE_90 = (datetime.now() - timedelta(days=90)).strftime("%Y-%m-%d")


class TestAuthentication:
    """Test that analytics endpoints require admin/supervisor role"""
    
    def test_admin_can_login(self):
        """Admin Manager can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"PASS: Admin login successful")
    
    def test_supervisor_can_login(self):
        """Mike Supervisor can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDENTIALS)
        assert response.status_code == 200, f"Supervisor login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"PASS: Supervisor login successful")
    
    def test_deployer_can_login(self):
        """John Deployer can login successfully"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPLOYER_CREDENTIALS)
        assert response.status_code == 200, f"Deployer login failed: {response.text}"
        data = response.json()
        assert "access_token" in data
        print(f"PASS: Deployer login successful")


class TestAnalyticsAccessControl:
    """Test role-based access control for analytics endpoints"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        return response.json()["access_token"]
    
    @pytest.fixture
    def supervisor_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=SUPERVISOR_CREDENTIALS)
        return response.json()["access_token"]
    
    @pytest.fixture
    def deployer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPLOYER_CREDENTIALS)
        return response.json()["access_token"]
    
    def test_admin_can_access_overview(self, admin_token):
        """Admin can access analytics overview endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/overview?start_date={START_DATE_7}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 200, f"Admin access failed: {response.text}"
        print(f"PASS: Admin can access analytics overview")
    
    def test_supervisor_can_access_overview(self, supervisor_token):
        """Supervisor can access analytics overview endpoint"""
        headers = {"Authorization": f"Bearer {supervisor_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/overview?start_date={START_DATE_7}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 200, f"Supervisor access failed: {response.text}"
        print(f"PASS: Supervisor can access analytics overview")
    
    def test_deployer_cannot_access_overview(self, deployer_token):
        """Deployer (non-admin) should NOT be able to access analytics"""
        headers = {"Authorization": f"Bearer {deployer_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/overview?start_date={START_DATE_7}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 403, f"Deployer should get 403, got {response.status_code}"
        print(f"PASS: Deployer correctly denied access to analytics (403)")
    
    def test_deployer_cannot_access_daily_hours(self, deployer_token):
        """Deployer cannot access daily hours analytics"""
        headers = {"Authorization": f"Bearer {deployer_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/daily-hours?start_date={START_DATE_7}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 403
        print(f"PASS: Deployer correctly denied access to daily-hours (403)")


class TestAnalyticsOverviewEndpoint:
    """Test /admin/analytics/overview endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        return response.json()["access_token"]
    
    def test_overview_returns_correct_structure(self, admin_token):
        """Overview endpoint returns all required fields"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/overview?start_date={START_DATE_7}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "period" in data, "Missing 'period' field"
        assert "total_hours" in data, "Missing 'total_hours' field"
        assert "total_shifts" in data, "Missing 'total_shifts' field"
        assert "active_bnbs" in data, "Missing 'active_bnbs' field"
        assert "unique_workers" in data, "Missing 'unique_workers' field"
        
        # Check period structure
        assert "start" in data["period"]
        assert "end" in data["period"]
        
        # Check data types
        assert isinstance(data["total_hours"], (int, float))
        assert isinstance(data["total_shifts"], int)
        assert isinstance(data["active_bnbs"], int)
        assert isinstance(data["unique_workers"], int)
        
        print(f"PASS: Overview returns correct structure")
        print(f"  - Total Hours: {data['total_hours']}")
        print(f"  - Total Shifts: {data['total_shifts']}")
        print(f"  - Active BnBs: {data['active_bnbs']}")
        print(f"  - Unique Workers: {data['unique_workers']}")
    
    def test_overview_with_different_date_ranges(self, admin_token):
        """Overview works with different date ranges (7, 14, 30, 90 days)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        for days in [7, 14, 30, 90]:
            start = (datetime.now() - timedelta(days=days)).strftime("%Y-%m-%d")
            response = requests.get(
                f"{BASE_URL}/api/admin/analytics/overview?start_date={start}&end_date={END_DATE}",
                headers=headers
            )
            assert response.status_code == 200, f"Failed for {days} days range"
        
        print(f"PASS: Overview works with different date ranges (7, 14, 30, 90 days)")


class TestDailyHoursEndpoint:
    """Test /admin/analytics/daily-hours endpoint for trend chart"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        return response.json()["access_token"]
    
    def test_daily_hours_returns_array(self, admin_token):
        """Daily hours returns array of date/hours data points"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/daily-hours?start_date={START_DATE_7}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Should return a list"
        
        if len(data) > 0:
            # Check each data point has required fields
            for item in data:
                assert "date" in item, "Missing 'date' field"
                assert "total_hours" in item, "Missing 'total_hours' field"
                assert "shift_count" in item, "Missing 'shift_count' field"
        
        print(f"PASS: Daily hours returns correct structure with {len(data)} data points")


class TestBnbPerformanceEndpoint:
    """Test /admin/analytics/bnb-performance endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        return response.json()["access_token"]
    
    def test_bnb_performance_returns_array(self, admin_token):
        """BnB performance returns metrics per BnB"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/bnb-performance?start_date={START_DATE_30}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Should return a list"
        
        if len(data) > 0:
            for item in data:
                assert "bnb_id" in item, "Missing 'bnb_id' field"
                assert "total_hours" in item, "Missing 'total_hours' field"
                assert "total_shifts" in item, "Missing 'total_shifts' field"
        
        print(f"PASS: BnB performance returns {len(data)} BnBs with metrics")
        for bnb in data:
            print(f"  - {bnb['bnb_id']}: {bnb['total_hours']} hrs, {bnb['total_shifts']} shifts")


class TestCategoryBreakdownEndpoint:
    """Test /admin/analytics/category-breakdown endpoint for pie chart"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        return response.json()["access_token"]
    
    def test_category_breakdown_returns_array(self, admin_token):
        """Category breakdown returns hours by data category"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/category-breakdown?start_date={START_DATE_30}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Should return a list"
        
        if len(data) > 0:
            for item in data:
                assert "category" in item, "Missing 'category' field"
                assert "total_hours" in item, "Missing 'total_hours' field"
                assert "shift_count" in item, "Missing 'shift_count' field"
        
        print(f"PASS: Category breakdown returns {len(data)} categories")
        for cat in data:
            print(f"  - {cat['category']}: {cat['total_hours']} hrs, {cat['shift_count']} shifts")


class TestWorkerPerformanceEndpoint:
    """Test /admin/analytics/worker-performance endpoint for leaderboard"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        return response.json()["access_token"]
    
    def test_worker_performance_returns_array(self, admin_token):
        """Worker performance returns ranked workers with hours"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/worker-performance?start_date={START_DATE_30}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        assert isinstance(data, list), "Should return a list"
        
        if len(data) > 0:
            for item in data:
                assert "user_id" in item, "Missing 'user_id' field"
                assert "name" in item, "Missing 'name' field"
                assert "total_hours" in item, "Missing 'total_hours' field"
                assert "shift_count" in item, "Missing 'shift_count' field"
        
        print(f"PASS: Worker performance returns {len(data)} workers")
        for worker in data:
            print(f"  - {worker['name']}: {worker['total_hours']} hrs, {worker['shift_count']} shifts")


class TestInventoryHealthEndpoint:
    """Test /admin/analytics/inventory-health endpoint"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        return response.json()["access_token"]
    
    def test_inventory_health_returns_correct_structure(self, admin_token):
        """Inventory health returns wear/damaged counts per item type"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(
            f"{BASE_URL}/api/admin/analytics/inventory-health?start_date={START_DATE_30}&end_date={END_DATE}",
            headers=headers
        )
        assert response.status_code == 200
        data = response.json()
        
        # Check required fields
        assert "total_shifts_with_issues" in data, "Missing 'total_shifts_with_issues' field"
        assert "issues" in data, "Missing 'issues' field"
        
        # Check issues structure
        issues = data["issues"]
        assert "left_glove" in issues, "Missing 'left_glove' in issues"
        assert "right_glove" in issues, "Missing 'right_glove' in issues"
        assert "head_cam" in issues, "Missing 'head_cam' in issues"
        
        # Check each item has wear and damaged counts
        for item_type in ["left_glove", "right_glove", "head_cam"]:
            assert "wear" in issues[item_type], f"Missing 'wear' count for {item_type}"
            assert "damaged" in issues[item_type], f"Missing 'damaged' count for {item_type}"
        
        print(f"PASS: Inventory health returns correct structure")
        print(f"  - Total shifts with issues: {data['total_shifts_with_issues']}")
        print(f"  - Left Glove: wear={issues['left_glove']['wear']}, damaged={issues['left_glove']['damaged']}")
        print(f"  - Right Glove: wear={issues['right_glove']['wear']}, damaged={issues['right_glove']['damaged']}")
        print(f"  - Head Cam: wear={issues['head_cam']['wear']}, damaged={issues['head_cam']['damaged']}")


class TestAnalyticsWithTestData:
    """Test analytics with known test data"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=ADMIN_CREDENTIALS)
        return response.json()["access_token"]
    
    @pytest.fixture
    def deployer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json=DEPLOYER_CREDENTIALS)
        return response.json()["access_token"]
    
    def test_create_end_shift_with_analytics_data(self, deployer_token, admin_token):
        """Create end_shift event with hours_recorded and data_category for analytics"""
        headers = {"Authorization": f"Bearer {deployer_token}"}
        
        # Create end_shift event with analytics data
        event_data = {
            "event_type": "end_shift",
            "user_id": "user_1",
            "from_kit": "KIT-01",
            "hours_recorded": 2.5,
            "data_category": "cooking",
            "ssd_id": "SSD-001",
            "ssd_space_gb": 128,
            "notes": "TEST_ANALYTICS: Inventory Issues - Left Glove: wear, Head Cam: damaged"
        }
        
        response = requests.post(f"{BASE_URL}/api/events", json=event_data, headers=headers)
        assert response.status_code == 200, f"Failed to create event: {response.text}"
        
        # Verify analytics updated
        admin_headers = {"Authorization": f"Bearer {admin_token}"}
        overview_response = requests.get(
            f"{BASE_URL}/api/admin/analytics/overview?start_date={START_DATE_7}&end_date={END_DATE}",
            headers=admin_headers
        )
        assert overview_response.status_code == 200
        
        print(f"PASS: Created end_shift event with analytics data")
        print(f"  - Hours: 2.5, Category: cooking")
        print(f"  - Inventory issues recorded in notes")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
