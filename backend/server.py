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
import pytz

# Configure logging first
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load environment variables from .env file (won't override existing env vars)
load_dotenv()

# ========================
# TIMEZONE & OPERATIONAL DAY CONFIG
# ========================
IST = pytz.timezone('Asia/Kolkata')

def get_ist_now():
    """Get current time in IST"""
    return datetime.now(IST)

def get_operational_date(timestamp=None):
    """
    Get operational date for a given timestamp (or now).
    Operational day: 11:00 AM (Day 1) to 5:00 AM (Day 2) = Day 1
    
    Example: March 21, 2026 at 2:00 AM IST → belongs to March 20 operational day
    """
    if timestamp is None:
        timestamp = get_ist_now()
    elif isinstance(timestamp, str):
        # Parse ISO string and convert to IST
        dt = datetime.fromisoformat(timestamp.replace("Z", "+00:00"))
        timestamp = dt.astimezone(IST)
    elif timestamp.tzinfo is None:
        timestamp = IST.localize(timestamp)
    else:
        timestamp = timestamp.astimezone(IST)
    
    # If time is before 5:00 AM, it belongs to previous day's operational period
    if timestamp.hour < 5:
        timestamp = timestamp - timedelta(days=1)
    
    return timestamp.strftime("%Y-%m-%d")

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
    date: str  # YYYY-MM-DD - THIS IS THE SINGLE SOURCE OF TRUTH
    bnb: str
    # NEW STRUCTURE: Both shifts in one deployment
    morning_managers: List[str] = []  # User IDs for morning shift
    evening_managers: List[str] = []  # User IDs for evening shift
    assigned_kits: List[str] = []  # Kits assigned to this BnB for the day
    # Legacy field for backwards compatibility during transition
    shift: Optional[str] = None  # Will be removed after migration
    deployment_managers: Optional[List[str]] = None  # Legacy field

class DeploymentUpdate(BaseModel):
    morning_managers: List[str] = []
    evening_managers: List[str] = []
    assigned_kits: List[str] = []

class ItemUpdate(BaseModel):
    category: Optional[str] = None
    tracking_type: str  # individual / quantity
    status: str = "active"  # active / damaged / lost / repair
    current_location: Optional[str] = None
    quantity: Optional[int] = None

# Collection record models - CONTEXT-AWARE (tied to deployment/kit)
class CollectionStart(BaseModel):
    deployment_id: str  # Required - which deployment this collection belongs to
    kit: str  # Required - which kit
    shift: str  # Required - "morning" or "evening" (user selects which shift they're working)
    ssd_used: str
    activity_type: str  # cooking, cleaning, organizing, outdoor, other

# Legacy model for backwards compatibility
class ShiftStart(BaseModel):
    deployment_id: str
    kit: str
    ssd_used: str
    activity_type: str
    shift: str = "morning"  # Default to morning for legacy calls

class EventCreate(BaseModel):
    event_type: str  # transfer, damage, lost
    item: str
    from_location: Optional[str] = None  # e.g., "kit:KIT-01" or "bnb:BnB-01" or "station:Main"
    to_location: Optional[str] = None  # e.g., "kit:KIT-02" or "bnb:BnB-02" or "station:Storage"
    quantity: int = 1
    notes: Optional[str] = None
    deployment_id: Optional[str] = None  # Optional - links event to a deployment
    deployment_date: Optional[str] = None  # Optional - YYYY-MM-DD, will be derived from deployment if not provided

class RequestCreate(BaseModel):
    item: str
    quantity: int = 1
    notes: Optional[str] = None

# Hardware Health Check models
class HardwareCheckCreate(BaseModel):
    deployment_id: str
    kit: str
    left_glove_image: Optional[str] = None  # Base64 or URL - now optional for async upload
    right_glove_image: Optional[str] = None
    head_camera_image: Optional[str] = None
    notes: Optional[str] = None

class HardwareCheckImageUpload(BaseModel):
    hardware_check_id: str
    left_glove_image: Optional[str] = None
    right_glove_image: Optional[str] = None
    head_camera_image: Optional[str] = None

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
    shift_type: str = "morning"  # morning / evening - which shift is doing the handover
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
    except Exception:
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

@app.get("/api/system/operational-date")
async def get_current_operational_date():
    """
    Returns the current operational date based on IST timezone.
    Operational day: 11:00 AM (Day 1) to 5:00 AM (Day 2) = Day 1
    
    This is the SINGLE SOURCE OF TRUTH for "today" across the entire system.
    Frontend MUST use this endpoint instead of local date calculations.
    """
    operational_date = get_operational_date()
    return {
        "operational_date": operational_date,
        "timezone": "Asia/Kolkata",
        "note": "Use this date for all 'today' references. Do NOT use browser date."
    }

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

class UserUpdate(BaseModel):
    name: Optional[str] = None
    password: Optional[str] = None

@app.put("/api/users/{user_id}")
async def update_user(user_id: str, data: UserUpdate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    existing = await get_db().users.find_one({"id": user_id})
    if not existing:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = {}
    if data.name:
        # Check if name already taken by another user
        name_taken = await get_db().users.find_one({"name": data.name, "id": {"$ne": user_id}})
        if name_taken:
            raise HTTPException(status_code=400, detail="Username already taken")
        update_data["name"] = data.name
    if data.password:
        update_data["password_hash"] = pwd_context.hash(data.password)
    
    if update_data:
        await get_db().users.update_one({"id": user_id}, {"$set": update_data})
    
    return {"status": "updated"}

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

@app.get("/api/items/distribution")
async def get_item_distribution(user: dict = Depends(get_current_user_dep())):
    """Get item distribution across all locations grouped by category"""
    items = await get_db().items.find({}, {"_id": 0}).to_list(500)
    kits = await get_db().kits.find({}, {"_id": 0}).to_list(100)
    bnbs = await get_db().bnbs.find({}, {"_id": 0}).to_list(100)
    
    # Get unique categories
    categories = list(set(item.get("category", "general") for item in items))
    
    # Get all location columns
    locations = ["Hub"]
    locations.extend([k["kit_id"] for k in kits])
    locations.extend([b["name"] for b in bnbs])
    
    # Build distribution matrix
    distribution = {}
    for cat in categories:
        distribution[cat] = {loc: 0 for loc in locations}
    
    # Count items by category and location
    for item in items:
        cat = item.get("category", "general")
        loc = item.get("current_location", "")
        qty = item.get("quantity", 1) if item.get("tracking_type") == "quantity" else 1
        
        if not loc or loc.startswith("station:"):
            distribution[cat]["Hub"] += qty
        elif loc.startswith("kit:"):
            kit_id = loc.split(":")[1]
            if kit_id in distribution[cat]:
                distribution[cat][kit_id] += qty
        elif loc.startswith("bnb:"):
            bnb_name = loc.split(":")[1]
            if bnb_name in distribution[cat]:
                distribution[cat][bnb_name] += qty
    
    return {
        "categories": categories,
        "locations": locations,
        "distribution": distribution
    }

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
    
    # Deployment managers see deployments where they're in morning_managers, evening_managers, or legacy deployment_managers
    if user["role"] == "deployment_manager":
        manager_filter = {
            "$or": [
                {"morning_managers": user["id"]},
                {"evening_managers": user["id"]},
                {"deployment_managers": user["id"]}  # Legacy support
            ]
        }
        if date:
            query = {"date": date, **manager_filter}
        else:
            query = manager_filter
    
    deployments = await get_db().deployments.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return deployments

@app.get("/api/deployments/today")
async def get_today_deployments(user: dict = Depends(get_current_user_dep())):
    # Use operational date (11 AM - 5 AM next day)
    operational_date = get_operational_date()
    query = {"date": operational_date}
    
    if user["role"] == "deployment_manager":
        # Manager can see deployment if they're in morning_managers OR evening_managers
        query["$or"] = [
            {"morning_managers": user["id"]},
            {"evening_managers": user["id"]},
            {"deployment_managers": user["id"]}  # Legacy support
        ]
        del query["date"]  # Remove date from main query, add it to $and
        query = {"date": operational_date, "$or": query["$or"]}
    
    return await get_db().deployments.find(query, {"_id": 0}).to_list(50)

@app.post("/api/deployments")
async def create_deployment(data: DeploymentCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # NEW STRUCTURE: One deployment per BnB per date (no shift duplication)
    # Check for duplicate by date + bnb only
    existing = await get_db().deployments.find_one({
        "date": data.date, "bnb": data.bnb
    })
    if existing:
        raise HTTPException(status_code=400, detail="Deployment already exists for this BnB on this date. Edit the existing deployment instead.")
    
    # Validate at least one manager (morning or evening)
    has_managers = (data.morning_managers and len(data.morning_managers) > 0) or \
                   (data.evening_managers and len(data.evening_managers) > 0) or \
                   (data.deployment_managers and len(data.deployment_managers) > 0)
    if not has_managers:
        raise HTTPException(status_code=400, detail="At least one manager is required (morning or evening)")
    
    doc = {
        "id": f"dep-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:18]}",
        "date": data.date,  # THIS IS THE SINGLE SOURCE OF TRUTH
        "bnb": data.bnb,
        "morning_managers": data.morning_managers or [],
        "evening_managers": data.evening_managers or [],
        "assigned_kits": data.assigned_kits,
        # Legacy fields for backwards compatibility
        "deployment_managers": data.deployment_managers or data.morning_managers or [],
        "shift": data.shift or "morning",  # Legacy
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await get_db().deployments.insert_one(doc)
    doc.pop("_id", None)
    return doc

@app.put("/api/deployments/{deployment_id}")
async def update_deployment(deployment_id: str, data: DeploymentUpdate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    update_data = {
        "morning_managers": data.morning_managers,
        "evening_managers": data.evening_managers,
        "assigned_kits": data.assigned_kits,
        # Update legacy field too
        "deployment_managers": data.morning_managers + data.evening_managers
    }
    
    await get_db().deployments.update_one(
        {"id": deployment_id},
        {"$set": update_data}
    )
    return {"status": "updated"}

@app.delete("/api/deployments/{deployment_id}")
async def delete_deployment(deployment_id: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await get_db().deployments.delete_one({"id": deployment_id})
    return {"status": "deleted"}

@app.get("/api/deployments/grouped/{date}")
async def get_grouped_deployments(date: str, user: dict = Depends(get_current_user_dep())):
    """
    Get deployments grouped by BnB for a given date.
    Returns structure: { bnbs: [ { bnb: "BnB 1", morning: {...}, evening: {...} } ] }
    """
    query = {"date": date}
    
    # Deployment managers only see their deployments
    if user["role"] == "deployment_manager":
        query["deployment_managers"] = user["id"]
    
    deployments = await get_db().deployments.find(query, {"_id": 0}).to_list(50)
    
    # Group by BnB
    bnb_groups = {}
    for dep in deployments:
        bnb = dep["bnb"]
        shift = dep.get("shift", "morning")
        
        if bnb not in bnb_groups:
            bnb_groups[bnb] = {
                "bnb": bnb,
                "morning": None,
                "evening": None
            }
        
        bnb_groups[bnb][shift] = dep
    
    # Convert to list and sort by BnB name
    result = sorted(bnb_groups.values(), key=lambda x: x["bnb"])
    return {"bnbs": result, "date": date}

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
    
    # Get events for this BnB on this date - USE deployment_date
    events = await get_db().events.find(
        {"$or": [
            {"deployment_date": date},
            {"deployment_date": {"$exists": False}, "timestamp": {"$regex": f"^{date}"}}
        ]},
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
        # CRITICAL: Filter by deployment_date first, fall back to timestamp for legacy events
        query["$or"] = [
            {"deployment_date": date},
            {"deployment_date": {"$exists": False}, "timestamp": {"$regex": f"^{date}"}}
        ]
    
    return await get_db().events.find(query, {"_id": 0}).sort("timestamp", -1).to_list(500)

@app.get("/api/events/today")
async def get_today_events(user: dict = Depends(get_current_user_dep())):
    # Use operational date, not UTC date
    operational_date = get_operational_date()
    return await get_db().events.find(
        {"$or": [
            {"deployment_date": operational_date},
            {"deployment_date": {"$exists": False}, "timestamp": {"$regex": f"^{operational_date}"}}
        ]},
        {"_id": 0}
    ).sort("timestamp", -1).to_list(500)

@app.post("/api/events")
async def create_event(data: EventCreate, user: dict = Depends(get_current_user_dep())):
    # Determine deployment_date
    deployment_date = data.deployment_date
    
    # If deployment_id provided, get the date from deployment
    if data.deployment_id and not deployment_date:
        deployment = await get_db().deployments.find_one({"id": data.deployment_id})
        if deployment:
            deployment_date = deployment.get("date")
    
    # If still no deployment_date, use current operational date
    if not deployment_date:
        deployment_date = get_operational_date()
    
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
        "deployment_id": data.deployment_id,
        "deployment_date": deployment_date,  # SINGLE SOURCE OF TRUTH
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
    """Get all collection records for a specific deployment"""
    records = await get_db().shifts.find(
        {"deployment_id": deployment_id},
        {"_id": 0}
    ).sort("start_time", -1).to_list(200)
    
    # Group records by kit for easy lookup
    # Each kit can have multiple records (collection sessions)
    kit_records = {}
    for record in records:
        kit = record["kit"]
        if kit not in kit_records:
            kit_records[kit] = {
                "active_record": None,  # Current active/paused record
                "records": []  # All records for this kit
            }
        
        kit_records[kit]["records"].append(record)
        
        # Track the active record (if any)
        if record.get("status") in ["active", "paused"]:
            kit_records[kit]["active_record"] = record
    
    return kit_records

@app.get("/api/shifts")
async def get_shifts(
    date: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    """Get shifts - filter by deployment_date (NOT timestamp)"""
    query = {}
    if date:
        # Use deployment_date field, NOT timestamp
        query["date"] = date
    
    if user["role"] == "deployment_manager":
        query["user"] = user["id"]
    
    shifts = await get_db().shifts.find(query, {"_id": 0}).sort("start_time", -1).to_list(100)
    return shifts

@app.get("/api/shifts/today")
async def get_today_shifts(user: dict = Depends(get_current_user_dep())):
    """Get today's completed shifts using operational date"""
    operational_date = get_operational_date()
    query = {"date": operational_date, "status": "completed"}
    
    if user["role"] == "deployment_manager":
        query["user"] = user["id"]
    
    return await get_db().shifts.find(query, {"_id": 0}).to_list(100)

@app.post("/api/shifts/start")
async def start_shift(data: ShiftStart, user: dict = Depends(get_current_user_dep())):
    """Start a new collection record for a specific kit - allows multiple records per kit"""
    # Check if this kit already has an active/paused record
    existing = await get_db().shifts.find_one(
        {"kit": data.kit, "deployment_id": data.deployment_id, "status": {"$in": ["active", "paused"]}}
    )
    if existing:
        raise HTTPException(status_code=400, detail="This kit has an active collection. Stop it first before starting a new one.")
    
    # Get deployment details for context
    deployment = await get_db().deployments.find_one({"id": data.deployment_id})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    # Get shift from request or default to morning
    shift_value = getattr(data, 'shift', 'morning') or 'morning'
    
    now = datetime.now(timezone.utc)
    # CRITICAL: Use deployment["date"] as the SINGLE SOURCE OF TRUTH
    # NEVER derive date from timestamp
    record = {
        "id": f"rec-{now.strftime('%Y%m%d%H%M%S%f')[:18]}",
        "deployment_id": data.deployment_id,
        "date": deployment["date"],  # SINGLE SOURCE OF TRUTH - copied from deployment
        "shift": shift_value,  # User-selected shift (morning/evening)
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
    
    await get_db().shifts.insert_one(record)
    record.pop("_id", None)
    return record

@app.delete("/api/shifts/{shift_id}")
async def delete_shift(shift_id: str, user: dict = Depends(get_current_user_dep())):
    """Delete a collection record - allowed for admin and deployment managers"""
    record = await get_db().shifts.find_one({"id": shift_id})
    if not record:
        raise HTTPException(status_code=404, detail="Collection record not found")
    
    # Allow deletion by admin or the user who created it
    if user["role"] != "admin" and record.get("user") != user["id"]:
        raise HTTPException(status_code=403, detail="You can only delete your own collection records")
    
    await get_db().shifts.delete_one({"id": shift_id})
    return {"status": "deleted", "id": shift_id}

@app.post("/api/shifts/{shift_id}/pause")
async def pause_shift(shift_id: str, user: dict = Depends(get_current_user_dep())):
    """Pause an active collection record - any manager on deployment or admin can pause"""
    # First find the record
    shift = await get_db().shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Collection record not found")
    
    # Check authorization: admin can do anything, or user must be manager on the deployment
    if user["role"] != "admin":
        deployment = await get_db().deployments.find_one({"id": shift.get("deployment_id")})
        if not deployment or user["id"] not in deployment.get("deployment_managers", []):
            raise HTTPException(status_code=403, detail="Not authorized to control this collection")
    
    if shift["status"] != "active":
        raise HTTPException(status_code=400, detail="Collection is not active")
    
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
    """Resume a paused collection record - any manager on deployment or admin can resume"""
    # First find the record
    shift = await get_db().shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Collection record not found")
    
    # Check authorization: admin can do anything, or user must be manager on the deployment
    if user["role"] != "admin":
        deployment = await get_db().deployments.find_one({"id": shift.get("deployment_id")})
        if not deployment or user["id"] not in deployment.get("deployment_managers", []):
            raise HTTPException(status_code=403, detail="Not authorized to control this collection")
    
    if shift["status"] != "paused":
        raise HTTPException(status_code=400, detail="Collection is not paused")
    
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
    """Stop a collection record - any manager on deployment or admin can stop"""
    # First find the record
    shift = await get_db().shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Collection record not found")
    
    # Check authorization: admin can do anything, or user must be manager on the deployment
    if user["role"] != "admin":
        deployment = await get_db().deployments.find_one({"id": shift.get("deployment_id")})
        if not deployment or user["id"] not in deployment.get("deployment_managers", []):
            raise HTTPException(status_code=403, detail="Not authorized to control this collection")
    
    if shift["status"] == "completed":
        raise HTTPException(status_code=400, detail="Collection is already completed")
    
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
        "shift_type": data.shift_type,  # morning / evening
        "user": user["id"],
        "user_name": user["name"],
        "kit_checklists": [kc.dict() for kc in data.kit_checklists],
        "bnb_checklist": data.bnb_checklist.dict(),
        "missing_items": data.missing_items,
        "notes": data.notes,
        "timestamp": now.isoformat(),
        "created_at": now.isoformat()
    }
    
    await get_db().handovers.insert_one(handover_doc)
    handover_doc.pop("_id", None)
    return handover_doc


@app.get("/api/handovers/status/{deployment_id}/{date}")
async def get_handover_status(deployment_id: str, date: str, user: dict = Depends(get_current_user_dep())):
    """
    Get handover status for a deployment on a specific date.
    Returns which shifts have completed their handovers.
    
    Handover flow:
    - Morning team does OUTGOING handover -> morning_outgoing_complete
    - Night team does INCOMING handover -> night_incoming_complete
    - Night team does OUTGOING handover -> night_outgoing_complete
    - Next day Morning team does INCOMING handover -> next_day_ready
    """
    
    # Get handovers for this deployment on this date
    handovers = await get_db().handovers.find({
        "deployment_id": deployment_id,
        "timestamp": {"$regex": f"^{date}"}  # Match date prefix in timestamp
    }, {"_id": 0}).to_list(100)
    
    # Determine status based on completed handovers
    morning_outgoing_complete = any(
        h.get("handover_type") == "outgoing" and 
        h.get("shift_type") == "morning" 
        for h in handovers
    )
    
    night_incoming_complete = any(
        h.get("handover_type") == "incoming" and 
        h.get("shift_type") == "evening" 
        for h in handovers
    )
    
    night_outgoing_complete = any(
        h.get("handover_type") == "outgoing" and 
        h.get("shift_type") == "evening" 
        for h in handovers
    )
    
    # Legacy handovers without shift_type - check by time of day
    for h in handovers:
        if not h.get("shift_type"):
            try:
                ts = datetime.fromisoformat(h.get("timestamp", "").replace("Z", "+00:00"))
                hour = ts.hour
                # Morning shift: before 3 PM
                # Evening shift: 3 PM onwards
                is_morning = hour < 15
                
                if h.get("handover_type") == "outgoing":
                    if is_morning:
                        morning_outgoing_complete = True
                    else:
                        night_outgoing_complete = True
                elif h.get("handover_type") == "incoming":
                    if not is_morning:
                        night_incoming_complete = True
            except:
                pass
    
    return {
        "deployment_id": deployment_id,
        "date": date,
        "morning_outgoing_complete": morning_outgoing_complete,
        "night_incoming_complete": night_incoming_complete,
        "night_outgoing_complete": night_outgoing_complete,
        "handovers": handovers,
        # Computed flags for UI
        "can_morning_end_shift": True,  # Morning can always try to end (handover dialog will guide)
        "can_night_start": morning_outgoing_complete,  # Night needs morning handover first
        "can_night_end_shift": night_incoming_complete,  # Night must have done incoming first
    }


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

def calculate_live_duration_hours(record):
    """Calculate live duration for an active/paused record in hours"""
    if not record or not record.get("start_time"):
        return 0
    
    try:
        start_time = datetime.fromisoformat(record["start_time"].replace("Z", "+00:00"))
        now = datetime.now(timezone.utc)
        
        # Calculate total paused time
        total_paused_seconds = 0
        pauses = record.get("pauses", [])
        
        for pause in pauses:
            pause_time = datetime.fromisoformat(pause["pause_time"].replace("Z", "+00:00"))
            if pause.get("resume_time"):
                resume_time = datetime.fromisoformat(pause["resume_time"].replace("Z", "+00:00"))
                total_paused_seconds += (resume_time - pause_time).total_seconds()
            else:
                # Currently paused - count time from pause to now
                total_paused_seconds += (now - pause_time).total_seconds()
        
        # Calculate active duration
        total_elapsed_seconds = (now - start_time).total_seconds()
        active_seconds = total_elapsed_seconds - total_paused_seconds
        
        return max(0, active_seconds / 3600)  # Convert to hours
    except Exception:
        return 0

@app.get("/api/dashboard/live")
async def get_live_dashboard(
    date: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    """Get operational dashboard data for a specific date (defaults to today). Data baseline: 2026-03-20"""
    target_date = date or datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Analytics baseline - Live Dashboard still shows data but analytics ignores old data
    ANALYTICS_BASELINE = "2026-03-20"
    
    # Get deployments for this date FIRST - this is the source of truth for date
    deployments = await get_db().deployments.find({"date": target_date}, {"_id": 0}).to_list(50)
    deployment_ids = [d["id"] for d in deployments]
    
    # Get all collection records by deployment_id (NOT by date field to avoid timezone issues)
    all_records = []
    if deployment_ids:
        all_records = await get_db().shifts.find(
            {"deployment_id": {"$in": deployment_ids}},
            {"_id": 0}
        ).to_list(500)
    
    # Separate completed and active records
    if target_date < ANALYTICS_BASELINE:
        completed_records = []  # Don't show old data in totals
        active_records = [r for r in all_records if r.get("status") in ["active", "paused"]]
    else:
        completed_records = [r for r in all_records if r.get("status") == "completed"]
        active_records = [r for r in all_records if r.get("status") in ["active", "paused"]]
    
    # Get events for damage and lost reports - USE deployment_date, fall back to timestamp for legacy
    events = await get_db().events.find(
        {"$or": [
            {"deployment_date": target_date},
            {"deployment_date": {"$exists": False}, "timestamp": {"$regex": f"^{target_date}"}}
        ]},
        {"_id": 0}
    ).to_list(200)
    
    # --- TOP LEVEL METRICS ---
    # Include BOTH completed hours AND live hours from active records
    completed_hours = sum(r.get("total_duration_hours", 0) or 0 for r in completed_records)
    active_hours = sum(calculate_live_duration_hours(r) for r in active_records)
    total_hours = completed_hours + active_hours
    
    # Category-wise hours (all BnBs combined) - include active records
    category_hours = {}
    for record in completed_records:
        activity = record.get("activity_type", "Other")
        category_hours[activity] = category_hours.get(activity, 0) + (record.get("total_duration_hours", 0) or 0)
    for record in active_records:
        activity = record.get("activity_type", "Other")
        category_hours[activity] = category_hours.get(activity, 0) + calculate_live_duration_hours(record)
    
    # Round category hours
    category_hours = {k: round(v, 2) for k, v in category_hours.items()}
    
    # --- PER BNB METRICS ---
    bnb_data = {}
    
    # Get all users for manager name resolution
    all_users = await get_db().users.find({}, {"_id": 0, "id": 1, "name": 1}).to_list(100)
    user_map = {u["id"]: u["name"] for u in all_users}
    
    # Initialize BnB data from deployments
    for dep in deployments:
        bnb = dep["bnb"]
        shift_type = dep.get("shift", "morning")
        
        if bnb not in bnb_data:
            bnb_data[bnb] = {
                "bnb": bnb,
                "total_hours": 0,
                "morning_hours": 0,
                "night_hours": 0,
                "morning_managers": [],
                "night_managers": [],
                "category_hours": {},
                "kits": {},
                "active_count": 0,
                "damage_reports": [],
                "lost_reports": []
            }
        
        # Add managers from deployment (new structure: morning_managers, evening_managers)
        morning_mgrs = dep.get("morning_managers", [])
        evening_mgrs = dep.get("evening_managers", [])
        
        # Also support legacy single deployment_manager field
        legacy_mgr = dep.get("deployment_manager")
        if legacy_mgr and not morning_mgrs and not evening_mgrs:
            if shift_type == "morning":
                morning_mgrs = [legacy_mgr]
            else:
                evening_mgrs = [legacy_mgr]
        
        # Add manager names (avoid duplicates)
        for mgr_id in morning_mgrs:
            mgr_name = user_map.get(mgr_id, mgr_id)
            if mgr_name not in bnb_data[bnb]["morning_managers"]:
                bnb_data[bnb]["morning_managers"].append(mgr_name)
        
        for mgr_id in evening_mgrs:
            mgr_name = user_map.get(mgr_id, mgr_id)
            if mgr_name not in bnb_data[bnb]["night_managers"]:
                bnb_data[bnb]["night_managers"].append(mgr_name)
        
        # Add kits from this deployment
        for kit in dep.get("assigned_kits", []):
            if kit not in bnb_data[bnb]["kits"]:
                bnb_data[bnb]["kits"][kit] = {
                    "kit_id": kit,
                    "total_hours": 0,
                    "morning_hours": 0,  # NEW: shift-wise kit hours
                    "night_hours": 0,    # NEW: shift-wise kit hours
                    "category_hours": {},
                    "shift": shift_type,
                    "active_record": None  # Will be populated if kit has active collection
                }
    
    # Map active records to kits
    for record in active_records:
        bnb = record.get("bnb")
        kit = record.get("kit")
        record_shift = record.get("shift", "morning")
        if bnb and bnb in bnb_data and kit and kit in bnb_data[bnb]["kits"]:
            bnb_data[bnb]["kits"][kit]["active_record"] = {
                "id": record.get("id"),
                "status": record.get("status"),
                "start_time": record.get("start_time"),
                "pauses": record.get("pauses", []),
                "activity_type": record.get("activity_type"),
                "user_name": record.get("user_name"),
                "ssd_used": record.get("ssd_used"),
                "shift": record_shift  # Include shift info in active record
            }
    
    # Process completed records
    for record in completed_records:
        bnb = record.get("bnb")
        kit = record.get("kit")
        hours = record.get("total_duration_hours", 0) or 0
        activity = record.get("activity_type", "Other")
        # Use shift from the record itself (set at creation from deployment)
        record_shift = record.get("shift", "morning")
        
        if bnb and bnb in bnb_data:
            # Total hours
            bnb_data[bnb]["total_hours"] += hours
            
            # Category hours for BnB
            bnb_data[bnb]["category_hours"][activity] = bnb_data[bnb]["category_hours"].get(activity, 0) + hours
            
            # Kit-level data (total + shift-wise)
            if kit and kit in bnb_data[bnb]["kits"]:
                bnb_data[bnb]["kits"][kit]["total_hours"] += hours
                bnb_data[bnb]["kits"][kit]["category_hours"][activity] = \
                    bnb_data[bnb]["kits"][kit]["category_hours"].get(activity, 0) + hours
                
                # NEW: Add to kit's shift-wise hours
                if record_shift == "morning":
                    bnb_data[bnb]["kits"][kit]["morning_hours"] += hours
                else:
                    bnb_data[bnb]["kits"][kit]["night_hours"] += hours
            
            # Shift split based on RECORD's shift assignment (not inferred from time)
            if record_shift == "morning":
                bnb_data[bnb]["morning_hours"] += hours
            else:
                bnb_data[bnb]["night_hours"] += hours
    
    # Process active records - ADD live hours to totals
    for record in active_records:
        bnb = record.get("bnb")
        kit = record.get("kit")
        live_hours = calculate_live_duration_hours(record)
        activity = record.get("activity_type", "Other")
        # Use shift from the record itself (set at creation from deployment)
        record_shift = record.get("shift", "morning")
        
        if bnb and bnb in bnb_data:
            bnb_data[bnb]["active_count"] += 1
            
            # Add live hours to totals
            bnb_data[bnb]["total_hours"] += live_hours
            bnb_data[bnb]["category_hours"][activity] = bnb_data[bnb]["category_hours"].get(activity, 0) + live_hours
            
            # Kit-level live hours (total + shift-wise)
            if kit and kit in bnb_data[bnb]["kits"]:
                bnb_data[bnb]["kits"][kit]["total_hours"] += live_hours
                bnb_data[bnb]["kits"][kit]["live_hours"] = live_hours  # Separate field for live hours
                bnb_data[bnb]["kits"][kit]["category_hours"][activity] = \
                    bnb_data[bnb]["kits"][kit]["category_hours"].get(activity, 0) + live_hours
                
                # NEW: Add to kit's shift-wise hours
                if record_shift == "morning":
                    bnb_data[bnb]["kits"][kit]["morning_hours"] += live_hours
                else:
                    bnb_data[bnb]["kits"][kit]["night_hours"] += live_hours
            
            # Shift split based on RECORD's shift assignment (not inferred)
            if record_shift == "morning":
                bnb_data[bnb]["morning_hours"] += live_hours
            else:
                bnb_data[bnb]["night_hours"] += live_hours
    
    # Process damage and lost events
    for event in events:
        event_type = event.get("event_type")
        # Try to determine BnB from event locations
        from_loc = event.get("from_location", "") or ""
        to_loc = event.get("to_location", "") or ""
        
        # Find matching BnB
        for bnb in bnb_data:
            if bnb in from_loc or bnb in to_loc:
                if event_type == "damage":
                    bnb_data[bnb]["damage_reports"].append({
                        "item": event.get("item"),
                        "notes": event.get("notes"),
                        "user": event.get("user_name"),
                        "time": event.get("timestamp")
                    })
                elif event_type == "lost":
                    bnb_data[bnb]["lost_reports"].append({
                        "item": event.get("item"),
                        "notes": event.get("notes"),
                        "user": event.get("user_name"),
                        "time": event.get("timestamp")
                    })
                break
    
    # Finalize BnB data
    bnb_list = []
    for bnb, data in bnb_data.items():
        data["total_hours"] = round(data["total_hours"], 2)
        data["morning_hours"] = round(data["morning_hours"], 2)
        data["night_hours"] = round(data["night_hours"], 2)
        data["category_hours"] = {k: round(v, 2) for k, v in data["category_hours"].items()}
        
        # Convert kits dict to list
        kit_list = []
        for kit_id, kit_data in data["kits"].items():
            kit_data["total_hours"] = round(kit_data["total_hours"], 2)
            kit_data["morning_hours"] = round(kit_data.get("morning_hours", 0), 2)  # NEW
            kit_data["night_hours"] = round(kit_data.get("night_hours", 0), 2)      # NEW
            kit_data["category_hours"] = {k: round(v, 2) for k, v in kit_data["category_hours"].items()}
            kit_list.append(kit_data)
        data["kits"] = sorted(kit_list, key=lambda x: x["kit_id"])
        
        bnb_list.append(data)
    
    # Sort by BnB name
    bnb_list.sort(key=lambda x: x["bnb"])
    
    return {
        "date": target_date,
        "total_hours": round(total_hours, 2),
        "category_hours": category_hours,
        "active_count": len(active_records),
        "bnbs": bnb_list
    }

# ========================
# HARDWARE HEALTH CHECKS
# ========================

@app.post("/api/hardware-checks")
async def create_hardware_check(data: HardwareCheckCreate, user: dict = Depends(get_current_user_dep())):
    """Create a hardware health check for a kit (required before first collection of the day)
    Images can be uploaded immediately or async via separate endpoint"""
    deployment = await get_db().deployments.find_one({"id": data.deployment_id})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    # Check if already submitted today for this kit
    existing = await get_db().hardware_checks.find_one({
        "deployment_id": data.deployment_id,
        "kit": data.kit,
        "date": deployment["date"]
    })
    if existing:
        raise HTTPException(status_code=400, detail="Hardware check already completed for this kit today")
    
    now = datetime.now(timezone.utc)
    
    # Determine upload status
    has_all_images = bool(data.left_glove_image and data.right_glove_image and data.head_camera_image)
    
    check = {
        "id": f"hw-{now.strftime('%Y%m%d%H%M%S%f')[:18]}",
        "deployment_id": data.deployment_id,
        "date": deployment["date"],
        "bnb": deployment["bnb"],
        "kit": data.kit,
        "user": user["id"],
        "user_name": user["name"],
        "left_glove_image": data.left_glove_image,
        "right_glove_image": data.right_glove_image,
        "head_camera_image": data.head_camera_image,
        "notes": data.notes,
        "image_upload_status": "complete" if has_all_images else "pending",
        "created_at": now.isoformat()
    }
    
    await get_db().hardware_checks.insert_one(check)
    check.pop("_id", None)
    return check


@app.patch("/api/hardware-checks/{check_id}/images")
async def upload_hardware_check_images(check_id: str, data: HardwareCheckImageUpload, user: dict = Depends(get_current_user_dep())):
    """Async image upload for hardware check - allows uploading images after initial submission"""
    check = await get_db().hardware_checks.find_one({"id": check_id})
    if not check:
        raise HTTPException(status_code=404, detail="Hardware check not found")
    
    update_data = {}
    if data.left_glove_image:
        update_data["left_glove_image"] = data.left_glove_image
    if data.right_glove_image:
        update_data["right_glove_image"] = data.right_glove_image
    if data.head_camera_image:
        update_data["head_camera_image"] = data.head_camera_image
    
    if update_data:
        # Check if all images are now present
        current_left = update_data.get("left_glove_image") or check.get("left_glove_image")
        current_right = update_data.get("right_glove_image") or check.get("right_glove_image")
        current_head = update_data.get("head_camera_image") or check.get("head_camera_image")
        
        if current_left and current_right and current_head:
            update_data["image_upload_status"] = "complete"
        
        await get_db().hardware_checks.update_one(
            {"id": check_id},
            {"$set": update_data}
        )
    
    updated = await get_db().hardware_checks.find_one({"id": check_id}, {"_id": 0})
    return updated

@app.get("/api/hardware-checks/status/{deployment_id}/{kit}")
async def get_hardware_check_status(deployment_id: str, kit: str, user: dict = Depends(get_current_user_dep())):
    """Check if hardware check has been completed for a kit today"""
    deployment = await get_db().deployments.find_one({"id": deployment_id})
    if not deployment:
        return {"completed": False}
    
    existing = await get_db().hardware_checks.find_one({
        "deployment_id": deployment_id,
        "kit": kit,
        "date": deployment["date"]
    }, {"_id": 0})
    
    return {"completed": existing is not None, "check": existing}

@app.get("/api/hardware-checks")
async def get_hardware_checks(
    date: Optional[str] = None,
    bnb: Optional[str] = None,
    kit: Optional[str] = None,
    skip: int = 0,
    limit: int = 20,
    include_images: bool = False,
    user: dict = Depends(get_current_user_dep())
):
    """Get hardware checks with optional filters (for hardware dashboard)
    
    Optimized for performance:
    - By default, excludes large image fields (include_images=False)
    - Supports pagination with skip/limit
    - Images can be fetched separately via /hardware-checks/{id}/images
    """
    query = {}
    
    if date:
        query["date"] = date
    if bnb:
        query["bnb"] = bnb
    if kit:
        query["kit"] = kit
    
    # Projection: exclude images by default for faster loading
    projection = {"_id": 0}
    if not include_images:
        projection["left_glove_image"] = 0
        projection["right_glove_image"] = 0
        projection["head_camera_image"] = 0
    
    # Get total count for pagination info
    total_count = await get_db().hardware_checks.count_documents(query)
    
    checks = await get_db().hardware_checks.find(query, projection).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {
        "checks": checks,
        "total": total_count,
        "skip": skip,
        "limit": limit,
        "has_more": skip + len(checks) < total_count
    }


@app.get("/api/hardware-checks/{check_id}/images")
async def get_hardware_check_images(check_id: str, user: dict = Depends(get_current_user_dep())):
    """Get images for a specific hardware check (lazy loading)"""
    check = await get_db().hardware_checks.find_one(
        {"id": check_id},
        {
            "_id": 0,
            "id": 1,
            "left_glove_image": 1,
            "right_glove_image": 1,
            "head_camera_image": 1
        }
    )
    
    if not check:
        raise HTTPException(status_code=404, detail="Hardware check not found")
    
    return check

# ========================
# ANALYTICS DASHBOARD - DATE RANGE SUPPORT
# ========================

@app.get("/api/analytics")
async def get_analytics(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    user: dict = Depends(get_current_user_dep())
):
    """Get analytics for a date range (defaults to last 7 days). Data baseline: 2026-03-20"""
    today = datetime.now(timezone.utc)
    
    # Analytics baseline date - ignore all data before this
    ANALYTICS_BASELINE = "2026-03-20"
    
    if not end_date:
        end_date = today.strftime("%Y-%m-%d")
    if not start_date:
        start_date = (today - timedelta(days=6)).strftime("%Y-%m-%d")
    
    # Ensure start_date is not before baseline
    if start_date < ANALYTICS_BASELINE:
        start_date = ANALYTICS_BASELINE
    
    # If end_date is before baseline, return empty data
    if end_date < ANALYTICS_BASELINE:
        return {
            "start_date": start_date,
            "end_date": end_date,
            "total_hours": 0,
            "total_collection_records": 0,
            "total_deployments": 0,
            "hours_per_activity": [],
            "daily_trend": []
        }
    
    # Get all completed shifts in date range
    shifts = await get_db().shifts.find(
        {
            "date": {"$gte": start_date, "$lte": end_date},
            "status": "completed"
        },
        {"_id": 0}
    ).to_list(2000)
    
    # Get total deployments in date range
    total_deployments = await get_db().deployments.count_documents({
        "date": {"$gte": start_date, "$lte": end_date}
    })
    
    # Total hours
    total_hours = sum(s.get("total_duration_hours", 0) or 0 for s in shifts)
    
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
    
    activity_breakdown = [
        {"activity": act, "hours": round(hours, 2)}
        for act, hours in sorted(hours_per_activity.items(), key=lambda x: -x[1])
    ]
    
    return {
        "start_date": start_date,
        "end_date": end_date,
        "total_hours": round(total_hours, 2),
        "total_collection_records": len(shifts),
        "total_deployments": total_deployments,
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
