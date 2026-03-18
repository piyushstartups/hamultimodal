from fastapi import FastAPI, APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, Field, ConfigDict
from typing import List, Optional
from datetime import datetime, timezone, timedelta
from passlib.context import CryptContext
import jwt
import os
import logging
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# JWT configuration
SECRET_KEY = os.environ.get('JWT_SECRET', 'your-secret-key-change-in-production')
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7  # 7 days

# Password hashing
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()

# Create the main app without a prefix
app = FastAPI()

# Create a router with the /api prefix
api_router = APIRouter(prefix="/api")

# ========================
# PYDANTIC MODELS
# ========================

# User Models
class UserBase(BaseModel):
    name: str
    role: str  # deployer, station, supervisor, inventory_manager, admin
    default_kit: Optional[str] = None  # kit_id
    assigned_bnb: Optional[str] = None  # bnb kit_id
    shift_team: Optional[str] = None  # morning, night

class UserCreate(UserBase):
    password: str

class UserLogin(BaseModel):
    name: str
    password: str

class User(UserBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_at: str

class UserResponse(UserBase):
    id: str
    created_at: str

# Kit Models
class KitBase(BaseModel):
    kit_id: str
    type: str  # kit, bnb, station
    status: str  # active, idle, paused
    assigned_bnb: Optional[str] = None  # For kits, which BnB they're assigned to

class KitCreate(KitBase):
    pass

class Kit(KitBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_at: str

# Item Models
class ItemBase(BaseModel):
    item_id: str
    item_name: str
    tracking_type: str  # individual, quantity
    status: Optional[str] = "active"  # active, damaged, repair, lost, wear_flag
    current_kit: Optional[str] = None  # kit_id (for individual items)
    category: Optional[str] = None  # ssd, glove, camera, imu, etc.
    total_capacity_gb: Optional[int] = None  # For SSDs
    side: Optional[str] = None  # For gloves: left, right
    description: Optional[str] = None  # Additional details

class ItemCreate(ItemBase):
    pass

class Item(ItemBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_at: str

# Event Models
class EventBase(BaseModel):
    event_type: str  # start_shift, end_shift, pause_kit, resume_kit, activity, transfer, damage, assignment, lost, check_out, check_in, wear_flag, new_addition, repair
    user_id: str
    from_kit: Optional[str] = None
    to_kit: Optional[str] = None
    item_id: Optional[str] = None
    quantity: int = 1
    activity_type: Optional[str] = None  # cooking, cleaning, charging, idle
    damage_type: Optional[str] = None
    severity: Optional[str] = None  # low, medium, high
    ssd_id: Optional[str] = None  # For shift start/end - which SSD
    ssd_space_gb: Optional[int] = None  # For shift end - available space on SSD
    notes: Optional[str] = None
    # Enhanced shift logging fields
    hours_recorded: Optional[float] = None  # Hours of data captured
    data_category: Optional[str] = None  # cooking, cleaning, organizing, mixed, other

class EventCreate(EventBase):
    pass

class Event(EventBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    timestamp: str

# Request Models
class RequestBase(BaseModel):
    requested_by: str  # user_id
    from_kit: str  # kit_id
    item_id: str
    quantity: int = 1
    notes: Optional[str] = None

class RequestCreate(RequestBase):
    pass

class RequestUpdate(BaseModel):
    status: Optional[str] = None  # pending, approved, fulfilled, rejected
    assigned_to: Optional[str] = None
    linked_event_id: Optional[str] = None

class Request(RequestBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    status: str
    assigned_to: Optional[str] = None
    linked_event_id: Optional[str] = None
    timestamp: str

# Notification Models
class Notification(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    message: str
    type: str  # transfer, damage, request, shift
    read: bool = False
    timestamp: str
    related_id: Optional[str] = None

# Handover Models
class HandoverChecklistItem(BaseModel):
    item_id: str
    checked: bool
    notes: Optional[str] = None

class HandoverCreate(BaseModel):
    from_user_id: str
    to_user_id: str
    bnb_id: str
    shift_date: str  # YYYY-MM-DD
    shift_number: int  # 1, 2, 3, 4
    kit_checklist: List[dict]  # List of {kit_id, items: [{item_id, checked, notes}]}
    bnb_checklist: List[HandoverChecklistItem]
    notes: Optional[str] = None

class Handover(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    from_user_id: str
    to_user_id: str
    bnb_id: str
    shift_date: str
    shift_number: int
    kit_checklist: List[dict]
    bnb_checklist: List[dict]
    notes: Optional[str] = None
    status: str  # pending, completed
    timestamp: str

# Assignment Models
class AssignmentCreate(BaseModel):
    bnb_id: str
    kit_ids: List[str]  # Kits assigned to this BnB
    shift_date: str  # YYYY-MM-DD
    morning_team: List[str]  # List of user IDs for morning shift
    night_team: List[str]  # List of user IDs for night shift

class Assignment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    bnb_id: str
    kit_ids: List[str]
    shift_date: str
    morning_team: List[str]
    night_team: List[str]
    created_at: str

# Token Models
class Token(BaseModel):
    access_token: str
    token_type: str

# ========================
# AUTH HELPERS
# ========================

def verify_password(plain_password, hashed_password):
    return pwd_context.verify(plain_password, hashed_password)

def get_password_hash(password):
    return pwd_context.hash(password)

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    try:
        token = credentials.credentials
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        user_id: str = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=401, detail="Invalid authentication credentials")
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.JWTError:
        raise HTTPException(status_code=401, detail="Could not validate credentials")
    
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if user is None:
        raise HTTPException(status_code=401, detail="User not found")
    return user

# ========================
# NOTIFICATION HELPERS
# ========================

async def create_notification(user_id: str, message: str, notification_type: str, related_id: str = None):
    notification = {
        "id": f"notif_{datetime.now(timezone.utc).timestamp()}",
        "user_id": user_id,
        "message": message,
        "type": notification_type,
        "read": False,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "related_id": related_id
    }
    await db.notifications.insert_one(notification)

async def notify_kit_owners(kit_id: str, message: str, notification_type: str, related_id: str = None):
    """Notify all users who have this kit as their default kit"""
    users = await db.users.find({"default_kit": kit_id}, {"_id": 0}).to_list(100)
    for user in users:
        await create_notification(user["id"], message, notification_type, related_id)

# ========================
# AUTH ROUTES
# ========================

@api_router.post("/auth/register", response_model=UserResponse)
async def register(user: UserCreate):
    # Check if user exists
    existing_user = await db.users.find_one({"name": user.name}, {"_id": 0})
    if existing_user:
        raise HTTPException(status_code=400, detail="User already exists")
    
    # Hash password
    hashed_password = get_password_hash(user.password)
    
    # Create user
    user_dict = user.model_dump(exclude={"password"})
    user_dict["id"] = f"user_{datetime.now(timezone.utc).timestamp()}"
    user_dict["password_hash"] = hashed_password
    user_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.users.insert_one(user_dict)
    
    return UserResponse(**{k: v for k, v in user_dict.items() if k != "password_hash"})

@api_router.post("/auth/login", response_model=Token)
async def login(user_login: UserLogin):
    user = await db.users.find_one({"name": user_login.name}, {"_id": 0})
    if not user or not verify_password(user_login.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect username or password")
    
    access_token = create_access_token(data={"sub": user["id"]})
    return {"access_token": access_token, "token_type": "bearer"}

@api_router.get("/auth/me", response_model=UserResponse)
async def get_me(current_user: dict = Depends(get_current_user)):
    return UserResponse(**{k: v for k, v in current_user.items() if k != "password_hash"})

# ========================
# USER ROUTES
# ========================

@api_router.get("/users", response_model=List[UserResponse])
async def get_users(current_user: dict = Depends(get_current_user)):
    users = await db.users.find({}, {"_id": 0, "password_hash": 0}).to_list(1000)
    return users

@api_router.get("/users/{user_id}", response_model=UserResponse)
async def get_user(user_id: str, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user

@api_router.put("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: str, user_update: UserBase, current_user: dict = Depends(get_current_user)):
    user = await db.users.find_one({"id": user_id}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    update_data = user_update.model_dump(exclude_unset=True)
    await db.users.update_one({"id": user_id}, {"$set": update_data})
    
    updated_user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    return updated_user

# ========================
# KIT ROUTES
# ========================

@api_router.get("/kits", response_model=List[Kit])
async def get_kits(current_user: dict = Depends(get_current_user)):
    kits = await db.kits.find({}, {"_id": 0}).to_list(1000)
    return kits

@api_router.post("/kits", response_model=Kit)
async def create_kit(kit: KitCreate, current_user: dict = Depends(get_current_user)):
    # Check if kit_id already exists
    existing_kit = await db.kits.find_one({"kit_id": kit.kit_id}, {"_id": 0})
    if existing_kit:
        raise HTTPException(status_code=400, detail="Kit ID already exists")
    
    kit_dict = kit.model_dump()
    kit_dict["id"] = f"kit_{datetime.now(timezone.utc).timestamp()}"
    kit_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.kits.insert_one(kit_dict)
    return Kit(**kit_dict)

@api_router.get("/kits/{kit_id}", response_model=Kit)
async def get_kit(kit_id: str, current_user: dict = Depends(get_current_user)):
    kit = await db.kits.find_one({"kit_id": kit_id}, {"_id": 0})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit not found")
    return kit

@api_router.put("/kits/{kit_id}", response_model=Kit)
async def update_kit(kit_id: str, kit_update: KitBase, current_user: dict = Depends(get_current_user)):
    kit = await db.kits.find_one({"kit_id": kit_id}, {"_id": 0})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit not found")
    
    update_data = kit_update.model_dump()
    await db.kits.update_one({"kit_id": kit_id}, {"$set": update_data})
    
    updated_kit = await db.kits.find_one({"kit_id": kit_id}, {"_id": 0})
    return updated_kit

# ========================
# ITEM ROUTES
# ========================

@api_router.get("/items", response_model=List[Item])
async def get_items(current_user: dict = Depends(get_current_user)):
    items = await db.items.find({}, {"_id": 0}).to_list(1000)
    return items

@api_router.post("/items", response_model=Item)
async def create_item(item: ItemCreate, current_user: dict = Depends(get_current_user)):
    # Check if item_id already exists
    existing_item = await db.items.find_one({"item_id": item.item_id}, {"_id": 0})
    if existing_item:
        raise HTTPException(status_code=400, detail="Item ID already exists")
    
    item_dict = item.model_dump()
    item_dict["id"] = f"item_{datetime.now(timezone.utc).timestamp()}"
    item_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.items.insert_one(item_dict)
    
    # Log notification for inventory managers
    if current_user["role"] == "inventory_manager":
        supervisors = await db.users.find({"role": "supervisor"}, {"_id": 0}).to_list(100)
        for supervisor in supervisors:
            await create_notification(
                supervisor["id"],
                f"New item added to inventory: {item.item_id} by {current_user['name']}",
                "inventory",
                item_dict["id"]
            )
    
    return Item(**item_dict)

@api_router.get("/items/by-category")
async def get_items_by_category(
    category: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get items filtered by category"""
    query = {}
    if category:
        query["category"] = category
    
    items = await db.items.find(query, {"_id": 0}).to_list(1000)
    return items

@api_router.get("/items/ssds")
async def get_ssds(current_user: dict = Depends(get_current_user)):
    """Get all SSDs for shift tracking"""
    ssds = await db.items.find({"category": "ssd"}, {"_id": 0}).to_list(1000)
    return ssds

@api_router.put("/items/{item_id}")
async def update_item(item_id: str, item_update: ItemBase, current_user: dict = Depends(get_current_user)):
    """Update an item (inventory manager only)"""
    if current_user["role"] not in ["admin", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Inventory manager access required")
    
    item = await db.items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    update_data = item_update.model_dump(exclude_unset=True)
    await db.items.update_one({"item_id": item_id}, {"$set": update_data})
    
    updated_item = await db.items.find_one({"item_id": item_id}, {"_id": 0})
    return updated_item

@api_router.delete("/items/{item_id}")
async def delete_item(item_id: str, current_user: dict = Depends(get_current_user)):
    """Delete an item (inventory manager only)"""
    if current_user["role"] not in ["admin", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Inventory manager access required")
    
    result = await db.items.delete_one({"item_id": item_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Item not found")
    
    return {"status": "success", "message": "Item deleted"}

@api_router.post("/items/bulk-add")
async def bulk_add_items(items: List[ItemCreate], current_user: dict = Depends(get_current_user)):
    """Bulk add items (inventory manager only)"""
    if current_user["role"] not in ["admin", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Inventory manager access required")
    
    created_items = []
    for item in items:
        # Check if item_id already exists
        existing = await db.items.find_one({"item_id": item.item_id}, {"_id": 0})
        if existing:
            continue
        
        item_dict = item.model_dump()
        item_dict["id"] = f"item_{datetime.now(timezone.utc).timestamp()}_{item.item_id}"
        item_dict["created_at"] = datetime.now(timezone.utc).isoformat()
        
        await db.items.insert_one(item_dict)
        created_items.append(item_dict["id"])
    
    return {
        "status": "success",
        "items_created": len(created_items),
        "item_ids": created_items
    }

@api_router.put("/items/{item_id}/report-lost")
async def report_item_lost(item_id: str, notes: Optional[str] = None, current_user: dict = Depends(get_current_user)):
    """Report an item as lost"""
    item = await db.items.find_one({"item_id": item_id}, {"_id": 0})
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    
    # Update item status to lost
    await db.items.update_one(
        {"item_id": item_id},
        {"$set": {"status": "lost"}}
    )
    
    # Create event
    event_dict = {
        "id": f"event_{datetime.now(timezone.utc).timestamp()}",
        "event_type": "lost",
        "user_id": current_user["id"],
        "from_kit": item.get("current_kit"),
        "item_id": item_id,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "notes": notes or "Item reported as lost"
    }
    await db.events.insert_one(event_dict)
    
    # Notify supervisors
    supervisors = await db.users.find({"role": "supervisor"}, {"_id": 0}).to_list(100)
    for supervisor in supervisors:
        await create_notification(
            supervisor["id"],
            f"Lost item reported: {item_id} by {current_user['name']}",
            "lost",
            event_dict["id"]
        )
    
    return {"status": "success", "message": "Item reported as lost"}

@api_router.get("/reports/lost-items")
async def get_lost_items_report(current_user: dict = Depends(get_current_user)):
    """Get report of all lost items with who reported them"""
    lost_items = await db.items.find({"status": "lost"}, {"_id": 0}).to_list(1000)
    
    # Get lost events for each item
    report = []
    for item in lost_items:
        lost_event = await db.events.find_one(
            {"item_id": item["item_id"], "event_type": "lost"},
            {"_id": 0}
        )
        
        if lost_event:
            user = await db.users.find_one({"id": lost_event["user_id"]}, {"_id": 0})
            report.append({
                **item,
                "reported_by": user.get("name") if user else "Unknown",
                "reported_by_id": lost_event["user_id"],
                "reported_at": lost_event["timestamp"],
                "last_known_location": lost_event.get("from_kit"),
                "notes": lost_event.get("notes")
            })
    
    return report

@api_router.get("/reports/ssd-offload")
async def get_ssd_offload_report(current_user: dict = Depends(get_current_user)):
    """Get report of SSDs at data center for offloading"""
    # Get all SSDs at DATA-CENTER
    ssds_at_dc = await db.items.find({
        "category": "ssd",
        "current_kit": "DATA-CENTER"
    }, {"_id": 0}).to_list(1000)
    
    report = []
    for ssd in ssds_at_dc:
        # Get latest transfer event to DATA-CENTER
        transfer_event = await db.events.find_one(
            {
                "item_id": ssd["item_id"],
                "to_kit": "DATA-CENTER",
                "event_type": "transfer"
            },
            {"_id": 0}
        ).sort("timestamp", -1)
        
        # Get latest end_shift event with SSD space
        last_space_event = await db.events.find_one(
            {
                "ssd_id": ssd["item_id"],
                "event_type": "end_shift",
                "ssd_space_gb": {"$ne": None}
            },
            {"_id": 0}
        ).sort("timestamp", -1)
        
        if transfer_event:
            user = await db.users.find_one({"id": transfer_event["user_id"]}, {"_id": 0})
            report.append({
                **ssd,
                "transferred_by": user.get("name") if user else "Unknown",
                "transferred_at": transfer_event["timestamp"],
                "from_kit": transfer_event.get("from_kit"),
                "last_space_gb": last_space_event.get("ssd_space_gb") if last_space_event else None,
                "last_space_logged_at": last_space_event.get("timestamp") if last_space_event else None,
                "days_at_dc": (datetime.now(timezone.utc) - datetime.fromisoformat(transfer_event["timestamp"])).days
            })
    
    return report

@api_router.post("/events/bulk-transfer")
async def bulk_transfer_items(
    item_ids: List[str],
    from_kit: str,
    to_kit: str,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Transfer multiple items at once"""
    created_events = []
    
    for item_id in item_ids:
        item = await db.items.find_one({"item_id": item_id}, {"_id": 0})
        if not item:
            continue
        
        # Create transfer event
        event_dict = {
            "id": f"event_{datetime.now(timezone.utc).timestamp()}_{item_id}",
            "event_type": "transfer",
            "user_id": current_user["id"],
            "from_kit": from_kit,
            "to_kit": to_kit,
            "item_id": item_id,
            "quantity": 1,
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "notes": notes
        }
        await db.events.insert_one(event_dict)
        created_events.append(event_dict["id"])
        
        # Update item location if individual
        if item.get("tracking_type") == "individual":
            await db.items.update_one(
                {"item_id": item_id},
                {"$set": {"current_kit": to_kit}}
            )
    
    # Notify kit owners
    if to_kit:
        await notify_kit_owners(
            to_kit,
            f"Bulk transfer: {len(item_ids)} items received from {from_kit} by {current_user['name']}",
            "transfer",
            None
        )
    if from_kit:
        await notify_kit_owners(
            from_kit,
            f"Bulk transfer: {len(item_ids)} items sent to {to_kit} by {current_user['name']}",
            "transfer",
            None
        )
    
    return {
        "status": "success",
        "items_transferred": len(created_events),
        "event_ids": created_events
    }

@api_router.get("/items/inventory")
async def get_inventory(current_user: dict = Depends(get_current_user)):
    """Get inventory state derived from events - OPTIMIZED with aggregation"""
    items = await db.items.find({}, {"_id": 0}).to_list(1000)
    
    # Separate individual items from quantity-based items
    individual_items = [item for item in items if item.get("tracking_type") == "individual"]
    quantity_items = [item for item in items if item.get("tracking_type") == "quantity"]
    
    inventory = list(individual_items)  # Individual items already have current_kit
    
    if quantity_items:
        # Use aggregation pipeline for quantity-based items
        quantity_item_ids = [item["item_id"] for item in quantity_items]
        
        # Aggregate transfer events to calculate quantities per kit
        pipeline = [
            {"$match": {
                "event_type": "transfer",
                "item_id": {"$in": quantity_item_ids}
            }},
            {"$group": {
                "_id": {"item_id": "$item_id", "kit_id": "$to_kit"},
                "total_in": {"$sum": "$quantity"}
            }},
            {"$lookup": {
                "from": "events",
                "let": {"item_id": "$_id.item_id", "kit_id": "$_id.kit_id"},
                "pipeline": [
                    {"$match": {
                        "$expr": {
                            "$and": [
                                {"$eq": ["$event_type", "transfer"]},
                                {"$eq": ["$item_id", "$$item_id"]},
                                {"$eq": ["$from_kit", "$$kit_id"]}
                            ]
                        }
                    }},
                    {"$group": {"_id": None, "total_out": {"$sum": "$quantity"}}}
                ],
                "as": "outgoing"
            }},
            {"$project": {
                "item_id": "$_id.item_id",
                "kit_id": "$_id.kit_id",
                "quantity": {
                    "$subtract": [
                        "$total_in",
                        {"$ifNull": [{"$arrayElemAt": ["$outgoing.total_out", 0]}, 0]}
                    ]
                }
            }},
            {"$match": {"quantity": {"$gt": 0}}}
        ]
        
        quantity_results = await db.events.aggregate(pipeline).to_list(1000)
        
        # Build a map of quantity items for quick lookup
        item_map = {item["item_id"]: item for item in quantity_items}
        
        for result in quantity_results:
            if result["item_id"] in item_map:
                base_item = item_map[result["item_id"]].copy()
                base_item["current_kit"] = result["kit_id"]
                base_item["quantity"] = result["quantity"]
                inventory.append(base_item)
    
    return inventory

@api_router.get("/items/inventory-summary")
async def get_inventory_summary(current_user: dict = Depends(get_current_user)):
    """Get optimized inventory summary grouped by kit and category"""
    # Get all kits
    kits = await db.kits.find({}, {"_id": 0}).to_list(1000)
    
    # Use aggregation to get item counts by kit and category
    pipeline = [
        {"$match": {"current_kit": {"$ne": None}}},
        {"$group": {
            "_id": {
                "kit": "$current_kit",
                "category": {"$ifNull": ["$category", "uncategorized"]},
                "status": "$status"
            },
            "count": {"$sum": 1},
            "items": {"$push": {
                "item_id": "$item_id",
                "item_name": "$item_name",
                "status": "$status"
            }}
        }},
        {"$group": {
            "_id": {"kit": "$_id.kit", "category": "$_id.category"},
            "total": {"$sum": "$count"},
            "active": {"$sum": {"$cond": [{"$eq": ["$_id.status", "active"]}, "$count", 0]}},
            "damaged": {"$sum": {"$cond": [{"$eq": ["$_id.status", "damaged"]}, "$count", 0]}},
            "lost": {"$sum": {"$cond": [{"$eq": ["$_id.status", "lost"]}, "$count", 0]}},
            "wear_flag": {"$sum": {"$cond": [{"$eq": ["$_id.status", "wear_flag"]}, "$count", 0]}},
            "repair": {"$sum": {"$cond": [{"$eq": ["$_id.status", "repair"]}, "$count", 0]}}
        }},
        {"$sort": {"_id.kit": 1, "_id.category": 1}}
    ]
    
    results = await db.items.aggregate(pipeline).to_list(1000)
    
    # Build kit-based summary
    kit_summary = {}
    for kit in kits:
        kit_summary[kit["kit_id"]] = {
            "kit_id": kit["kit_id"],
            "type": kit["type"],
            "status": kit["status"],
            "categories": {}
        }
    
    for result in results:
        kit_id = result["_id"]["kit"]
        category = result["_id"]["category"]
        
        if kit_id not in kit_summary:
            kit_summary[kit_id] = {
                "kit_id": kit_id,
                "type": "unknown",
                "status": "unknown",
                "categories": {}
            }
        
        kit_summary[kit_id]["categories"][category] = {
            "total": result["total"],
            "active": result["active"],
            "damaged": result["damaged"],
            "lost": result["lost"],
            "wear_flag": result["wear_flag"],
            "repair": result["repair"]
        }
    
    return list(kit_summary.values())

# ========================
# EVENT ROUTES
# ========================

@api_router.get("/events", response_model=List[Event])
async def get_events(
    event_type: Optional[str] = None,
    user_id: Optional[str] = None,
    kit_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if event_type:
        query["event_type"] = event_type
    if user_id:
        query["user_id"] = user_id
    if kit_id:
        query["$or"] = [{"from_kit": kit_id}, {"to_kit": kit_id}]
    
    events = await db.events.find(query, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return events

@api_router.post("/events", response_model=Event)
async def create_event(event: EventCreate, current_user: dict = Depends(get_current_user)):
    event_dict = event.model_dump()
    event_dict["id"] = f"event_{datetime.now(timezone.utc).timestamp()}"
    event_dict["timestamp"] = datetime.now(timezone.utc).isoformat()
    
    await db.events.insert_one(event_dict)
    
    # Handle automations
    if event.event_type == "transfer" and event.item_id:
        item = await db.items.find_one({"item_id": event.item_id}, {"_id": 0})
        if item and item.get("tracking_type") == "individual":
            # Update item location
            await db.items.update_one(
                {"item_id": event.item_id},
                {"$set": {"current_kit": event.to_kit}}
            )
        
        # Notify kit owners
        if event.to_kit:
            await notify_kit_owners(
                event.to_kit,
                f"Item {event.item_id} transferred to your kit",
                "transfer",
                event_dict["id"]
            )
        if event.from_kit:
            await notify_kit_owners(
                event.from_kit,
                f"Item {event.item_id} transferred from your kit",
                "transfer",
                event_dict["id"]
            )
    
    if event.event_type == "damage" and event.item_id:
        item = await db.items.find_one({"item_id": event.item_id}, {"_id": 0})
        if item and item.get("tracking_type") == "individual":
            # Update item status
            await db.items.update_one(
                {"item_id": event.item_id},
                {"$set": {"status": "damaged"}}
            )
        
        # Notify supervisors and kit owner
        supervisors = await db.users.find({"role": "supervisor"}, {"_id": 0}).to_list(100)
        for supervisor in supervisors:
            await create_notification(
                supervisor["id"],
                f"Damage reported: {event.item_id} - {event.severity} severity",
                "damage",
                event_dict["id"]
            )
        
        # Notify kit owner
        if item and item.get("current_kit"):
            await notify_kit_owners(
                item["current_kit"],
                f"Damage reported on your kit's item: {event.item_id}",
                "damage",
                event_dict["id"]
            )
    
    if event.event_type in ["start_shift", "end_shift"]:
        # Log shift change for records
        user = await db.users.find_one({"id": event.user_id}, {"_id": 0})
        kit_name = event.from_kit or user.get("default_kit")
        
        if event.event_type == "start_shift":
            ssd_info = f" with {event.ssd_id}" if event.ssd_id else ""
            if kit_name:
                await notify_kit_owners(
                    kit_name,
                    f"{user['name']} started shift{ssd_info}",
                    "shift",
                    event_dict["id"]
                )
            
            # Notify supervisors about shift start with SSD
            if event.ssd_id:
                supervisors = await db.users.find({"role": "supervisor"}, {"_id": 0}).to_list(100)
                for supervisor in supervisors:
                    await create_notification(
                        supervisor["id"],
                        f"{user['name']} started shift with {event.ssd_id} in {kit_name}",
                        "shift",
                        event_dict["id"]
                    )
        
        if event.event_type == "end_shift":
            ssd_space_info = f" - {event.ssd_space_gb}GB free on {event.ssd_id}" if event.ssd_space_gb and event.ssd_id else ""
            if kit_name:
                await notify_kit_owners(
                    kit_name,
                    f"{user['name']} ended shift{ssd_space_info}",
                    "shift",
                    event_dict["id"]
                )
            
            # Log SSD space for tracking
            if event.ssd_id and event.ssd_space_gb is not None:
                supervisors = await db.users.find({"role": "supervisor"}, {"_id": 0}).to_list(100)
                for supervisor in supervisors:
                    await create_notification(
                        supervisor["id"],
                        f"End of shift: {event.ssd_id} has {event.ssd_space_gb}GB free ({kit_name})",
                        "shift",
                        event_dict["id"]
                    )
    
    if event.event_type == "pause_kit":
        # Update kit status to paused
        if event.from_kit:
            await db.kits.update_one(
                {"kit_id": event.from_kit},
                {"$set": {"status": "paused"}}
            )
            
            user = await db.users.find_one({"id": event.user_id}, {"_id": 0})
            await notify_kit_owners(
                event.from_kit,
                f"Kit paused by {user['name']} - Break",
                "shift",
                event_dict["id"]
            )
    
    if event.event_type == "resume_kit":
        # Update kit status back to active
        if event.from_kit:
            await db.kits.update_one(
                {"kit_id": event.from_kit},
                {"$set": {"status": "active"}}
            )
            
            user = await db.users.find_one({"id": event.user_id}, {"_id": 0})
            await notify_kit_owners(
                event.from_kit,
                f"Kit resumed by {user['name']}",
                "shift",
                event_dict["id"]
            )
    
    if event.event_type == "check_out":
        # When deployer checks out items
        user = await db.users.find_one({"id": event.user_id}, {"_id": 0})
        if event.from_kit:
            await notify_kit_owners(
                event.from_kit,
                f"{user['name']} checked out {event.quantity} x {event.item_id}",
                "checkout",
                event_dict["id"]
            )
    
    if event.event_type == "check_in":
        # When deployer checks in items
        user = await db.users.find_one({"id": event.user_id}, {"_id": 0})
        if event.to_kit:
            await notify_kit_owners(
                event.to_kit,
                f"{user['name']} checked in {event.quantity} x {event.item_id}",
                "checkin",
                event_dict["id"]
            )
    
    if event.event_type == "wear_flag":
        # Mark item as showing wear but still usable
        if event.item_id:
            item = await db.items.find_one({"item_id": event.item_id}, {"_id": 0})
            if item and item.get("tracking_type") == "individual":
                await db.items.update_one(
                    {"item_id": event.item_id},
                    {"$set": {"status": "wear_flag"}}
                )
            
            # Notify inventory managers
            managers = await db.users.find({"role": {"$in": ["inventory_manager", "admin"]}}, {"_id": 0}).to_list(100)
            for manager in managers:
                await create_notification(
                    manager["id"],
                    f"Wear flag: {event.item_id} needs attention",
                    "wear_flag",
                    event_dict["id"]
                )
    
    if event.event_type == "new_addition":
        # New item added to inventory
        managers = await db.users.find({"role": {"$in": ["inventory_manager", "admin"]}}, {"_id": 0}).to_list(100)
        for manager in managers:
            await create_notification(
                manager["id"],
                f"New inventory: {event.quantity} x {event.item_id} added to {event.to_kit}",
                "inventory",
                event_dict["id"]
            )
    
    return Event(**event_dict)

# ========================
# REQUEST ROUTES
# ========================

@api_router.get("/requests", response_model=List[Request])
async def get_requests(
    status_filter: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    query = {}
    if status_filter:
        query["status"] = status_filter
    
    requests = await db.requests.find(query, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return requests

@api_router.post("/requests", response_model=Request)
async def create_request(request: RequestCreate, current_user: dict = Depends(get_current_user)):
    request_dict = request.model_dump()
    request_dict["id"] = f"req_{datetime.now(timezone.utc).timestamp()}"
    request_dict["status"] = "pending"
    request_dict["assigned_to"] = None
    request_dict["linked_event_id"] = None
    request_dict["timestamp"] = datetime.now(timezone.utc).isoformat()
    
    await db.requests.insert_one(request_dict)
    
    # Notify supervisors about new request
    supervisors = await db.users.find({"role": "supervisor"}, {"_id": 0}).to_list(100)
    for supervisor in supervisors:
        await create_notification(
            supervisor["id"],
            f"New request: {request.item_id} from {request.from_kit}",
            "request",
            request_dict["id"]
        )
    
    return Request(**request_dict)

@api_router.put("/requests/{request_id}", response_model=Request)
async def update_request(
    request_id: str,
    request_update: RequestUpdate,
    current_user: dict = Depends(get_current_user)
):
    request_doc = await db.requests.find_one({"id": request_id}, {"_id": 0})
    if not request_doc:
        raise HTTPException(status_code=404, detail="Request not found")
    
    update_data = request_update.model_dump(exclude_unset=True)
    await db.requests.update_one({"id": request_id}, {"$set": update_data})
    
    updated_request = await db.requests.find_one({"id": request_id}, {"_id": 0})
    
    # Notify requester about status change
    if "status" in update_data:
        await create_notification(
            request_doc["requested_by"],
            f"Your request status changed to: {update_data['status']}",
            "request",
            request_id
        )
    
    return updated_request

# ========================
# NOTIFICATION ROUTES
# ========================

@api_router.get("/notifications", response_model=List[Notification])
async def get_notifications(current_user: dict = Depends(get_current_user)):
    notifications = await db.notifications.find(
        {"user_id": current_user["id"]},
        {"_id": 0}
    ).sort("timestamp", -1).limit(50).to_list(50)
    return notifications

@api_router.put("/notifications/{notification_id}/read")
async def mark_notification_read(
    notification_id: str,
    current_user: dict = Depends(get_current_user)
):
    await db.notifications.update_one(
        {"id": notification_id, "user_id": current_user["id"]},
        {"$set": {"read": True}}
    )
    return {"status": "success"}

@api_router.get("/notifications/unread/count")
async def get_unread_count(current_user: dict = Depends(get_current_user)):
    count = await db.notifications.count_documents({
        "user_id": current_user["id"],
        "read": False
    })
    return {"count": count}

# ========================
# ADMIN ROUTES
# ========================

@api_router.post("/admin/assignments", response_model=Assignment)
async def create_assignment(assignment: AssignmentCreate, current_user: dict = Depends(get_current_user)):
    """Admin: Assign BnB and kits with morning/night teams"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    assignment_dict = assignment.model_dump()
    assignment_dict["id"] = f"assign_{datetime.now(timezone.utc).timestamp()}"
    assignment_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.assignments.insert_one(assignment_dict)
    
    # Update all morning team users
    for user_id in assignment.morning_team:
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "assigned_bnb": assignment.bnb_id,
                "shift_team": "morning"
            }}
        )
        await create_notification(
            user_id,
            f"You've been assigned to {assignment.bnb_id} for {assignment.shift_date} (Morning shift)",
            "assignment",
            assignment_dict["id"]
        )
    
    # Update all night team users
    for user_id in assignment.night_team:
        await db.users.update_one(
            {"id": user_id},
            {"$set": {
                "assigned_bnb": assignment.bnb_id,
                "shift_team": "night"
            }}
        )
        await create_notification(
            user_id,
            f"You've been assigned to {assignment.bnb_id} for {assignment.shift_date} (Night shift)",
            "assignment",
            assignment_dict["id"]
        )
    
    # Update kits to be assigned to this BnB
    for kit_id in assignment.kit_ids:
        await db.kits.update_one(
            {"kit_id": kit_id},
            {"$set": {"assigned_bnb": assignment.bnb_id}}
        )
    
    return Assignment(**assignment_dict)

@api_router.get("/admin/assignments")
async def get_assignments(
    shift_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all assignments, optionally filtered by date"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    query = {}
    if shift_date:
        query["shift_date"] = shift_date
    
    assignments = await db.assignments.find(query, {"_id": 0}).sort("shift_date", -1).to_list(1000)
    return assignments

@api_router.get("/admin/assignments/range")
async def get_assignments_range(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get assignments for a date range (for calendar view)"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    assignments = await db.assignments.find({
        "shift_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).sort("shift_date", 1).to_list(1000)
    return assignments

@api_router.put("/admin/assignments/{assignment_id}")
async def update_assignment(
    assignment_id: str,
    assignment: AssignmentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Update an existing assignment"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    existing = await db.assignments.find_one({"id": assignment_id}, {"_id": 0})
    if not existing:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    update_data = assignment.model_dump()
    await db.assignments.update_one({"id": assignment_id}, {"$set": update_data})
    
    # Update kits assignment
    for kit_id in assignment.kit_ids:
        await db.kits.update_one(
            {"kit_id": kit_id},
            {"$set": {"assigned_bnb": assignment.bnb_id}}
        )
    
    # Update users
    for user_id in assignment.morning_team:
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"assigned_bnb": assignment.bnb_id, "shift_team": "morning"}}
        )
    for user_id in assignment.night_team:
        await db.users.update_one(
            {"id": user_id},
            {"$set": {"assigned_bnb": assignment.bnb_id, "shift_team": "night"}}
        )
    
    updated = await db.assignments.find_one({"id": assignment_id}, {"_id": 0})
    return updated

@api_router.delete("/admin/assignments/{assignment_id}")
async def delete_assignment(
    assignment_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Delete an assignment"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    result = await db.assignments.delete_one({"id": assignment_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Assignment not found")
    
    return {"status": "success", "message": "Assignment deleted"}

@api_router.get("/admin/deployment-summary")
async def get_deployment_summary(
    shift_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get comprehensive deployment summary for a specific date"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all assignments for the date
    assignments = await db.assignments.find({"shift_date": shift_date}, {"_id": 0}).to_list(100)
    
    # Get all BnBs
    bnbs = await db.kits.find({"type": "bnb"}, {"_id": 0}).to_list(100)
    
    # Get all kits
    kits = await db.kits.find({"type": "kit"}, {"_id": 0}).to_list(100)
    
    # Get all users (deployers and station workers)
    users = await db.users.find({"role": {"$in": ["deployer", "station"]}}, {"_id": 0, "password_hash": 0}).to_list(100)
    
    # Get shift events for the date
    date_start = f"{shift_date}T00:00:00"
    date_end = f"{shift_date}T23:59:59"
    shift_events = await db.events.find({
        "event_type": {"$in": ["start_shift", "end_shift"]},
        "timestamp": {"$gte": date_start, "$lte": date_end}
    }, {"_id": 0}).to_list(1000)
    
    # Build summary
    summary = {
        "date": shift_date,
        "total_bnbs": len(bnbs),
        "active_bnbs": len(assignments),
        "total_kits": len(kits),
        "deployed_kits": sum(len(a.get("kit_ids", [])) for a in assignments),
        "total_workers": len(users),
        "assigned_workers": sum(len(a.get("morning_team", [])) + len(a.get("night_team", [])) for a in assignments),
        "shifts_started": len([e for e in shift_events if e["event_type"] == "start_shift"]),
        "shifts_ended": len([e for e in shift_events if e["event_type"] == "end_shift"]),
        "assignments": assignments,
        "bnbs": bnbs,
        "available_kits": [k for k in kits if not k.get("assigned_bnb")],
        "available_workers": users
    }
    
    return summary

# ========================
# ANALYTICS ENDPOINTS
# ========================

@api_router.get("/admin/analytics/daily-hours")
async def get_daily_hours_analytics(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get daily hours captured over a date range for trend charts"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Aggregate end_shift events to get hours per day
    pipeline = [
        {"$match": {
            "event_type": "end_shift",
            "timestamp": {"$gte": f"{start_date}T00:00:00", "$lte": f"{end_date}T23:59:59"}
        }},
        {"$addFields": {
            "date": {"$substr": ["$timestamp", 0, 10]},
            "hours": {"$ifNull": ["$hours_recorded", 0]}
        }},
        {"$group": {
            "_id": "$date",
            "total_hours": {"$sum": "$hours"},
            "shift_count": {"$sum": 1}
        }},
        {"$sort": {"_id": 1}},
        {"$project": {
            "date": "$_id",
            "total_hours": 1,
            "shift_count": 1,
            "_id": 0
        }}
    ]
    
    results = await db.events.aggregate(pipeline).to_list(100)
    return results

@api_router.get("/admin/analytics/bnb-performance")
async def get_bnb_performance_analytics(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get performance metrics per BnB for the date range"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all BnBs
    bnbs = await db.kits.find({"type": "bnb"}, {"_id": 0}).to_list(100)
    
    # Get assignments for the date range
    assignments = await db.assignments.find({
        "shift_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Get shift events for the date range
    shift_events = await db.events.find({
        "event_type": {"$in": ["start_shift", "end_shift"]},
        "timestamp": {"$gte": f"{start_date}T00:00:00", "$lte": f"{end_date}T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    # Build performance data per BnB
    bnb_performance = []
    for bnb in bnbs:
        bnb_id = bnb["kit_id"]
        
        # Get kits assigned to this BnB
        bnb_assignments = [a for a in assignments if a.get("bnb_id") == bnb_id]
        kit_ids = set()
        for a in bnb_assignments:
            kit_ids.update(a.get("kit_ids", []))
        
        # Get shifts for these kits
        bnb_shifts = [e for e in shift_events if e.get("from_kit") in kit_ids]
        end_shifts = [e for e in bnb_shifts if e["event_type"] == "end_shift"]
        
        total_hours = sum(e.get("hours_recorded", 0) or 0 for e in end_shifts)
        
        bnb_performance.append({
            "bnb_id": bnb_id,
            "days_active": len(bnb_assignments),
            "total_kits": len(kit_ids),
            "total_shifts": len(end_shifts),
            "total_hours": round(total_hours, 1),
            "avg_hours_per_shift": round(total_hours / len(end_shifts), 1) if end_shifts else 0
        })
    
    return bnb_performance

@api_router.get("/admin/analytics/category-breakdown")
async def get_category_breakdown_analytics(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get data captured by category for pie/bar charts"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Aggregate by data_category
    pipeline = [
        {"$match": {
            "event_type": "end_shift",
            "timestamp": {"$gte": f"{start_date}T00:00:00", "$lte": f"{end_date}T23:59:59"}
        }},
        {"$group": {
            "_id": {"$ifNull": ["$data_category", "unspecified"]},
            "total_hours": {"$sum": {"$ifNull": ["$hours_recorded", 0]}},
            "shift_count": {"$sum": 1}
        }},
        {"$project": {
            "category": "$_id",
            "total_hours": 1,
            "shift_count": 1,
            "_id": 0
        }}
    ]
    
    results = await db.events.aggregate(pipeline).to_list(100)
    return results

@api_router.get("/admin/analytics/inventory-health")
async def get_inventory_health_analytics(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get inventory health issues reported during shifts"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get end_shift events with inventory health in notes
    events = await db.events.find({
        "event_type": "end_shift",
        "timestamp": {"$gte": f"{start_date}T00:00:00", "$lte": f"{end_date}T23:59:59"},
        "notes": {"$regex": "Inventory Issues", "$options": "i"}
    }, {"_id": 0}).to_list(1000)
    
    # Parse health issues from notes
    health_issues = {
        "left_glove": {"wear": 0, "damaged": 0},
        "right_glove": {"wear": 0, "damaged": 0},
        "head_cam": {"wear": 0, "damaged": 0}
    }
    
    for event in events:
        notes = event.get("notes", "")
        if "Left Glove: wear" in notes:
            health_issues["left_glove"]["wear"] += 1
        if "Left Glove: damaged" in notes:
            health_issues["left_glove"]["damaged"] += 1
        if "Right Glove: wear" in notes:
            health_issues["right_glove"]["wear"] += 1
        if "Right Glove: damaged" in notes:
            health_issues["right_glove"]["damaged"] += 1
        if "Head Cam: wear" in notes:
            health_issues["head_cam"]["wear"] += 1
        if "Head Cam: damaged" in notes:
            health_issues["head_cam"]["damaged"] += 1
    
    return {
        "total_shifts_with_issues": len(events),
        "issues": health_issues
    }

@api_router.get("/admin/analytics/worker-performance")
async def get_worker_performance_analytics(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get performance metrics per worker"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Aggregate by user_id
    pipeline = [
        {"$match": {
            "event_type": "end_shift",
            "timestamp": {"$gte": f"{start_date}T00:00:00", "$lte": f"{end_date}T23:59:59"}
        }},
        {"$group": {
            "_id": "$user_id",
            "total_hours": {"$sum": {"$ifNull": ["$hours_recorded", 0]}},
            "shift_count": {"$sum": 1}
        }},
        {"$sort": {"total_hours": -1}},
        {"$project": {
            "user_id": "$_id",
            "total_hours": 1,
            "shift_count": 1,
            "_id": 0
        }}
    ]
    
    results = await db.events.aggregate(pipeline).to_list(100)
    
    # Enrich with user names
    for result in results:
        user = await db.users.find_one({"id": result["user_id"]}, {"_id": 0, "password_hash": 0})
        result["name"] = user["name"] if user else result["user_id"]
    
    return results

@api_router.get("/admin/analytics/overview")
async def get_analytics_overview(
    start_date: str,
    end_date: str,
    current_user: dict = Depends(get_current_user)
):
    """Get comprehensive analytics overview for the date range"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Get all relevant data in parallel-style queries
    end_shifts = await db.events.find({
        "event_type": "end_shift",
        "timestamp": {"$gte": f"{start_date}T00:00:00", "$lte": f"{end_date}T23:59:59"}
    }, {"_id": 0}).to_list(1000)
    
    assignments = await db.assignments.find({
        "shift_date": {"$gte": start_date, "$lte": end_date}
    }, {"_id": 0}).to_list(1000)
    
    # Calculate totals
    total_hours = sum(e.get("hours_recorded", 0) or 0 for e in end_shifts)
    total_shifts = len(end_shifts)
    active_bnbs = len(set(a.get("bnb_id") for a in assignments))
    unique_workers = len(set(e.get("user_id") for e in end_shifts))
    
    # Calculate category distribution
    category_dist = {}
    for e in end_shifts:
        cat = e.get("data_category") or "unspecified"
        category_dist[cat] = category_dist.get(cat, 0) + (e.get("hours_recorded", 0) or 0)
    
    return {
        "period": {"start": start_date, "end": end_date},
        "total_hours": round(total_hours, 1),
        "total_shifts": total_shifts,
        "active_bnbs": active_bnbs,
        "unique_workers": unique_workers,
        "avg_hours_per_shift": round(total_hours / total_shifts, 1) if total_shifts > 0 else 0,
        "category_distribution": category_dist
    }

# ========================
# PHASE 3: HISTORY & ACCOUNTABILITY
# ========================

# Incident Models
class IncidentCreate(BaseModel):
    incident_type: str  # damage, loss, misuse
    item_id: Optional[str] = None
    kit_id: Optional[str] = None
    user_id: str  # Worker responsible
    shift_date: str
    bnb_id: Optional[str] = None
    description: str
    severity: str = "medium"  # low, medium, high
    penalty_amount: Optional[float] = None
    notes: Optional[str] = None

@api_router.get("/history/kit/{kit_id}")
async def get_kit_history(
    kit_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get complete deployment history for a kit"""
    if current_user["role"] not in ["admin", "supervisor", "inventory_manager"]:
        raise HTTPException(status_code=403, detail="Access denied")
    
    # Get kit details
    kit = await db.kits.find_one({"kit_id": kit_id}, {"_id": 0})
    if not kit:
        raise HTTPException(status_code=404, detail="Kit not found")
    
    # Get all assignments where this kit was deployed
    assignments = await db.assignments.find({
        "kit_ids": kit_id
    }, {"_id": 0}).sort("shift_date", -1).to_list(500)
    
    # Get all events for this kit
    events = await db.events.find({
        "$or": [
            {"from_kit": kit_id},
            {"to_kit": kit_id}
        ]
    }, {"_id": 0}).sort("timestamp", -1).to_list(500)
    
    # Get shift events specifically
    shift_events = [e for e in events if e["event_type"] in ["start_shift", "end_shift"]]
    damage_events = [e for e in events if e["event_type"] in ["damage", "lost", "wear_flag"]]
    
    # Calculate stats
    unique_bnbs = list(set(a.get("bnb_id") for a in assignments if a.get("bnb_id")))
    total_shifts = len([e for e in shift_events if e["event_type"] == "end_shift"])
    total_hours = sum(e.get("hours_recorded", 0) or 0 for e in shift_events if e["event_type"] == "end_shift")
    
    return {
        "kit": kit,
        "stats": {
            "total_deployments": len(assignments),
            "unique_bnbs": len(unique_bnbs),
            "total_shifts": total_shifts,
            "total_hours": round(total_hours, 1),
            "damage_incidents": len(damage_events)
        },
        "bnbs_deployed": unique_bnbs,
        "recent_assignments": assignments[:20],
        "recent_events": events[:50],
        "damage_history": damage_events
    }

@api_router.get("/history/worker/{user_id}")
async def get_worker_history(
    user_id: str,
    current_user: dict = Depends(get_current_user)
):
    """Get complete work history for a worker"""
    if current_user["role"] not in ["admin", "supervisor"]:
        # Workers can view their own history
        if current_user["id"] != user_id:
            raise HTTPException(status_code=403, detail="Access denied")
    
    # Get user details
    user = await db.users.find_one({"id": user_id}, {"_id": 0, "password_hash": 0})
    if not user:
        raise HTTPException(status_code=404, detail="Worker not found")
    
    # Get all shifts for this worker
    shift_events = await db.events.find({
        "user_id": user_id,
        "event_type": {"$in": ["start_shift", "end_shift"]}
    }, {"_id": 0}).sort("timestamp", -1).to_list(500)
    
    # Get all assignments where this worker was assigned
    assignments = await db.assignments.find({
        "$or": [
            {"morning_team": user_id},
            {"night_team": user_id}
        ]
    }, {"_id": 0}).sort("shift_date", -1).to_list(500)
    
    # Get incidents involving this worker
    incidents = await db.incidents.find({
        "user_id": user_id
    }, {"_id": 0}).sort("created_at", -1).to_list(100)
    
    # Calculate stats
    end_shifts = [e for e in shift_events if e["event_type"] == "end_shift"]
    total_hours = sum(e.get("hours_recorded", 0) or 0 for e in end_shifts)
    unique_bnbs = list(set(a.get("bnb_id") for a in assignments if a.get("bnb_id")))
    unique_kits = set()
    for e in shift_events:
        if e.get("from_kit"):
            unique_kits.add(e["from_kit"])
    
    # Calculate total penalties
    total_penalties = sum(i.get("penalty_amount", 0) or 0 for i in incidents)
    
    return {
        "worker": user,
        "stats": {
            "total_shifts": len(end_shifts),
            "total_hours": round(total_hours, 1),
            "avg_hours_per_shift": round(total_hours / len(end_shifts), 1) if end_shifts else 0,
            "unique_bnbs": len(unique_bnbs),
            "unique_kits": len(unique_kits),
            "total_incidents": len(incidents),
            "total_penalties": total_penalties
        },
        "bnbs_worked": unique_bnbs,
        "recent_shifts": end_shifts[:20],
        "recent_assignments": assignments[:20],
        "incidents": incidents
    }

@api_router.post("/incidents")
async def create_incident(
    incident: IncidentCreate,
    current_user: dict = Depends(get_current_user)
):
    """Create a new incident record"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    incident_dict = {
        "id": f"INC-{datetime.now(timezone.utc).strftime('%Y%m%d%H%M%S')}",
        **incident.model_dump(),
        "status": "open",
        "created_by": current_user["id"],
        "created_at": datetime.now(timezone.utc).isoformat(),
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    await db.incidents.insert_one(incident_dict)
    
    # Create notification for the worker
    await create_notification(
        incident.user_id,
        f"New incident reported: {incident.incident_type} - {incident.description[:50]}",
        "incident"
    )
    
    # Remove _id before returning
    incident_dict.pop("_id", None)
    return incident_dict

@api_router.get("/incidents")
async def get_incidents(
    status: Optional[str] = None,
    user_id: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get all incidents with optional filters"""
    if current_user["role"] not in ["admin", "supervisor"]:
        # Workers can only see their own incidents
        user_id = current_user["id"]
    
    query = {}
    if status:
        query["status"] = status
    if user_id:
        query["user_id"] = user_id
    
    incidents = await db.incidents.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)
    
    # Enrich with user names
    for incident in incidents:
        user = await db.users.find_one({"id": incident["user_id"]}, {"_id": 0, "password_hash": 0})
        incident["user_name"] = user["name"] if user else incident["user_id"]
    
    return incidents

@api_router.put("/incidents/{incident_id}")
async def update_incident(
    incident_id: str,
    status: str,
    penalty_amount: Optional[float] = None,
    notes: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Update an incident's status or penalty"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    update_data = {
        "status": status,
        "updated_at": datetime.now(timezone.utc).isoformat(),
        "updated_by": current_user["id"]
    }
    if penalty_amount is not None:
        update_data["penalty_amount"] = penalty_amount
    if notes:
        update_data["notes"] = notes
    
    result = await db.incidents.update_one(
        {"id": incident_id},
        {"$set": update_data}
    )
    
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Incident not found")
    
    updated = await db.incidents.find_one({"id": incident_id}, {"_id": 0})
    return updated

@api_router.get("/incidents/summary")
async def get_incidents_summary(
    current_user: dict = Depends(get_current_user)
):
    """Get incidents summary for dashboard"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    # Aggregate by status
    pipeline = [
        {"$group": {
            "_id": "$status",
            "count": {"$sum": 1},
            "total_penalties": {"$sum": {"$ifNull": ["$penalty_amount", 0]}}
        }}
    ]
    
    by_status = await db.incidents.aggregate(pipeline).to_list(10)
    
    # Aggregate by type
    pipeline_type = [
        {"$group": {
            "_id": "$incident_type",
            "count": {"$sum": 1}
        }}
    ]
    
    by_type = await db.incidents.aggregate(pipeline_type).to_list(10)
    
    # Recent incidents
    recent = await db.incidents.find({}, {"_id": 0}).sort("created_at", -1).to_list(5)
    
    return {
        "by_status": {item["_id"]: {"count": item["count"], "penalties": item["total_penalties"]} for item in by_status},
        "by_type": {item["_id"]: item["count"] for item in by_type},
        "recent": recent,
        "total_open": sum(item["count"] for item in by_status if item["_id"] == "open")
    }

@api_router.get("/my-bnb/dashboard")
async def get_my_bnb_dashboard(current_user: dict = Depends(get_current_user)):
    """Get dashboard view for associate's assigned BnB"""
    if not current_user.get("assigned_bnb"):
        raise HTTPException(status_code=404, detail="No BnB assigned to you")
    
    bnb_id = current_user["assigned_bnb"]
    
    # Get BnB details
    bnb = await db.kits.find_one({"kit_id": bnb_id}, {"_id": 0})
    
    # Get all kits assigned to this BnB
    kits = await db.kits.find({"assigned_bnb": bnb_id, "type": "kit"}, {"_id": 0}).to_list(1000)
    
    # Get today's assignment
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assignment = await db.assignments.find_one({
        "bnb_id": bnb_id,
        "shift_date": today
    }, {"_id": 0})
    
    # Get recent events for this BnB and its kits
    kit_ids = [kit["kit_id"] for kit in kits]
    recent_events = await db.events.find({
        "$or": [
            {"from_kit": {"$in": [bnb_id] + kit_ids}},
            {"to_kit": {"$in": [bnb_id] + kit_ids}}
        ]
    }, {"_id": 0}).sort("timestamp", -1).limit(20).to_list(20)
    
    return {
        "bnb": bnb,
        "kits": kits,
        "assignment": assignment,
        "recent_events": recent_events,
        "shift_team": current_user.get("shift_team")
    }

# ========================
# HANDOVER ROUTES
# ========================

@api_router.post("/handovers", response_model=Handover)
async def create_handover(handover: HandoverCreate, current_user: dict = Depends(get_current_user)):
    """Create shift handover checklist"""
    handover_dict = handover.model_dump()
    handover_dict["id"] = f"handover_{datetime.now(timezone.utc).timestamp()}"
    handover_dict["status"] = "pending"
    handover_dict["timestamp"] = datetime.now(timezone.utc).isoformat()
    
    await db.handovers.insert_one(handover_dict)
    
    # Notify the receiving user
    await create_notification(
        handover.to_user_id,
        f"Shift handover from {current_user['name']} for {handover.bnb_id}",
        "handover",
        handover_dict["id"]
    )
    
    return Handover(**handover_dict)

@api_router.get("/handovers")
async def get_handovers(
    bnb_id: Optional[str] = None,
    shift_date: Optional[str] = None,
    current_user: dict = Depends(get_current_user)
):
    """Get handovers filtered by BnB or date"""
    query = {}
    if bnb_id:
        query["bnb_id"] = bnb_id
    if shift_date:
        query["shift_date"] = shift_date
    
    handovers = await db.handovers.find(query, {"_id": 0}).sort("timestamp", -1).to_list(1000)
    return handovers

@api_router.put("/handovers/{handover_id}/complete")
async def complete_handover(handover_id: str, current_user: dict = Depends(get_current_user)):
    """Mark handover as completed"""
    await db.handovers.update_one(
        {"id": handover_id},
        {"$set": {"status": "completed"}}
    )
    
    handover = await db.handovers.find_one({"id": handover_id}, {"_id": 0})
    if handover:
        await create_notification(
            handover["from_user_id"],
            f"Handover completed by {current_user['name']}",
            "handover",
            handover_id
        )
    
    return {"status": "success"}

# ========================
# SEED DATA ROUTE
# ========================

@api_router.post("/seed")
async def seed_data():
    """Seed sample data for testing"""
    
    # Clear existing data
    await db.users.delete_many({})
    await db.kits.delete_many({})
    await db.items.delete_many({})
    await db.events.delete_many({})
    await db.requests.delete_many({})
    await db.notifications.delete_many({})
    
    # Create sample users
    users = [
        {
            "id": "user_1",
            "name": "John Deployer",
            "role": "deployer",
            "default_kit": "KIT-01",
            "assigned_bnb": "BNB-01",
            "shift_team": "morning",
            "password_hash": get_password_hash("password123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "user_2",
            "name": "Sarah Station",
            "role": "station",
            "default_kit": "KIT-04",
            "assigned_bnb": "BNB-02",
            "shift_team": "night",
            "password_hash": get_password_hash("password123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "user_3",
            "name": "Mike Supervisor",
            "role": "supervisor",
            "default_kit": None,
            "assigned_bnb": None,
            "shift_team": None,
            "password_hash": get_password_hash("password123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "user_4",
            "name": "Admin Manager",
            "role": "admin",
            "default_kit": None,
            "assigned_bnb": None,
            "shift_team": None,
            "password_hash": get_password_hash("password123"),
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.users.insert_many(users)
    
    # Create sample kits
    kits = [
        {"id": "kit_1", "kit_id": "KIT-01", "type": "kit", "status": "active", "assigned_bnb": "BNB-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "kit_2", "kit_id": "KIT-02", "type": "kit", "status": "idle", "assigned_bnb": "BNB-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "kit_3", "kit_id": "KIT-03", "type": "kit", "status": "active", "assigned_bnb": "BNB-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "kit_4", "kit_id": "KIT-04", "type": "kit", "status": "active", "assigned_bnb": "BNB-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "kit_5", "kit_id": "KIT-05", "type": "kit", "status": "idle", "assigned_bnb": "BNB-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "kit_6", "kit_id": "BNB-01", "type": "bnb", "status": "active", "assigned_bnb": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "kit_7", "kit_id": "BNB-02", "type": "bnb", "status": "active", "assigned_bnb": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "kit_8", "kit_id": "STATION-01", "type": "station", "status": "active", "assigned_bnb": None, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "kit_9", "kit_id": "DATA-CENTER", "type": "data_center", "status": "active", "assigned_bnb": None, "created_at": datetime.now(timezone.utc).isoformat()}
    ]
    await db.kits.insert_many(kits)
    
    # Create comprehensive inventory items
    items = [
        # Kit 1 Items
        {"id": "item_1", "item_id": "GLOVE-L-001", "item_name": "Glove Left with Dongle", "category": "glove", "side": "left", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_2", "item_id": "GLOVE-R-001", "item_name": "Glove Right with Dongle", "category": "glove", "side": "right", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_3", "item_id": "HEAD-CAM-001", "item_name": "Head Camera", "category": "camera", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_4", "item_id": "IMU-SET-001", "item_name": "IMU Set (5 units)", "category": "imu", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_5", "item_id": "USB-HUB-001", "item_name": "USB Hub", "category": "hub", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_6", "item_id": "L-CABLE-001", "item_name": "L Cable for Head Camera", "category": "cable", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_7", "item_id": "POWER-BANK-001", "item_name": "Power Bank 1", "category": "power", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_8", "item_id": "POWER-BANK-002", "item_name": "Power Bank 2", "category": "power", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_9", "item_id": "SSD-001", "item_name": "SSD Drive 1TB", "category": "ssd", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "total_capacity_gb": 1000, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_10", "item_id": "POWER-ADAPTER-001", "item_name": "Power Adapter", "category": "adapter", "tracking_type": "individual", "status": "active", "current_kit": "KIT-01", "created_at": datetime.now(timezone.utc).isoformat()},
        
        # Kit 2 Items
        {"id": "item_11", "item_id": "GLOVE-L-002", "item_name": "Glove Left with Dongle", "category": "glove", "side": "left", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_12", "item_id": "GLOVE-R-002", "item_name": "Glove Right with Dongle", "category": "glove", "side": "right", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_13", "item_id": "HEAD-CAM-002", "item_name": "Head Camera", "category": "camera", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_14", "item_id": "IMU-SET-002", "item_name": "IMU Set (5 units)", "category": "imu", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_15", "item_id": "USB-HUB-002", "item_name": "USB Hub", "category": "hub", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_16", "item_id": "L-CABLE-002", "item_name": "L Cable for Head Camera", "category": "cable", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_17", "item_id": "POWER-BANK-003", "item_name": "Power Bank 1", "category": "power", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_18", "item_id": "POWER-BANK-004", "item_name": "Power Bank 2", "category": "power", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_19", "item_id": "SSD-002", "item_name": "SSD Drive 1TB", "category": "ssd", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "total_capacity_gb": 1000, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_20", "item_id": "POWER-ADAPTER-002", "item_name": "Power Adapter", "category": "adapter", "tracking_type": "individual", "status": "active", "current_kit": "KIT-02", "created_at": datetime.now(timezone.utc).isoformat()},
        
        # Kit 3 Items
        {"id": "item_21", "item_id": "GLOVE-L-003", "item_name": "Glove Left with Dongle", "category": "glove", "side": "left", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_22", "item_id": "GLOVE-R-003", "item_name": "Glove Right with Dongle", "category": "glove", "side": "right", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_23", "item_id": "HEAD-CAM-003", "item_name": "Head Camera", "category": "camera", "tracking_type": "individual", "status": "damaged", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_24", "item_id": "IMU-SET-003", "item_name": "IMU Set (5 units)", "category": "imu", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_25", "item_id": "USB-HUB-003", "item_name": "USB Hub", "category": "hub", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_26", "item_id": "L-CABLE-003", "item_name": "L Cable for Head Camera", "category": "cable", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_27", "item_id": "POWER-BANK-005", "item_name": "Power Bank 1", "category": "power", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_28", "item_id": "POWER-BANK-006", "item_name": "Power Bank 2", "category": "power", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_29", "item_id": "SSD-003", "item_name": "SSD Drive 2TB", "category": "ssd", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "total_capacity_gb": 2000, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_30", "item_id": "POWER-ADAPTER-003", "item_name": "Power Adapter", "category": "adapter", "tracking_type": "individual", "status": "active", "current_kit": "KIT-03", "created_at": datetime.now(timezone.utc).isoformat()},
        
        # BnB Items
        {"id": "item_31", "item_id": "CHARGE-STATION-001", "item_name": "Charging Station", "category": "charging", "tracking_type": "individual", "status": "active", "current_kit": "BNB-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_32", "item_id": "CHARGE-EXT-001", "item_name": "Charging Extension 1", "category": "charging", "tracking_type": "individual", "status": "active", "current_kit": "BNB-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_33", "item_id": "CHARGE-EXT-002", "item_name": "Charging Extension 2", "category": "charging", "tracking_type": "individual", "status": "active", "current_kit": "BNB-01", "created_at": datetime.now(timezone.utc).isoformat()},
        
        {"id": "item_34", "item_id": "CHARGE-STATION-002", "item_name": "Charging Station", "category": "charging", "tracking_type": "individual", "status": "active", "current_kit": "BNB-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_35", "item_id": "CHARGE-EXT-003", "item_name": "Charging Extension 1", "category": "charging", "tracking_type": "individual", "status": "active", "current_kit": "BNB-02", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_36", "item_id": "CHARGE-EXT-004", "item_name": "Charging Extension 2", "category": "charging", "tracking_type": "individual", "status": "active", "current_kit": "BNB-02", "created_at": datetime.now(timezone.utc).isoformat()},
        
        # Spare items in Station
        {"id": "item_37", "item_id": "SSD-SPARE-001", "item_name": "SSD Drive 1TB (Spare)", "category": "ssd", "tracking_type": "individual", "status": "active", "current_kit": "STATION-01", "total_capacity_gb": 1000, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_38", "item_id": "SSD-SPARE-002", "item_name": "SSD Drive 2TB (Spare)", "category": "ssd", "tracking_type": "individual", "status": "active", "current_kit": "STATION-01", "total_capacity_gb": 2000, "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_39", "item_id": "GLOVE-L-SPARE", "item_name": "Glove Left with Dongle (Spare)", "category": "glove", "side": "left", "tracking_type": "individual", "status": "active", "current_kit": "STATION-01", "created_at": datetime.now(timezone.utc).isoformat()},
        {"id": "item_40", "item_id": "GLOVE-R-SPARE", "item_name": "Glove Right with Dongle (Spare)", "category": "glove", "side": "right", "tracking_type": "individual", "status": "active", "current_kit": "STATION-01", "created_at": datetime.now(timezone.utc).isoformat()},
    ]
    await db.items.insert_many(items)
    
    # Create sample events
    events = [
        {
            "id": "event_1",
            "event_type": "start_shift",
            "user_id": "user_1",
            "from_kit": "KIT-01",
            "ssd_id": "SSD-001",
            "timestamp": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "event_2",
            "event_type": "transfer",
            "user_id": "user_3",
            "from_kit": "STATION-01",
            "to_kit": "KIT-01",
            "item_id": "SSD-001",
            "quantity": 1,
            "timestamp": (datetime.now(timezone.utc) - timedelta(hours=2)).isoformat()
        },
        {
            "id": "event_3",
            "event_type": "damage",
            "user_id": "user_2",
            "from_kit": "KIT-03",
            "item_id": "HEAD-CAM-003",
            "damage_type": "Lens cracked",
            "severity": "high",
            "timestamp": (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        }
    ]
    await db.events.insert_many(events)
    
    # Create sample requests
    requests = [
        {
            "id": "req_1",
            "requested_by": "user_1",
            "from_kit": "STATION-01",
            "item_id": "SSD-SPARE-001",
            "quantity": 1,
            "status": "pending",
            "notes": "Need for deployment",
            "timestamp": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "req_2",
            "requested_by": "user_2",
            "from_kit": "STATION-01",
            "item_id": "GLOVE-L-SPARE",
            "quantity": 1,
            "status": "approved",
            "assigned_to": "user_3",
            "notes": "Replacement needed",
            "timestamp": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.requests.insert_many(requests)
    
    # Create sample assignments
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    assignments = [
        {
            "id": "assign_1",
            "bnb_id": "BNB-01",
            "kit_ids": ["KIT-01", "KIT-02", "KIT-03"],
            "shift_date": today,
            "morning_team": ["user_1"],
            "night_team": [],
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "assign_2",
            "bnb_id": "BNB-02",
            "kit_ids": ["KIT-04", "KIT-05"],
            "shift_date": today,
            "morning_team": [],
            "night_team": ["user_2"],
            "created_at": datetime.now(timezone.utc).isoformat()
        }
    ]
    await db.assignments.insert_many(assignments)
    
    return {"status": "success", "message": "Sample data seeded successfully"}

# Include the router in the main app
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get('CORS_ORIGINS', '*').split(','),
    allow_methods=["*"],
    allow_headers=["*"],
)

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger(__name__)

# ========================
# DATABASE INDEXES
# ========================

async def create_indexes():
    """Create database indexes for query optimization"""
    try:
        # Events collection indexes - critical for performance
        await db.events.create_index([("event_type", 1), ("timestamp", -1)])
        await db.events.create_index([("item_id", 1), ("timestamp", -1)])
        await db.events.create_index([("user_id", 1), ("timestamp", -1)])
        await db.events.create_index([("from_kit", 1)])
        await db.events.create_index([("to_kit", 1)])
        await db.events.create_index([("ssd_id", 1), ("event_type", 1)])
        
        # Items collection indexes
        await db.items.create_index([("item_id", 1)], unique=True)
        await db.items.create_index([("category", 1)])
        await db.items.create_index([("status", 1)])
        await db.items.create_index([("current_kit", 1)])
        
        # Kits collection indexes
        await db.kits.create_index([("kit_id", 1)], unique=True)
        await db.kits.create_index([("type", 1)])
        await db.kits.create_index([("assigned_bnb", 1)])
        
        # Users collection indexes
        await db.users.create_index([("id", 1)], unique=True)
        await db.users.create_index([("name", 1)], unique=True)
        await db.users.create_index([("role", 1)])
        await db.users.create_index([("assigned_bnb", 1)])
        
        # Requests collection indexes
        await db.requests.create_index([("status", 1), ("timestamp", -1)])
        await db.requests.create_index([("requested_by", 1)])
        
        # Notifications collection indexes
        await db.notifications.create_index([("user_id", 1), ("read", 1), ("timestamp", -1)])
        
        # Assignments collection indexes
        await db.assignments.create_index([("bnb_id", 1), ("shift_date", -1)])
        
        # Handovers collection indexes
        await db.handovers.create_index([("bnb_id", 1), ("shift_date", -1)])
        
        logger.info("Database indexes created successfully")
    except Exception as e:
        logger.warning(f"Index creation warning (may already exist): {e}")

@app.on_event("startup")
async def startup_db_client():
    """Initialize database indexes on startup"""
    await create_indexes()

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
