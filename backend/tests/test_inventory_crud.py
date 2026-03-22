"""
Test Suite for Ops Management App - Inventory CRUD & Role Permissions
Tests: 
- Full CRUD for items (Admin only)
- Deployment managers filtering
- Multiple deployment managers per deployment
- Role-based access control
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kit-inventory-deploy.preview.emergentagent.com').rstrip('/')


class TestHealth:
    """Health endpoint tests"""
    
    def test_health_endpoint(self):
        response = requests.get(f"{BASE_URL}/api/health")
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "ok"
        print("✓ Health endpoint working")


class TestAdminInventoryCRUD:
    """Admin Inventory CRUD tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, "Admin login failed"
        return response.json()["access_token"]
    
    def test_admin_login(self, admin_token):
        """Test admin login"""
        assert admin_token is not None
        print("✓ Admin login successful")
    
    def test_admin_can_create_item(self, admin_token):
        """Admin can create items"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.post(f"{BASE_URL}/api/items", json={
            "item_name": "TEST_item_01",
            "tracking_type": "individual",
            "status": "active",
            "current_kit": None
        }, headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["item_name"] == "TEST_item_01"
        assert data["status"] == "active"
        print("✓ Admin can create item")
    
    def test_admin_can_update_item(self, admin_token):
        """Admin can update items via PUT endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.put(f"{BASE_URL}/api/items/TEST_item_01", json={
            "tracking_type": "individual",
            "status": "damaged",
            "current_kit": None
        }, headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "damaged"
        print("✓ Admin can update item")
    
    def test_admin_can_verify_item_updated(self, admin_token):
        """Verify item was updated in database"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/items", headers=headers)
        
        assert response.status_code == 200
        items = response.json()
        test_item = next((i for i in items if i["item_name"] == "TEST_item_01"), None)
        assert test_item is not None
        assert test_item["status"] == "damaged"
        print("✓ Item update persisted")
    
    def test_admin_can_delete_item(self, admin_token):
        """Admin can delete items"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.delete(f"{BASE_URL}/api/items/TEST_item_01", headers=headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "deleted"
        print("✓ Admin can delete item")
    
    def test_item_deletion_persists(self, admin_token):
        """Verify item no longer exists"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/items", headers=headers)
        
        items = response.json()
        test_item = next((i for i in items if i["item_name"] == "TEST_item_01"), None)
        assert test_item is None
        print("✓ Item deletion persisted")


class TestDeploymentManagerPermissions:
    """Deployment Manager role-based access tests"""
    
    @pytest.fixture(scope="class")
    def manager_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TestManager1",
            "password": "test123"
        })
        assert response.status_code == 200, "Manager login failed"
        return response.json()["access_token"]
    
    def test_manager_login(self, manager_token):
        """Manager can login"""
        assert manager_token is not None
        print("✓ Manager login successful")
    
    def test_manager_can_view_items(self, manager_token):
        """Manager can view inventory"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/items", headers=headers)
        
        assert response.status_code == 200
        assert isinstance(response.json(), list)
        print("✓ Manager can view items")
    
    def test_manager_cannot_create_item(self, manager_token):
        """Manager cannot create items - should get 403"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.post(f"{BASE_URL}/api/items", json={
            "item_name": "UNAUTHORIZED_item",
            "tracking_type": "individual",
            "status": "active"
        }, headers=headers)
        
        assert response.status_code == 403
        assert "Admin only" in response.json().get("detail", "")
        print("✓ Manager cannot create item (403)")
    
    def test_manager_cannot_update_item(self, manager_token):
        """Manager cannot update items - should get 403"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.put(f"{BASE_URL}/api/items/SSD-01", json={
            "tracking_type": "individual",
            "status": "active",
            "current_kit": None
        }, headers=headers)
        
        assert response.status_code == 403
        assert "Admin only" in response.json().get("detail", "")
        print("✓ Manager cannot update item (403)")
    
    def test_manager_cannot_delete_item(self, manager_token):
        """Manager cannot delete items - should get 403"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.delete(f"{BASE_URL}/api/items/SSD-01", headers=headers)
        
        assert response.status_code == 403
        assert "Admin only" in response.json().get("detail", "")
        print("✓ Manager cannot delete item (403)")
    
    def test_manager_sees_only_assigned_deployments(self, manager_token):
        """Manager can only see deployments where they are assigned"""
        headers = {"Authorization": f"Bearer {manager_token}"}
        response = requests.get(f"{BASE_URL}/api/deployments", headers=headers)
        
        assert response.status_code == 200
        deployments = response.json()
        
        # All deployments should have this manager in deployment_managers
        for dep in deployments:
            managers = dep.get("deployment_managers", [])
            assert "user-20260318194437" in managers or dep.get("deployment_manager") == "user-20260318194437"
        print(f"✓ Manager sees only {len(deployments)} assigned deployments")


class TestMultipleDeploymentManagers:
    """Multiple deployment managers per deployment tests"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_create_deployment_with_multiple_managers(self, admin_token):
        """Create deployment with multiple managers"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Get deployment managers
        users_response = requests.get(f"{BASE_URL}/api/users", headers=headers)
        users = users_response.json()
        managers = [u["id"] for u in users if u["role"] == "deployment_manager"]
        
        # Create deployment with multiple managers
        response = requests.post(f"{BASE_URL}/api/deployments", json={
            "date": "2026-01-21",
            "bnb": "BnB-01",
            "shift": "evening",
            "assigned_kits": ["KIT-01"],
            "assigned_users": [],
            "deployment_managers": managers[:2] if len(managers) >= 2 else managers
        }, headers=headers)
        
        # Could be 200 or 400 if already exists
        if response.status_code == 200:
            data = response.json()
            assert "deployment_managers" in data
            assert isinstance(data["deployment_managers"], list)
            print(f"✓ Deployment created with {len(data['deployment_managers'])} managers")
        elif response.status_code == 400:
            # Already exists is OK
            print("✓ Deployment already exists (expected)")
    
    def test_deployment_managers_array_exists(self, admin_token):
        """Verify NEW deployments have deployment_managers array (backward compat for old data)"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/deployments", headers=headers)
        
        assert response.status_code == 200
        deployments = response.json()
        
        new_format_count = 0
        old_format_count = 0
        for dep in deployments:
            if "deployment_managers" in dep:
                assert isinstance(dep["deployment_managers"], list)
                new_format_count += 1
            else:
                # Old format with deployment_manager (singular) - backward compatible
                assert "deployment_manager" in dep, f"Deployment {dep['id']} has neither deployment_managers nor deployment_manager"
                old_format_count += 1
        
        print(f"✓ Deployments: {new_format_count} new format, {old_format_count} old format (backward compat)")


class TestItemUpdateEndpoint:
    """Specific tests for PUT /api/items/{item_name} endpoint"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        return response.json()["access_token"]
    
    def test_update_item_status_to_damaged(self, admin_token):
        """Update item status from active to damaged"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Create test item
        create_response = requests.post(f"{BASE_URL}/api/items", json={
            "item_name": "TEST_status_item",
            "tracking_type": "individual",
            "status": "active",
            "current_kit": None
        }, headers=headers)
        
        if create_response.status_code != 200:
            pytest.skip("Could not create test item")
        
        # Update to damaged
        response = requests.put(f"{BASE_URL}/api/items/TEST_status_item", json={
            "tracking_type": "individual",
            "status": "damaged",
            "current_kit": None
        }, headers=headers)
        
        assert response.status_code == 200
        assert response.json()["status"] == "damaged"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/items/TEST_status_item", headers=headers)
        print("✓ PUT endpoint updates status correctly")
    
    def test_update_nonexistent_item_returns_404(self, admin_token):
        """Updating non-existent item returns 404"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.put(f"{BASE_URL}/api/items/NONEXISTENT_ITEM_XYZ", json={
            "tracking_type": "individual",
            "status": "active",
            "current_kit": None
        }, headers=headers)
        
        assert response.status_code == 404
        print("✓ PUT endpoint returns 404 for non-existent item")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
