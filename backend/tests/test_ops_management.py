"""
Backend API Tests for Ops Management App
Tests: Auth, Users, BnBs, Kits, Deployments, Events, Live Dashboard
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestHealth:
    """Health check tests"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("Health check passed")


class TestAuth:
    """Authentication endpoint tests"""
    
    def test_login_admin_success(self):
        """Test login with Admin/admin123 credentials"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert "user" in data
        assert data["user"]["name"] == "Admin"
        assert data["user"]["role"] == "admin"
        print(f"Admin login successful: {data['user']}")
    
    def test_login_invalid_credentials(self):
        """Test login with invalid credentials returns 401"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "wronguser",
            "password": "wrongpassword"
        })
        assert response.status_code == 401
        print("Invalid credentials correctly rejected")
    
    def test_me_without_token(self):
        """Test /api/auth/me without token returns 401"""
        response = requests.get(f"{BASE_URL}/api/auth/me")
        assert response.status_code == 401
        print("Unauthenticated request correctly rejected")


class TestLiveDashboard:
    """Live Dashboard API tests - simplified structure"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_live_dashboard_returns_simplified_structure(self, admin_token):
        """Test /api/dashboard/live returns correct simplified structure"""
        response = requests.get(
            f"{BASE_URL}/api/dashboard/live",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify simplified structure
        assert "date" in data
        assert "total_hours" in data
        assert "total_shifts" in data
        assert "per_bnb" in data
        assert "recent_events" in data
        
        # Verify types
        assert isinstance(data["total_hours"], (int, float))
        assert isinstance(data["total_shifts"], int)
        assert isinstance(data["per_bnb"], list)
        assert isinstance(data["recent_events"], list)
        
        print(f"Live dashboard response: {data}")
    
    def test_live_dashboard_requires_auth(self):
        """Test /api/dashboard/live requires authentication"""
        response = requests.get(f"{BASE_URL}/api/dashboard/live")
        assert response.status_code == 401
        print("Live dashboard auth requirement verified")


class TestUsers:
    """User management tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_users(self, admin_token):
        """Test get users list"""
        response = requests.get(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Users list: {len(data)} users")
    
    def test_create_deployment_manager(self, admin_token):
        """Test creating a deployment_manager user"""
        import time
        test_name = f"TEST_Manager_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/users",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": test_name,
                "role": "deployment_manager",
                "password": "password123"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == test_name
        assert data["role"] == "deployment_manager"
        print(f"Created deployment_manager: {data}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/users/{data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


class TestBnBs:
    """BnB management tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_bnbs(self, admin_token):
        """Test get BnBs list"""
        response = requests.get(
            f"{BASE_URL}/api/bnbs",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"BnBs list: {len(data)} BnBs")
    
    def test_create_bnb(self, admin_token):
        """Test creating a BnB"""
        import time
        test_name = f"TEST_BnB_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/bnbs",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "name": test_name,
                "status": "active"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["name"] == test_name
        print(f"Created BnB: {data}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/bnbs/{test_name}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


class TestKits:
    """Kit management tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_get_kits(self, admin_token):
        """Test get kits list"""
        response = requests.get(
            f"{BASE_URL}/api/kits",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Kits list: {len(data)} kits")
    
    def test_create_kit(self, admin_token):
        """Test creating a kit"""
        import time
        test_id = f"TEST_KIT_{int(time.time())}"
        
        response = requests.post(
            f"{BASE_URL}/api/kits",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "kit_id": test_id,
                "status": "active"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["kit_id"] == test_id
        print(f"Created Kit: {data}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/kits/{test_id}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


class TestDeployments:
    """Deployment CRUD tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def setup_bnb_kit(self, admin_token):
        """Setup a BnB and Kit for deployment tests"""
        import time
        timestamp = int(time.time())
        bnb_name = f"TEST_BnB_{timestamp}"
        kit_id = f"TEST_KIT_{timestamp}"
        
        # Create BnB
        requests.post(
            f"{BASE_URL}/api/bnbs",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"name": bnb_name, "status": "active"}
        )
        
        # Create Kit
        requests.post(
            f"{BASE_URL}/api/kits",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"kit_id": kit_id, "status": "active"}
        )
        
        yield {"bnb": bnb_name, "kit": kit_id}
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/bnbs/{bnb_name}", headers={"Authorization": f"Bearer {admin_token}"})
        requests.delete(f"{BASE_URL}/api/kits/{kit_id}", headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_get_deployments(self, admin_token):
        """Test get deployments list"""
        response = requests.get(
            f"{BASE_URL}/api/deployments",
            headers={"Authorization": f"Bearer {admin_token}"}
        )
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        print(f"Deployments list: {len(data)} deployments")
    
    def test_create_deployment(self, admin_token, setup_bnb_kit):
        """Test creating a deployment with BnB, shift, manager, kits"""
        import datetime
        today = datetime.date.today().isoformat()
        
        response = requests.post(
            f"{BASE_URL}/api/deployments",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "date": today,
                "bnb": setup_bnb_kit["bnb"],
                "shift": "morning",
                "deployment_manager": "admin-001",
                "assigned_kits": [setup_bnb_kit["kit"]],
                "assigned_users": []
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["bnb"] == setup_bnb_kit["bnb"]
        assert data["shift"] == "morning"
        assert "id" in data
        print(f"Created Deployment: {data}")
        
        # Cleanup
        requests.delete(
            f"{BASE_URL}/api/deployments/{data['id']}",
            headers={"Authorization": f"Bearer {admin_token}"}
        )


class TestEvents:
    """Event logging tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def setup_kit(self, admin_token):
        """Setup a Kit for event tests"""
        import time
        kit_id = f"TEST_KIT_EVT_{int(time.time())}"
        
        requests.post(
            f"{BASE_URL}/api/kits",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={"kit_id": kit_id, "status": "active"}
        )
        
        yield kit_id
        
        requests.delete(f"{BASE_URL}/api/kits/{kit_id}", headers={"Authorization": f"Bearer {admin_token}"})
    
    def test_shift_end_requires_ssd_and_activity(self, admin_token, setup_kit):
        """Test that shift_end event can include ssd_used and activity_type"""
        response = requests.post(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "event_type": "shift_end",
                "kit": setup_kit,
                "ssd_used": "SSD-001",
                "activity_type": "cooking",
                "hours_logged": 4.5,
                "notes": "Test shift end"
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["event_type"] == "shift_end"
        assert data["ssd_used"] == "SSD-001"
        assert data["activity_type"] == "cooking"
        assert data["hours_logged"] == 4.5
        print(f"Created shift_end event: {data}")
    
    def test_shift_start(self, admin_token, setup_kit):
        """Test creating shift_start event"""
        response = requests.post(
            f"{BASE_URL}/api/events",
            headers={"Authorization": f"Bearer {admin_token}"},
            json={
                "event_type": "shift_start",
                "kit": setup_kit
            }
        )
        assert response.status_code == 200
        data = response.json()
        assert data["event_type"] == "shift_start"
        print(f"Created shift_start event: {data}")


class TestRoleBasedAccess:
    """Role-based access tests"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_admin_cannot_access_protected_endpoints_without_token(self):
        """Test that protected endpoints require authentication"""
        endpoints = ["/api/users", "/api/deployments", "/api/dashboard/live"]
        for endpoint in endpoints:
            response = requests.get(f"{BASE_URL}{endpoint}")
            assert response.status_code == 401, f"{endpoint} should require auth"
        print("All protected endpoints require authentication")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
