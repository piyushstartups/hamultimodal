import requests
import sys
from datetime import datetime
import json

class InventoryAPITester:
    def __init__(self, base_url="https://inventory-fix-56.preview.emergentagent.com"):
        self.base_url = base_url
        self.token = None
        self.tests_run = 0
        self.tests_passed = 0
        self.current_user = None

    def run_test(self, name, method, endpoint, expected_status, data=None, headers=None):
        """Run a single API test"""
        url = f"{self.base_url}/api/{endpoint}"
        
        # Set up headers
        test_headers = {'Content-Type': 'application/json'}
        if self.token:
            test_headers['Authorization'] = f'Bearer {self.token}'
        if headers:
            test_headers.update(headers)

        self.tests_run += 1
        print(f"\n🔍 Testing {name}...")
        print(f"   URL: {url}")
        
        try:
            if method == 'GET':
                response = requests.get(url, headers=test_headers)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=test_headers)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=test_headers)

            success = response.status_code == expected_status
            if success:
                self.tests_passed += 1
                print(f"✅ Passed - Status: {response.status_code}")
                try:
                    return True, response.json()
                except:
                    return True, {}
            else:
                print(f"❌ Failed - Expected {expected_status}, got {response.status_code}")
                try:
                    error_data = response.json()
                    print(f"   Error: {error_data}")
                except:
                    print(f"   Response text: {response.text}")

            return False, {}

        except Exception as e:
            print(f"❌ Failed - Error: {str(e)}")
            return False, {}

    def test_seed_data(self):
        """Seed sample data"""
        print("\n🌱 Seeding sample data...")
        success, response = self.run_test(
            "Seed Data",
            "POST",
            "seed",
            200
        )
        return success

    def test_login(self, username, password):
        """Test login and get token"""
        success, response = self.run_test(
            f"Login - {username}",
            "POST",
            "auth/login",
            200,
            data={"name": username, "password": password}
        )
        if success and 'access_token' in response:
            self.token = response['access_token']
            print(f"   Token received: {self.token[:20]}...")
            return True
        return False

    def test_get_me(self):
        """Test get current user"""
        success, response = self.run_test(
            "Get Current User",
            "GET",
            "auth/me",
            200
        )
        if success:
            self.current_user = response
        return success, response

    def test_get_users(self):
        """Test get all users"""
        return self.run_test(
            "Get Users",
            "GET",
            "users",
            200
        )

    def test_get_kits(self):
        """Test get all kits"""
        return self.run_test(
            "Get Kits",
            "GET",
            "kits",
            200
        )

    def test_get_items(self):
        """Test get all items"""
        return self.run_test(
            "Get Items",
            "GET",
            "items",
            200
        )

    def test_get_inventory(self):
        """Test get inventory state"""
        return self.run_test(
            "Get Inventory",
            "GET",
            "items/inventory",
            200
        )

    def test_get_events(self):
        """Test get events with filters"""
        # Test without filters
        success1, _ = self.run_test(
            "Get All Events",
            "GET",
            "events",
            200
        )
        
        # Test with event type filter
        success2, _ = self.run_test(
            "Get Events - Start Shift Filter",
            "GET",
            "events?event_type=start_shift",
            200
        )
        
        return success1 and success2

    def test_create_event(self):
        """Test creating an event"""
        event_data = {
            "event_type": "activity",
            "user_id": self.current_user.get("id") if self.current_user else "user_1",
            "from_kit": "KIT-01",
            "activity_type": "cooking",
            "notes": "Test activity from backend test"
        }
        
        return self.run_test(
            "Create Activity Event",
            "POST",
            "events",
            200,
            data=event_data
        )

    def test_create_transfer_event(self):
        """Test creating a transfer event"""
        event_data = {
            "event_type": "transfer",
            "user_id": self.current_user.get("id") if self.current_user else "user_1",
            "from_kit": "STATION-01",
            "to_kit": "KIT-01",
            "item_id": "BATTERIES",
            "quantity": 10,
            "notes": "Test transfer from backend test"
        }
        
        return self.run_test(
            "Create Transfer Event",
            "POST",
            "events",
            200,
            data=event_data
        )

    def test_create_damage_event(self):
        """Test creating a damage event"""
        event_data = {
            "event_type": "damage",
            "user_id": self.current_user.get("id") if self.current_user else "user_1",
            "from_kit": "KIT-01",
            "item_id": "SSD-001",
            "damage_type": "Test damage from backend test",
            "severity": "low",
            "notes": "Test damage report"
        }
        
        return self.run_test(
            "Create Damage Event",
            "POST",
            "events",
            200,
            data=event_data
        )

    def test_get_requests(self):
        """Test get requests"""
        success1, _ = self.run_test(
            "Get All Requests",
            "GET",
            "requests",
            200
        )
        
        # Test with status filter
        success2, _ = self.run_test(
            "Get Pending Requests",
            "GET",
            "requests?status_filter=pending",
            200
        )
        
        return success1 and success2

    def test_create_request(self):
        """Test creating a request"""
        request_data = {
            "requested_by": self.current_user.get("id") if self.current_user else "user_1",
            "from_kit": "STATION-01",
            "item_id": "CABLES",
            "quantity": 5,
            "notes": "Test request from backend test"
        }
        
        success, response = self.run_test(
            "Create Request",
            "POST",
            "requests",
            200,
            data=request_data
        )
        
        if success and response:
            # Try to approve the request
            request_id = response.get("id")
            if request_id:
                approve_success, _ = self.run_test(
                    "Approve Request",
                    "PUT",
                    f"requests/{request_id}",
                    200,
                    data={"status": "approved"}
                )
                return success and approve_success
        
        return success

    def test_get_notifications(self):
        """Test notifications endpoints"""
        success1, _ = self.run_test(
            "Get Notifications",
            "GET",
            "notifications",
            200
        )
        
        success2, _ = self.run_test(
            "Get Unread Count",
            "GET",
            "notifications/unread/count",
            200
        )
        
        return success1 and success2

    def test_mark_notification_read(self):
        """Test marking notification as read"""
        # First get notifications to find one to mark as read
        success, notifications = self.run_test(
            "Get Notifications for Mark Read Test",
            "GET",
            "notifications",
            200
        )
        
        if success and notifications and len(notifications) > 0:
            first_notification = notifications[0]
            notification_id = first_notification.get("id")
            if notification_id:
                return self.run_test(
                    "Mark Notification Read",
                    "PUT",
                    f"notifications/{notification_id}/read",
                    200
                )[0]
        
        print("   No notifications available to mark as read")
        return True  # Consider this a pass if no notifications exist

def main():
    """Main test execution"""
    print("🚀 Starting Inventory Management API Tests")
    print("=" * 50)
    
    # Setup
    tester = InventoryAPITester()
    
    # Test sequence
    tests = [
        ("Seed Data", tester.test_seed_data),
        ("Login - John Deployer", lambda: tester.test_login("John Deployer", "password123")),
        ("Get Current User", tester.test_get_me),
        ("Get Users", tester.test_get_users),
        ("Get Kits", tester.test_get_kits),
        ("Get Items", tester.test_get_items),
        ("Get Inventory", tester.test_get_inventory),
        ("Get Events", tester.test_get_events),
        ("Create Activity Event", tester.test_create_event),
        ("Create Transfer Event", tester.test_create_transfer_event),
        ("Create Damage Event", tester.test_create_damage_event),
        ("Get Requests", tester.test_get_requests),
        ("Create and Approve Request", tester.test_create_request),
        ("Get Notifications", tester.test_get_notifications),
        ("Mark Notification Read", tester.test_mark_notification_read),
    ]
    
    # Run tests
    failed_tests = []
    for test_name, test_func in tests:
        try:
            result = test_func()
            if not result:
                failed_tests.append(test_name)
        except Exception as e:
            print(f"❌ {test_name} - Exception: {str(e)}")
            failed_tests.append(test_name)
            tester.tests_run += 1
    
    # Print results
    print("\n" + "=" * 50)
    print("📊 TEST RESULTS")
    print("=" * 50)
    print(f"Tests passed: {tester.tests_passed}/{tester.tests_run}")
    print(f"Success rate: {(tester.tests_passed/tester.tests_run*100):.1f}%" if tester.tests_run > 0 else "0%")
    
    if failed_tests:
        print(f"\n❌ Failed tests ({len(failed_tests)}):")
        for test in failed_tests:
            print(f"   - {test}")
    else:
        print("\n✅ All tests passed!")
    
    return 0 if len(failed_tests) == 0 else 1

if __name__ == "__main__":
    sys.exit(main())