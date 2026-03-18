from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
import jwt
import os
import logging

# ========================
# APP SETUP
# ========================

app = FastAPI(title="Ops Management", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
client = AsyncIOMotorClient(MONGO_URL)
db = client.ops_management_v2

# Auth
SECRET_KEY = os.environ.get("SECRET_KEY", "ops-secret-key-2024")
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ========================
# MODELS
# ========================

class UserCreate(BaseModel):
    name: str
    role: str  # admin / deployment_manager
    password: str

class UserLogin(BaseModel):
    name: str
    password: str

class BnBCreate(BaseModel):
    name: str
    status: str = "active"  # active / inactive

class KitCreate(BaseModel):
    kit_id: str
    status: str = "active"  # active / maintenance

class ItemCreate(BaseModel):
    item_name: str
    category: str = "general"  # ssd, camera, gloves, etc.
    tracking_type: str  # individual / quantity
    status: str = "active"  # active / damaged / lost / repair
    current_location: Optional[str] = None  # e.g., "kit:KIT-01" or "bnb:BnB-01" or "station:Storage"
    quantity: int = 1  # For quantity-tracked items

class DeploymentCreate(BaseModel):
    date: str  # YYYY-MM-DD
    bnb: str
    shift: str  # morning / evening
    assigned_kits: List[str] = []
    assigned_users: List[str] = []
    deployment_managers: List[str] = []  # Multiple user_ids

class ItemUpdate(BaseModel):
    category: Optional[str] = None
    tracking_type: str  # individual / quantity
    status: str = "active"  # active / damaged / lost / repair
    current_location: Optional[str] = None
    quantity: Optional[int] = None

# Shift models for automatic time tracking - CONTEXT-AWARE (tied to deployment/kit)
class ShiftStart(BaseModel):
    deployment_id: str  # Required - which deployment this shift belongs to
    kit: str  # Required - which kit
    ssd_used: str
    activity_type: str  # cooking, cleaning, organizing, outdoor, other

class EventCreate(BaseModel):
    event_type: str  # transfer, damage, activity
    item: str
    from_location: Optional[str] = None  # e.g., "kit:KIT-01" or "bnb:BnB-01" or "station:Main"
    to_location: Optional[str] = None  # e.g., "kit:KIT-02" or "bnb:BnB-02" or "station:Storage"
    quantity: int = 1
    notes: Optional[str] = None

class RequestCreate(BaseModel):
    item: str
    quantity: int = 1
    notes: Optional[str] = None

# ========================
# AUTH HELPERS
# ========================

def create_token(user_id: str, role: str):
    return jwt.encode(
        {"user_id": user_id, "role": role, "exp": datetime.now(timezone.utc).timestamp() + 86400},
        SECRET_KEY, algorithm="HS256"
    )

async def get_current_user(authorization: str = None):
    if not authorization:
        from fastapi import Header
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    try:
        token = authorization.replace("Bearer ", "")
        payload = jwt.decode(token, SECRET_KEY, algorithms=["HS256"])
        user = await db.users.find_one({"id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
        if not user:
            raise HTTPException(status_code=401, detail="User not found")
        return user
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except:
        raise HTTPException(status_code=401, detail="Invalid token")

def get_current_user_dep():
    from fastapi import Header
    async def dependency(authorization: str = Header(None)):
        return await get_current_user(authorization)
    return dependency

# ========================
# STARTUP
# ========================

@app.on_event("startup")
async def startup():
    # Create indexes - use background=True to avoid blocking
    # For items, we need to drop the old non-unique index first
    try:
        await db.items.drop_index("item_name_1")
    except Exception:
        pass  # Index might not exist
    
    await db.users.create_index("id", unique=True)
    await db.users.create_index("name", unique=True)
    await db.bnbs.create_index("name", unique=True)
    await db.kits.create_index("kit_id", unique=True)
    await db.items.create_index("item_name", unique=True)
    await db.deployments.create_index([("date", 1), ("bnb", 1), ("shift", 1)])
    await db.events.create_index([("timestamp", -1)])
    await db.events.create_index([("event_type", 1), ("timestamp", -1)])
    
    # Seed admin if not exists
    admin = await db.users.find_one({"role": "admin"})
    if not admin:
        await db.users.insert_one({
            "id": "admin-001",
            "name": "Admin",
            "role": "admin",
            "password_hash": pwd_context.hash("admin123")
        })
        logger.info("Created default admin user: Admin / admin123")
    
    logger.info("Database initialized")

# ========================
# AUTH ROUTES
# ========================

@app.post("/api/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"name": data.name})
    if not user or not pwd_context.verify(data.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    
    token = create_token(user["id"], user["role"])
    return {
        "access_token": token,
        "user": {"id": user["id"], "name": user["name"], "role": user["role"]}
    }

@app.get("/api/auth/me")
async def get_me(user: dict = Depends(get_current_user_dep())):
    return user

# ========================
# USERS
# ========================

@app.get("/api/users")
async def get_users(user: dict = Depends(get_current_user_dep())):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return users

@app.post("/api/users")
async def create_user(data: UserCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    existing = await db.users.find_one({"name": data.name})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    user_doc = {
        "id": f"user-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "name": data.name,
        "role": data.role,
        "password_hash": pwd_context.hash(data.password)
    }
    await db.users.insert_one(user_doc)
    return {"id": user_doc["id"], "name": data.name, "role": data.role}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.users.delete_one({"id": user_id})
    return {"status": "deleted"}

# ========================
# BNBS
# ========================

@app.get("/api/bnbs")
async def get_bnbs(user: dict = Depends(get_current_user_dep())):
    return await db.bnbs.find({}, {"_id": 0}).to_list(100)

@app.post("/api/bnbs")
async def create_bnb(data: BnBCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    doc = {"name": data.name, "status": data.status}
    await db.bnbs.insert_one(doc)
    return {"name": data.name, "status": data.status}

@app.delete("/api/bnbs/{name}")
async def delete_bnb(name: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.bnbs.delete_one({"name": name})
    return {"status": "deleted"}

# ========================
# KITS
# ========================

@app.get("/api/kits")
async def get_kits(user: dict = Depends(get_current_user_dep())):
    return await db.kits.find({}, {"_id": 0}).to_list(100)

@app.post("/api/kits")
async def create_kit(data: KitCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    doc = {"kit_id": data.kit_id, "status": data.status}
    await db.kits.insert_one(doc)
    return {"kit_id": data.kit_id, "status": data.status}

@app.delete("/api/kits/{kit_id}")
async def delete_kit(kit_id: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.kits.delete_one({"kit_id": kit_id})
    return {"status": "deleted"}

# ========================
# ITEMS
# ========================

@app.get("/api/items")
async def get_items(user: dict = Depends(get_current_user_dep())):
    return await db.items.find({}, {"_id": 0}).to_list(500)

@app.post("/api/items")
async def create_item(data: ItemCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check for duplicate item name
    existing = await db.items.find_one({"item_name": data.item_name})
    if existing:
        raise HTTPException(status_code=400, detail="Item already exists")
    
    doc = {
        "item_name": data.item_name,
        "category": data.category,
        "tracking_type": data.tracking_type,
        "status": data.status,
        "current_location": data.current_location,
        "quantity": data.quantity if data.tracking_type == "quantity" else 1
    }
    await db.items.insert_one(doc)
    # Return without _id
    return {
        "item_name": data.item_name,
        "category": data.category,
        "tracking_type": data.tracking_type,
        "status": data.status,
        "current_location": data.current_location,
        "quantity": doc["quantity"]
    }

@app.delete("/api/items/{item_name}")
async def delete_item(item_name: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.items.delete_one({"item_name": item_name})
    return {"status": "deleted"}

@app.put("/api/items/{item_name}")
async def update_item(item_name: str, data: ItemUpdate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check item exists
    existing = await db.items.find_one({"item_name": item_name})
    if not existing:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_data = {
        "tracking_type": data.tracking_type,
        "status": data.status,
        "current_location": data.current_location
    }
    if data.category:
        update_data["category"] = data.category
    if data.quantity is not None:
        update_data["quantity"] = data.quantity
    
    await db.items.update_one({"item_name": item_name}, {"$set": update_data})
    
    updated = await db.items.find_one({"item_name": item_name}, {"_id": 0})
    return updated

# ========================
# DEPLOYMENTS
# ========================

@app.get("/api/deployments")
async def get_deployments(
    date: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    query = {}
    if date:
        query["date"] = date
    
    # Deployment managers only see their deployments (where they are in deployment_managers array)
    if user["role"] == "deployment_manager":
        query["deployment_managers"] = user["id"]
    
    deployments = await db.deployments.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return deployments

@app.get("/api/deployments/today")
async def get_today_deployments(user: dict = Depends(get_current_user_dep())):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = {"date": today}
    
    if user["role"] == "deployment_manager":
        query["deployment_managers"] = user["id"]
    
    return await db.deployments.find(query, {"_id": 0}).to_list(50)

@app.post("/api/deployments")
async def create_deployment(data: DeploymentCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Validate at least one deployment manager
    if not data.deployment_managers or len(data.deployment_managers) == 0:
        raise HTTPException(status_code=400, detail="At least one deployment manager is required")
    
    # Check for duplicate
    existing = await db.deployments.find_one({
        "date": data.date, "bnb": data.bnb, "shift": data.shift
    })
    if existing:
        raise HTTPException(status_code=400, detail="Deployment already exists for this BnB/shift/date")
    
    doc = {
        "id": f"dep-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:18]}",
        "date": data.date,
        "bnb": data.bnb,
        "shift": data.shift,
        "assigned_kits": data.assigned_kits,
        "assigned_users": data.assigned_users,
        "deployment_managers": data.deployment_managers,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.deployments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@app.put("/api/deployments/{deployment_id}")
async def update_deployment(deployment_id: str, data: DeploymentCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await db.deployments.update_one(
        {"id": deployment_id},
        {"$set": {
            "bnb": data.bnb,
            "shift": data.shift,
            "assigned_kits": data.assigned_kits,
            "assigned_users": data.assigned_users,
            "deployment_managers": data.deployment_managers
        }}
    )
    return {"status": "updated"}

@app.delete("/api/deployments/{deployment_id}")
async def delete_deployment(deployment_id: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.deployments.delete_one({"id": deployment_id})
    return {"status": "deleted"}

# ========================
# EVENTS (CORE)
# ========================

@app.get("/api/events")
async def get_events(
    event_type: Optional[str] = None,
    date: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    query = {}
    if event_type:
        query["event_type"] = event_type
    if date:
        query["timestamp"] = {"$regex": f"^{date}"}
    
    return await db.events.find(query, {"_id": 0}).sort("timestamp", -1).to_list(500)

@app.get("/api/events/today")
async def get_today_events(user: dict = Depends(get_current_user_dep())):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return await db.events.find(
        {"timestamp": {"$regex": f"^{today}"}},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(500)

@app.post("/api/events")
async def create_event(data: EventCreate, user: dict = Depends(get_current_user_dep())):
    doc = {
        "id": f"evt-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:18]}",
        "event_type": data.event_type,
        "user": user["id"],
        "user_name": user["name"],
        "item": data.item,
        "from_location": data.from_location,
        "to_location": data.to_location,
        "quantity": data.quantity,
        "notes": data.notes,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    # AUTOMATIONS
    if data.event_type == "transfer" and data.item and data.to_location:
        # Update item.current_location for individual items
        await db.items.update_one(
            {"item_name": data.item, "tracking_type": "individual"},
            {"$set": {"current_location": data.to_location}}
        )
    
    if data.event_type == "damage" and data.item:
        # Update item.status to damaged
        await db.items.update_one(
            {"item_name": data.item},
            {"$set": {"status": "damaged"}}
        )
    
    await db.events.insert_one(doc)
    doc.pop("_id", None)
    return doc

# ========================
# SHIFTS (AUTO TIME TRACKING)
# ========================

@app.get("/api/shifts/active")
async def get_active_shift(user: dict = Depends(get_current_user_dep())):
    """Get user's currently active shift (if any)"""
    shift = await db.shifts.find_one(
        {"user": user["id"], "status": {"$in": ["active", "paused"]}},
        {"_id": 0}
    )
    return shift

@app.get("/api/shifts/by-deployment/{deployment_id}")
async def get_shifts_by_deployment(deployment_id: str, user: dict = Depends(get_current_user_dep())):
    """Get all shifts for a specific deployment (to show kit statuses)"""
    shifts = await db.shifts.find(
        {"deployment_id": deployment_id},
        {"_id": 0}
    ).to_list(100)
    
    # Return as a dict keyed by kit for easy lookup
    kit_shifts = {}
    for shift in shifts:
        kit = shift["kit"]
        # Keep the most recent shift for each kit
        if kit not in kit_shifts or shift.get("start_time", "") > kit_shifts[kit].get("start_time", ""):
            kit_shifts[kit] = shift
    
    return kit_shifts

@app.get("/api/shifts")
async def get_shifts(
    date: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    """Get shifts - admins see all, managers see their own"""
    query = {}
    if date:
        query["start_time"] = {"$regex": f"^{date}"}
    
    if user["role"] == "deployment_manager":
        query["user"] = user["id"]
    
    shifts = await db.shifts.find(query, {"_id": 0}).sort("start_time", -1).to_list(100)
    return shifts

@app.get("/api/shifts/today")
async def get_today_shifts(user: dict = Depends(get_current_user_dep())):
    """Get today's completed shifts"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = {"start_time": {"$regex": f"^{today}"}, "status": "completed"}
    
    if user["role"] == "deployment_manager":
        query["user"] = user["id"]
    
    return await db.shifts.find(query, {"_id": 0}).to_list(100)

@app.post("/api/shifts/start")
async def start_shift(data: ShiftStart, user: dict = Depends(get_current_user_dep())):
    """Start a new shift for a specific kit in a deployment - captures start_time automatically"""
    # Check if this kit already has an active shift
    existing = await db.shifts.find_one(
        {"kit": data.kit, "deployment_id": data.deployment_id, "status": {"$in": ["active", "paused"]}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="This kit already has an active shift.")
    
    # Get deployment details for context
    deployment = await db.deployments.find_one({"id": data.deployment_id})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    now = datetime.now(timezone.utc)
    shift = {
        "id": f"shift-{now.strftime('%Y%m%d%H%M%S%f')[:18]}",
        "deployment_id": data.deployment_id,
        "date": deployment["date"],
        "bnb": deployment["bnb"],
        "user": user["id"],
        "user_name": user["name"],
        "kit": data.kit,
        "ssd_used": data.ssd_used,
        "activity_type": data.activity_type,
        "status": "active",  # active, paused, completed
        "start_time": now.isoformat(),
        "pauses": [],  # [{pause_time, resume_time}]
        "end_time": None,
        "total_paused_seconds": 0,
        "total_duration_seconds": None,
        "total_duration_hours": None
    }
    
    await db.shifts.insert_one(shift)
    shift.pop("_id", None)
    return shift

@app.post("/api/shifts/{shift_id}/pause")
async def pause_shift(shift_id: str, user: dict = Depends(get_current_user_dep())):
    """Pause an active shift - captures pause_time automatically"""
    shift = await db.shifts.find_one({"id": shift_id, "user": user["id"]})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift["status"] != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")
    
    now = datetime.now(timezone.utc)
    await db.shifts.update_one(
        {"id": shift_id},
        {
            "$set": {"status": "paused"},
            "$push": {"pauses": {"pause_time": now.isoformat(), "resume_time": None}}
        }
    )
    
    updated = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    return updated

@app.post("/api/shifts/{shift_id}/resume")
async def resume_shift(shift_id: str, user: dict = Depends(get_current_user_dep())):
    """Resume a paused shift - captures resume_time automatically"""
    shift = await db.shifts.find_one({"id": shift_id, "user": user["id"]})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift["status"] != "paused":
        raise HTTPException(status_code=400, detail="Shift is not paused")
    
    now = datetime.now(timezone.utc)
    
    # Update the last pause entry with resume_time
    pauses = shift.get("pauses", [])
    if pauses and pauses[-1].get("resume_time") is None:
        pauses[-1]["resume_time"] = now.isoformat()
    
    await db.shifts.update_one(
        {"id": shift_id},
        {"$set": {"status": "active", "pauses": pauses}}
    )
    
    updated = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    return updated

@app.post("/api/shifts/{shift_id}/stop")
async def stop_shift(shift_id: str, user: dict = Depends(get_current_user_dep())):
    """Stop a shift - captures end_time and calculates total duration automatically"""
    shift = await db.shifts.find_one({"id": shift_id, "user": user["id"]})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift["status"] == "completed":
        raise HTTPException(status_code=400, detail="Shift is already completed")
    
    now = datetime.now(timezone.utc)
    start_time = datetime.fromisoformat(shift["start_time"].replace("Z", "+00:00"))
    
    # Calculate total paused time
    total_paused_seconds = 0
    pauses = shift.get("pauses", [])
    
    for pause in pauses:
        pause_time = datetime.fromisoformat(pause["pause_time"].replace("Z", "+00:00"))
        if pause.get("resume_time"):
            resume_time = datetime.fromisoformat(pause["resume_time"].replace("Z", "+00:00"))
        else:
            # If still paused when stopping, use now as resume time
            resume_time = now
        total_paused_seconds += (resume_time - pause_time).total_seconds()
    
    # Calculate total active duration
    total_elapsed_seconds = (now - start_time).total_seconds()
    total_duration_seconds = total_elapsed_seconds - total_paused_seconds
    total_duration_hours = round(total_duration_seconds / 3600, 2)
    
    await db.shifts.update_one(
        {"id": shift_id},
        {"$set": {
            "status": "completed",
            "end_time": now.isoformat(),
            "total_paused_seconds": round(total_paused_seconds),
            "total_duration_seconds": round(total_duration_seconds),
            "total_duration_hours": total_duration_hours
        }}
    )
    
    updated = await db.shifts.find_one({"id": shift_id}, {"_id": 0})
    return updated

# ========================
# REQUESTS
# ========================

@app.get("/api/requests")
async def get_requests(
    status: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    query = {}
    if status:
        query["status"] = status
    return await db.requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

@app.post("/api/requests")
async def create_request(data: RequestCreate, user: dict = Depends(get_current_user_dep())):
    doc = {
        "id": f"req-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:18]}",
        "requested_by": user["id"],
        "requested_by_name": user["name"],
        "item": data.item,
        "quantity": data.quantity,
        "notes": data.notes,
        "status": "pending",
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.requests.insert_one(doc)
    doc.pop("_id", None)
    return doc

@app.put("/api/requests/{request_id}")
async def update_request(request_id: str, status: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await db.requests.update_one(
        {"id": request_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "updated"}

# ========================
# LIVE DASHBOARD (TODAY ONLY) - AUTO-CALCULATED FROM SHIFTS
# ========================

@app.get("/api/dashboard/live")
async def get_live_dashboard(user: dict = Depends(get_current_user_dep())):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Get today's COMPLETED shifts (auto-calculated durations)
    completed_shifts = await db.shifts.find(
        {"start_time": {"$regex": f"^{today}"}, "status": "completed"},
        {"_id": 0}
    ).to_list(500)
    
    # Get today's ACTIVE shifts
    active_shifts = await db.shifts.find(
        {"start_time": {"$regex": f"^{today}"}, "status": {"$in": ["active", "paused"]}},
        {"_id": 0}
    ).to_list(50)
    
    # Get today's deployments
    deployments = await db.deployments.find({"date": today}, {"_id": 0}).to_list(50)
    
    # Calculate total hours from COMPLETED shifts (system-calculated, not user input)
    total_hours = sum(s.get("total_duration_hours", 0) or 0 for s in completed_shifts)
    
    # Map kits to BnBs
    kit_to_bnb = {}
    for dep in deployments:
        for kit in dep.get("assigned_kits", []):
            kit_to_bnb[kit] = dep["bnb"]
    
    # Per BnB stats - hours from completed shifts
    bnb_stats = {}
    for dep in deployments:
        bnb = dep["bnb"]
        if bnb not in bnb_stats:
            bnb_stats[bnb] = {
                "bnb": bnb,
                "shift": dep["shift"],
                "hours_logged": 0,
                "active_shifts": 0
            }
    
    # Add hours from completed shifts
    for shift in completed_shifts:
        kit = shift.get("kit")
        bnb = kit_to_bnb.get(kit)
        if bnb and bnb in bnb_stats:
            bnb_stats[bnb]["hours_logged"] += shift.get("total_duration_hours", 0) or 0
    
    # Count active shifts per BnB
    for shift in active_shifts:
        kit = shift.get("kit")
        bnb = kit_to_bnb.get(kit)
        if bnb and bnb in bnb_stats:
            bnb_stats[bnb]["active_shifts"] += 1
    
    # Round hours
    for bnb in bnb_stats:
        bnb_stats[bnb]["hours_logged"] = round(bnb_stats[bnb]["hours_logged"], 2)
    
    # Get recent events for activity feed
    events = await db.events.find(
        {"timestamp": {"$regex": f"^{today}"}},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(10)
    
    return {
        "date": today,
        "total_hours": round(total_hours, 2),
        "total_shifts_completed": len(completed_shifts),
        "total_shifts_active": len(active_shifts),
        "per_bnb": list(bnb_stats.values()),
        "recent_shifts": completed_shifts[:5],
        "recent_events": events
    }

# ========================
# HEALTH CHECK
# ========================

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0"}
