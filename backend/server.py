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
    status: Optional[str] = "active"  # active, damaged, repair (for individual items)
    current_kit: Optional[str] = None  # kit_id (for individual items)
    category: Optional[str] = None  # ssd, glove, camera, imu, etc.
    total_capacity_gb: Optional[int] = None  # For SSDs
    side: Optional[str] = None  # For gloves: left, right

class ItemCreate(ItemBase):
    pass

class Item(ItemBase):
    model_config = ConfigDict(extra="ignore")
    id: str
    created_at: str

# Event Models
class EventBase(BaseModel):
    event_type: str  # start_shift, end_shift, pause_kit, resume_kit, activity, transfer, damage, assignment
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
    user_id: str
    bnb_id: str
    kit_ids: List[str]  # Kits assigned to this BnB
    shift_date: str  # YYYY-MM-DD
    shift_team: str  # morning, night

class Assignment(BaseModel):
    model_config = ConfigDict(extra="ignore")
    id: str
    user_id: str
    bnb_id: str
    kit_ids: List[str]
    shift_date: str
    shift_team: str
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

@api_router.get("/items/inventory")
async def get_inventory(current_user: dict = Depends(get_current_user)):
    """Get inventory state derived from events"""
    items = await db.items.find({}, {"_id": 0}).to_list(1000)
    kits = await db.kits.find({}, {"_id": 0}).to_list(1000)
    
    # For quantity-based items, calculate quantities per kit from events
    quantity_items = [item for item in items if item["tracking_type"] == "quantity"]
    inventory = []
    
    for item in items:
        if item["tracking_type"] == "individual":
            inventory.append(item)
        else:
            # Calculate quantities per kit
            for kit in kits:
                # Get all transfer events for this item and kit
                events = await db.events.find({
                    "item_id": item["item_id"],
                    "event_type": "transfer"
                }, {"_id": 0}).sort("timestamp", -1).to_list(1000)
                
                quantity = 0
                for event in events:
                    if event.get("to_kit") == kit["kit_id"]:
                        quantity += event.get("quantity", 0)
                    if event.get("from_kit") == kit["kit_id"]:
                        quantity -= event.get("quantity", 0)
                
                if quantity > 0:
                    inventory.append({
                        **item,
                        "current_kit": kit["kit_id"],
                        "quantity": quantity
                    })
    
    return inventory

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
    """Admin: Assign BnB and kits to user for a shift"""
    if current_user["role"] not in ["admin", "supervisor"]:
        raise HTTPException(status_code=403, detail="Admin access required")
    
    assignment_dict = assignment.model_dump()
    assignment_dict["id"] = f"assign_{datetime.now(timezone.utc).timestamp()}"
    assignment_dict["created_at"] = datetime.now(timezone.utc).isoformat()
    
    await db.assignments.insert_one(assignment_dict)
    
    # Update user's assigned_bnb and shift_team
    await db.users.update_one(
        {"id": assignment.user_id},
        {"$set": {
            "assigned_bnb": assignment.bnb_id,
            "shift_team": assignment.shift_team
        }}
    )
    
    # Update kits to be assigned to this BnB
    for kit_id in assignment.kit_ids:
        await db.kits.update_one(
            {"kit_id": kit_id},
            {"$set": {"assigned_bnb": assignment.bnb_id}}
        )
    
    # Notify the assigned user
    await create_notification(
        assignment.user_id,
        f"You've been assigned to {assignment.bnb_id} for {assignment.shift_date} ({assignment.shift_team} shift)",
        "assignment",
        assignment_dict["id"]
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
        {"id": "kit_8", "kit_id": "STATION-01", "type": "station", "status": "active", "assigned_bnb": None, "created_at": datetime.now(timezone.utc).isoformat()}
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
            "user_id": "user_1",
            "bnb_id": "BNB-01",
            "kit_ids": ["KIT-01", "KIT-02", "KIT-03"],
            "shift_date": today,
            "shift_team": "morning",
            "created_at": datetime.now(timezone.utc).isoformat()
        },
        {
            "id": "assign_2",
            "user_id": "user_2",
            "bnb_id": "BNB-02",
            "kit_ids": ["KIT-04", "KIT-05"],
            "shift_date": today,
            "shift_team": "night",
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

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
