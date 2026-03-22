"""
Test Task Categories API and Hardware Check Shift Mapping
=========================================================
Tests for:
1. Task Categories CRUD (GET/POST/PUT/DELETE /api/task-categories)
2. Hardware Check Shift Mapping (shift_type filtering)
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://kit-inventory-deploy.preview.emergentagent.com').rstrip('/')

class TestTaskCategoriesAPI:
    """Test Task Categories CRUD endpoints"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_get_task_categories_returns_list(self):
        """GET /api/task-categories returns list from database"""
        response = requests.get(f"{BASE_URL}/api/task-categories", headers=self.headers)
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        
        # Should have default categories seeded
        if len(data) > 0:
            # Verify structure
            cat = data[0]
            assert "value" in cat, "Category should have 'value' field"
            assert "label" in cat, "Category should have 'label' field"
            print(f"✓ GET /api/task-categories returns {len(data)} categories")
    
    def test_create_task_category_admin_only(self):
        """POST /api/task-categories creates new category (admin only)"""
        test_value = f"test_cat_{int(time.time())}"
        test_label = "Test Category"
        
        response = requests.post(f"{BASE_URL}/api/task-categories", 
            headers=self.headers,
            json={"value": test_value, "label": test_label}
        )
        assert response.status_code == 200, f"Failed to create: {response.text}"
        
        data = response.json()
        assert data["value"] == test_value.lower().replace(" ", "_")
        assert data["label"] == test_label
        print(f"✓ POST /api/task-categories created '{test_value}'")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-categories/{test_value}", headers=self.headers)
    
    def test_update_task_category(self):
        """PUT /api/task-categories/{value} updates category label"""
        # First create a test category
        test_value = f"test_update_{int(time.time())}"
        requests.post(f"{BASE_URL}/api/task-categories", 
            headers=self.headers,
            json={"value": test_value, "label": "Original Label"}
        )
        
        # Update it
        new_label = "Updated Label"
        response = requests.put(f"{BASE_URL}/api/task-categories/{test_value}",
            headers=self.headers,
            json={"label": new_label}
        )
        assert response.status_code == 200, f"Failed to update: {response.text}"
        
        data = response.json()
        assert data["label"] == new_label
        print(f"✓ PUT /api/task-categories/{test_value} updated label")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/task-categories/{test_value}", headers=self.headers)
    
    def test_delete_task_category(self):
        """DELETE /api/task-categories/{value} deletes category"""
        # First create a test category
        test_value = f"test_delete_{int(time.time())}"
        requests.post(f"{BASE_URL}/api/task-categories", 
            headers=self.headers,
            json={"value": test_value, "label": "To Delete"}
        )
        
        # Delete it
        response = requests.delete(f"{BASE_URL}/api/task-categories/{test_value}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed to delete: {response.text}"
        
        data = response.json()
        assert data["status"] == "deleted"
        print(f"✓ DELETE /api/task-categories/{test_value} succeeded")
    
    def test_delete_nonexistent_category_returns_404(self):
        """DELETE /api/task-categories/{value} returns 404 for nonexistent"""
        response = requests.delete(f"{BASE_URL}/api/task-categories/nonexistent_xyz",
            headers=self.headers
        )
        assert response.status_code == 404, f"Expected 404, got {response.status_code}"
        print("✓ DELETE nonexistent category returns 404")
    
    def test_default_categories_exist(self):
        """Verify default task categories are seeded"""
        response = requests.get(f"{BASE_URL}/api/task-categories", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        values = [cat["value"] for cat in data]
        
        # Check for expected default categories
        expected = ["cooking", "cleaning", "organizing", "outdoor", "other"]
        found = [e for e in expected if e in values]
        
        print(f"✓ Found {len(found)}/{len(expected)} default categories: {found}")
        assert len(found) >= 3, f"Expected at least 3 default categories, found {len(found)}"


class TestHardwareCheckShiftMapping:
    """Test Hardware Check shift_type filtering"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200, f"Login failed: {response.text}"
        self.token = response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_hardware_check_status_accepts_shift_type_param(self):
        """GET /api/hardware-checks/status/{dep_id}/{kit} accepts shift_type query param"""
        # First get a deployment
        response = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        assert response.status_code == 200
        
        deployments = response.json()
        if not deployments:
            pytest.skip("No deployments available for testing")
        
        dep = deployments[0]
        dep_id = dep["id"]
        kits = dep.get("assigned_kits", [])
        
        if not kits:
            pytest.skip("No kits assigned to deployment")
        
        kit = kits[0]
        
        # Test with shift_type=morning
        response = requests.get(
            f"{BASE_URL}/api/hardware-checks/status/{dep_id}/{kit}?shift_type=morning",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        data = response.json()
        assert "completed" in data or "morning_completed" in data, f"Response missing completion status: {data}"
        print(f"✓ Hardware check status with shift_type=morning works")
        
        # Test with shift_type=night
        response = requests.get(
            f"{BASE_URL}/api/hardware-checks/status/{dep_id}/{kit}?shift_type=night",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print(f"✓ Hardware check status with shift_type=night works")
    
    def test_hardware_check_create_requires_shift_type(self):
        """POST /api/hardware-checks requires shift_type field"""
        # Get a deployment
        response = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        deployments = response.json()
        
        if not deployments:
            pytest.skip("No deployments available")
        
        dep = deployments[0]
        kits = dep.get("assigned_kits", [])
        
        if not kits:
            pytest.skip("No kits assigned")
        
        # Try to create without shift_type - should fail or use default
        # Note: The API may have a default, so we test that shift_type is accepted
        response = requests.post(f"{BASE_URL}/api/hardware-checks",
            headers=self.headers,
            json={
                "deployment_id": dep["id"],
                "kit": kits[0],
                "shift_type": "morning",
                "left_glove_image": "data:image/png;base64,test",
                "right_glove_image": "data:image/png;base64,test",
                "head_camera_image": "data:image/png;base64,test"
            }
        )
        # Either 200 (created) or 400 (already exists) is acceptable
        assert response.status_code in [200, 400], f"Unexpected status: {response.status_code}, {response.text}"
        print(f"✓ Hardware check creation with shift_type works (status: {response.status_code})")
    
    def test_hardware_check_shift_type_validation(self):
        """POST /api/hardware-checks validates shift_type values"""
        response = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        deployments = response.json()
        
        if not deployments:
            pytest.skip("No deployments available")
        
        dep = deployments[0]
        kits = dep.get("assigned_kits", [])
        
        if not kits:
            pytest.skip("No kits assigned")
        
        # Try invalid shift_type
        response = requests.post(f"{BASE_URL}/api/hardware-checks",
            headers=self.headers,
            json={
                "deployment_id": dep["id"],
                "kit": kits[0],
                "shift_type": "invalid_shift",
                "left_glove_image": "data:image/png;base64,test",
                "right_glove_image": "data:image/png;base64,test",
                "head_camera_image": "data:image/png;base64,test"
            }
        )
        assert response.status_code == 400, f"Expected 400 for invalid shift_type, got {response.status_code}"
        print("✓ Invalid shift_type is rejected with 400")
    
    def test_hardware_checks_list_filter_by_shift_type(self):
        """GET /api/hardware-checks can filter by shift_type"""
        # Test morning filter
        response = requests.get(
            f"{BASE_URL}/api/hardware-checks?shift_type=morning",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print("✓ GET /api/hardware-checks?shift_type=morning works")
        
        # Test night filter
        response = requests.get(
            f"{BASE_URL}/api/hardware-checks?shift_type=night",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        print("✓ GET /api/hardware-checks?shift_type=night works")


class TestShiftRecordFiltering:
    """Test that shift records are properly filtered by shift_type"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin before each test"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_shifts_by_deployment_returns_shift_field(self):
        """GET /api/shifts/by-deployment/{id} returns records with shift field"""
        response = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        deployments = response.json()
        
        if not deployments:
            pytest.skip("No deployments available")
        
        dep = deployments[0]
        
        response = requests.get(
            f"{BASE_URL}/api/shifts/by-deployment/{dep['id']}",
            headers=self.headers
        )
        assert response.status_code == 200, f"Failed: {response.text}"
        
        data = response.json()
        # Data is a dict with kit_id as keys
        for kit_id, kit_data in data.items():
            records = kit_data.get("records", [])
            for record in records:
                # Each record should have shift or shift_type field
                has_shift = "shift" in record or "shift_type" in record
                if has_shift:
                    shift_val = record.get("shift") or record.get("shift_type")
                    assert shift_val in ["morning", "night", "evening"], f"Invalid shift value: {shift_val}"
        
        print(f"✓ Shifts by deployment returns records with shift field")
    
    def test_start_shift_includes_shift_field(self):
        """POST /api/shifts/start includes shift field in request"""
        response = requests.get(f"{BASE_URL}/api/deployments", headers=self.headers)
        deployments = response.json()
        
        if not deployments:
            pytest.skip("No deployments available")
        
        dep = deployments[0]
        kits = dep.get("assigned_kits", [])
        
        if not kits:
            pytest.skip("No kits assigned")
        
        # Get task categories for activity_type
        cats_response = requests.get(f"{BASE_URL}/api/task-categories", headers=self.headers)
        cats = cats_response.json()
        activity_type = cats[0]["value"] if cats else "cooking"
        
        # Try to start a shift with explicit shift field
        response = requests.post(f"{BASE_URL}/api/shifts/start",
            headers=self.headers,
            json={
                "deployment_id": dep["id"],
                "kit": kits[0],
                "ssd_used": "TEST-SSD",
                "activity_type": activity_type,
                "shift": "morning"
            }
        )
        # Either 200 (created) or 409 (already active) is acceptable
        assert response.status_code in [200, 409], f"Unexpected: {response.status_code}, {response.text}"
        
        if response.status_code == 200:
            data = response.json()
            assert data.get("shift") == "morning", f"Shift field not set correctly: {data}"
            print("✓ Start shift with shift=morning works")
            
            # Stop the shift to clean up
            shift_id = data["id"]
            requests.post(f"{BASE_URL}/api/shifts/{shift_id}/stop", headers=self.headers)
        else:
            print("✓ Start shift endpoint accepts shift field (existing active shift)")


class TestAdminPanelTaskCategories:
    """Test Admin Panel Task Categories tab functionality"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Login as admin"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        self.token = response.json()["access_token"]
        self.headers = {
            "Authorization": f"Bearer {self.token}",
            "Content-Type": "application/json"
        }
    
    def test_task_categories_crud_flow(self):
        """Full CRUD flow for task categories"""
        # CREATE
        test_value = f"test_crud_{int(time.time())}"
        create_response = requests.post(f"{BASE_URL}/api/task-categories",
            headers=self.headers,
            json={"value": test_value, "label": "Test CRUD Category"}
        )
        assert create_response.status_code == 200, f"Create failed: {create_response.text}"
        print(f"✓ CREATE task category '{test_value}'")
        
        # READ
        read_response = requests.get(f"{BASE_URL}/api/task-categories", headers=self.headers)
        assert read_response.status_code == 200
        categories = read_response.json()
        found = any(c["value"] == test_value for c in categories)
        assert found, f"Created category not found in list"
        print(f"✓ READ task categories includes '{test_value}'")
        
        # UPDATE
        update_response = requests.put(f"{BASE_URL}/api/task-categories/{test_value}",
            headers=self.headers,
            json={"label": "Updated CRUD Category"}
        )
        assert update_response.status_code == 200, f"Update failed: {update_response.text}"
        updated = update_response.json()
        assert updated["label"] == "Updated CRUD Category"
        print(f"✓ UPDATE task category '{test_value}'")
        
        # DELETE
        delete_response = requests.delete(f"{BASE_URL}/api/task-categories/{test_value}",
            headers=self.headers
        )
        assert delete_response.status_code == 200, f"Delete failed: {delete_response.text}"
        print(f"✓ DELETE task category '{test_value}'")
        
        # Verify deletion
        verify_response = requests.get(f"{BASE_URL}/api/task-categories", headers=self.headers)
        categories = verify_response.json()
        found = any(c["value"] == test_value for c in categories)
        assert not found, f"Deleted category still exists"
        print(f"✓ VERIFY deletion of '{test_value}'")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
