"""
Test Kit Composition and Related Features
- Kit Composition CRUD endpoints in Admin Panel
- Kit chips display on Deployments page
- Dynamic kit completeness calculation from API
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestKitCompositionCRUD:
    """Test Kit Composition CRUD endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_get_kit_composition_returns_list(self):
        """GET /api/kit-composition should return a list of composition items"""
        response = requests.get(f"{BASE_URL}/api/kit-composition", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        print(f"✓ Kit composition returned {len(data)} items")
        
        # Verify structure of items
        if len(data) > 0:
            item = data[0]
            assert "category" in item, "Item should have 'category' field"
            assert "label" in item, "Item should have 'label' field"
            assert "required" in item, "Item should have 'required' field"
            print(f"✓ First item: {item['label']} - Required: {item['required']}")
    
    def test_kit_composition_has_power_bank_and_ssd(self):
        """Kit composition should include Power Bank: 2 and SSD: 2 as defaults"""
        response = requests.get(f"{BASE_URL}/api/kit-composition", headers=self.headers)
        assert response.status_code == 200
        data = response.json()
        
        # Find power_bank and ssd
        power_bank = next((item for item in data if item["category"] == "power_bank"), None)
        ssd = next((item for item in data if item["category"] == "ssd"), None)
        
        assert power_bank is not None, "Power Bank should be in kit composition"
        assert ssd is not None, "SSD should be in kit composition"
        
        # Verify required quantities (defaults are 2)
        assert power_bank["required"] == 2, f"Power Bank required should be 2, got {power_bank['required']}"
        assert ssd["required"] == 2, f"SSD required should be 2, got {ssd['required']}"
        
        print(f"✓ Power Bank: {power_bank['required']} required")
        print(f"✓ SSD: {ssd['required']} required")
    
    def test_add_kit_composition_item(self):
        """POST /api/kit-composition should add a new item"""
        # First, try to delete if exists (cleanup from previous test)
        requests.delete(f"{BASE_URL}/api/kit-composition/test_item_xyz", headers=self.headers)
        
        # Add new item
        response = requests.post(f"{BASE_URL}/api/kit-composition", headers=self.headers, json={
            "category": "test_item_xyz",
            "label": "Test Item XYZ",
            "required": 3
        })
        assert response.status_code == 200, f"Failed to add: {response.text}"
        print(f"✓ Added test_item_xyz to kit composition")
        
        # Verify it was added
        response = requests.get(f"{BASE_URL}/api/kit-composition", headers=self.headers)
        data = response.json()
        test_item = next((item for item in data if item["category"] == "test_item_xyz"), None)
        assert test_item is not None, "Test item should be in composition"
        assert test_item["required"] == 3, f"Required should be 3, got {test_item['required']}"
        print(f"✓ Verified test_item_xyz exists with required=3")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/kit-composition/test_item_xyz", headers=self.headers)
    
    def test_update_kit_composition_item(self):
        """PUT /api/kit-composition/{category} should update an item"""
        # First add a test item
        requests.delete(f"{BASE_URL}/api/kit-composition/test_update_item", headers=self.headers)
        requests.post(f"{BASE_URL}/api/kit-composition", headers=self.headers, json={
            "category": "test_update_item",
            "label": "Test Update Item",
            "required": 1
        })
        
        # Update it
        response = requests.put(f"{BASE_URL}/api/kit-composition/test_update_item", headers=self.headers, json={
            "label": "Updated Label",
            "required": 5
        })
        assert response.status_code == 200, f"Failed to update: {response.text}"
        print(f"✓ Updated test_update_item")
        
        # Verify update
        response = requests.get(f"{BASE_URL}/api/kit-composition", headers=self.headers)
        data = response.json()
        updated_item = next((item for item in data if item["category"] == "test_update_item"), None)
        assert updated_item is not None, "Updated item should exist"
        assert updated_item["label"] == "Updated Label", f"Label should be 'Updated Label', got {updated_item['label']}"
        assert updated_item["required"] == 5, f"Required should be 5, got {updated_item['required']}"
        print(f"✓ Verified update: label='Updated Label', required=5")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/kit-composition/test_update_item", headers=self.headers)
    
    def test_delete_kit_composition_item(self):
        """DELETE /api/kit-composition/{category} should remove an item"""
        # First add a test item
        requests.post(f"{BASE_URL}/api/kit-composition", headers=self.headers, json={
            "category": "test_delete_item",
            "label": "Test Delete Item",
            "required": 1
        })
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/kit-composition/test_delete_item", headers=self.headers)
        assert response.status_code == 200, f"Failed to delete: {response.text}"
        print(f"✓ Deleted test_delete_item")
        
        # Verify deletion
        response = requests.get(f"{BASE_URL}/api/kit-composition", headers=self.headers)
        data = response.json()
        deleted_item = next((item for item in data if item["category"] == "test_delete_item"), None)
        assert deleted_item is None, "Deleted item should not exist"
        print(f"✓ Verified test_delete_item no longer exists")
    
    def test_add_duplicate_category_fails(self):
        """Adding duplicate category should fail"""
        # First add a test item
        requests.delete(f"{BASE_URL}/api/kit-composition/test_duplicate", headers=self.headers)
        requests.post(f"{BASE_URL}/api/kit-composition", headers=self.headers, json={
            "category": "test_duplicate",
            "label": "Test Duplicate",
            "required": 1
        })
        
        # Try to add duplicate
        response = requests.post(f"{BASE_URL}/api/kit-composition", headers=self.headers, json={
            "category": "test_duplicate",
            "label": "Test Duplicate 2",
            "required": 2
        })
        assert response.status_code == 400, f"Should fail with 400, got {response.status_code}"
        print(f"✓ Duplicate category correctly rejected")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/kit-composition/test_duplicate", headers=self.headers)
    
    def test_non_admin_cannot_modify_kit_composition(self):
        """Non-admin users should not be able to modify kit composition"""
        # Create a manager user if not exists
        requests.post(f"{BASE_URL}/api/users", headers=self.headers, json={
            "name": "TestManager",
            "role": "deployment_manager",
            "password": "test1234"
        })
        
        # Login as manager
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TestManager",
            "password": "test1234"
        })
        if response.status_code != 200:
            pytest.skip("Could not login as manager")
        
        manager_token = response.json()["access_token"]
        manager_headers = {"Authorization": f"Bearer {manager_token}"}
        
        # Try to add item as manager
        response = requests.post(f"{BASE_URL}/api/kit-composition", headers=manager_headers, json={
            "category": "manager_test",
            "label": "Manager Test",
            "required": 1
        })
        assert response.status_code == 403, f"Manager should get 403, got {response.status_code}"
        print(f"✓ Non-admin correctly rejected from adding kit composition")


class TestDeploymentsKitChips:
    """Test that deployments show kit numbers as chips"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_deployments_include_assigned_kits(self):
        """GET /api/deployments should return assigned_kits field"""
        response = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        if len(data) > 0:
            # Check that deployments have assigned_kits field
            dep = data[0]
            assert "assigned_kits" in dep, "Deployment should have 'assigned_kits' field"
            print(f"✓ Deployment {dep.get('id', 'unknown')} has assigned_kits: {dep['assigned_kits']}")
        else:
            print("⚠ No deployments found to verify")
    
    def test_create_deployment_with_kits(self):
        """Creating deployment should include assigned_kits"""
        # Get operational date
        response = requests.get(f"{BASE_URL}/api/system/operational-date", headers=self.headers)
        op_date = response.json()["operational_date"]
        
        # Get available kits
        response = requests.get(f"{BASE_URL}/api/kits", headers=self.headers)
        kits = response.json()
        if len(kits) < 2:
            pytest.skip("Need at least 2 kits for this test")
        
        kit_ids = [kits[0]["kit_id"], kits[1]["kit_id"]]
        
        # Get a manager
        response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        users = response.json()
        managers = [u for u in users if u["role"] == "deployment_manager"]
        if not managers:
            pytest.skip("No managers available")
        
        # Create deployment with kits
        test_bnb = "TEST-BNB-CHIPS"
        response = requests.post(f"{BASE_URL}/api/deployments", headers=self.headers, json={
            "date": op_date,
            "bnb": test_bnb,
            "morning_managers": [managers[0]["id"]],
            "night_managers": [],
            "assigned_kits": kit_ids
        })
        
        if response.status_code == 400 and "already exists" in response.text:
            # Deployment exists, find and verify it
            response = requests.get(f"{BASE_URL}/api/deployments?date={op_date}", headers=self.headers)
            deps = response.json()
            test_dep = next((d for d in deps if d["bnb"] == test_bnb), None)
            if test_dep:
                assert "assigned_kits" in test_dep
                print(f"✓ Existing deployment has assigned_kits: {test_dep['assigned_kits']}")
                return
        
        assert response.status_code == 200, f"Failed to create: {response.text}"
        dep = response.json()
        assert "assigned_kits" in dep, "Created deployment should have assigned_kits"
        assert dep["assigned_kits"] == kit_ids, f"Assigned kits should match: {dep['assigned_kits']}"
        print(f"✓ Created deployment with assigned_kits: {kit_ids}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/deployments/{dep['id']}", headers=self.headers)


class TestInventoryKitCompleteness:
    """Test that Inventory uses API-driven kit composition for completeness"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_kit_composition_endpoint_accessible(self):
        """Kit composition endpoint should be accessible for completeness calculation"""
        response = requests.get(f"{BASE_URL}/api/kit-composition", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        # Should have items with required quantities
        assert len(data) > 0, "Kit composition should have items"
        
        for item in data:
            assert "category" in item
            assert "label" in item
            assert "required" in item
            assert isinstance(item["required"], int)
        
        print(f"✓ Kit composition has {len(data)} items for completeness calculation")
    
    def test_items_distribution_endpoint(self):
        """Items distribution endpoint should work for completeness view"""
        response = requests.get(f"{BASE_URL}/api/items/distribution", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        
        assert "categories" in data, "Should have categories"
        assert "locations" in data, "Should have locations"
        assert "distribution" in data, "Should have distribution matrix"
        
        print(f"✓ Distribution has {len(data['categories'])} categories across {len(data['locations'])} locations")


class TestAdminPanelKitCompositionTab:
    """Test Admin Panel Kit Composition tab functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {"Authorization": f"Bearer {self.token}"}
    
    def test_all_admin_panel_endpoints_work(self):
        """All endpoints used by Admin Panel should work"""
        # Users
        response = requests.get(f"{BASE_URL}/api/users", headers=self.headers)
        assert response.status_code == 200, f"Users endpoint failed: {response.text}"
        print(f"✓ /api/users works")
        
        # BnBs
        response = requests.get(f"{BASE_URL}/api/bnbs", headers=self.headers)
        assert response.status_code == 200, f"BnBs endpoint failed: {response.text}"
        print(f"✓ /api/bnbs works")
        
        # Kits
        response = requests.get(f"{BASE_URL}/api/kits", headers=self.headers)
        assert response.status_code == 200, f"Kits endpoint failed: {response.text}"
        print(f"✓ /api/kits works")
        
        # Task Categories
        response = requests.get(f"{BASE_URL}/api/task-categories", headers=self.headers)
        assert response.status_code == 200, f"Task categories endpoint failed: {response.text}"
        print(f"✓ /api/task-categories works")
        
        # Kit Composition
        response = requests.get(f"{BASE_URL}/api/kit-composition", headers=self.headers)
        assert response.status_code == 200, f"Kit composition endpoint failed: {response.text}"
        print(f"✓ /api/kit-composition works")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
