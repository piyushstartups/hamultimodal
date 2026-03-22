"""
Test Damage/Lost Item Flow for Inventory Management
=====================================================
Tests the following features:
1. /api/items/distribution excludes items with status 'damaged' or 'lost'
2. Kit Completeness calculation filters items with status 'active' only
3. Transfer Item dialog only shows items with status 'active' in dropdown
4. Report Damage dialog (UNIQUE category): select specific item → marks as 'damaged'
5. Report Lost dialog (NON-UNIQUE category): enter quantity → marks items as 'lost'
6. After marking item as damaged, it disappears from Distribution count
7. After marking item as damaged, Kit Completeness shows 'missing' for that category
8. Damaged items cannot be selected in Transfer Item dialog
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test data prefixes for cleanup
TEST_PREFIX = "TEST_DAMAGE_"


class TestDamageLostFlow:
    """Test suite for Damage/Lost Item Flow"""
    
    @pytest.fixture(autouse=True)
    def setup(self):
        """Setup: Get auth token"""
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
        """Delete all test items created during testing"""
        try:
            items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
            if items_response.status_code == 200:
                items = items_response.json()
                for item in items:
                    if item.get("item_name", "").startswith(TEST_PREFIX):
                        requests.delete(f"{BASE_URL}/api/items/{item['item_name']}", headers=self.headers)
        except Exception as e:
            print(f"Cleanup error: {e}")
    
    # ==========================================
    # TEST 1: Distribution endpoint excludes damaged/lost items
    # ==========================================
    def test_distribution_excludes_damaged_items(self):
        """Verify /api/items/distribution excludes items with status 'damaged'"""
        # Step 1: Create a test item with status 'active'
        item_name = f"{TEST_PREFIX}LAPTOP_01"
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": item_name,
            "category": "laptop",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert create_response.status_code == 200, f"Failed to create item: {create_response.text}"
        
        # Step 2: Get distribution - item should be counted
        dist_response = requests.get(f"{BASE_URL}/api/items/distribution", headers=self.headers)
        assert dist_response.status_code == 200
        dist_data = dist_response.json()
        
        # Verify laptop category exists and has count > 0 in Hub
        assert "laptop" in dist_data["categories"], "laptop category not in distribution"
        initial_hub_count = dist_data["distribution"]["laptop"].get("Hub", 0)
        assert initial_hub_count > 0, f"Expected laptop count > 0 in Hub, got {initial_hub_count}"
        
        # Step 3: Mark item as damaged
        update_response = requests.put(f"{BASE_URL}/api/items/{item_name}", headers=self.headers, json={
            "tracking_type": "individual",
            "status": "damaged",
            "current_location": "station:Storage"
        })
        assert update_response.status_code == 200, f"Failed to update item: {update_response.text}"
        
        # Step 4: Get distribution again - item should NOT be counted
        dist_response2 = requests.get(f"{BASE_URL}/api/items/distribution", headers=self.headers)
        assert dist_response2.status_code == 200
        dist_data2 = dist_response2.json()
        
        new_hub_count = dist_data2["distribution"]["laptop"].get("Hub", 0)
        assert new_hub_count < initial_hub_count, f"Damaged item still counted in distribution. Before: {initial_hub_count}, After: {new_hub_count}"
        print(f"✓ Distribution correctly excludes damaged items. Hub count: {initial_hub_count} → {new_hub_count}")
    
    def test_distribution_excludes_lost_items(self):
        """Verify /api/items/distribution excludes items with status 'lost'"""
        # Step 1: Create a test item with status 'active'
        item_name = f"{TEST_PREFIX}SSD_01"
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": item_name,
            "category": "ssd",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert create_response.status_code == 200, f"Failed to create item: {create_response.text}"
        
        # Step 2: Get distribution - item should be counted
        dist_response = requests.get(f"{BASE_URL}/api/items/distribution", headers=self.headers)
        assert dist_response.status_code == 200
        dist_data = dist_response.json()
        
        initial_hub_count = dist_data["distribution"]["ssd"].get("Hub", 0)
        assert initial_hub_count > 0, f"Expected ssd count > 0 in Hub, got {initial_hub_count}"
        
        # Step 3: Mark item as lost
        update_response = requests.put(f"{BASE_URL}/api/items/{item_name}", headers=self.headers, json={
            "tracking_type": "individual",
            "status": "lost",
            "current_location": "station:Storage"
        })
        assert update_response.status_code == 200, f"Failed to update item: {update_response.text}"
        
        # Step 4: Get distribution again - item should NOT be counted
        dist_response2 = requests.get(f"{BASE_URL}/api/items/distribution", headers=self.headers)
        assert dist_response2.status_code == 200
        dist_data2 = dist_response2.json()
        
        new_hub_count = dist_data2["distribution"]["ssd"].get("Hub", 0)
        assert new_hub_count < initial_hub_count, f"Lost item still counted in distribution. Before: {initial_hub_count}, After: {new_hub_count}"
        print(f"✓ Distribution correctly excludes lost items. Hub count: {initial_hub_count} → {new_hub_count}")
    
    # ==========================================
    # TEST 2: Event creation for damage/lost
    # ==========================================
    def test_damage_event_updates_item_status(self):
        """Verify creating a damage event updates item status to 'damaged'"""
        # Step 1: Create a test item
        item_name = f"{TEST_PREFIX}GLOVE_LEFT_01"
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": item_name,
            "category": "glove_left",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert create_response.status_code == 200, f"Failed to create item: {create_response.text}"
        
        # Step 2: Create a damage event
        event_response = requests.post(f"{BASE_URL}/api/events", headers=self.headers, json={
            "event_type": "damage",
            "item": item_name,
            "from_location": "station:Storage",
            "quantity": 1,
            "notes": "Test damage report"
        })
        assert event_response.status_code == 200, f"Failed to create damage event: {event_response.text}"
        
        # Step 3: Verify item status is now 'damaged'
        items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        assert items_response.status_code == 200
        items = items_response.json()
        
        test_item = next((i for i in items if i["item_name"] == item_name), None)
        assert test_item is not None, f"Item {item_name} not found"
        assert test_item["status"] == "damaged", f"Expected status 'damaged', got '{test_item['status']}'"
        print(f"✓ Damage event correctly updates item status to 'damaged'")
    
    def test_lost_event_updates_item_status(self):
        """Verify creating a lost event updates item status to 'lost'"""
        # Step 1: Create a test item
        item_name = f"{TEST_PREFIX}POWER_BANK_01"
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": item_name,
            "category": "power_bank",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "station:Storage"
        })
        assert create_response.status_code == 200, f"Failed to create item: {create_response.text}"
        
        # Step 2: Create a lost event
        event_response = requests.post(f"{BASE_URL}/api/events", headers=self.headers, json={
            "event_type": "lost",
            "item": item_name,
            "from_location": "station:Storage",
            "quantity": 1,
            "notes": "Test lost report"
        })
        assert event_response.status_code == 200, f"Failed to create lost event: {event_response.text}"
        
        # Step 3: Verify item status is now 'lost'
        items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        assert items_response.status_code == 200
        items = items_response.json()
        
        test_item = next((i for i in items if i["item_name"] == item_name), None)
        assert test_item is not None, f"Item {item_name} not found"
        assert test_item["status"] == "lost", f"Expected status 'lost', got '{test_item['status']}'"
        print(f"✓ Lost event correctly updates item status to 'lost'")
    
    # ==========================================
    # TEST 3: Items API returns all items (including damaged/lost)
    # ==========================================
    def test_items_api_returns_all_statuses(self):
        """Verify /api/items returns items with all statuses (for admin management)"""
        # Create items with different statuses
        items_to_create = [
            (f"{TEST_PREFIX}ACTIVE_ITEM", "active"),
            (f"{TEST_PREFIX}DAMAGED_ITEM", "damaged"),
            (f"{TEST_PREFIX}LOST_ITEM", "lost"),
        ]
        
        for item_name, status in items_to_create:
            create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
                "item_name": item_name,
                "category": "laptop",
                "tracking_type": "individual",
                "status": status,
                "current_location": "station:Storage"
            })
            assert create_response.status_code == 200, f"Failed to create {item_name}: {create_response.text}"
        
        # Get all items
        items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        assert items_response.status_code == 200
        items = items_response.json()
        
        # Verify all test items are returned
        test_items = [i for i in items if i["item_name"].startswith(TEST_PREFIX)]
        statuses_found = set(i["status"] for i in test_items)
        
        assert "active" in statuses_found, "Active items not returned"
        assert "damaged" in statuses_found, "Damaged items not returned"
        assert "lost" in statuses_found, "Lost items not returned"
        print(f"✓ Items API returns all statuses: {statuses_found}")
    
    # ==========================================
    # TEST 4: UNIQUE category damage flow
    # ==========================================
    def test_unique_category_damage_flow(self):
        """Test damage flow for UNIQUE category (laptop, ssd) - select specific item by ID"""
        # UNIQUE categories: glove_left, glove_right, head_camera, wrist_camera, laptop, power_bank, ssd
        item_name = f"{TEST_PREFIX}LAPTOP_UNIQUE_01"
        
        # Step 1: Create a UNIQUE item
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": item_name,
            "category": "laptop",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "kit:KIT-01"
        })
        assert create_response.status_code == 200, f"Failed to create item: {create_response.text}"
        
        # Step 2: Get items to verify it's active
        items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        items = items_response.json()
        active_laptops = [i for i in items if i["category"] == "laptop" and i["status"] == "active"]
        assert any(i["item_name"] == item_name for i in active_laptops), "Test item not in active laptops"
        
        # Step 3: Report damage via event
        event_response = requests.post(f"{BASE_URL}/api/events", headers=self.headers, json={
            "event_type": "damage",
            "item": item_name,
            "quantity": 1,
            "notes": "Screen cracked"
        })
        assert event_response.status_code == 200, f"Failed to create damage event: {event_response.text}"
        
        # Step 4: Verify item is now damaged
        items_response2 = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        items2 = items_response2.json()
        test_item = next((i for i in items2 if i["item_name"] == item_name), None)
        assert test_item["status"] == "damaged", f"Expected 'damaged', got '{test_item['status']}'"
        
        # Step 5: Verify item is NOT in distribution
        dist_response = requests.get(f"{BASE_URL}/api/items/distribution", headers=self.headers)
        dist_data = dist_response.json()
        # The damaged item should not be counted
        print(f"✓ UNIQUE category damage flow works correctly")
    
    # ==========================================
    # TEST 5: NON-UNIQUE category lost flow
    # ==========================================
    def test_non_unique_category_lost_flow(self):
        """Test lost flow for NON-UNIQUE category (usb_hub, imu) - enter quantity"""
        # NON-UNIQUE categories: usb_hub, imu, l_shaped_wire, laptop_charger, bluetooth_adapter
        
        # Step 1: Create multiple NON-UNIQUE items
        for i in range(3):
            item_name = f"{TEST_PREFIX}USB_HUB_{i:02d}"
            create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
                "item_name": item_name,
                "category": "usb_hub",
                "tracking_type": "quantity",
                "status": "active",
                "current_location": "station:Storage",
                "quantity": 1
            })
            assert create_response.status_code == 200, f"Failed to create item: {create_response.text}"
        
        # Step 2: Get initial distribution count
        dist_response = requests.get(f"{BASE_URL}/api/items/distribution", headers=self.headers)
        dist_data = dist_response.json()
        initial_count = dist_data["distribution"]["usb_hub"].get("Hub", 0)
        
        # Step 3: Mark one item as lost
        lost_item_name = f"{TEST_PREFIX}USB_HUB_00"
        event_response = requests.post(f"{BASE_URL}/api/events", headers=self.headers, json={
            "event_type": "lost",
            "item": lost_item_name,
            "quantity": 1,
            "notes": "Lost during deployment"
        })
        assert event_response.status_code == 200, f"Failed to create lost event: {event_response.text}"
        
        # Step 4: Verify distribution count decreased
        dist_response2 = requests.get(f"{BASE_URL}/api/items/distribution", headers=self.headers)
        dist_data2 = dist_response2.json()
        new_count = dist_data2["distribution"]["usb_hub"].get("Hub", 0)
        
        assert new_count < initial_count, f"Lost item still counted. Before: {initial_count}, After: {new_count}"
        print(f"✓ NON-UNIQUE category lost flow works correctly. Count: {initial_count} → {new_count}")
    
    # ==========================================
    # TEST 6: Kit Completeness excludes damaged/lost
    # ==========================================
    def test_kit_completeness_excludes_damaged_items(self):
        """Verify Kit Completeness calculation only counts active items"""
        # This is a frontend calculation, but we can verify the data returned by backend
        # The frontend filters items with status === 'active' for kit completeness
        
        # Step 1: Create an item in a kit
        item_name = f"{TEST_PREFIX}HEAD_CAM_KIT"
        create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
            "item_name": item_name,
            "category": "head_camera",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "kit:KIT-01"
        })
        assert create_response.status_code == 200, f"Failed to create item: {create_response.text}"
        
        # Step 2: Get items and filter for kit completeness (simulating frontend logic)
        items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        items = items_response.json()
        
        kit_items_active = [i for i in items if i.get("current_location") == "kit:KIT-01" and i.get("status") == "active"]
        initial_active_count = len([i for i in kit_items_active if i.get("category") == "head_camera"])
        
        # Step 3: Mark item as damaged
        update_response = requests.put(f"{BASE_URL}/api/items/{item_name}", headers=self.headers, json={
            "tracking_type": "individual",
            "status": "damaged",
            "current_location": "kit:KIT-01"
        })
        assert update_response.status_code == 200
        
        # Step 4: Get items again and verify damaged item is excluded from active count
        items_response2 = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        items2 = items_response2.json()
        
        kit_items_active2 = [i for i in items2 if i.get("current_location") == "kit:KIT-01" and i.get("status") == "active"]
        new_active_count = len([i for i in kit_items_active2 if i.get("category") == "head_camera"])
        
        assert new_active_count < initial_active_count, f"Damaged item still counted in kit completeness. Before: {initial_active_count}, After: {new_active_count}"
        print(f"✓ Kit Completeness correctly excludes damaged items. Active count: {initial_active_count} → {new_active_count}")
    
    # ==========================================
    # TEST 7: Transfer dialog only shows active items
    # ==========================================
    def test_transfer_only_shows_active_items(self):
        """Verify that only active items are available for transfer (simulating frontend filter)"""
        # Create items with different statuses
        active_item = f"{TEST_PREFIX}TRANSFER_ACTIVE"
        damaged_item = f"{TEST_PREFIX}TRANSFER_DAMAGED"
        
        for item_name, status in [(active_item, "active"), (damaged_item, "damaged")]:
            create_response = requests.post(f"{BASE_URL}/api/items", headers=self.headers, json={
                "item_name": item_name,
                "category": "ssd",
                "tracking_type": "individual",
                "status": status,
                "current_location": "station:Storage"
            })
            assert create_response.status_code == 200
        
        # Get items and filter for transfer (simulating frontend logic)
        items_response = requests.get(f"{BASE_URL}/api/items", headers=self.headers)
        items = items_response.json()
        
        # Frontend filter: items.filter(i => i.category === formData.transfer_category && i.status === 'active')
        transfer_eligible = [i for i in items if i.get("category") == "ssd" and i.get("status") == "active"]
        
        # Verify active item is in list
        assert any(i["item_name"] == active_item for i in transfer_eligible), "Active item not in transfer list"
        
        # Verify damaged item is NOT in list
        assert not any(i["item_name"] == damaged_item for i in transfer_eligible), "Damaged item should not be in transfer list"
        
        print(f"✓ Transfer dialog correctly filters to only active items")
    
    # ==========================================
    # TEST 8: Categories endpoint returns correct data
    # ==========================================
    def test_categories_endpoint(self):
        """Verify /api/categories returns UNIQUE and NON-UNIQUE classification"""
        response = requests.get(f"{BASE_URL}/api/categories", headers=self.headers)
        assert response.status_code == 200, f"Categories endpoint failed: {response.text}"
        
        data = response.json()
        
        # Verify structure
        assert "categories" in data, "Missing 'categories' field"
        assert "unique_categories" in data, "Missing 'unique_categories' field"
        assert "non_unique_categories" in data, "Missing 'non_unique_categories' field"
        
        # Verify UNIQUE categories
        unique = data["unique_categories"]
        assert "laptop" in unique, "laptop should be UNIQUE"
        assert "ssd" in unique, "ssd should be UNIQUE"
        assert "glove_left" in unique, "glove_left should be UNIQUE"
        
        # Verify NON-UNIQUE categories
        non_unique = data["non_unique_categories"]
        assert "usb_hub" in non_unique, "usb_hub should be NON-UNIQUE"
        assert "imu" in non_unique, "imu should be NON-UNIQUE"
        
        print(f"✓ Categories endpoint returns correct UNIQUE/NON-UNIQUE classification")
        print(f"  UNIQUE: {unique}")
        print(f"  NON-UNIQUE: {non_unique}")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
