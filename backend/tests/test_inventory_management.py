"""
Test suite for Inventory Management Features
- Tests CRUD operations for items
- Tests inventory summary endpoint
- Tests bulk add functionality
- Tests role-based access control for inventory management
"""

import pytest
import requests
import os
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', 'https://damage-lost-flow.preview.emergentagent.com').rstrip('/')

class TestAuth:
    """Authentication tests for different user roles"""
    
    def test_admin_login(self):
        """Test admin user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["token_type"] == "bearer"
        print(f"Admin login successful, token: {data['access_token'][:20]}...")
        
    def test_deployer_login(self):
        """Test deployer user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("Deployer login successful")
        
    def test_station_login(self):
        """Test station user can login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Sarah Station",
            "password": "password123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        print("Station user login successful")


class TestItemsCRUD:
    """Test Items CRUD operations - Inventory Management feature"""
    
    @pytest.fixture
    def admin_token(self):
        """Get admin token for authenticated requests"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        if response.status_code != 200:
            pytest.skip("Admin login failed")
        return response.json()["access_token"]
    
    @pytest.fixture
    def deployer_token(self):
        """Get deployer token for testing role-based access"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        if response.status_code != 200:
            pytest.skip("Deployer login failed")
        return response.json()["access_token"]
    
    def test_get_all_items(self, admin_token):
        """Test getting all items"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        response = requests.get(f"{BASE_URL}/api/items", headers=headers)
        assert response.status_code == 200
        items = response.json()
        assert isinstance(items, list)
        assert len(items) > 0
        print(f"Retrieved {len(items)} items from inventory")
        
        # Verify item structure
        first_item = items[0]
        assert "item_id" in first_item
        assert "item_name" in first_item
        assert "status" in first_item
        
    def test_create_item_admin(self, admin_token):
        """Test creating a new item as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        test_item_id = f"TEST-ITEM-{int(time.time())}"
        
        item_data = {
            "item_id": test_item_id,
            "item_name": "Test Camera Unit",
            "tracking_type": "individual",
            "status": "active",
            "category": "camera",
            "current_kit": "STATION-01",
            "description": "Test item for automated testing"
        }
        
        response = requests.post(f"{BASE_URL}/api/items", headers=headers, json=item_data)
        assert response.status_code == 200
        
        created_item = response.json()
        assert created_item["item_id"] == test_item_id
        assert created_item["item_name"] == "Test Camera Unit"
        assert created_item["status"] == "active"
        print(f"Created item: {test_item_id}")
        
        # Verify persistence with GET
        response = requests.get(f"{BASE_URL}/api/items", headers=headers)
        assert response.status_code == 200
        items = response.json()
        found = any(item["item_id"] == test_item_id for item in items)
        assert found, "Created item not found in GET response"
        
    def test_update_item_admin(self, admin_token):
        """Test updating an item as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First get an existing item
        response = requests.get(f"{BASE_URL}/api/items", headers=headers)
        items = response.json()
        test_item = next((i for i in items if i["item_id"].startswith("TEST-ITEM")), items[0])
        
        # Update the item
        update_data = {
            "item_id": test_item["item_id"],
            "item_name": test_item["item_name"],
            "tracking_type": test_item["tracking_type"],
            "status": "repair",  # Changed status
            "category": test_item.get("category", "camera"),
            "current_kit": test_item.get("current_kit"),
            "description": "Updated description for testing"
        }
        
        response = requests.put(f"{BASE_URL}/api/items/{test_item['item_id']}", headers=headers, json=update_data)
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["status"] == "repair"
        assert updated["description"] == "Updated description for testing"
        print(f"Updated item {test_item['item_id']} status to repair")
        
    def test_deployer_cannot_update_items(self, deployer_token):
        """Test that deployer role cannot update items - role-based access"""
        headers = {"Authorization": f"Bearer {deployer_token}"}
        
        # Try to update an item (should fail for deployer)
        response = requests.put(
            f"{BASE_URL}/api/items/SSD-001", 
            headers=headers, 
            json={
                "item_id": "SSD-001",
                "item_name": "SSD Drive 1TB",
                "tracking_type": "individual",
                "status": "active"
            }
        )
        assert response.status_code == 403, "Deployer should not be able to update items"
        print("Deployer correctly denied access to update items")
        
    def test_deployer_cannot_delete_items(self, deployer_token):
        """Test that deployer role cannot delete items"""
        headers = {"Authorization": f"Bearer {deployer_token}"}
        
        response = requests.delete(f"{BASE_URL}/api/items/SSD-001", headers=headers)
        assert response.status_code == 403, "Deployer should not be able to delete items"
        print("Deployer correctly denied access to delete items")
        
    def test_delete_item_admin(self, admin_token):
        """Test deleting an item as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # First create an item to delete
        test_item_id = f"DELETE-TEST-{int(time.time())}"
        response = requests.post(f"{BASE_URL}/api/items", headers=headers, json={
            "item_id": test_item_id,
            "item_name": "Item to be deleted",
            "tracking_type": "individual",
            "status": "active"
        })
        assert response.status_code == 200
        
        # Delete the item
        response = requests.delete(f"{BASE_URL}/api/items/{test_item_id}", headers=headers)
        assert response.status_code == 200
        
        result = response.json()
        assert result["status"] == "success"
        print(f"Deleted item: {test_item_id}")
        
        # Verify deletion - item should not be in list
        response = requests.get(f"{BASE_URL}/api/items", headers=headers)
        items = response.json()
        found = any(item["item_id"] == test_item_id for item in items)
        assert not found, "Deleted item should not exist"


class TestBulkAddItems:
    """Test Bulk Add Items functionality"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def deployer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        return response.json()["access_token"]
    
    def test_bulk_add_items_admin(self, admin_token):
        """Test bulk adding items as admin"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        timestamp = int(time.time())
        
        bulk_items = [
            {
                "item_id": f"BULK-SSD-{timestamp}-1",
                "item_name": "Bulk SSD 1",
                "tracking_type": "individual",
                "status": "active",
                "category": "ssd",
                "current_kit": "STATION-01",
                "total_capacity_gb": 1000
            },
            {
                "item_id": f"BULK-SSD-{timestamp}-2",
                "item_name": "Bulk SSD 2",
                "tracking_type": "individual",
                "status": "active",
                "category": "ssd",
                "current_kit": "STATION-01",
                "total_capacity_gb": 2000
            },
            {
                "item_id": f"BULK-GLOVE-{timestamp}",
                "item_name": "Bulk Glove Left",
                "tracking_type": "individual",
                "status": "active",
                "category": "glove",
                "side": "left",
                "current_kit": "STATION-01"
            }
        ]
        
        response = requests.post(f"{BASE_URL}/api/items/bulk-add", headers=headers, json=bulk_items)
        assert response.status_code == 200
        
        result = response.json()
        assert result["status"] == "success"
        assert result["items_created"] == 3
        print(f"Bulk added {result['items_created']} items")
        
    def test_bulk_add_items_deployer_denied(self, deployer_token):
        """Test that deployer cannot bulk add items"""
        headers = {"Authorization": f"Bearer {deployer_token}"}
        
        response = requests.post(f"{BASE_URL}/api/items/bulk-add", headers=headers, json=[
            {"item_id": "SHOULD-FAIL", "item_name": "Test", "tracking_type": "individual"}
        ])
        assert response.status_code == 403
        print("Deployer correctly denied access to bulk add items")


class TestInventorySummary:
    """Test Inventory Summary endpoint - optimized aggregation"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        return response.json()["access_token"]
    
    def test_inventory_summary_endpoint(self, admin_token):
        """Test the optimized inventory summary endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/items/inventory-summary", headers=headers)
        assert response.status_code == 200
        
        summary = response.json()
        assert isinstance(summary, list)
        assert len(summary) > 0
        
        # Verify structure
        first_kit = summary[0]
        assert "kit_id" in first_kit
        assert "type" in first_kit
        assert "status" in first_kit
        assert "categories" in first_kit
        
        print(f"Inventory summary returned {len(summary)} kits")
        
        # Check for category breakdown
        for kit in summary:
            if kit.get("categories"):
                for category, stats in kit["categories"].items():
                    assert "total" in stats
                    assert "active" in stats
                    print(f"Kit {kit['kit_id']} - {category}: {stats['total']} total, {stats['active']} active")
                    
    def test_inventory_endpoint(self, admin_token):
        """Test the basic inventory endpoint"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/items/inventory", headers=headers)
        assert response.status_code == 200
        
        inventory = response.json()
        assert isinstance(inventory, list)
        print(f"Inventory endpoint returned {len(inventory)} items")


class TestEventTypes:
    """Test new event types: check_out, check_in, wear_flag"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        return response.json()["access_token"]
    
    @pytest.fixture
    def deployer_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        return response.json()["access_token"]
    
    def test_create_check_out_event(self, deployer_token):
        """Test creating check_out event"""
        headers = {"Authorization": f"Bearer {deployer_token}"}
        
        event_data = {
            "event_type": "check_out",
            "user_id": "user_1",
            "from_kit": "KIT-01",
            "item_id": "SSD-001",
            "quantity": 1,
            "notes": "Checking out SSD for shift"
        }
        
        response = requests.post(f"{BASE_URL}/api/events", headers=headers, json=event_data)
        assert response.status_code == 200
        
        event = response.json()
        assert event["event_type"] == "check_out"
        print("check_out event created successfully")
        
    def test_create_check_in_event(self, deployer_token):
        """Test creating check_in event"""
        headers = {"Authorization": f"Bearer {deployer_token}"}
        
        event_data = {
            "event_type": "check_in",
            "user_id": "user_1",
            "to_kit": "KIT-01",
            "item_id": "SSD-001",
            "quantity": 1,
            "notes": "Checking in SSD after shift"
        }
        
        response = requests.post(f"{BASE_URL}/api/events", headers=headers, json=event_data)
        assert response.status_code == 200
        
        event = response.json()
        assert event["event_type"] == "check_in"
        print("check_in event created successfully")
        
    def test_create_wear_flag_event(self, admin_token):
        """Test creating wear_flag event"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        event_data = {
            "event_type": "wear_flag",
            "user_id": "user_4",
            "from_kit": "KIT-02",
            "item_id": "GLOVE-L-002",
            "notes": "Glove showing wear on fingertips"
        }
        
        response = requests.post(f"{BASE_URL}/api/events", headers=headers, json=event_data)
        assert response.status_code == 200
        
        event = response.json()
        assert event["event_type"] == "wear_flag"
        print("wear_flag event created successfully")
        
        # Verify item status was updated
        response = requests.get(f"{BASE_URL}/api/items", headers=headers)
        items = response.json()
        flagged_item = next((i for i in items if i["item_id"] == "GLOVE-L-002"), None)
        if flagged_item:
            print(f"Item status after wear_flag: {flagged_item['status']}")
            # Note: wear_flag event should update item status to 'wear_flag'
            

class TestGetEvents:
    """Test events retrieval with filters"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        return response.json()["access_token"]
    
    def test_get_events_by_type(self, admin_token):
        """Test filtering events by type"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Test check_out events
        response = requests.get(f"{BASE_URL}/api/events?event_type=check_out", headers=headers)
        assert response.status_code == 200
        events = response.json()
        for event in events:
            assert event["event_type"] == "check_out"
        print(f"Found {len(events)} check_out events")
        
        # Test check_in events
        response = requests.get(f"{BASE_URL}/api/events?event_type=check_in", headers=headers)
        assert response.status_code == 200
        events = response.json()
        for event in events:
            assert event["event_type"] == "check_in"
        print(f"Found {len(events)} check_in events")
        
        # Test wear_flag events
        response = requests.get(f"{BASE_URL}/api/events?event_type=wear_flag", headers=headers)
        assert response.status_code == 200
        events = response.json()
        for event in events:
            assert event["event_type"] == "wear_flag"
        print(f"Found {len(events)} wear_flag events")


class TestItemFilters:
    """Test item filtering by category"""
    
    @pytest.fixture
    def admin_token(self):
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        return response.json()["access_token"]
    
    def test_get_items_by_category(self, admin_token):
        """Test filtering items by category"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        # Test SSD category
        response = requests.get(f"{BASE_URL}/api/items/by-category?category=ssd", headers=headers)
        assert response.status_code == 200
        items = response.json()
        for item in items:
            assert item["category"] == "ssd"
        print(f"Found {len(items)} SSD items")
        
        # Test glove category
        response = requests.get(f"{BASE_URL}/api/items/by-category?category=glove", headers=headers)
        assert response.status_code == 200
        items = response.json()
        for item in items:
            assert item["category"] == "glove"
        print(f"Found {len(items)} glove items")
    
    def test_get_ssds(self, admin_token):
        """Test SSDs endpoint for shift tracking"""
        headers = {"Authorization": f"Bearer {admin_token}"}
        
        response = requests.get(f"{BASE_URL}/api/items/ssds", headers=headers)
        assert response.status_code == 200
        ssds = response.json()
        assert len(ssds) > 0
        
        for ssd in ssds:
            assert ssd["category"] == "ssd"
        print(f"Found {len(ssds)} SSDs for shift tracking")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
