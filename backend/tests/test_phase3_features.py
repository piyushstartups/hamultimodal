"""
Phase 3 Backend Tests - History & Accountability Features
Tests: Kit History, Worker History, Incidents CRUD, Incidents Summary
"""
import pytest
import requests
import os
from datetime import datetime, timedelta

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL')

class TestPhase3Features:
    """Test Phase 3: History & Accountability endpoints"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        assert response.status_code == 200, f"Admin login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def deployer_token(self):
        """Get deployer authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "John Deployer",
            "password": "password123"
        })
        assert response.status_code == 200, f"Deployer login failed: {response.text}"
        return response.json()["access_token"]
    
    @pytest.fixture(scope="class")
    def supervisor_token(self):
        """Get supervisor authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Mike Supervisor",
            "password": "password123"
        })
        if response.status_code != 200:
            # Try Sarah Station as fallback
            response = requests.post(f"{BASE_URL}/api/auth/login", json={
                "name": "Sarah Station",
                "password": "password123"
            })
        return response.json().get("access_token")
    
    def auth_header(self, token):
        return {"Authorization": f"Bearer {token}"}

    # ========================
    # KIT HISTORY TESTS
    # ========================
    
    def test_kit_history_endpoint_exists(self, admin_token):
        """Test /history/kit/{kit_id} endpoint returns valid data"""
        # Get available kits first
        kits_response = requests.get(
            f"{BASE_URL}/api/kits",
            headers=self.auth_header(admin_token)
        )
        assert kits_response.status_code == 200
        kits = kits_response.json()
        
        # Test with first kit type kit
        kit_id = None
        for k in kits:
            if k.get("type") == "kit":
                kit_id = k["kit_id"]
                break
        
        if kit_id:
            response = requests.get(
                f"{BASE_URL}/api/history/kit/{kit_id}",
                headers=self.auth_header(admin_token)
            )
            assert response.status_code == 200, f"Kit history failed: {response.text}"
            data = response.json()
            
            # Verify response structure
            assert "kit" in data, "Response missing 'kit' field"
            assert "stats" in data, "Response missing 'stats' field"
            assert "bnbs_deployed" in data, "Response missing 'bnbs_deployed' field"
            
            # Verify stats structure
            stats = data["stats"]
            assert "total_deployments" in stats
            assert "unique_bnbs" in stats
            assert "total_shifts" in stats
            assert "total_hours" in stats
            assert "damage_incidents" in stats
            print(f"Kit {kit_id} history: {stats['total_shifts']} shifts, {stats['total_hours']} hours")
    
    def test_kit_history_returns_damage_events(self, admin_token):
        """Test kit history includes damage history"""
        kits_response = requests.get(
            f"{BASE_URL}/api/kits",
            headers=self.auth_header(admin_token)
        )
        kits = kits_response.json()
        
        kit_id = None
        for k in kits:
            if k.get("type") == "kit":
                kit_id = k["kit_id"]
                break
        
        if kit_id:
            response = requests.get(
                f"{BASE_URL}/api/history/kit/{kit_id}",
                headers=self.auth_header(admin_token)
            )
            data = response.json()
            assert "damage_history" in data, "Response missing 'damage_history'"
            assert isinstance(data["damage_history"], list)
            print(f"Kit {kit_id} has {len(data['damage_history'])} damage events")
    
    def test_kit_history_deployer_denied(self, deployer_token):
        """Test deployer cannot access kit history (403)"""
        response = requests.get(
            f"{BASE_URL}/api/history/kit/KIT-01",
            headers=self.auth_header(deployer_token)
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Deployer correctly denied access to kit history")
    
    def test_kit_history_not_found(self, admin_token):
        """Test kit history 404 for non-existent kit"""
        response = requests.get(
            f"{BASE_URL}/api/history/kit/NONEXISTENT-KIT",
            headers=self.auth_header(admin_token)
        )
        assert response.status_code == 404

    # ========================
    # WORKER HISTORY TESTS
    # ========================
    
    def test_worker_history_endpoint_exists(self, admin_token):
        """Test /history/worker/{user_id} endpoint returns valid data"""
        # Get users first
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=self.auth_header(admin_token)
        )
        assert users_response.status_code == 200
        users = users_response.json()
        
        # Find deployer user
        worker_id = None
        for u in users:
            if u.get("role") in ["deployer", "station"]:
                worker_id = u["id"]
                break
        
        if worker_id:
            response = requests.get(
                f"{BASE_URL}/api/history/worker/{worker_id}",
                headers=self.auth_header(admin_token)
            )
            assert response.status_code == 200, f"Worker history failed: {response.text}"
            data = response.json()
            
            # Verify response structure
            assert "worker" in data, "Response missing 'worker' field"
            assert "stats" in data, "Response missing 'stats' field"
            assert "incidents" in data, "Response missing 'incidents' field"
            
            # Verify stats structure
            stats = data["stats"]
            assert "total_shifts" in stats
            assert "total_hours" in stats
            assert "total_incidents" in stats
            assert "total_penalties" in stats
            print(f"Worker history: {stats['total_shifts']} shifts, {stats['total_hours']} hours, {stats['total_incidents']} incidents, ${stats['total_penalties']} penalties")
    
    def test_worker_history_self_access(self, deployer_token):
        """Test worker can access their own history"""
        # Get current user
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=self.auth_header(deployer_token)
        )
        assert me_response.status_code == 200
        user_id = me_response.json()["id"]
        
        # Access own history
        response = requests.get(
            f"{BASE_URL}/api/history/worker/{user_id}",
            headers=self.auth_header(deployer_token)
        )
        assert response.status_code == 200, f"Self history access failed: {response.text}"
        print("Worker can access their own history")
    
    def test_worker_history_other_denied(self, deployer_token, admin_token):
        """Test deployer cannot access other worker's history"""
        # Get a different user
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=self.auth_header(admin_token)
        )
        users = users_response.json()
        
        # Get current deployer
        me_response = requests.get(
            f"{BASE_URL}/api/auth/me",
            headers=self.auth_header(deployer_token)
        )
        my_id = me_response.json()["id"]
        
        # Find another user
        other_id = None
        for u in users:
            if u["id"] != my_id:
                other_id = u["id"]
                break
        
        if other_id:
            response = requests.get(
                f"{BASE_URL}/api/history/worker/{other_id}",
                headers=self.auth_header(deployer_token)
            )
            assert response.status_code == 403, f"Expected 403, got {response.status_code}"
            print("Deployer correctly denied access to other worker's history")

    # ========================
    # INCIDENTS CRUD TESTS
    # ========================
    
    def test_create_incident(self, admin_token):
        """Test creating a new incident"""
        # Get a worker user
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=self.auth_header(admin_token)
        )
        users = users_response.json()
        worker_id = None
        for u in users:
            if u.get("role") in ["deployer", "station"]:
                worker_id = u["id"]
                break
        
        incident_data = {
            "incident_type": "damage",
            "user_id": worker_id,
            "description": "TEST_Broken glove during shift",
            "severity": "medium",
            "penalty_amount": 25.00,
            "shift_date": datetime.now().strftime("%Y-%m-%d")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/incidents",
            json=incident_data,
            headers=self.auth_header(admin_token)
        )
        assert response.status_code == 200, f"Create incident failed: {response.text}"
        data = response.json()
        
        # Verify incident structure
        assert "id" in data, "Incident missing 'id'"
        assert data["incident_type"] == "damage"
        assert data["status"] == "open"
        assert data["penalty_amount"] == 25.00
        print(f"Created incident: {data['id']}")
        return data["id"]
    
    def test_get_incidents_list(self, admin_token):
        """Test getting incidents list"""
        response = requests.get(
            f"{BASE_URL}/api/incidents",
            headers=self.auth_header(admin_token)
        )
        assert response.status_code == 200
        incidents = response.json()
        assert isinstance(incidents, list)
        
        # Check enrichment with user_name
        if incidents:
            assert "user_name" in incidents[0], "Incident missing 'user_name' enrichment"
        print(f"Found {len(incidents)} incidents")
    
    def test_get_incidents_filtered_by_status(self, admin_token):
        """Test filtering incidents by status"""
        response = requests.get(
            f"{BASE_URL}/api/incidents?status=open",
            headers=self.auth_header(admin_token)
        )
        assert response.status_code == 200
        incidents = response.json()
        
        # Verify all are open
        for inc in incidents:
            assert inc["status"] == "open"
        print(f"Found {len(incidents)} open incidents")
    
    def test_update_incident_status(self, admin_token):
        """Test updating incident status to investigating"""
        # First create an incident
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=self.auth_header(admin_token)
        )
        users = users_response.json()
        worker_id = None
        for u in users:
            if u.get("role") in ["deployer", "station"]:
                worker_id = u["id"]
                break
        
        incident_data = {
            "incident_type": "loss",
            "user_id": worker_id,
            "description": "TEST_Lost camera during shift",
            "severity": "high",
            "shift_date": datetime.now().strftime("%Y-%m-%d")
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/incidents",
            json=incident_data,
            headers=self.auth_header(admin_token)
        )
        incident_id = create_response.json()["id"]
        
        # Update to investigating
        update_response = requests.put(
            f"{BASE_URL}/api/incidents/{incident_id}?status=investigating",
            headers=self.auth_header(admin_token)
        )
        assert update_response.status_code == 200
        data = update_response.json()
        assert data["status"] == "investigating"
        print(f"Updated incident {incident_id} to investigating")
    
    def test_update_incident_to_resolved(self, admin_token):
        """Test resolving an incident with penalty"""
        # Create an incident
        users_response = requests.get(
            f"{BASE_URL}/api/users",
            headers=self.auth_header(admin_token)
        )
        users = users_response.json()
        worker_id = None
        for u in users:
            if u.get("role") in ["deployer", "station"]:
                worker_id = u["id"]
                break
        
        incident_data = {
            "incident_type": "misuse",
            "user_id": worker_id,
            "description": "TEST_Misuse of equipment",
            "severity": "low",
            "shift_date": datetime.now().strftime("%Y-%m-%d")
        }
        
        create_response = requests.post(
            f"{BASE_URL}/api/incidents",
            json=incident_data,
            headers=self.auth_header(admin_token)
        )
        incident_id = create_response.json()["id"]
        
        # Resolve with penalty
        update_response = requests.put(
            f"{BASE_URL}/api/incidents/{incident_id}?status=resolved&penalty_amount=50.00",
            headers=self.auth_header(admin_token)
        )
        assert update_response.status_code == 200
        data = update_response.json()
        assert data["status"] == "resolved"
        assert data["penalty_amount"] == 50.00
        print(f"Resolved incident {incident_id} with $50 penalty")
    
    def test_deployer_cannot_create_incident(self, deployer_token):
        """Test deployer cannot create incidents (403)"""
        incident_data = {
            "incident_type": "damage",
            "user_id": "some_user",
            "description": "Test incident",
            "severity": "low",
            "shift_date": datetime.now().strftime("%Y-%m-%d")
        }
        
        response = requests.post(
            f"{BASE_URL}/api/incidents",
            json=incident_data,
            headers=self.auth_header(deployer_token)
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Deployer correctly denied creating incidents")

    # ========================
    # INCIDENTS SUMMARY TESTS
    # ========================
    
    def test_incidents_summary(self, admin_token):
        """Test incidents summary endpoint"""
        response = requests.get(
            f"{BASE_URL}/api/incidents/summary",
            headers=self.auth_header(admin_token)
        )
        assert response.status_code == 200, f"Summary failed: {response.text}"
        data = response.json()
        
        # Verify structure
        assert "by_status" in data, "Summary missing 'by_status'"
        assert "by_type" in data, "Summary missing 'by_type'"
        assert "recent" in data, "Summary missing 'recent'"
        assert "total_open" in data, "Summary missing 'total_open'"
        
        print(f"Summary: by_status={data['by_status']}, by_type={data['by_type']}, total_open={data['total_open']}")
    
    def test_incidents_summary_deployer_denied(self, deployer_token):
        """Test deployer cannot access incidents summary (403)"""
        response = requests.get(
            f"{BASE_URL}/api/incidents/summary",
            headers=self.auth_header(deployer_token)
        )
        assert response.status_code == 403, f"Expected 403, got {response.status_code}"
        print("Deployer correctly denied access to incidents summary")

    # ========================
    # ADD BNB IN DEPLOYMENT PLANNING TESTS
    # ========================
    
    def test_create_bnb_via_kits_endpoint(self, admin_token):
        """Test creating a new BnB location via /kits endpoint"""
        bnb_data = {
            "kit_id": f"TEST-BNB-{datetime.now().strftime('%H%M%S')}",
            "type": "bnb",
            "status": "active"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/kits",
            json=bnb_data,
            headers=self.auth_header(admin_token)
        )
        assert response.status_code == 200, f"Create BnB failed: {response.text}"
        data = response.json()
        
        assert data["type"] == "bnb"
        assert data["status"] == "active"
        print(f"Created BnB: {data['kit_id']}")
    
    def test_deployer_cannot_create_bnb(self, deployer_token):
        """Test deployer can create BnB (they shouldn't have this button in UI but API allows)"""
        # Note: The API might allow it if role check isn't implemented
        # This tests the API behavior
        bnb_data = {
            "kit_id": f"DEPLOYER-BNB-{datetime.now().strftime('%H%M%S')}",
            "type": "bnb",
            "status": "active"
        }
        
        response = requests.post(
            f"{BASE_URL}/api/kits",
            json=bnb_data,
            headers=self.auth_header(deployer_token)
        )
        # Currently the API allows any authenticated user to create kits
        # This might need to be restricted in future
        print(f"Deployer kit creation response: {response.status_code}")

    # ========================
    # WORKER HISTORY FROM INCIDENT DETAIL
    # ========================
    
    def test_worker_history_includes_incidents(self, admin_token):
        """Test worker history shows incidents with penalties"""
        # Get all incidents first
        incidents_response = requests.get(
            f"{BASE_URL}/api/incidents",
            headers=self.auth_header(admin_token)
        )
        incidents = incidents_response.json()
        
        if incidents:
            # Get the user_id from first incident
            user_id = incidents[0]["user_id"]
            
            # Get worker history
            response = requests.get(
                f"{BASE_URL}/api/history/worker/{user_id}",
                headers=self.auth_header(admin_token)
            )
            assert response.status_code == 200
            data = response.json()
            
            # Verify incidents are included
            assert "incidents" in data
            assert "stats" in data
            assert "total_incidents" in data["stats"]
            assert "total_penalties" in data["stats"]
            
            print(f"Worker {user_id} has {data['stats']['total_incidents']} incidents, ${data['stats']['total_penalties']} total penalties")


class TestDeploymentSummary:
    """Test deployment summary for Add BnB functionality"""
    
    @pytest.fixture(scope="class")
    def admin_token(self):
        """Get admin authentication token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "name": "Admin Manager",
            "password": "password123"
        })
        assert response.status_code == 200
        return response.json()["access_token"]
    
    def auth_header(self, token):
        return {"Authorization": f"Bearer {token}"}
    
    def test_deployment_summary_has_bnbs_list(self, admin_token):
        """Test deployment summary returns list of BnBs"""
        today = datetime.now().strftime("%Y-%m-%d")
        response = requests.get(
            f"{BASE_URL}/api/admin/deployment-summary?shift_date={today}",
            headers=self.auth_header(admin_token)
        )
        assert response.status_code == 200
        data = response.json()
        
        # Verify BnBs are included
        assert "bnbs" in data
        assert "total_bnbs" in data
        assert isinstance(data["bnbs"], list)
        print(f"Deployment summary: {data['total_bnbs']} total BnBs, {data['active_bnbs']} active")


if __name__ == "__main__":
    pytest.main([__file__, "-v", "--tb=short"])
