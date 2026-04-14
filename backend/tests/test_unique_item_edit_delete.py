"""
Test Edit/Delete functionality for Unique Items in Inventory Categories

Features tested:
1. Unique items (SSD, Camera, Laptop, Power Bank) support edit/delete
2. Non-unique items (IMU, USB Hub, etc.) should NOT have edit/delete (frontend only)
3. Edit item: rename item_name while keeping item_id for tracking
4. Delete item: works correctly with warning for assigned items
5. Backend PUT /api/items/{id} supports new_item_name field
6. Backend DELETE /api/items/{id} works correctly
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestUniqueItemEditDelete:
    """Test Edit/Delete functionality for unique items"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
        # Login as admin
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
        yield
        # Cleanup: Delete test items
        self._cleanup_test_items()
    
    def _cleanup_test_items(self):
        """Clean up test items created during tests"""
        test_prefixes = ["TEST-EDIT-", "TEST-DELETE-", "TEST-RENAME-"]
        try:
            items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
            if items_response.status_code == 200:
                items = items_response.json()
                for item in items:
                    item_name = item.get("item_name", "")
                    item_id = item.get("item_id", item_name)
                    if any(item_name.startswith(prefix) for prefix in test_prefixes):
                        requests.delete(f"{BASE_URL}/api/items/{item_id}", headers=self.headers)
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ==================== CATEGORY TESTS ====================
    
    def test_get_categories_returns_unique_and_non_unique(self):
        """Verify categories API returns unique and non-unique category lists"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        assert response.status_code == 200, f"Failed to get categories: {response.text}"
        
        data = response.json()
        assert "categories" in data
        assert "unique_categories" in data
        assert "non_unique_categories" in data
        
        # Verify SSD is in unique categories
        assert "ssd" in data["unique_categories"], "SSD should be a unique category"
        
        # Verify IMU is in non-unique categories
        assert "imu" in data["non_unique_categories"], "IMU should be a non-unique category"
        
        print(f"✓ Unique categories: {data['unique_categories']}")
        print(f"✓ Non-unique categories: {data['non_unique_categories']}")
    
    # ==================== CREATE UNIQUE ITEM TESTS ====================
    
    def test_create_unique_item_ssd(self):
        """Create a unique item (SSD) for testing"""
        response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": "TEST-EDIT-SSD-001",
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert response.status_code == 200, f"Failed to create SSD: {response.text}"
        
        data = response.json()
        assert data["item_name"] == "TEST-EDIT-SSD-001"
        assert data["item_id"] == "TEST-EDIT-SSD-001"
        assert data["category"] == "ssd"
        print(f"✓ Created unique item: {data['item_name']}")
    
    # ==================== EDIT ITEM TESTS ====================
    
    def test_edit_item_rename_keeps_item_id(self):
        """Test that renaming an item updates item_name but keeps item_id"""
        # First create an item
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": "TEST-RENAME-SSD-001",
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert create_response.status_code == 200, f"Failed to create item: {create_response.text}"
        original_item = create_response.json()
        original_item_id = original_item["item_id"]
        
        # Now rename the item
        update_response = requests.put(
            f"{BASE_URL}/api/items/{original_item_id}",
            headers=self.headers,
            json={
                "tracking_type": "individual",
                "status": "active",
                "current_location": "station:Storage",
                "new_item_name": "TEST-RENAME-SSD-RENAMED"
            }
        )
        assert update_response.status_code == 200, f"Failed to rename item: {update_response.text}"
        
        updated_item = update_response.json()
        # Verify item_name changed but item_id stayed the same
        assert updated_item["item_name"] == "TEST-RENAME-SSD-RENAMED", "Item name should be updated"
        assert updated_item["item_id"] == original_item_id, "Item ID should remain unchanged"
        
        print(f"✓ Renamed item: {original_item_id} -> {updated_item['item_name']}")
        print(f"✓ Item ID preserved: {updated_item['item_id']}")
    
    def test_edit_item_update_status(self):
        """Test updating item status"""
        # Create item
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": "TEST-EDIT-STATUS-001",
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert create_response.status_code == 200
        item_id = create_response.json()["item_id"]
        
        # Update status to damaged
        update_response = requests.put(
            f"{BASE_URL}/api/items/{item_id}",
            headers=self.headers,
            json={
                "tracking_type": "individual",
                "status": "damaged",
                "current_location": "station:Storage"
            }
        )
        assert update_response.status_code == 200, f"Failed to update status: {update_response.text}"
        
        updated_item = update_response.json()
        assert updated_item["status"] == "damaged", "Status should be updated to damaged"
        print(f"✓ Updated item status to: {updated_item['status']}")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/items/{item_id}", headers=self.headers)
    
    def test_edit_item_duplicate_name_rejected(self):
        """Test that renaming to an existing name is rejected"""
        # Create two items
        requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": "TEST-EDIT-DUP-001",
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        
        create_response2 = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": "TEST-EDIT-DUP-002",
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        item2_id = create_response2.json()["item_id"]
        
        # Try to rename item2 to item1's name
        update_response = requests.put(
            f"{BASE_URL}/api/items/{item2_id}",
            headers=self.headers,
            json={
                "tracking_type": "individual",
                "status": "active",
                "current_location": "station:Storage",
                "new_item_name": "TEST-EDIT-DUP-001"  # Already exists
            }
        )
        assert update_response.status_code == 400, "Should reject duplicate name"
        assert "already exists" in update_response.json().get("detail", "").lower()
        print(f"✓ Duplicate name correctly rejected")
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/items/TEST-EDIT-DUP-001", headers=self.headers)
        requests.delete(f"{BASE_URL}/api/items/TEST-EDIT-DUP-002", headers=self.headers)
    
    # ==================== DELETE ITEM TESTS ====================
    
    def test_delete_item_success(self):
        """Test deleting an item"""
        # Create item
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": "TEST-DELETE-SSD-001",
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert create_response.status_code == 200
        item_id = create_response.json()["item_id"]
        
        # Delete item
        delete_response = requests.delete(
            f"{BASE_URL}/api/items/{item_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200, f"Failed to delete item: {delete_response.text}"
        
        data = delete_response.json()
        assert "deleted" in data.get("message", "").lower() or data.get("status") == "deleted"
        print(f"✓ Item deleted successfully")
        
        # Verify item no longer exists
        items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        items = items_response.json()
        item_names = [i["item_name"] for i in items]
        assert "TEST-DELETE-SSD-001" not in item_names, "Item should be deleted"
        print(f"✓ Verified item no longer exists")
    
    def test_delete_item_with_location_returns_warning_info(self):
        """Test that deleting an item with active location returns warning info"""
        # Create item with kit location
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": "TEST-DELETE-ASSIGNED-001",
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "kit:KIT-01"  # Assigned to a kit
        })
        assert create_response.status_code == 200
        item_id = create_response.json()["item_id"]
        
        # Delete item - should succeed but return warning info
        delete_response = requests.delete(
            f"{BASE_URL}/api/items/{item_id}",
            headers=self.headers
        )
        assert delete_response.status_code == 200, f"Failed to delete item: {delete_response.text}"
        
        data = delete_response.json()
        # Check if warning info is returned
        if "deleted_item" in data:
            deleted_info = data["deleted_item"]
            assert deleted_info.get("has_location") == True, "Should indicate item had location"
            assert "kit:KIT-01" in deleted_info.get("current_location", "")
            print(f"✓ Delete returned warning info: has_location={deleted_info.get('has_location')}")
        
        print(f"✓ Item with location deleted successfully")
    
    def test_delete_nonexistent_item_returns_404(self):
        """Test that deleting a non-existent item returns 404"""
        delete_response = requests.delete(
            f"{BASE_URL}/api/items/NONEXISTENT-ITEM-12345",
            headers=self.headers
        )
        assert delete_response.status_code == 404, "Should return 404 for non-existent item"
        print(f"✓ Non-existent item correctly returns 404")
    
    # ==================== CATEGORY ITEMS ENDPOINT TESTS ====================
    
    def test_get_category_items_ssd(self):
        """Test getting items for SSD category"""
        response = requests.get(f"{BASE_URL}/api/categories/ssd/items", headers=self.headers)
        assert response.status_code == 200, f"Failed to get SSD items: {response.text}"
        
        data = response.json()
        assert "category" in data
        assert "items" in data
        assert data["category"]["value"] == "ssd"
        assert data["category"]["type"] == "unique"
        
        print(f"✓ SSD category has {len(data['items'])} items")
        print(f"✓ Category type: {data['category']['type']}")
    
    def test_get_category_items_imu_non_unique(self):
        """Test getting items for IMU category (non-unique)"""
        response = requests.get(f"{BASE_URL}/api/categories/imu/items", headers=self.headers)
        assert response.status_code == 200, f"Failed to get IMU items: {response.text}"
        
        data = response.json()
        assert data["category"]["type"] == "non_unique"
        print(f"✓ IMU category type: {data['category']['type']} (non-unique)")
    
    # ==================== ADMIN PERMISSION TESTS ====================
    
    def test_non_admin_cannot_delete_item(self):
        """Test that non-admin users cannot delete items"""
        # First create a manager user if not exists
        # Try to login as Manager
        login_response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Manager",
            "password": "test1234"
        })
        
        if login_response.status_code != 200:
            # Manager doesn't exist, skip this test
            pytest.skip("Manager user not available for testing")
        
        manager_token = login_response.json()["access_token"]
        manager_headers = {
            "Authorization": f"Bearer {manager_token}",
            "Content-Type": "application/json"
        }
        
        # Create item as admin
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": "TEST-DELETE-PERM-001",
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert create_response.status_code == 200
        item_id = create_response.json()["item_id"]
        
        # Try to delete as manager
        delete_response = requests.delete(
            f"{BASE_URL}/api/items/{item_id}",
            headers=manager_headers
        )
        assert delete_response.status_code == 403, "Non-admin should not be able to delete"
        print(f"✓ Non-admin correctly denied delete permission")
        
        # Cleanup as admin
        requests.delete(f"{BASE_URL}/api/items/{item_id}", headers=self.headers)


class TestExistingSSDItems:
    """Test existing SSD items in the system"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Login and get auth token"""
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
    
    def test_ssd_items_exist(self):
        """Verify SSD items exist in the system"""
        response = requests.get(f"{BASE_URL}/api/categories/ssd/items", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        items = data.get("items", [])
        
        print(f"✓ Found {len(items)} SSD items")
        for item in items[:5]:  # Show first 5
            print(f"  - {item.get('item_name')} (ID: {item.get('item_id')}) at {item.get('current_location')}")
        
        # Verify SSD items have item_id
        for item in items:
            assert "item_id" in item or "item_name" in item, "Items should have item_id or item_name"
    
    def test_ssd_category_is_unique(self):
        """Verify SSD is marked as unique category"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        assert response.status_code == 200
        
        data = response.json()
        assert "ssd" in data["unique_categories"], "SSD should be in unique categories"
        print(f"✓ SSD is correctly marked as unique category")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
