from fastapi import FastAPI, HTTPException, Depends
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime, timezone, timedelta
from motor.motor_asyncio import AsyncIOMotorClient
from passlib.context import CryptContext
from dotenv import load_dotenv
import jwt
import os
import logging
import secrets

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file (won't override existing env vars)
load_dotenv()

# ========================
# APP SETUP
# ========================

app = FastAPI(title="HA Multimodal Management", version="2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Database config
MONGO_URL = os.environ.get("MONGO_URL", "mongodb://localhost:27017")
DB_NAME = os.environ.get("DB_NAME", "ops_management_v2")

# Lazy database connection - initialize client but don't connect yet
client = None
db = None

def get_db():
    """Get database connection, creating it if needed"""
    global client, db
    if client is None:
        logger.info(f"Connecting to MongoDB: {DB_NAME}")
        client = AsyncIOMotorClient(
            MONGO_URL,
            serverSelectionTimeoutMS=30000,
            connectTimeoutMS=30000,
            socketTimeoutMS=30000,
        )
        db = client[DB_NAME]
    return db

# Auth - generate a random key if not provided
SECRET_KEY = os.environ.get("SECRET_KEY")
if not SECRET_KEY:
    SECRET_KEY = secrets.token_urlsafe(32)
    logger.warning("SECRET_KEY not set, using auto-generated key.")

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

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
    event_type: str  # transfer, damage, lost
    item: str
    from_location: Optional[str] = None  # e.g., "kit:KIT-01" or "bnb:BnB-01" or "station:Main"
    to_location: Optional[str] = None  # e.g., "kit:KIT-02" or "bnb:BnB-02" or "station:Storage"
    quantity: int = 1
    notes: Optional[str] = None

class RequestCreate(BaseModel):
    item: str
    quantity: int = 1
    notes: Optional[str] = None

# Handover models
class KitChecklist(BaseModel):
    kit_id: str
    gloves: int = 0
    usb_hub: int = 0
    imus: int = 0
    head_camera: int = 0
    l_shaped_wire: int = 0
    laptop: int = 0
    laptop_charger: int = 0
    power_bank: int = 0
    ssds: int = 0

class BnbChecklist(BaseModel):
    charging_station: int = 0
    power_strip_8_port: int = 0
    power_strip_4_5_port: int = 0

class HandoverCreate(BaseModel):
    deployment_id: str
    handover_type: str  # outgoing / incoming
    kit_checklists: List[KitChecklist]
    bnb_checklist: BnbChecklist
    missing_items: List[dict] = []  # [{item, quantity, kit_or_bnb, report_as_lost}]
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
        user = await get_db().users.find_one({"id": payload["user_id"]}, {"_id": 0, "password_hash": 0})
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
# STARTUP - Minimal, no DB connection
# ========================

@app.on_event("startup")
async def startup():
    logger.info("App started successfully - DB will connect on first request")

# ========================
# AUTH ROUTES
# ========================

@app.post("/api/auth/login")
async def login(data: UserLogin):
    # Auto-create Admin user if it doesn't exist
    admin_exists = await get_db().users.find_one({"name": "Admin"})
    if not admin_exists:
        try:
            logger.info("Admin user not found, creating...")
            await get_db().users.insert_one({
                "id": "admin-001",
                "name": "Admin",
                "role": "admin",
                "password_hash": pwd_context.hash("admin123")
            })
            logger.info("Admin user created successfully")
        except Exception as e:
            logger.error(f"Failed to create admin: {e}")
    
    user = await get_db().users.find_one({"name": data.name})
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
    users = await get_db().users.find({}, {"_id": 0, "password_hash": 0}).to_list(100)
    return users

@app.post("/api/users")
async def create_user(data: UserCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    existing = await get_db().users.find_one({"name": data.name})
    if existing:
        raise HTTPException(status_code=400, detail="User already exists")
    
    user_doc = {
        "id": f"user-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        "name": data.name,
        "role": data.role,
        "password_hash": pwd_context.hash(data.password)
    }
    await get_db().users.insert_one(user_doc)
    return {"id": user_doc["id"], "name": data.name, "role": data.role}

@app.delete("/api/users/{user_id}")
async def delete_user(user_id: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await get_db().users.delete_one({"id": user_id})
    return {"status": "deleted"}

# ========================
# BNBS
# ========================

@app.get("/api/bnbs")
async def get_bnbs(user: dict = Depends(get_current_user_dep())):
    return await get_db().bnbs.find({}, {"_id": 0}).to_list(100)

@app.post("/api/bnbs")
async def create_bnb(data: BnBCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    doc = {"name": data.name, "status": data.status}
    await get_db().bnbs.insert_one(doc)
    return {"name": data.name, "status": data.status}

@app.delete("/api/bnbs/{name}")
async def delete_bnb(name: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await get_db().bnbs.delete_one({"name": name})
    return {"status": "deleted"}

# ========================
# KITS
# ========================

@app.get("/api/kits")
async def get_kits(user: dict = Depends(get_current_user_dep())):
    return await get_db().kits.find({}, {"_id": 0}).to_list(100)

@app.post("/api/kits")
async def create_kit(data: KitCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    doc = {"kit_id": data.kit_id, "status": data.status}
    await get_db().kits.insert_one(doc)
    return {"kit_id": data.kit_id, "status": data.status}

@app.delete("/api/kits/{kit_id}")
async def delete_kit(kit_id: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await get_db().kits.delete_one({"kit_id": kit_id})
    return {"status": "deleted"}

# ========================
# ITEMS
# ========================

@app.get("/api/items")
async def get_items(user: dict = Depends(get_current_user_dep())):
    return await get_db().items.find({}, {"_id": 0}).to_list(500)

@app.post("/api/items")
async def create_item(data: ItemCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check for duplicate item name
    existing = await get_db().items.find_one({"item_name": data.item_name})
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
    await get_db().items.insert_one(doc)
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
    await get_db().items.delete_one({"item_name": item_name})
    return {"status": "deleted"}

@app.put("/api/items/{item_name}")
async def update_item(item_name: str, data: ItemUpdate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check item exists
    existing = await get_db().items.find_one({"item_name": item_name})
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
    
    await get_db().items.update_one({"item_name": item_name}, {"$set": update_data})
    
    updated = await get_db().items.find_one({"item_name": item_name}, {"_id": 0})
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
    
    deployments = await get_db().deployments.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return deployments

@app.get("/api/deployments/today")
async def get_today_deployments(user: dict = Depends(get_current_user_dep())):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = {"date": today}
    
    if user["role"] == "deployment_manager":
        query["deployment_managers"] = user["id"]
    
    return await get_db().deployments.find(query, {"_id": 0}).to_list(50)

@app.post("/api/deployments")
async def create_deployment(data: DeploymentCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Validate at least one deployment manager
    if not data.deployment_managers or len(data.deployment_managers) == 0:
        raise HTTPException(status_code=400, detail="At least one deployment manager is required")
    
    # Check for duplicate
    existing = await get_db().deployments.find_one({
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
    await get_db().deployments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@app.put("/api/deployments/{deployment_id}")
async def update_deployment(deployment_id: str, data: DeploymentCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await get_db().deployments.update_one(
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
    await get_db().deployments.delete_one({"id": deployment_id})
    return {"status": "deleted"}

# ========================
# BNB DAY VIEW - Complete operational history
# ========================

@app.get("/api/deployments/{deployment_id}/day-view")
async def get_bnb_day_view(deployment_id: str, user: dict = Depends(get_current_user_dep())):
    """Get complete operational history for a deployment (BnB on a specific date)"""
    
    # Get deployment info
    deployment = await get_db().deployments.find_one({"id": deployment_id}, {"_id": 0})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    date = deployment.get("date")
    bnb = deployment.get("bnb")
    
    # Get all shifts for this deployment
    shifts = await get_db().shifts.find(
        {"deployment_id": deployment_id},
        {"_id": 0}
    ).to_list(100)
    
    # Get user details for managers (bulk query to avoid N+1)
    manager_ids = deployment.get("deployment_managers", [])
    managers = await get_db().users.find(
        {"id": {"$in": manager_ids}},
        {"_id": 0, "password_hash": 0}
    ).to_list(len(manager_ids) if manager_ids else 1)
    
    # Build shift logs with user-kit mapping
    shift_logs = []
    ssd_usage = {}
    users_worked = {}
    
    for shift in shifts:
        shift_logs.append({
            "kit": shift.get("kit"),
            "user": shift.get("user"),
            "user_name": shift.get("user_name"),
            "activity_type": shift.get("activity_type"),
            "ssd_used": shift.get("ssd_used"),
            "status": shift.get("status"),
            "start_time": shift.get("start_time"),
            "end_time": shift.get("end_time"),
            "total_duration_hours": shift.get("total_duration_hours")
        })
        
        # Track SSD usage
        ssd = shift.get("ssd_used")
        if ssd:
            if ssd not in ssd_usage:
                ssd_usage[ssd] = []
            ssd_usage[ssd].append(shift.get("kit"))
        
        # Track users who worked
        uid = shift.get("user")
        if uid and uid not in users_worked:
            users_worked[uid] = {
                "user_id": uid,
                "user_name": shift.get("user_name"),
                "kits_worked": []
            }
        if uid:
            kit = shift.get("kit")
            if kit and kit not in users_worked[uid]["kits_worked"]:
                users_worked[uid]["kits_worked"].append(kit)
    
    # Get events for this BnB on this date
    events = await get_db().events.find(
        {"timestamp": {"$regex": f"^{date}"}},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(100)
    
    # Filter events related to this BnB or its kits
    assigned_kits = deployment.get("assigned_kits", [])
    relevant_events = []
    for evt in events:
        from_loc = evt.get("from_location", "") or ""
        to_loc = evt.get("to_location", "") or ""
        if (bnb in from_loc or bnb in to_loc or 
            any(kit in from_loc or kit in to_loc for kit in assigned_kits)):
            relevant_events.append(evt)
    
    # Get handovers for this deployment
    handovers = await get_db().handovers.find(
        {"deployment_id": deployment_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    
    return {
        "deployment": {
            "id": deployment.get("id"),
            "bnb": bnb,
            "date": date,
            "shift": deployment.get("shift"),
            "assigned_kits": assigned_kits,
            "deployment_managers": managers
        },
        "people": list(users_worked.values()),
        "shift_logs": shift_logs,
        "ssd_usage": [{"ssd": ssd, "kits": kits} for ssd, kits in ssd_usage.items()],
        "events": relevant_events,
        "handovers": handovers
    }

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
    
    return await get_db().events.find(query, {"_id": 0}).sort("timestamp", -1).to_list(500)

@app.get("/api/events/today")
async def get_today_events(user: dict = Depends(get_current_user_dep())):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    return await get_db().events.find(
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
        await get_db().items.update_one(
            {"item_name": data.item, "tracking_type": "individual"},
            {"$set": {"current_location": data.to_location}}
        )
    
    if data.event_type == "damage" and data.item:
        # Update item.status to damaged
        await get_db().items.update_one(
            {"item_name": data.item},
            {"$set": {"status": "damaged"}}
        )
    
    if data.event_type == "lost" and data.item:
        # For individual items: mark as lost
        # For quantity items: reduce quantity
        item = await get_db().items.find_one({"item_name": data.item})
        if item:
            if item.get("tracking_type") == "individual":
                await get_db().items.update_one(
                    {"item_name": data.item},
                    {"$set": {"status": "lost"}}
                )
            elif item.get("tracking_type") == "quantity":
                new_qty = max(0, (item.get("quantity", 0) - data.quantity))
                await get_db().items.update_one(
                    {"item_name": data.item},
                    {"$set": {"quantity": new_qty}}
                )
    
    await get_db().events.insert_one(doc)
    doc.pop("_id", None)
    return doc

# ========================
# SHIFTS (AUTO TIME TRACKING)
# ========================

@app.get("/api/shifts/active")
async def get_active_shift(user: dict = Depends(get_current_user_dep())):
    """Get user's currently active shift (if any)"""
    shift = await get_db().shifts.find_one(
        {"user": user["id"], "status": {"$in": ["active", "paused"]}},
        {"_id": 0}
    )
    return shift

@app.get("/api/shifts/by-deployment/{deployment_id}")
async def get_shifts_by_deployment(deployment_id: str, user: dict = Depends(get_current_user_dep())):
    """Get all shifts for a specific deployment (to show kit statuses)"""
    shifts = await get_db().shifts.find(
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
    
    shifts = await get_db().shifts.find(query, {"_id": 0}).sort("start_time", -1).to_list(100)
    return shifts

@app.get("/api/shifts/today")
async def get_today_shifts(user: dict = Depends(get_current_user_dep())):
    """Get today's completed shifts"""
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = {"start_time": {"$regex": f"^{today}"}, "status": "completed"}
    
    if user["role"] == "deployment_manager":
        query["user"] = user["id"]
    
    return await get_db().shifts.find(query, {"_id": 0}).to_list(100)

@app.post("/api/shifts/start")
async def start_shift(data: ShiftStart, user: dict = Depends(get_current_user_dep())):
    """Start a new shift for a specific kit in a deployment - captures start_time automatically"""
    # Check if this kit already has an active shift
    existing = await get_db().shifts.find_one(
        {"kit": data.kit, "deployment_id": data.deployment_id, "status": {"$in": ["active", "paused"]}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="This kit already has an active shift.")
    
    # Get deployment details for context
    deployment = await get_db().deployments.find_one({"id": data.deployment_id})
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
    
    await get_db().shifts.insert_one(shift)
    shift.pop("_id", None)
    return shift

@app.post("/api/shifts/{shift_id}/pause")
async def pause_shift(shift_id: str, user: dict = Depends(get_current_user_dep())):
    """Pause an active shift - captures pause_time automatically"""
    shift = await get_db().shifts.find_one({"id": shift_id, "user": user["id"]})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift["status"] != "active":
        raise HTTPException(status_code=400, detail="Shift is not active")
    
    now = datetime.now(timezone.utc)
    await get_db().shifts.update_one(
        {"id": shift_id},
        {
            "$set": {"status": "paused"},
            "$push": {"pauses": {"pause_time": now.isoformat(), "resume_time": None}}
        }
    )
    
    updated = await get_db().shifts.find_one({"id": shift_id}, {"_id": 0})
    return updated

@app.post("/api/shifts/{shift_id}/resume")
async def resume_shift(shift_id: str, user: dict = Depends(get_current_user_dep())):
    """Resume a paused shift - captures resume_time automatically"""
    shift = await get_db().shifts.find_one({"id": shift_id, "user": user["id"]})
    if not shift:
        raise HTTPException(status_code=404, detail="Shift not found")
    if shift["status"] != "paused":
        raise HTTPException(status_code=400, detail="Shift is not paused")
    
    now = datetime.now(timezone.utc)
    
    # Update the last pause entry with resume_time
    pauses = shift.get("pauses", [])
    if pauses and pauses[-1].get("resume_time") is None:
        pauses[-1]["resume_time"] = now.isoformat()
    
    await get_db().shifts.update_one(
        {"id": shift_id},
        {"$set": {"status": "active", "pauses": pauses}}
    )
    
    updated = await get_db().shifts.find_one({"id": shift_id}, {"_id": 0})
    return updated

@app.post("/api/shifts/{shift_id}/stop")
async def stop_shift(shift_id: str, user: dict = Depends(get_current_user_dep())):
    """Stop a shift - captures end_time and calculates total duration automatically"""
    shift = await get_db().shifts.find_one({"id": shift_id, "user": user["id"]})
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
    
    await get_db().shifts.update_one(
        {"id": shift_id},
        {"$set": {
            "status": "completed",
            "end_time": now.isoformat(),
            "total_paused_seconds": round(total_paused_seconds),
            "total_duration_seconds": round(total_duration_seconds),
            "total_duration_hours": total_duration_hours
        }}
    )
    
    updated = await get_db().shifts.find_one({"id": shift_id}, {"_id": 0})
    return updated

# ========================
# HANDOVERS
# ========================

@app.get("/api/handovers/by-deployment/{deployment_id}")
async def get_handovers_by_deployment(deployment_id: str, user: dict = Depends(get_current_user_dep())):
    """Get all handovers for a deployment"""
    handovers = await get_db().handovers.find(
        {"deployment_id": deployment_id},
        {"_id": 0}
    ).sort("created_at", -1).to_list(10)
    return handovers

@app.post("/api/handovers")
async def create_handover(data: HandoverCreate, user: dict = Depends(get_current_user_dep())):
    """Create a handover (outgoing or incoming)"""
    # Get deployment details
    deployment = await get_db().deployments.find_one({"id": data.deployment_id})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    now = datetime.now(timezone.utc)
    
    # Create lost events for any items marked as lost
    for missing in data.missing_items:
        if missing.get("report_as_lost"):
            lost_event = {
                "id": f"evt-{now.strftime('%Y%m%d%H%M%S%f')[:18]}-lost",
                "event_type": "lost",
                "user": user["id"],
                "user_name": user["name"],
                "item": missing.get("item"),
                "from_location": f"kit:{missing.get('kit_id')}" if missing.get('kit_id') else f"bnb:{deployment['bnb']}",
                "quantity": missing.get("quantity", 1),
                "notes": f"Lost during handover - {data.handover_type}",
                "timestamp": now.isoformat()
            }
            await get_db().events.insert_one(lost_event)
            
            # Update item status
            item = await get_db().items.find_one({"item_name": missing.get("item")})
            if item:
                if item.get("tracking_type") == "individual":
                    await get_db().items.update_one(
                        {"item_name": missing.get("item")},
                        {"$set": {"status": "lost"}}
                    )
                elif item.get("tracking_type") == "quantity":
                    new_qty = max(0, (item.get("quantity", 0) - missing.get("quantity", 1)))
                    await get_db().items.update_one(
                        {"item_name": missing.get("item")},
                        {"$set": {"quantity": new_qty}}
                    )
    
    # Create handover record
    handover_doc = {
        "id": f"handover-{now.strftime('%Y%m%d%H%M%S%f')[:18]}",
        "deployment_id": data.deployment_id,
        "date": deployment["date"],
        "bnb": deployment["bnb"],
        "handover_type": data.handover_type,
        "user": user["id"],
        "user_name": user["name"],
        "kit_checklists": [kc.dict() for kc in data.kit_checklists],
        "bnb_checklist": data.bnb_checklist.dict(),
        "missing_items": data.missing_items,
        "notes": data.notes,
        "created_at": now.isoformat()
    }
    
    await get_db().handovers.insert_one(handover_doc)
    handover_doc.pop("_id", None)
    return handover_doc

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
    return await get_db().requests.find(query, {"_id": 0}).sort("created_at", -1).to_list(100)

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
    await get_db().requests.insert_one(doc)
    doc.pop("_id", None)
    return doc

@app.put("/api/requests/{request_id}")
async def update_request(request_id: str, status: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    await get_db().requests.update_one(
        {"id": request_id},
        {"$set": {"status": status, "updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    return {"status": "updated"}

# ========================
# LIVE DASHBOARD - WITH DATE RANGE SUPPORT
# ========================

@app.get("/api/dashboard/live")
async def get_live_dashboard(
    date: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    """Get dashboard data for a specific date (defaults to today)"""
    target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Get shifts for the target date
    completed_shifts = await get_db().shifts.find(
        {"date": target_date, "status": "completed"},
        {"_id": 0}
    ).to_list(500)
    
    active_shifts = await get_db().shifts.find(
        {"date": target_date, "status": {"$in": ["active", "paused"]}},
        {"_id": 0}
    ).to_list(50)
    
    deployments = await get_db().deployments.find({"date": target_date}, {"_id": 0}).to_list(50)
    
    total_hours = sum(s.get("total_duration_hours", 0) or 0 for s in completed_shifts)
    
    # Map kits to BnBs
    kit_to_bnb = {}
    for dep in deployments:
        for kit in dep.get("assigned_kits", []):
            kit_to_bnb[kit] = dep["bnb"]
    
    # Per BnB stats
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
    
    for shift in completed_shifts:
        bnb = shift.get("bnb") or kit_to_bnb.get(shift.get("kit"))
        if bnb and bnb in bnb_stats:
            bnb_stats[bnb]["hours_logged"] += shift.get("total_duration_hours", 0) or 0
    
    for shift in active_shifts:
        bnb = shift.get("bnb") or kit_to_bnb.get(shift.get("kit"))
        if bnb and bnb in bnb_stats:
            bnb_stats[bnb]["active_shifts"] += 1
    
    for bnb in bnb_stats:
        bnb_stats[bnb]["hours_logged"] = round(bnb_stats[bnb]["hours_logged"], 2)
    
    events = await get_db().events.find(
        {"timestamp": {"$regex": f"^{target_date}"}},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(10)
    
    return {
        "date": target_date,
        "total_hours": round(total_hours, 2),
        "total_shifts_completed": len(completed_shifts),
        "total_shifts_active": len(active_shifts),
        "per_bnb": list(bnb_stats.values()),
        "recent_shifts": completed_shifts[:5],
        "recent_events": events
    }

# ========================
# ANALYTICS DASHBOARD - DATE RANGE SUPPORT
# ========================

@app.get("/api/analytics")
async def get_analytics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    """Get analytics for a date range (defaults to last 7 days)"""
    today = datetime.now(timezone.utc)
    
    if not end_date:
        end_date = today.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (today - timedelta(days=6)).strftime("%Y-%m-%d")
    
    # Get all completed shifts in date range
    shifts = await get_db().shifts.find(
        {
            "date": {"$gte": start_date, "$lte": end_date},
            "status": "completed"
        },
        {"_id": 0}
    ).to_list(2000)
    
    # Total hours
    total_hours = sum(s.get("total_duration_hours", 0) or 0 for s in shifts)
    
    # Hours per BnB
    hours_per_bnb = {}
    for shift in shifts:
        bnb = shift.get("bnb", "Unknown")
        if bnb not in hours_per_bnb:
            hours_per_bnb[bnb] = 0
        hours_per_bnb[bnb] += shift.get("total_duration_hours", 0) or 0
    
    # Hours per activity type
    hours_per_activity = {}
    for shift in shifts:
        activity = shift.get("activity_type", "other")
        if activity not in hours_per_activity:
            hours_per_activity[activity] = 0
        hours_per_activity[activity] += shift.get("total_duration_hours", 0) or 0
    
    # Daily trend
    daily_hours = {}
    for shift in shifts:
        day = shift.get("date", "")
        if day not in daily_hours:
            daily_hours[day] = 0
        daily_hours[day] += shift.get("total_duration_hours", 0) or 0
    
    # Sort and format
    daily_trend = [
        {"date": day, "hours": round(hours, 2)}
        for day, hours in sorted(daily_hours.items())
    ]
    
    bnb_breakdown = [
        {"bnb": bnb, "hours": round(hours, 2)}
        for bnb, hours in sorted(hours_per_bnb.items(), key=lambda x: -x[1])
    ]
    
    activity_breakdown = [
        {"activity": act, "hours": round(hours, 2)}
        for act, hours in sorted(hours_per_activity.items(), key=lambda x: -x[1])
    ]
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_hours": round(total_hours, 2),
        "total_shifts": len(shifts),
        "hours_per_bnb": bnb_breakdown,
        "hours_per_activity": activity_breakdown,
        "daily_trend": daily_trend
    }

# ========================
# HEALTH CHECK
# ========================

@app.get("/health")
async def health_root():
    """Health check endpoint for production deployment (without /api prefix)"""
    return {"status": "ok", "version": "2.0"}

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0"}

# ========================
# ONE-TIME SETUP (create admin if not exists)
# ========================

@app.get("/api/setup")
async def setup_admin_get():
    """One-time setup endpoint to create admin user if none exists (GET for browser)"""
    try:
        admin = await get_db().users.find_one({"role": "admin"})
        if admin:
            return {"message": "Admin already exists", "username": admin.get("name")}
        
        # Create admin user
        await get_db().users.insert_one({
            "id": "admin-001",
            "name": "Admin",
            "role": "admin",
            "password_hash": pwd_context.hash("admin123")
        })
        return {"message": "Admin user created", "username": "Admin", "password": "admin123"}
    except Exception as e:
        logger.error(f"Setup error: {e}")
        return {"error": str(e)}

@app.post("/api/setup")
async def setup_admin():
    """One-time setup endpoint to create admin user if none exists"""
    try:
        admin = await get_db().users.find_one({"role": "admin"})
        if admin:
            return {"message": "Admin already exists", "username": admin.get("name")}
        
        # Create admin user
        await get_db().users.insert_one({
            "id": "admin-001",
            "name": "Admin",
            "role": "admin",
            "password_hash": pwd_context.hash("admin123")
        })
        return {"message": "Admin user created", "username": "Admin", "password": "admin123"}
    except Exception as e:
        logger.error(f"Setup error: {e}")
        return {"error": str(e)}
