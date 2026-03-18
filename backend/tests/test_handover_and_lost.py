"""
Test cases for UX improvements and handover/loss tracking features (Iteration 9)
- Handover system with kit-level and BnB-level checklists
- Lost event handling and item status updates
- Quick Actions verification (Transfer, Damage, Lost - NOT Request)
- Shift controls (Start/Pause/Resume/Stop)
"""

import pytest
import requests
import os

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

class TestAuthentication:
    """Authentication for testing"""
    
    def test_admin_login(self):
        """Admin should be able to login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin",
            "password": "admin123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "admin"
    
    def test_manager_login(self):
        """Manager should be able to login"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "TestManager1",
            "password": "test123"
        })
        assert response.status_code == 200
        data = response.json()
        assert "access_token" in data
        assert data["user"]["role"] == "deployment_manager"


@pytest.fixture
def admin_token():
    """Get admin token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "name": "Admin",
        "password": "admin123"
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Admin login failed")

@pytest.fixture
def manager_token():
    """Get manager token"""
    response = requests.post(f"{BASE_URL}/api/auth/login", json={
        "name": "TestManager1",
        "password": "test123"
    })
    if response.status_code == 200:
        return response.json()["access_token"]
    pytest.skip("Manager login failed")

@pytest.fixture
def admin_headers(admin_token):
    """Get admin headers"""
    return {"Authorization": f"Bearer {admin_token}"}

@pytest.fixture
def manager_headers(manager_token):
    """Get manager headers"""
    return {"Authorization": f"Bearer {manager_token}"}


class TestHandoverEndpoints:
    """Test handover system endpoints"""
    
    def test_handover_endpoint_exists(self, manager_headers):
        """POST /api/handovers should exist"""
        # First need to create a deployment to test with
        response = requests.get(f"{BASE_URL}/api/deployments", headers=manager_headers)
        assert response.status_code == 200
        deployments = response.json()
        
        if not deployments:
            pytest.skip("No deployments available for handover test")
        
        # Try to create a handover
        deployment = deployments[0]
        kit_checklists = []
        for kit in deployment.get("assigned_kits", ["TEST-KIT-01"]):
            kit_checklists.append({
                "kit_id": kit,
                "gloves": 2,
                "usb_hub": 1,
                "imus": 4,
                "head_camera": 1,
                "l_shaped_wire": 1,
                "laptop": 1,
                "laptop_charger": 1,
                "power_bank": 1,
                "ssds": 2
            })
        
        bnb_checklist = {
            "charging_station": 1,
            "power_strip_8_port": 2,
            "power_strip_4_5_port": 1
        }
        
        response = requests.post(f"{BASE_URL}/api/handovers", json={
            "deployment_id": deployment["id"],
            "handover_type": "outgoing",
            "kit_checklists": kit_checklists,
            "bnb_checklist": bnb_checklist,
            "missing_items": [],
            "notes": "Test handover"
        }, headers=manager_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert data["handover_type"] == "outgoing"
        assert "kit_checklists" in data
        assert "bnb_checklist" in data
    
    def test_handover_with_missing_items(self, manager_headers):
        """Handover should handle missing items"""
        response = requests.get(f"{BASE_URL}/api/deployments", headers=manager_headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No deployments available")
        
        deployment = response.json()[0]
        
        response = requests.post(f"{BASE_URL}/api/handovers", json={
            "deployment_id": deployment["id"],
            "handover_type": "incoming",
            "kit_checklists": [{
                "kit_id": deployment.get("assigned_kits", ["TEST-KIT"])[0] if deployment.get("assigned_kits") else "TEST-KIT",
                "gloves": 1,
                "usb_hub": 0,
                "imus": 4,
                "head_camera": 1,
                "l_shaped_wire": 1,
                "laptop": 1,
                "laptop_charger": 1,
                "power_bank": 1,
                "ssds": 2
            }],
            "bnb_checklist": {
                "charging_station": 1,
                "power_strip_8_port": 2,
                "power_strip_4_5_port": 1
            },
            "missing_items": [
                {"item": "USB Hub", "quantity": 1, "kit_id": "KIT-01", "report_as_lost": False}
            ],
            "notes": "USB hub missing, not reporting as lost"
        }, headers=manager_headers)
        
        assert response.status_code == 200
        data = response.json()
        assert data["handover_type"] == "incoming"
        assert len(data["missing_items"]) >= 1
    
    def test_get_handovers_by_deployment(self, manager_headers):
        """GET /api/handovers/by-deployment should return handovers"""
        response = requests.get(f"{BASE_URL}/api/deployments", headers=manager_headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No deployments available")
        
        deployment = response.json()[0]
        
        response = requests.get(f"{BASE_URL}/api/handovers/by-deployment/{deployment['id']}", headers=manager_headers)
        assert response.status_code == 200
        assert isinstance(response.json(), list)


class TestLostEventHandling:
    """Test lost event creation and item status update"""
    
    def test_create_lost_event_updates_item_status(self, admin_headers):
        """Lost event should update item status to 'lost' for individual items"""
        # First, create a test item with individual tracking
        unique_name = f"TEST_Lost_Item_{os.urandom(4).hex()}"
        response = requests.post(f"{BASE_URL}/api/items", json={
            "item_name": unique_name,
            "category": "test",
            "tracking_type": "individual",
            "status": "active",
            "current_location": "kit:KIT-01"
        }, headers=admin_headers)
        
        assert response.status_code == 200 or response.status_code == 201
        
        # Now create a lost event
        response = requests.post(f"{BASE_URL}/api/events", json={
            "event_type": "lost",
            "item": unique_name,
            "from_location": "kit:KIT-01",
            "quantity": 1,
            "notes": "Test lost event"
        }, headers=admin_headers)
        
        assert response.status_code == 200
        event = response.json()
        assert event["event_type"] == "lost"
        
        # Verify item status was updated
        response = requests.get(f"{BASE_URL}/api/items", headers=admin_headers)
        assert response.status_code == 200
        items = response.json()
        test_item = next((i for i in items if i["item_name"] == unique_name), None)
        
        assert test_item is not None
        assert test_item["status"] == "lost"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/items/{unique_name}", headers=admin_headers)
    
    def test_lost_event_reduces_quantity(self, admin_headers):
        """Lost event should reduce quantity for quantity-tracked items"""
        # Create quantity-tracked item
        unique_name = f"TEST_Qty_Item_{os.urandom(4).hex()}"
        response = requests.post(f"{BASE_URL}/api/items", json={
            "item_name": unique_name,
            "category": "test",
            "tracking_type": "quantity",
            "status": "active",
            "quantity": 10
        }, headers=admin_headers)
        
        assert response.status_code == 200 or response.status_code == 201
        
        # Create lost event for 3 items
        response = requests.post(f"{BASE_URL}/api/events", json={
            "event_type": "lost",
            "item": unique_name,
            "from_location": "station:Main",
            "quantity": 3,
            "notes": "3 items lost"
        }, headers=admin_headers)
        
        assert response.status_code == 200
        
        # Verify quantity reduced
        response = requests.get(f"{BASE_URL}/api/items", headers=admin_headers)
        items = response.json()
        test_item = next((i for i in items if i["item_name"] == unique_name), None)
        
        assert test_item is not None
        assert test_item["quantity"] == 7  # 10 - 3
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/items/{unique_name}", headers=admin_headers)


class TestShiftControls:
    """Test Start/Pause/Resume/Stop shift operations"""
    
    def test_start_shift_requires_deployment(self, manager_headers):
        """Starting a shift requires deployment_id"""
        response = requests.post(f"{BASE_URL}/api/shifts/start", json={
            "kit": "KIT-01",
            "ssd_used": "SSD-01",
            "activity_type": "cooking"
        }, headers=manager_headers)
        
        # Should fail without deployment_id
        assert response.status_code == 422
    
    def test_full_shift_lifecycle(self, manager_headers, admin_headers):
        """Test Start → Pause → Resume → Stop flow"""
        # Get a deployment
        response = requests.get(f"{BASE_URL}/api/deployments", headers=manager_headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No deployments available")
        
        deployment = response.json()[0]
        kits = deployment.get("assigned_kits", [])
        if not kits:
            pytest.skip("No kits assigned to deployment")
        
        kit = kits[0]
        
        # Start shift
        response = requests.post(f"{BASE_URL}/api/shifts/start", json={
            "deployment_id": deployment["id"],
            "kit": kit,
            "ssd_used": "SSD-01",
            "activity_type": "cooking"
        }, headers=manager_headers)
        
        # May fail if shift already active for this kit
        if response.status_code == 400:
            # Get existing shift and stop it
            response = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{deployment['id']}", headers=manager_headers)
            if response.status_code == 200:
                shifts = response.json()
                if kit in shifts:
                    shift_id = shifts[kit]["id"]
                    # Stop existing shift
                    requests.post(f"{BASE_URL}/api/shifts/{shift_id}/stop", headers=manager_headers)
                    # Try again
                    response = requests.post(f"{BASE_URL}/api/shifts/start", json={
                        "deployment_id": deployment["id"],
                        "kit": kit,
                        "ssd_used": "SSD-01",
                        "activity_type": "cooking"
                    }, headers=manager_headers)
        
        assert response.status_code == 200, f"Start failed: {response.text}"
        shift = response.json()
        shift_id = shift["id"]
        assert shift["status"] == "active"
        
        # Pause shift
        response = requests.post(f"{BASE_URL}/api/shifts/{shift_id}/pause", headers=manager_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "paused"
        
        # Resume shift
        response = requests.post(f"{BASE_URL}/api/shifts/{shift_id}/resume", headers=manager_headers)
        assert response.status_code == 200
        assert response.json()["status"] == "active"
        
        # Stop shift
        response = requests.post(f"{BASE_URL}/api/shifts/{shift_id}/stop", headers=manager_headers)
        assert response.status_code == 200
        data = response.json()
        assert data["status"] == "completed"
        assert "total_duration_hours" in data
        assert "total_duration_seconds" in data
    
    def test_get_shifts_by_deployment(self, manager_headers):
        """GET /api/shifts/by-deployment returns shifts keyed by kit"""
        response = requests.get(f"{BASE_URL}/api/deployments", headers=manager_headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No deployments available")
        
        deployment = response.json()[0]
        
        response = requests.get(f"{BASE_URL}/api/shifts/by-deployment/{deployment['id']}", headers=manager_headers)
        assert response.status_code == 200
        # Should return dict (kit -> shift)
        assert isinstance(response.json(), dict)


class TestQuickActions:
    """Test Quick Actions have correct options (Transfer, Damage, Lost - NOT Request)"""
    
    def test_transfer_event(self, manager_headers, admin_headers):
        """Transfer events should work"""
        # Get items
        response = requests.get(f"{BASE_URL}/api/items", headers=manager_headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No items available")
        
        items = [i for i in response.json() if i["status"] == "active"]
        if not items:
            pytest.skip("No active items")
        
        item = items[0]["item_name"]
        
        response = requests.post(f"{BASE_URL}/api/events", json={
            "event_type": "transfer",
            "item": item,
            "from_location": "kit:KIT-01",
            "to_location": "kit:KIT-02",
            "quantity": 1,
            "notes": "Test transfer"
        }, headers=manager_headers)
        
        assert response.status_code == 200
        assert response.json()["event_type"] == "transfer"
    
    def test_damage_event_updates_status(self, admin_headers):
        """Damage events should update item status"""
        # Create test item
        unique_name = f"TEST_Damage_{os.urandom(4).hex()}"
        response = requests.post(f"{BASE_URL}/api/items", json={
            "item_name": unique_name,
            "category": "test",
            "tracking_type": "individual",
            "status": "active"
        }, headers=admin_headers)
        
        assert response.status_code == 200
        
        # Report damage
        response = requests.post(f"{BASE_URL}/api/events", json={
            "event_type": "damage",
            "item": unique_name,
            "from_location": "kit:KIT-01",
            "quantity": 1,
            "notes": "Screen cracked"
        }, headers=admin_headers)
        
        assert response.status_code == 200
        assert response.json()["event_type"] == "damage"
        
        # Verify status updated
        response = requests.get(f"{BASE_URL}/api/items", headers=admin_headers)
        items = response.json()
        test_item = next((i for i in items if i["item_name"] == unique_name), None)
        assert test_item is not None
        assert test_item["status"] == "damaged"
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/items/{unique_name}", headers=admin_headers)
    
    def test_lost_event_exists(self, manager_headers):
        """Lost event type should exist and be creatable"""
        response = requests.get(f"{BASE_URL}/api/items", headers=manager_headers)
        if response.status_code != 200 or not response.json():
            pytest.skip("No items available")
        
        items = [i for i in response.json() if i["status"] != "lost"]
        if not items:
            pytest.skip("No non-lost items")
        
        item = items[0]["item_name"]
        
        response = requests.post(f"{BASE_URL}/api/events", json={
            "event_type": "lost",
            "item": item,
            "from_location": "bnb:BnB-01",
            "quantity": 1,
            "notes": "Test lost event"
        }, headers=manager_headers)
        
        assert response.status_code == 200
        assert response.json()["event_type"] == "lost"


class TestHandoverWithLostReporting:
    """Test handover with 'report_as_lost' flag creates lost events"""
    
    def test_handover_lost_flag_creates_event(self, manager_headers, admin_headers):
        """When report_as_lost=True in missing items, lost event should be created"""
        # Create a test item
        unique_name = f"TEST_Handover_Lost_{os.urandom(4).hex()}"
        response = requests.post(f"{BASE_URL}/api/items", json={
            "item_name": unique_name,
            "category": "test",
            "tracking_type": "individual",
            "status": "active"
        }, headers=admin_headers)
        
        assert response.status_code == 200
        
        # Get deployment
        response = requests.get(f"{BASE_URL}/api/deployments", headers=manager_headers)
        if response.status_code != 200 or not response.json():
            # Cleanup and skip
            requests.delete(f"{BASE_URL}/api/items/{unique_name}", headers=admin_headers)
            pytest.skip("No deployments available")
        
        deployment = response.json()[0]
        
        # Create handover with lost item
        kit_id = deployment.get("assigned_kits", ["KIT-01"])[0] if deployment.get("assigned_kits") else "KIT-01"
        response = requests.post(f"{BASE_URL}/api/handovers", json={
            "deployment_id": deployment["id"],
            "handover_type": "outgoing",
            "kit_checklists": [{
                "kit_id": kit_id,
                "gloves": 2,
                "usb_hub": 1,
                "imus": 4,
                "head_camera": 1,
                "l_shaped_wire": 1,
                "laptop": 1,
                "laptop_charger": 1,
                "power_bank": 1,
                "ssds": 2
            }],
            "bnb_checklist": {
                "charging_station": 1,
                "power_strip_8_port": 2,
                "power_strip_4_5_port": 1
            },
            "missing_items": [
                {
                    "item": unique_name,
                    "quantity": 1,
                    "kit_id": kit_id,
                    "report_as_lost": True
                }
            ],
            "notes": "Item lost during handover"
        }, headers=manager_headers)
        
        assert response.status_code == 200
        
        # Verify item status is now 'lost'
        response = requests.get(f"{BASE_URL}/api/items", headers=admin_headers)
        items = response.json()
        test_item = next((i for i in items if i["item_name"] == unique_name), None)
        assert test_item is not None
        assert test_item["status"] == "lost"
        
        # Verify lost event was created
        response = requests.get(f"{BASE_URL}/api/events?event_type=lost", headers=admin_headers)
        events = response.json()
        lost_events = [e for e in events if e.get("item") == unique_name]
        assert len(lost_events) > 0
        
        # Cleanup
        requests.delete(f"{BASE_URL}/api/items/{unique_name}", headers=admin_headers)


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
