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
# DEFAULT CATEGORY DEFINITIONS (used for initial seeding)
# ========================
# Categories are now stored in MongoDB for dynamic management
# These defaults are used to seed the database on first run

DEFAULT_CATEGORIES = [
    {"value": "glove_left", "label": "Glove Left", "type": "unique"},
    {"value": "glove_right", "label": "Glove Right", "type": "unique"},
    {"value": "usb_hub", "label": "USB Hub", "type": "non_unique"},
    {"value": "imu", "label": "IMUs", "type": "non_unique"},
    {"value": "head_camera", "label": "Head Camera", "type": "unique"},
    {"value": "l_shaped_wire", "label": "L-Shaped Wire", "type": "non_unique"},
    {"value": "wrist_camera", "label": "Wrist Camera", "type": "unique"},
    {"value": "laptop", "label": "Laptop", "type": "unique"},
    {"value": "laptop_charger", "label": "Laptop Charger", "type": "non_unique"},
    {"value": "power_bank", "label": "Power Bank", "type": "unique"},
    {"value": "ssd", "label": "SSD", "type": "unique"},
    {"value": "bluetooth_adapter", "label": "Bluetooth Adapter", "type": "non_unique"},
]

# These will be populated from database at startup
CACHED_CATEGORIES = []
VALID_CATEGORY_VALUES = []
UNIQUE_CATEGORIES = []
NON_UNIQUE_CATEGORIES = []
CATEGORY_LABELS = {}

async def refresh_category_cache():
    """Refresh the in-memory category cache from database"""
    global CACHED_CATEGORIES, VALID_CATEGORY_VALUES, UNIQUE_CATEGORIES, NON_UNIQUE_CATEGORIES, CATEGORY_LABELS
    
    categories = await get_db().categories.find({}, {"_id": 0}).to_list(100)
    
    if not categories:
        # Seed with defaults if empty
        for cat in DEFAULT_CATEGORIES:
            cat_doc = {
                "value": cat["value"],
                "label": cat["label"],
                "type": cat["type"],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await get_db().categories.insert_one(cat_doc)
        categories = await get_db().categories.find({}, {"_id": 0}).to_list(100)
    
    CACHED_CATEGORIES = categories
    VALID_CATEGORY_VALUES = [c["value"] for c in categories]
    UNIQUE_CATEGORIES = [c["value"] for c in categories if c.get("type") == "unique"]
    NON_UNIQUE_CATEGORIES = [c["value"] for c in categories if c.get("type") == "non_unique"]
    CATEGORY_LABELS = {c["value"]: c["label"] for c in categories}
    
    return categories

# Legacy category mapping (to normalize old/inconsistent data)
CATEGORY_NORMALIZATION_MAP = {
    # Old values -> new standardized values
    "general": None,  # Remove general
    "tools": None,    # Remove tools
    "camera": "head_camera",  # Map generic camera to head_camera
    "gloves": "glove_left",   # Map generic gloves to glove_left
    "glove": "glove_left",
    "adapter": "bluetooth_adapter",
    "cable": "l_shaped_wire",
    "charging": "laptop_charger",
    "hub": "usb_hub",
    "imus": "imu",
    "power": "power_bank",
    "other": None,
}

def normalize_category(category: str) -> str:
    """Normalize a category value to the standard list"""
    if not category:
        return None
    cat_lower = category.lower().strip()
    
    # If already in valid list, return as-is
    if cat_lower in VALID_CATEGORY_VALUES:
        return cat_lower
    
    # Try normalization map
    if cat_lower in CATEGORY_NORMALIZATION_MAP:
        return CATEGORY_NORMALIZATION_MAP[cat_lower]
    
    # Try partial matching
    for valid_cat in VALID_CATEGORY_VALUES:
        if valid_cat in cat_lower or cat_lower in valid_cat:
            return valid_cat
    
    # Return None for unmapped categories
    return None

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
    status: str = "active"  # active / damaged / lost / repair / ready_for_offload
    current_location: Optional[str] = None  # e.g., "kit:KIT-01" or "bnb:BnB-01" or "station:Storage"
    quantity: int = 1  # For quantity-tracked items

class DeploymentCreate(BaseModel):
    date: str  # YYYY-MM-DD - THIS IS THE SINGLE SOURCE OF TRUTH
    bnb: str
    # NEW STRUCTURE: Both shifts in one deployment
    morning_managers: List[str] = []  # User IDs for morning shift
    night_managers: List[str] = []  # User IDs for night shift
    assigned_kits: List[str] = []  # Kits assigned to this BnB for the day
    # Legacy field for backwards compatibility during transition
    shift: Optional[str] = None  # Will be removed after migration
    deployment_managers: Optional[List[str]] = None  # Legacy field

class DeploymentUpdate(BaseModel):
    morning_managers: List[str] = []
    night_managers: List[str] = []
    assigned_kits: List[str] = []

class ItemUpdate(BaseModel):
    category: Optional[str] = None
    tracking_type: str  # individual / quantity
    status: str = "active"  # active / damaged / lost / repair / ready_for_offload
    current_location: Optional[str] = None
    quantity: Optional[int] = None

# Collection record models - CONTEXT-AWARE (tied to deployment/kit)
class CollectionStart(BaseModel):
    deployment_id: str  # Required - which deployment this collection belongs to
    kit: str  # Required - which kit
    shift: str  # Required - "morning" or "night" (user selects which shift they're working)
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

# Quantity-based transfer model (for NON-UNIQUE categories)
class QuantityTransferCreate(BaseModel):
    category: str  # Category to transfer (e.g., "usb_hub")
    from_location: str  # Source location (e.g., "kit:KIT-01")
    to_location: str  # Destination location (e.g., "station:Storage")
    quantity: int = 1  # Number of items to transfer
    notes: Optional[str] = None

# Quantity-based damage/lost model (for NON-UNIQUE categories)
class QuantityDamageLostCreate(BaseModel):
    category: str  # Category (e.g., "usb_hub")
    from_location: str  # Location where items are damaged/lost
    quantity: int = 1  # Number of items affected
    status: str  # "damaged" or "lost"
    notes: Optional[str] = None

# Full Kit Transfer model
class FullKitTransferCreate(BaseModel):
    kit_id: str  # Kit to transfer (e.g., "KIT-01")
    to_location: str  # Destination location (e.g., "bnb:BNB-2", "station:Hub")
    notes: Optional[str] = None

# Task Categories (Activity Types for Collections)
class TaskCategoryCreate(BaseModel):
    value: str  # Unique identifier (e.g., "cooking", "cleaning")
    label: str  # Display name (e.g., "Cooking", "Cleaning")

class TaskCategoryUpdate(BaseModel):
    label: Optional[str] = None

# Default task categories (seeded on first run)
DEFAULT_TASK_CATEGORIES = [
    {"value": "cooking", "label": "Cooking"},
    {"value": "cleaning", "label": "Cleaning"},
    {"value": "organizing", "label": "Organizing"},
    {"value": "outdoor", "label": "Outdoor"},
    {"value": "other", "label": "Other"},
]

# Hardware Health Check models
class HardwareCheckCreate(BaseModel):
    deployment_id: str
    kit: str
    shift_type: str  # "morning" or "night" - REQUIRED for shift-specific checks
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
    shift_type: str = "morning"  # morning / night - which shift is doing the handover
    kit_checklists: List[KitChecklist]
    bnb_checklist: BnbChecklist
    missing_items: List[dict] = []  # [{item, quantity, kit_or_bnb, report_as_lost}]
    notes: Optional[str] = None

# Offload Batch models (SSD → HDD data transfer tracking)
# Simplified Offload models (SSD → HDD data transfer)
class OffloadCreate(BaseModel):
    ssd_ids: List[str]  # list of SSD item_ids being offloaded
    hdd_id: str  # target HDD item_id
    transfer_size_gb: float  # approximate transfer size in GB
    notes: Optional[str] = None

class HDDCreate(BaseModel):
    item_id: str
    name: Optional[str] = None
    total_capacity_gb: float = 8000  # default 8TB
    notes: Optional[str] = None

class HDDReset(BaseModel):
    reason: str = "returned_from_data_centre"  # reason for reset

# Category Management Models
class CategoryCreate(BaseModel):
    value: str  # unique identifier (e.g., "laptop", "usb_hub")
    label: str  # display name (e.g., "Laptop", "USB Hub")
    type: str   # "unique" or "non_unique"

class CategoryUpdate(BaseModel):
    label: Optional[str] = None
    type: Optional[str] = None

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
    # Initialize category cache from database
    await refresh_category_cache()
    logger.info(f"Loaded {len(CACHED_CATEGORIES)} categories from database")
    
    # Seed task categories if empty
    task_cats = await get_db().task_categories.find({}, {"_id": 0}).to_list(100)
    if not task_cats:
        for cat in DEFAULT_TASK_CATEGORIES:
            cat_doc = {
                "value": cat["value"],
                "label": cat["label"],
                "created_at": datetime.now(timezone.utc).isoformat()
            }
            await get_db().task_categories.insert_one(cat_doc)
        logger.info(f"Seeded {len(DEFAULT_TASK_CATEGORIES)} task categories")
    else:
        logger.info(f"Found {len(task_cats)} existing task categories")

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
    """Get item distribution across all locations grouped by MASTER categories
    
    IMPORTANT: Only counts ACTIVE items (excludes damaged/lost)
    """
    # Only fetch ACTIVE items (exclude damaged/lost)
    items = await get_db().items.find(
        {"status": {"$nin": ["damaged", "lost"]}}, 
        {"_id": 0}
    ).to_list(500)
    kits = await get_db().kits.find({}, {"_id": 0}).to_list(100)
    bnbs = await get_db().bnbs.find({}, {"_id": 0}).to_list(100)
    
    # Use MASTER category list (single source of truth)
    categories = VALID_CATEGORY_VALUES
    
    # Get all location columns
    locations = ["Hub"]
    locations.extend([k["kit_id"] for k in kits])
    locations.extend([b["name"] for b in bnbs])
    
    # Build distribution matrix with ALL master categories
    distribution = {}
    for cat in categories:
        distribution[cat] = {loc: 0 for loc in locations}
    
    # Count items by category and location (normalize categories)
    for item in items:
        raw_cat = item.get("category", "")
        normalized_cat = normalize_category(raw_cat)
        
        # Skip items with unmapped categories
        if not normalized_cat or normalized_cat not in categories:
            continue
        
        loc = item.get("current_location", "")
        qty = item.get("quantity", 1) if item.get("tracking_type") == "quantity" else 1
        
        if not loc or loc.startswith("station:"):
            distribution[normalized_cat]["Hub"] += qty
        elif loc.startswith("kit:"):
            kit_id = loc.split(":")[1]
            if kit_id in distribution[normalized_cat]:
                distribution[normalized_cat][kit_id] += qty
        elif loc.startswith("bnb:"):
            bnb_name = loc.split(":")[1]
            if bnb_name in distribution[normalized_cat]:
                distribution[normalized_cat][bnb_name] += qty
    
    # Return with category labels for display
    return {
        "categories": categories,
        "category_labels": CATEGORY_LABELS,
        "locations": locations,
        "distribution": distribution
    }

@app.get("/api/categories")
async def get_categories():
    """Get master category list from database (SINGLE SOURCE OF TRUTH)"""
    # Refresh cache to ensure we have latest data
    if not CACHED_CATEGORIES:
        await refresh_category_cache()
    
    # Get item counts per category
    items = await get_db().items.find({"status": "active"}, {"_id": 0, "category": 1, "quantity": 1, "tracking_type": 1}).to_list(1000)
    category_counts = {}
    for item in items:
        cat = item.get("category", "")
        qty = item.get("quantity", 1) if item.get("tracking_type") == "quantity" else 1
        category_counts[cat] = category_counts.get(cat, 0) + qty
    
    # Enrich categories with counts
    enriched_categories = []
    for cat in CACHED_CATEGORIES:
        enriched_categories.append({
            **cat,
            "item_count": category_counts.get(cat["value"], 0)
        })
    
    return {
        "categories": enriched_categories,
        "unique_categories": UNIQUE_CATEGORIES,
        "non_unique_categories": NON_UNIQUE_CATEGORIES,
        "category_labels": CATEGORY_LABELS
    }

@app.post("/api/categories")
async def create_category(data: CategoryCreate, user: dict = Depends(get_current_user_dep())):
    """Create a new category (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Validate type
    if data.type not in ["unique", "non_unique"]:
        raise HTTPException(status_code=400, detail="Type must be 'unique' or 'non_unique'")
    
    # Normalize value (lowercase, replace spaces with underscores)
    value = data.value.lower().strip().replace(" ", "_").replace("-", "_")
    
    # Check if category already exists
    existing = await get_db().categories.find_one({"value": value})
    if existing:
        raise HTTPException(status_code=400, detail=f"Category '{value}' already exists")
    
    cat_doc = {
        "value": value,
        "label": data.label.strip(),
        "type": data.type,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await get_db().categories.insert_one(cat_doc)
    
    # Refresh cache
    await refresh_category_cache()
    
    return {"value": value, "label": data.label.strip(), "type": data.type}

@app.put("/api/categories/{category_value}")
async def update_category(category_value: str, data: CategoryUpdate, user: dict = Depends(get_current_user_dep())):
    """Update a category (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check if category exists
    existing = await get_db().categories.find_one({"value": category_value})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    update_data = {}
    if data.label is not None:
        update_data["label"] = data.label.strip()
    if data.type is not None:
        if data.type not in ["unique", "non_unique"]:
            raise HTTPException(status_code=400, detail="Type must be 'unique' or 'non_unique'")
        update_data["type"] = data.type
    
    if update_data:
        await get_db().categories.update_one({"value": category_value}, {"$set": update_data})
        # Refresh cache
        await refresh_category_cache()
    
    updated = await get_db().categories.find_one({"value": category_value}, {"_id": 0})
    return updated

@app.delete("/api/categories/{category_value}")
async def delete_category(category_value: str, user: dict = Depends(get_current_user_dep())):
    """Delete a category (admin only) - blocked if items exist"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check if category exists
    existing = await get_db().categories.find_one({"value": category_value})
    if not existing:
        raise HTTPException(status_code=404, detail="Category not found")
    
    # Check if any items exist in this category
    item_count = await get_db().items.count_documents({"category": category_value})
    if item_count > 0:
        raise HTTPException(
            status_code=400, 
            detail=f"Cannot delete category '{category_value}': {item_count} item(s) exist. Please remove or reassign items first."
        )
    
    await get_db().categories.delete_one({"value": category_value})
    
    # Refresh cache
    await refresh_category_cache()
    
    return {"status": "deleted", "category": category_value}

@app.get("/api/categories/{category_value}/items")
async def get_category_items(category_value: str, user: dict = Depends(get_current_user_dep())):
    """Get all items in a specific category"""
    # Validate category exists
    if category_value not in VALID_CATEGORY_VALUES:
        raise HTTPException(status_code=404, detail="Category not found")
    
    items = await get_db().items.find({"category": category_value}, {"_id": 0}).to_list(500)
    
    # Get category info
    cat_info = next((c for c in CACHED_CATEGORIES if c["value"] == category_value), None)
    
    return {
        "category": cat_info,
        "items": items,
        "total_count": len(items),
        "active_count": len([i for i in items if i.get("status") == "active"]),
        "damaged_count": len([i for i in items if i.get("status") == "damaged"]),
        "lost_count": len([i for i in items if i.get("status") == "lost"])
    }

# ========================
# TASK CATEGORIES (Activity Types for Collections)
# ========================

@app.get("/api/task-categories")
async def get_task_categories(user: dict = Depends(get_current_user_dep())):
    """Get all task categories (activity types for collections)"""
    categories = await get_db().task_categories.find({}, {"_id": 0}).to_list(100)
    return categories

@app.post("/api/task-categories")
async def create_task_category(data: TaskCategoryCreate, user: dict = Depends(get_current_user_dep())):
    """Create a new task category (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Normalize value (lowercase, replace spaces with underscores)
    value = data.value.lower().strip().replace(" ", "_").replace("-", "_")
    
    # Check if category already exists
    existing = await get_db().task_categories.find_one({"value": value})
    if existing:
        raise HTTPException(status_code=400, detail=f"Task category '{value}' already exists")
    
    cat_doc = {
        "value": value,
        "label": data.label.strip(),
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await get_db().task_categories.insert_one(cat_doc)
    
    return {"value": value, "label": data.label.strip()}

@app.put("/api/task-categories/{category_value}")
async def update_task_category(category_value: str, data: TaskCategoryUpdate, user: dict = Depends(get_current_user_dep())):
    """Update a task category (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check if category exists
    existing = await get_db().task_categories.find_one({"value": category_value})
    if not existing:
        raise HTTPException(status_code=404, detail="Task category not found")
    
    update_data = {}
    if data.label is not None:
        update_data["label"] = data.label.strip()
    
    if update_data:
        await get_db().task_categories.update_one({"value": category_value}, {"$set": update_data})
    
    updated = await get_db().task_categories.find_one({"value": category_value}, {"_id": 0})
    return updated

@app.delete("/api/task-categories/{category_value}")
async def delete_task_category(category_value: str, user: dict = Depends(get_current_user_dep())):
    """Delete a task category (admin only)"""
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    # Check if category exists
    existing = await get_db().task_categories.find_one({"value": category_value})
    if not existing:
        raise HTTPException(status_code=404, detail="Task category not found")
    
    await get_db().task_categories.delete_one({"value": category_value})
    
    return {"status": "deleted", "category": category_value}

@app.post("/api/items")
async def create_item(data: ItemCreate, user: dict = Depends(get_current_user_dep())):
    # Allow all authenticated users to add items (not just admins)
    # Admins retain edit/delete permissions
    
    # Validate category against master list
    normalized_category = normalize_category(data.category)
    if not normalized_category or normalized_category not in VALID_CATEGORY_VALUES:
        raise HTTPException(
            status_code=400, 
            detail=f"Invalid category '{data.category}'. Valid categories: {', '.join(VALID_CATEGORY_VALUES)}"
        )
    
    # For unique categories, item_name is required
    if normalized_category in UNIQUE_CATEGORIES:
        if not data.item_name or data.item_name.strip() == "":
            raise HTTPException(status_code=400, detail="Item name/ID is required for this category")
        # Check for duplicate item name
        existing = await get_db().items.find_one({"item_name": data.item_name})
        if existing:
            raise HTTPException(status_code=400, detail="Item already exists")
        item_name = data.item_name.strip()
    else:
        # For non-unique categories, auto-generate name if not provided
        if not data.item_name or data.item_name.strip() == "" or data.item_name == normalized_category:
            count = await get_db().items.count_documents({"category": normalized_category})
            item_name = f"{normalized_category.upper().replace('_', '-')}-BULK-{count + 1}"
        else:
            item_name = data.item_name.strip()
    
    doc = {
        "item_name": item_name,
        "item_id": item_name,  # Add item_id for consistency
        "category": normalized_category,  # Use normalized category
        "tracking_type": data.tracking_type,
        "status": data.status,
        "current_location": data.current_location,
        "quantity": data.quantity if data.tracking_type == "quantity" else 1
    }
    await get_db().items.insert_one(doc)
    # Return without _id
    return {
        "item_name": item_name,
        "item_id": item_name,
        "category": normalized_category,
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
    
    # Deployment managers see deployments where they're in morning_managers, night_managers, or legacy deployment_managers
    if user["role"] == "deployment_manager":
        manager_filter = {
            "$or": [
                {"morning_managers": user["id"]},
                {"night_managers": user["id"]},
                {"evening_managers": user["id"]},  # Legacy support
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
        # Manager can see deployment if they're in morning_managers OR night_managers
        query["$or"] = [
            {"morning_managers": user["id"]},
            {"night_managers": user["id"]},
            {"evening_managers": user["id"]},  # Legacy support
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
    
    # Validate at least one manager (morning or night)
    has_managers = (data.morning_managers and len(data.morning_managers) > 0) or \
                   (data.night_managers and len(data.night_managers) > 0) or \
                   (data.deployment_managers and len(data.deployment_managers) > 0)
    if not has_managers:
        raise HTTPException(status_code=400, detail="At least one manager is required (morning or night)")
    
    doc = {
        "id": f"dep-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:18]}",
        "date": data.date,  # THIS IS THE SINGLE SOURCE OF TRUTH
        "bnb": data.bnb,
        "morning_managers": data.morning_managers or [],
        "night_managers": data.night_managers or [],
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
        "night_managers": data.night_managers,
        "assigned_kits": data.assigned_kits,
        # Update legacy field too
        "deployment_managers": data.morning_managers + data.night_managers
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
    Returns structure: { bnbs: [ { bnb: "BnB 1", morning: {...}, night: {...} } ] }
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
        # Normalize evening to night
        if shift == "evening":
            shift = "night"
        
        if bnb not in bnb_groups:
            bnb_groups[bnb] = {
                "bnb": bnb,
                "morning": None,
                "night": None
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

@app.post("/api/events/transfer-quantity")
async def transfer_quantity(data: QuantityTransferCreate, user: dict = Depends(get_current_user_dep())):
    """
    Transfer quantity-based items (NON-UNIQUE categories) between locations.
    This reduces quantity at source and increases at destination.
    """
    # Validate category
    if data.category not in NON_UNIQUE_CATEGORIES:
        raise HTTPException(
            status_code=400, 
            detail=f"Category '{data.category}' is not a quantity-based category"
        )
    
    # Find items of this category at the source location
    source_items = await get_db().items.find({
        "category": data.category,
        "current_location": data.from_location,
        "status": "active"
    }).to_list(100)
    
    if not source_items:
        raise HTTPException(
            status_code=400, 
            detail=f"No {data.category} items found at {data.from_location}"
        )
    
    # Calculate total available quantity at source
    total_available = sum(item.get("quantity", 1) for item in source_items)
    
    if total_available < data.quantity:
        raise HTTPException(
            status_code=400, 
            detail=f"Not enough items. Available: {total_available}, Requested: {data.quantity}"
        )
    
    # Reduce quantity from source item(s)
    remaining_to_transfer = data.quantity
    for item in source_items:
        if remaining_to_transfer <= 0:
            break
        
        item_qty = item.get("quantity", 1)
        if item_qty <= remaining_to_transfer:
            # Transfer entire item (or delete if qty becomes 0)
            await get_db().items.update_one(
                {"item_name": item["item_name"]},
                {"$set": {"current_location": data.to_location}}
            )
            remaining_to_transfer -= item_qty
        else:
            # Split: reduce source quantity, create/update destination item
            new_source_qty = item_qty - remaining_to_transfer
            await get_db().items.update_one(
                {"item_name": item["item_name"]},
                {"$set": {"quantity": new_source_qty}}
            )
            
            # Check if destination already has this category
            dest_item = await get_db().items.find_one({
                "category": data.category,
                "current_location": data.to_location,
                "status": "active"
            })
            
            if dest_item:
                # Add to existing destination item
                await get_db().items.update_one(
                    {"item_name": dest_item["item_name"]},
                    {"$inc": {"quantity": remaining_to_transfer}}
                )
            else:
                # Create new item at destination
                count = await get_db().items.count_documents({"category": data.category})
                new_item_name = f"{data.category.upper().replace('_', '-')}-BULK-{count + 1}"
                await get_db().items.insert_one({
                    "item_name": new_item_name,
                    "item_id": new_item_name,
                    "category": data.category,
                    "tracking_type": "quantity",
                    "status": "active",
                    "current_location": data.to_location,
                    "quantity": remaining_to_transfer
                })
            
            remaining_to_transfer = 0
    
    # Record the transfer event
    event_doc = {
        "id": f"evt-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:18]}",
        "event_type": "transfer",
        "user": user["id"],
        "user_name": user["name"],
        "item": f"{data.category} (x{data.quantity})",
        "from_location": data.from_location,
        "to_location": data.to_location,
        "quantity": data.quantity,
        "notes": data.notes,
        "deployment_date": get_operational_date(),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await get_db().events.insert_one(event_doc)
    event_doc.pop("_id", None)
    
    return {
        "status": "success",
        "transferred": data.quantity,
        "category": data.category,
        "from": data.from_location,
        "to": data.to_location,
        "event": event_doc
    }

@app.post("/api/events/damage-lost-quantity")
async def damage_lost_quantity(data: QuantityDamageLostCreate, user: dict = Depends(get_current_user_dep())):
    """
    Mark quantity-based items (NON-UNIQUE categories) as damaged or lost at a specific location.
    This reduces the quantity at the source location.
    """
    # Validate category
    if data.category not in NON_UNIQUE_CATEGORIES:
        raise HTTPException(
            status_code=400, 
            detail=f"Category '{data.category}' is not a quantity-based category"
        )
    
    # Validate status
    if data.status not in ["damaged", "lost"]:
        raise HTTPException(status_code=400, detail="Status must be 'damaged' or 'lost'")
    
    # Find items of this category at the source location
    source_items = await get_db().items.find({
        "category": data.category,
        "current_location": data.from_location,
        "status": "active"
    }).to_list(100)
    
    if not source_items:
        raise HTTPException(
            status_code=400, 
            detail=f"No {data.category} items found at {data.from_location}"
        )
    
    # Calculate total available quantity at source
    total_available = sum(item.get("quantity", 1) for item in source_items)
    
    if total_available < data.quantity:
        raise HTTPException(
            status_code=400, 
            detail=f"Not enough items. Available: {total_available}, Requested: {data.quantity}"
        )
    
    # Reduce quantity from source item(s) and mark as damaged/lost
    remaining_to_mark = data.quantity
    affected_items = []
    
    for item in source_items:
        if remaining_to_mark <= 0:
            break
        
        item_qty = item.get("quantity", 1)
        if item_qty <= remaining_to_mark:
            # Mark entire item as damaged/lost
            await get_db().items.update_one(
                {"item_name": item["item_name"]},
                {"$set": {"status": data.status}}
            )
            affected_items.append({"item": item["item_name"], "quantity": item_qty})
            remaining_to_mark -= item_qty
        else:
            # Split: reduce source quantity, create a new item marked as damaged/lost
            new_source_qty = item_qty - remaining_to_mark
            await get_db().items.update_one(
                {"item_name": item["item_name"]},
                {"$set": {"quantity": new_source_qty}}
            )
            
            # Create new item record for the damaged/lost portion
            count = await get_db().items.count_documents({"category": data.category})
            new_item_name = f"{data.category.upper().replace('_', '-')}-{data.status.upper()}-{count + 1}"
            await get_db().items.insert_one({
                "item_name": new_item_name,
                "item_id": new_item_name,
                "category": data.category,
                "tracking_type": "quantity",
                "status": data.status,
                "current_location": data.from_location,
                "quantity": remaining_to_mark
            })
            affected_items.append({"item": new_item_name, "quantity": remaining_to_mark})
            remaining_to_mark = 0
    
    # Record the event
    event_doc = {
        "id": f"evt-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:18]}",
        "event_type": data.status,  # "damaged" or "lost"
        "user": user["id"],
        "user_name": user["name"],
        "item": f"{data.category} (x{data.quantity})",
        "from_location": data.from_location,
        "to_location": None,
        "quantity": data.quantity,
        "notes": data.notes,
        "deployment_date": get_operational_date(),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await get_db().events.insert_one(event_doc)
    event_doc.pop("_id", None)
    
    return {
        "status": "success",
        "marked_as": data.status,
        "quantity": data.quantity,
        "category": data.category,
        "location": data.from_location,
        "affected_items": affected_items,
        "event": event_doc
    }

@app.post("/api/events/transfer-kit")
async def transfer_full_kit(data: FullKitTransferCreate, user: dict = Depends(get_current_user_dep())):
    """
    Transfer ALL items in a kit to a new location.
    This moves every item (unique and non-unique) that currently has location = kit:KIT_ID
    to the new destination.
    
    Note: Damaged and lost items are NOT moved (they stay as-is).
    """
    kit_location = f"kit:{data.kit_id}"
    
    # Find all items currently in this kit (excluding damaged/lost)
    kit_items = await get_db().items.find({
        "current_location": kit_location,
        "status": {"$nin": ["damaged", "lost"]}  # Only move active items
    }).to_list(500)
    
    if not kit_items:
        raise HTTPException(
            status_code=400,
            detail=f"No active items found in {data.kit_id}"
        )
    
    # Move all items to the new location
    moved_items = []
    for item in kit_items:
        await get_db().items.update_one(
            {"item_name": item["item_name"]},
            {"$set": {"current_location": data.to_location}}
        )
        moved_items.append({
            "item_name": item["item_name"],
            "category": item.get("category"),
            "quantity": item.get("quantity", 1)
        })
    
    # Record the transfer event
    event_doc = {
        "id": f"evt-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S%f')[:18]}",
        "event_type": "kit_transfer",
        "user": user["id"],
        "user_name": user["name"],
        "item": f"Full Kit: {data.kit_id}",
        "from_location": kit_location,
        "to_location": data.to_location,
        "quantity": len(moved_items),
        "notes": data.notes,
        "items_moved": [item["item_name"] for item in moved_items],
        "deployment_date": get_operational_date(),
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    await get_db().events.insert_one(event_doc)
    event_doc.pop("_id", None)
    
    return {
        "status": "success",
        "kit_id": data.kit_id,
        "from_location": kit_location,
        "to_location": data.to_location,
        "items_moved": len(moved_items),
        "items": moved_items,
        "event": event_doc
    }

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
    """Start a new collection record for a specific kit - with strict access control and multi-device safety"""
    
    # Get deployment details first
    deployment = await get_db().deployments.find_one({"id": data.deployment_id})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    # Get shift from request or default to morning
    shift_value = getattr(data, 'shift', 'morning') or 'morning'
    # Normalize evening to night
    if shift_value == "evening":
        shift_value = "night"
    
    # === ROLE-BASED ACCESS CONTROL (CRITICAL) ===
    # User must be assigned to THIS SPECIFIC SHIFT (morning/night)
    if user["role"] != "admin":
        if shift_value == "morning":
            authorized_managers = deployment.get("morning_managers", [])
        else:
            # Support both night_managers and legacy evening_managers
            authorized_managers = deployment.get("night_managers", []) or deployment.get("evening_managers", [])
        
        if user["id"] not in authorized_managers:
            raise HTTPException(
                status_code=403, 
                detail=f"Not authorized for {shift_value} shift. You must be assigned to this shift to start collection."
            )
    
    # === MULTI-DEVICE SAFETY (CRITICAL) ===
    # Check if this kit already has an active/paused record FOR THE SAME SHIFT
    # This prevents duplicate sessions from multiple devices
    existing = await get_db().shifts.find_one({
        "kit": data.kit, 
        "deployment_id": data.deployment_id, 
        "shift": shift_value,
        "status": {"$in": ["active", "paused"]}
    })
    if existing:
        raise HTTPException(
            status_code=409,  # Conflict status code for duplicate resource
            detail=f"Collection already active on {data.kit} for {shift_value} shift. Stop it first before starting a new one."
        )
    
    now = datetime.now(timezone.utc)
    # CRITICAL: Use deployment["date"] as the SINGLE SOURCE OF TRUTH
    record = {
        "id": f"rec-{now.strftime('%Y%m%d%H%M%S%f')[:18]}",
        "deployment_id": data.deployment_id,
        "date": deployment["date"],  # SINGLE SOURCE OF TRUTH
        "shift": shift_value,
        "bnb": deployment["bnb"],
        "user": user["id"],
        "user_name": user["name"],
        "kit": data.kit,
        "ssd_used": data.ssd_used,
        "activity_type": data.activity_type,
        "status": "active",
        "start_time": now.isoformat(),
        "pauses": [],
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
    """Pause an active collection record - only authorized shift managers can pause"""
    # First find the record
    shift = await get_db().shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Collection record not found")
    
    # === ROLE-BASED ACCESS CONTROL (CRITICAL) ===
    # User must be assigned to THIS SPECIFIC SHIFT (morning/night)
    if user["role"] != "admin":
        deployment = await get_db().deployments.find_one({"id": shift.get("deployment_id")})
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        record_shift = shift.get("shift", "morning")
        if record_shift == "morning":
            authorized_managers = deployment.get("morning_managers", [])
        else:
            authorized_managers = deployment.get("night_managers", []) or deployment.get("evening_managers", [])
        
        if user["id"] not in authorized_managers:
            raise HTTPException(
                status_code=403, 
                detail=f"Not authorized for {record_shift} shift. Only assigned managers can control this collection."
            )
    
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
    """Resume a paused collection record - only authorized shift managers can resume"""
    # First find the record
    shift = await get_db().shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Collection record not found")
    
    # === ROLE-BASED ACCESS CONTROL (CRITICAL) ===
    # User must be assigned to THIS SPECIFIC SHIFT (morning/night)
    if user["role"] != "admin":
        deployment = await get_db().deployments.find_one({"id": shift.get("deployment_id")})
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        record_shift = shift.get("shift", "morning")
        if record_shift == "morning":
            authorized_managers = deployment.get("morning_managers", [])
        else:
            authorized_managers = deployment.get("night_managers", []) or deployment.get("evening_managers", [])
        
        if user["id"] not in authorized_managers:
            raise HTTPException(
                status_code=403, 
                detail=f"Not authorized for {record_shift} shift. Only assigned managers can control this collection."
            )
    
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
    """Stop a collection record - only authorized shift managers can stop"""
    # First find the record
    shift = await get_db().shifts.find_one({"id": shift_id})
    if not shift:
        raise HTTPException(status_code=404, detail="Collection record not found")
    
    # === ROLE-BASED ACCESS CONTROL (CRITICAL) ===
    # User must be assigned to THIS SPECIFIC SHIFT (morning/night)
    if user["role"] != "admin":
        deployment = await get_db().deployments.find_one({"id": shift.get("deployment_id")})
        if not deployment:
            raise HTTPException(status_code=404, detail="Deployment not found")
        
        record_shift = shift.get("shift", "morning")
        if record_shift == "morning":
            authorized_managers = deployment.get("morning_managers", [])
        else:
            authorized_managers = deployment.get("night_managers", []) or deployment.get("evening_managers", [])
        
        if user["id"] not in authorized_managers:
            raise HTTPException(
                status_code=403, 
                detail=f"Not authorized for {record_shift} shift. Only assigned managers can control this collection."
            )
    
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
        "shift_type": data.shift_type,  # morning / night
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
        h.get("shift_type") in ["night", "evening"]  # Support both names
        for h in handovers
    )
    
    night_outgoing_complete = any(
        h.get("handover_type") == "outgoing" and 
        h.get("shift_type") in ["night", "evening"]  # Support both names
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
        
        # Add managers from deployment (new structure: morning_managers, night_managers)
        morning_mgrs = dep.get("morning_managers", [])
        night_mgrs = dep.get("night_managers", []) or dep.get("evening_managers", [])
        
        # Also support legacy single deployment_manager field
        legacy_mgr = dep.get("deployment_manager")
        if legacy_mgr and not morning_mgrs and not night_mgrs:
            if shift_type == "morning":
                morning_mgrs = [legacy_mgr]
            else:
                night_mgrs = [legacy_mgr]
        
        # Add manager names (avoid duplicates)
        for mgr_id in morning_mgrs:
            mgr_name = user_map.get(mgr_id, mgr_id)
            if mgr_name not in bnb_data[bnb]["morning_managers"]:
                bnb_data[bnb]["morning_managers"].append(mgr_name)
        
        for mgr_id in night_mgrs:
            mgr_name = user_map.get(mgr_id, mgr_id)
            if mgr_name not in bnb_data[bnb]["night_managers"]:
                bnb_data[bnb]["night_managers"].append(mgr_name)
        
        # Add kits from this deployment
        for kit in dep.get("assigned_kits", []):
            if kit not in bnb_data[bnb]["kits"]:
                bnb_data[bnb]["kits"][kit] = {
                    "kit_id": kit,
                    "total_hours": 0,
                    "morning_hours": 0,  # Shift-wise kit hours
                    "night_hours": 0,    # Shift-wise kit hours
                    "morning_sessions": 0,  # NEW: Session count per shift
                    "night_sessions": 0,    # NEW: Session count per shift
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
                
                # Add to kit's shift-wise hours AND session count
                if record_shift == "morning":
                    bnb_data[bnb]["kits"][kit]["morning_hours"] += hours
                    bnb_data[bnb]["kits"][kit]["morning_sessions"] += 1
                else:
                    bnb_data[bnb]["kits"][kit]["night_hours"] += hours
                    bnb_data[bnb]["kits"][kit]["night_sessions"] += 1
            
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
                
                # Add to kit's shift-wise hours (active sessions count as +1 session)
                if record_shift == "morning":
                    bnb_data[bnb]["kits"][kit]["morning_hours"] += live_hours
                    # Active session counts as 1 session (will be added to completed count)
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
            kit_data["morning_hours"] = round(kit_data.get("morning_hours", 0), 2)
            kit_data["night_hours"] = round(kit_data.get("night_hours", 0), 2)
            kit_data["morning_sessions"] = kit_data.get("morning_sessions", 0)
            kit_data["night_sessions"] = kit_data.get("night_sessions", 0)
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
    """Create a hardware health check for a kit (required before first collection of EACH SHIFT)
    
    Hardware check is SHIFT-SPECIFIC:
    - Morning shift must complete check before first collection
    - Evening/Night shift must ALSO complete check before first collection
    - Each shift is independent (not tied to day or previous shift)
    
    Images can be uploaded immediately or async via separate endpoint
    """
    deployment = await get_db().deployments.find_one({"id": data.deployment_id})
    if not deployment:
        raise HTTPException(status_code=404, detail="Deployment not found")
    
    # Normalize shift_type - accept both "evening" and "night", store as "night"
    normalized_shift_type = data.shift_type
    if data.shift_type == "evening":
        normalized_shift_type = "night"  # Standardize to "night"
    
    # Validate shift_type
    if normalized_shift_type not in ["morning", "night"]:
        raise HTTPException(status_code=400, detail="shift_type must be 'morning' or 'night'")
    
    # Check if already submitted for this kit AND this shift_type (check both names)
    existing = await get_db().hardware_checks.find_one({
        "deployment_id": data.deployment_id,
        "kit": data.kit,
        "date": deployment["date"],
        "shift_type": {"$in": [normalized_shift_type, "evening" if normalized_shift_type == "night" else None]}
    })
    if existing:
        raise HTTPException(status_code=400, detail=f"Hardware check already completed for this kit in {normalized_shift_type} shift")
    
    now = datetime.now(timezone.utc)
    
    # Determine upload status
    has_all_images = bool(data.left_glove_image and data.right_glove_image and data.head_camera_image)
    
    check = {
        "id": f"hw-{now.strftime('%Y%m%d%H%M%S%f')[:18]}",
        "deployment_id": data.deployment_id,
        "date": deployment["date"],
        "bnb": deployment["bnb"],
        "kit": data.kit,
        "shift_type": normalized_shift_type,  # Store normalized shift type ("night" not "evening")
        "user": user["id"],
        "user_name": user["name"],
        "checked_by": user["name"],  # Alias for clarity
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
async def get_hardware_check_status(
    deployment_id: str, 
    kit: str, 
    shift_type: Optional[str] = None,  # Optional for backward compat, but should be provided
    user: dict = Depends(get_current_user_dep())
):
    """Check if hardware check has been completed for a kit in a specific shift
    
    SHIFT-SPECIFIC: Each shift (morning/night) requires its own hardware check.
    If shift_type is provided, checks for that specific shift.
    If not provided, returns status for both shifts.
    """
    deployment = await get_db().deployments.find_one({"id": deployment_id})
    if not deployment:
        return {"completed": False, "morning_completed": False, "night_completed": False}
    
    if shift_type:
        # Normalize shift_type
        normalized = shift_type if shift_type != "evening" else "night"
        
        # Check for specific shift - support both names for backward compat
        existing = await get_db().hardware_checks.find_one({
            "deployment_id": deployment_id,
            "kit": kit,
            "date": deployment["date"],
            "shift_type": {"$in": [normalized, "evening" if normalized == "night" else None]}
        }, {"_id": 0})
        
        return {
            "completed": existing is not None, 
            "shift_type": normalized,  # Return normalized shift type
            "check": existing
        }
    else:
        # Return status for both shifts
        morning_check = await get_db().hardware_checks.find_one({
            "deployment_id": deployment_id,
            "kit": kit,
            "date": deployment["date"],
            "shift_type": "morning"
        }, {"_id": 0})
        
        # Check for night shift - support both "evening" and "night" naming for backward compat
        night_check = await get_db().hardware_checks.find_one({
            "deployment_id": deployment_id,
            "kit": kit,
            "date": deployment["date"],
            "shift_type": {"$in": ["evening", "night"]}  # Support legacy data
        }, {"_id": 0})
        
        return {
            "morning_completed": morning_check is not None,
            "night_completed": night_check is not None,
            "morning_check": morning_check,
            "night_check": night_check,
            # Backward compat: completed = true if either shift has check
            "completed": morning_check is not None or night_check is not None
        }

@app.get("/api/hardware-checks")
async def get_hardware_checks(
    date: Optional[str] = None,
    bnb: Optional[str] = None,
    kit: Optional[str] = None,
    shift_type: Optional[str] = None,  # Filter by shift type
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
    - Can filter by shift_type (morning/night)
    """
    query = {}
    
    if date:
        query["date"] = date
    if bnb:
        query["bnb"] = bnb
    if kit:
        query["kit"] = kit
    if shift_type:
        query["shift_type"] = shift_type
    
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
    debug: bool = False,
    user: dict = Depends(get_current_user_dep())
):
    """
    Get analytics for a date range (defaults to last 7 days). 
    Data baseline: 2026-03-20
    
    SINGLE SOURCE OF TRUTH: collection_records (shifts table)
    - Uses deployment_date for date filtering
    - Includes BOTH completed AND active records
    - Proper pause handling: duration = end_time - start_time - paused_time
    """
    # Analytics baseline date - ignore all data before this
    ANALYTICS_BASELINE = "2026-03-20"
    
    if not end_date:
        end_date = get_operational_date()  # Use operational date, not UTC
    if not start_date:
        # Calculate 6 days before end_date
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        start_dt = end_dt - timedelta(days=6)
        start_date = start_dt.strftime("%Y-%m-%d")
    
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
            "daily_trend": [],
            "debug_info": None
        }
    
    # ========================================
    # STEP 1: Get ALL collection_records (shifts) in date range
    # Use deployment_date as the source of truth for date filtering
    # ========================================
    
    # First, get all deployments in the date range to get deployment_ids
    deployments_in_range = await get_db().deployments.find(
        {"date": {"$gte": start_date, "$lte": end_date}},
        {"_id": 0, "id": 1, "date": 1}
    ).to_list(500)
    
    deployment_ids = [d["id"] for d in deployments_in_range]
    deployment_date_map = {d["id"]: d["date"] for d in deployments_in_range}
    
    # Get all collection_records for these deployments
    all_records = []
    if deployment_ids:
        all_records = await get_db().shifts.find(
            {"deployment_id": {"$in": deployment_ids}},
            {"_id": 0}
        ).to_list(2000)
    
    # ========================================
    # STEP 2: Calculate duration for EACH record
    # - Completed: use stored total_duration_hours
    # - Active/Paused: calculate live duration
    # ========================================
    
    def get_record_duration(record):
        """Get duration in hours for a single record"""
        status = record.get("status", "")
        
        if status == "completed":
            # Use stored duration
            return record.get("total_duration_hours", 0) or 0
        elif status in ["active", "paused"]:
            # Calculate live duration
            return calculate_live_duration_hours(record)
        else:
            return 0
    
    # ========================================
    # STEP 3: Calculate totals - include ALL records
    # ========================================
    
    total_hours = 0
    hours_per_activity = {}
    daily_hours = {}
    
    debug_records = [] if debug else None
    
    for record in all_records:
        duration = get_record_duration(record)
        
        # Get the deployment_date from the record's deployment
        dep_id = record.get("deployment_id")
        record_date = deployment_date_map.get(dep_id) or record.get("date", "")
        
        # Skip if no valid date
        if not record_date:
            continue
        
        # Accumulate total hours
        total_hours += duration
        
        # Accumulate hours per activity
        activity = record.get("activity_type", "other")
        if activity not in hours_per_activity:
            hours_per_activity[activity] = 0
        hours_per_activity[activity] += duration
        
        # Accumulate daily hours (grouped by deployment_date)
        if record_date not in daily_hours:
            daily_hours[record_date] = 0
        daily_hours[record_date] += duration
        
        # Debug info
        if debug:
            debug_records.append({
                "id": record.get("id"),
                "kit": record.get("kit"),
                "bnb": record.get("bnb"),
                "date": record_date,
                "activity_type": activity,
                "status": record.get("status"),
                "duration_hours": round(duration, 4),
                "stored_duration": record.get("total_duration_hours"),
                "total_paused_seconds": record.get("total_paused_seconds", 0)
            })
    
    # ========================================
    # STEP 4: Format response
    # ========================================
    
    # Sort daily trend by date
    daily_trend = [
        {"date": day, "hours": round(hours, 2)}
        for day, hours in sorted(daily_hours.items())
    ]
    
    # Sort activities by hours (descending)
    activity_breakdown = [
        {"activity": act, "hours": round(hours, 2)}
        for act, hours in sorted(hours_per_activity.items(), key=lambda x: -x[1])
    ]
    
    # Total deployments
    total_deployments = len(deployments_in_range)
    
    response = {
        "start_date": start_date,
        "end_date": end_date,
        "total_hours": round(total_hours, 2),
        "total_collection_records": len(all_records),
        "total_deployments": total_deployments,
        "hours_per_activity": activity_breakdown,
        "daily_trend": daily_trend
    }
    
    # Add debug info if requested
    if debug:
        response["debug_info"] = {
            "record_count": len(all_records),
            "records": debug_records,
            "deployment_ids": deployment_ids,
            "calculation_method": "collection_records with live duration for active/paused"
        }
    
    return response

# ========================
# SIMPLIFIED OFFLOAD ROUTES (SSD → HDD Data Transfer)
# ========================

@app.post("/api/offloads")
async def create_offload(data: OffloadCreate, user: dict = Depends(get_current_user_dep())):
    """Simple offload - transfer data from SSDs to HDD with storage tracking"""
    
    # Get or create HDD record
    hdd = await get_db().hdds.find_one({"item_id": data.hdd_id})
    if not hdd:
        # Check if HDD exists in inventory
        inv_hdd = await get_db().inventory.find_one({"item_id": data.hdd_id})
        if not inv_hdd:
            raise HTTPException(status_code=404, detail=f"HDD {data.hdd_id} not found")
        
        # Create HDD tracking record with default 8TB capacity
        hdd = {
            "item_id": data.hdd_id,
            "name": inv_hdd.get("name", data.hdd_id),
            "total_capacity_gb": 8000,  # 8TB default
            "used_storage_gb": 0,
            "status": "active",  # active, sent_to_dc, at_dc, returned
            "offloads": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
        await get_db().hdds.insert_one(hdd)
        hdd.pop("_id", None)
    
    # Validate SSDs exist
    for ssd_id in data.ssd_ids:
        ssd = await get_db().inventory.find_one({"item_id": ssd_id})
        if not ssd:
            raise HTTPException(status_code=404, detail=f"SSD {ssd_id} not found")
    
    # Get ALL collection records from these SSDs (auto-derive dates, BnBs)
    collection_records = await get_db().shifts.find({
        "ssd_used": {"$in": data.ssd_ids},
        "status": "completed",
        "offload_id": {"$exists": False}  # Not already offloaded
    }, {"_id": 0}).to_list(1000)
    
    # Auto-derive dates, BnBs, kits, managers from collection records
    dates = list(set(r.get("date") for r in collection_records if r.get("date")))
    bnbs = list(set(r.get("bnb") for r in collection_records if r.get("bnb")))
    kits = list(set(r.get("kit") for r in collection_records if r.get("kit")))
    managers = list(set(r.get("user_name") for r in collection_records if r.get("user_name")))
    categories = list(set(r.get("activity_type", "Other") for r in collection_records))
    total_hours = sum(r.get("total_duration_hours", 0) or 0 for r in collection_records)
    
    now = datetime.now(timezone.utc)
    offload = {
        "id": f"off-{now.strftime('%Y%m%d%H%M%S%f')[:18]}",
        "hdd_id": data.hdd_id,
        "ssd_ids": data.ssd_ids,
        "transfer_size_gb": data.transfer_size_gb,
        "collection_record_ids": [r.get("id") for r in collection_records],
        # Auto-derived from collection records
        "dates": sorted(dates),
        "bnbs": bnbs,
        "kits": kits,
        "managers": managers,
        "categories": categories,
        "total_hours": round(total_hours, 2),
        "record_count": len(collection_records),
        "notes": data.notes,
        "created_by": user["id"],
        "created_by_name": user["name"],
        "created_at": now.isoformat()
    }
    
    await get_db().offloads.insert_one(offload)
    
    # Update HDD storage
    new_used = (hdd.get("used_storage_gb", 0) or 0) + data.transfer_size_gb
    await get_db().hdds.update_one(
        {"item_id": data.hdd_id},
        {
            "$set": {"used_storage_gb": round(new_used, 2)},
            "$push": {"offloads": offload["id"]}
        }
    )
    
    # Mark SSDs as fresh/available (data has been offloaded)
    for ssd_id in data.ssd_ids:
        await get_db().inventory.update_one(
            {"item_id": ssd_id},
            {"$set": {
                "data_status": "fresh",
                "last_offload_id": offload["id"],
                "last_offload_date": now.isoformat()
            }}
        )
    
    # Link collection records to offload
    for record_id in offload["collection_record_ids"]:
        await get_db().shifts.update_one(
            {"id": record_id},
            {"$set": {"offload_id": offload["id"]}}
        )
    
    offload.pop("_id", None)
    return offload


@app.get("/api/offloads")
async def get_offloads(
    hdd_id: Optional[str] = None,
    skip: int = 0,
    limit: int = 50,
    user: dict = Depends(get_current_user_dep())
):
    """Get all offloads with optional HDD filter"""
    query = {}
    if hdd_id:
        query["hdd_id"] = hdd_id
    
    total = await get_db().offloads.count_documents(query)
    offloads = await get_db().offloads.find(query, {"_id": 0}).sort("created_at", -1).skip(skip).limit(limit).to_list(limit)
    
    return {"offloads": offloads, "total": total}


@app.get("/api/hdds")
async def get_hdds(user: dict = Depends(get_current_user_dep())):
    """Get all HDDs with storage and data visibility"""
    hdds = await get_db().hdds.find({}, {"_id": 0}).to_list(100)
    
    result = []
    for hdd in hdds:
        # Get offloads for this HDD
        offloads = await get_db().offloads.find(
            {"hdd_id": hdd["item_id"]},
            {"_id": 0}
        ).sort("created_at", -1).to_list(100)
        
        # Aggregate data visibility from offloads
        all_dates = []
        all_bnbs = []
        all_kits = []
        total_hours = 0
        
        for off in offloads:
            all_dates.extend(off.get("dates", []))
            all_bnbs.extend(off.get("bnbs", []))
            all_kits.extend(off.get("kits", []))
            total_hours += off.get("total_hours", 0)
        
        total_capacity = hdd.get("total_capacity_gb", 8000)
        used_storage = hdd.get("used_storage_gb", 0)
        
        result.append({
            **hdd,
            "total_capacity_gb": total_capacity,
            "used_storage_gb": round(used_storage, 2),
            "available_storage_gb": round(total_capacity - used_storage, 2),
            "offload_count": len(offloads),
            "total_hours": round(total_hours, 2),
            "data_dates": sorted(list(set(all_dates))),
            "data_bnbs": list(set(all_bnbs)),
            "data_kits": list(set(all_kits)),
            "offloads": offloads
        })
    
    return result


@app.post("/api/hdds")
async def create_hdd(data: HDDCreate, user: dict = Depends(get_current_user_dep())):
    """Create or update HDD tracking record"""
    existing = await get_db().hdds.find_one({"item_id": data.item_id})
    if existing:
        raise HTTPException(status_code=400, detail="HDD already exists")
    
    hdd = {
        "item_id": data.item_id,
        "name": data.name or data.item_id,
        "total_capacity_gb": data.total_capacity_gb,
        "used_storage_gb": 0,
        "status": "active",
        "offloads": [],
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    
    await get_db().hdds.insert_one(hdd)
    hdd.pop("_id", None)
    return hdd


@app.post("/api/hdds/{hdd_id}/reset")
async def reset_hdd(hdd_id: str, data: HDDReset, user: dict = Depends(get_current_user_dep())):
    """Reset HDD when returned from data centre - clears storage and data mapping"""
    hdd = await get_db().hdds.find_one({"item_id": hdd_id})
    if not hdd:
        raise HTTPException(status_code=404, detail="HDD not found")
    
    now = datetime.now(timezone.utc)
    
    # Archive offloads (keep history but mark as archived)
    await get_db().offloads.update_many(
        {"hdd_id": hdd_id},
        {"$set": {"archived": True, "archived_at": now.isoformat(), "archive_reason": data.reason}}
    )
    
    # Reset HDD
    await get_db().hdds.update_one(
        {"item_id": hdd_id},
        {"$set": {
            "used_storage_gb": 0,
            "status": "active",
            "offloads": [],
            "last_reset_at": now.isoformat(),
            "last_reset_reason": data.reason
        }}
    )
    
    updated = await get_db().hdds.find_one({"item_id": hdd_id}, {"_id": 0})
    return updated


@app.patch("/api/hdds/{hdd_id}/status")
async def update_hdd_status(hdd_id: str, status: str, user: dict = Depends(get_current_user_dep())):
    """Update HDD status (active, sent_to_dc, at_dc, returned)"""
    valid_statuses = ["active", "sent_to_dc", "at_dc", "returned"]
    if status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid_statuses}")
    
    hdd = await get_db().hdds.find_one({"item_id": hdd_id})
    if not hdd:
        raise HTTPException(status_code=404, detail="HDD not found")
    
    await get_db().hdds.update_one(
        {"item_id": hdd_id},
        {"$set": {"status": status, "status_updated_at": datetime.now(timezone.utc).isoformat()}}
    )
    
    updated = await get_db().hdds.find_one({"item_id": hdd_id}, {"_id": 0})
    return updated


@app.get("/api/ssds")
async def get_ssds_for_offload(user: dict = Depends(get_current_user_dep())):
    """Get ALL SSDs from items collection for offload selection (no filtering by location/status/assignment)"""
    # Get ALL SSD items from items collection - no filters except category
    ssds = await get_db().items.find(
        {"category": {"$in": ["ssd", "SSD"]}},
        {"_id": 0}
    ).to_list(500)
    
    result = []
    for ssd in ssds:
        ssd_id = ssd.get("item_id") or ssd.get("item_name")
        
        # Get all pending (not offloaded) collection records for this SSD
        pending_records = await get_db().shifts.find({
            "ssd_used": ssd_id,
            "status": "completed",
            "offload_id": {"$exists": False}
        }, {"_id": 0}).to_list(500)
        
        pending_hours = sum(r.get("total_duration_hours", 0) or 0 for r in pending_records)
        pending_dates = list(set(r.get("date") for r in pending_records if r.get("date")))
        pending_bnbs = list(set(r.get("bnb") for r in pending_records if r.get("bnb")))
        
        result.append({
            "item_id": ssd_id,
            "item_name": ssd.get("item_name", ssd_id),
            "category": ssd.get("category", "ssd"),
            "status": ssd.get("status", "active"),
            "current_location": ssd.get("current_location", "Unknown"),
            "has_pending_data": len(pending_records) > 0,
            "pending_record_count": len(pending_records),
            "pending_hours": round(pending_hours, 2),
            "pending_dates": sorted(pending_dates),
            "pending_bnbs": pending_bnbs
        })
    
    return result


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



@app.post("/api/admin/migrate-evening-to-night")
async def migrate_evening_to_night(user: dict = Depends(get_current_user_dep())):
    """
    Data migration: Convert all 'evening' shift references to 'night'.
    This standardizes the shift naming across the entire system.
    Admin only.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    results = {
        "shifts_updated": 0,
        "hardware_checks_updated": 0,
        "handovers_updated": 0,
        "deployments_updated": 0
    }
    
    # 1. Update shifts collection (shift and shift_type fields)
    shifts_result = await get_db().shifts.update_many(
        {"$or": [{"shift": "evening"}, {"shift_type": "evening"}]},
        {"$set": {"shift": "night", "shift_type": "night"}}
    )
    results["shifts_updated"] = shifts_result.modified_count
    
    # 2. Update hardware_checks collection
    hw_result = await get_db().hardware_checks.update_many(
        {"shift_type": "evening"},
        {"$set": {"shift_type": "night"}}
    )
    results["hardware_checks_updated"] = hw_result.modified_count
    
    # 3. Update handovers collection
    handovers_result = await get_db().handovers.update_many(
        {"shift_type": "evening"},
        {"$set": {"shift_type": "night"}}
    )
    results["handovers_updated"] = handovers_result.modified_count
    
    # 4. Rename evening_managers to night_managers in deployments
    # This is a field rename, so we need to use aggregation
    deployments_with_evening = await get_db().deployments.find(
        {"evening_managers": {"$exists": True}}
    ).to_list(1000)
    
    for dep in deployments_with_evening:
        if dep.get("evening_managers"):
            await get_db().deployments.update_one(
                {"_id": dep["_id"]},
                {
                    "$set": {"night_managers": dep.get("evening_managers", [])},
                    "$unset": {"evening_managers": ""}
                }
            )
            results["deployments_updated"] += 1
    
    return {
        "status": "success",
        "message": "Migration complete",
        "results": results
    }

@app.post("/api/admin/fix-missing-shifts")
async def fix_missing_shifts(user: dict = Depends(get_current_user_dep())):
    """
    Data migration: Fix records that are missing the 'shift' field.
    
    LOGIC (Based on deployment assignments, NOT timestamps):
    1. Find the deployment for the record using deployment_id
    2. Check if the user who created the record is in morning_managers or night_managers
    3. If not found, check deployment's shift field
    4. If deployment has only morning_managers or only night_managers, use that
    5. If deployment has legacy deployment_managers (pre-split), check if user is admin
       - Admins default to morning
       - Non-admins default to the first non-empty manager list
    
    Admin only.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    results = {
        "shifts_fixed": 0,
        "shifts_details": [],
        "errors": [],
        "skipped": []
    }
    
    # Find all shifts records missing the 'shift' field or with invalid values
    missing_shift_records = await get_db().shifts.find({
        "$or": [
            {"shift": {"$exists": False}},
            {"shift": None},
            {"shift": ""}
        ]
    }).to_list(1000)
    
    logger.info(f"Found {len(missing_shift_records)} records missing shift field")
    
    # Cache deployments to avoid repeated queries
    deployments_cache = {}
    
    for record in missing_shift_records:
        record_id = record.get("id", str(record.get("_id")))
        deployment_id = record.get("deployment_id")
        record_user = record.get("user")
        assigned_shift = None
        derivation_method = "unknown"
        
        if deployment_id:
            # Get deployment from cache or database
            if deployment_id not in deployments_cache:
                dep = await get_db().deployments.find_one({"id": deployment_id})
                deployments_cache[deployment_id] = dep
            else:
                dep = deployments_cache[deployment_id]
            
            if dep:
                morning_managers = dep.get("morning_managers", []) or []
                night_managers = dep.get("night_managers", []) or dep.get("evening_managers", []) or []
                legacy_managers = dep.get("deployment_managers", []) or []
                dep_shift = dep.get("shift")
                
                # Method 1: Check if user is explicitly in morning_managers or night_managers
                if record_user:
                    if record_user in morning_managers:
                        assigned_shift = "morning"
                        derivation_method = f"user {record_user} in morning_managers"
                    elif record_user in night_managers:
                        assigned_shift = "night"
                        derivation_method = f"user {record_user} in night_managers"
                
                # Method 2: Use deployment's shift field if set
                if not assigned_shift and dep_shift:
                    assigned_shift = "night" if dep_shift == "evening" else dep_shift
                    derivation_method = f"deployment.shift = {dep_shift}"
                
                # Method 3: If deployment has only one type of shift managers, use that
                if not assigned_shift:
                    if morning_managers and not night_managers:
                        assigned_shift = "morning"
                        derivation_method = "deployment has only morning_managers"
                    elif night_managers and not morning_managers:
                        assigned_shift = "night"
                        derivation_method = "deployment has only night_managers"
                
                # Method 4: Legacy deployment with deployment_managers but no split
                # Check if user is in legacy managers - if admin-001, likely morning
                if not assigned_shift and record_user in legacy_managers:
                    # Look up user role
                    user_doc = await get_db().users.find_one({"id": record_user})
                    if user_doc and user_doc.get("role") == "admin":
                        assigned_shift = "morning"
                        derivation_method = f"admin user in legacy deployment_managers, defaulting to morning"
                    else:
                        # For non-admin managers in legacy deployments, we can't determine
                        # Mark as error for manual review
                        pass
        
        # If still no shift assigned, log for manual review
        if not assigned_shift:
            results["errors"].append({
                "id": record_id,
                "kit": record.get("kit"),
                "deployment_id": deployment_id,
                "user": record_user,
                "reason": "Could not derive shift from deployment data - needs manual review"
            })
            continue
        
        # Update the record
        await get_db().shifts.update_one(
            {"_id": record["_id"]},
            {"$set": {"shift": assigned_shift, "shift_type": assigned_shift}}
        )
        
        results["shifts_fixed"] += 1
        results["shifts_details"].append({
            "id": record_id,
            "kit": record.get("kit"),
            "deployment_id": deployment_id,
            "user": record_user,
            "assigned_shift": assigned_shift,
            "derivation_method": derivation_method
        })
    
    return {
        "status": "success",
        "message": f"Fixed {results['shifts_fixed']} records based on deployment assignments. {len(results['errors'])} records need manual review.",
        "details": results
    }


@app.post("/api/admin/rollback-night-to-evening")
async def rollback_night_to_evening(user: dict = Depends(get_current_user_dep())):
    """
    ROLLBACK: Convert all 'night' shift references back to 'evening'.
    Use this if you need to revert the standardization.
    Admin only.
    """
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
    results = {
        "shifts_updated": 0,
        "hardware_checks_updated": 0,
        "handovers_updated": 0,
        "deployments_updated": 0
    }
    
    # 1. Update shifts collection (shift and shift_type fields)
    shifts_result = await get_db().shifts.update_many(
        {"$or": [{"shift": "night"}, {"shift_type": "night"}]},
        {"$set": {"shift": "evening", "shift_type": "evening"}}
    )
    results["shifts_updated"] = shifts_result.modified_count
    
    # 2. Update hardware_checks collection
    hw_result = await get_db().hardware_checks.update_many(
        {"shift_type": "night"},
        {"$set": {"shift_type": "evening"}}
    )
    results["hardware_checks_updated"] = hw_result.modified_count
    
    # 3. Update handovers collection
    handovers_result = await get_db().handovers.update_many(
        {"shift_type": "night"},
        {"$set": {"shift_type": "evening"}}
    )
    results["handovers_updated"] = handovers_result.modified_count
    
    # 4. Rename night_managers back to evening_managers in deployments
    deployments_with_night = await get_db().deployments.find(
        {"night_managers": {"$exists": True}}
    ).to_list(1000)
    
    for dep in deployments_with_night:
        if dep.get("night_managers"):
            await get_db().deployments.update_one(
                {"id": dep["id"]},
                {
                    "$set": {"evening_managers": dep["night_managers"]},
                    "$unset": {"night_managers": ""}
                }
            )
            results["deployments_updated"] += 1
    
    return {
        "message": "ROLLBACK complete - 'night' converted back to 'evening'",
        "results": results,
        "warning": "You will also need to rollback the frontend code to use 'evening' naming"
    }
