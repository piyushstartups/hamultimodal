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
    tracking_type: str  # individual / quantity
    status: str = "active"  # active / damaged / lost / repair
    current_kit: Optional[str] = None

class DeploymentCreate(BaseModel):
    date: str  # YYYY-MM-DD
    bnb: str
    shift: str  # morning / evening
    assigned_kits: List[str] = []
    assigned_users: List[str] = []
    deployment_manager: str  # user_id

class EventCreate(BaseModel):
    event_type: str  # shift_start, shift_end, transfer, damage, activity
    kit: str
    item: Optional[str] = None
    to_kit: Optional[str] = None
    quantity: int = 1
    data_collected: Optional[float] = None
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
    # Create indexes
    await db.users.create_index("id", unique=True)
    await db.users.create_index("name", unique=True)
    await db.bnbs.create_index("name", unique=True)
    await db.kits.create_index("kit_id", unique=True)
    await db.items.create_index("item_name")
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
    
    doc = {
        "item_name": data.item_name,
        "tracking_type": data.tracking_type,
        "status": data.status,
        "current_kit": data.current_kit
    }
    await db.items.insert_one(doc)
    return {
        "item_name": data.item_name,
        "tracking_type": data.tracking_type,
        "status": data.status,
        "current_kit": data.current_kit
    }

@app.delete("/api/items/{item_name}")
async def delete_item(item_name: str, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    await db.items.delete_one({"item_name": item_name})
    return {"status": "deleted"}

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
    
    # Deployment managers only see their deployments
    if user["role"] == "deployment_manager":
        query["deployment_manager"] = user["id"]
    
    deployments = await db.deployments.find(query, {"_id": 0}).sort("date", -1).to_list(100)
    return deployments

@app.get("/api/deployments/today")
async def get_today_deployments(user: dict = Depends(get_current_user_dep())):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    query = {"date": today}
    
    if user["role"] == "deployment_manager":
        query["deployment_manager"] = user["id"]
    
    return await db.deployments.find(query, {"_id": 0}).to_list(50)

@app.post("/api/deployments")
async def create_deployment(data: DeploymentCreate, user: dict = Depends(get_current_user_dep())):
    if user["role"] != "admin":
        raise HTTPException(status_code=403, detail="Admin only")
    
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
        "deployment_manager": data.deployment_manager,
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
            "deployment_manager": data.deployment_manager
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
        "kit": data.kit,
        "item": data.item,
        "to_kit": data.to_kit,
        "quantity": data.quantity,
        "data_collected": data.data_collected,
        "notes": data.notes,
        "timestamp": datetime.now(timezone.utc).isoformat()
    }
    
    # AUTOMATIONS
    if data.event_type == "transfer" and data.item and data.to_kit:
        # Update item.current_kit for individual items
        await db.items.update_one(
            {"item_name": data.item, "tracking_type": "individual"},
            {"$set": {"current_kit": data.to_kit}}
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
# LIVE DASHBOARD (TODAY ONLY)
# ========================

@app.get("/api/dashboard/live")
async def get_live_dashboard(user: dict = Depends(get_current_user_dep())):
    today = datetime.now(timezone.utc).strftime("%Y-%m-%d")
    
    # Get today's events
    events = await db.events.find(
        {"timestamp": {"$regex": f"^{today}"}},
        {"_id": 0}
    ).to_list(1000)
    
    # Get today's deployments
    deployments = await db.deployments.find({"date": today}, {"_id": 0}).to_list(50)
    
    # Calculate totals
    shift_starts = [e for e in events if e["event_type"] == "shift_start"]
    shift_ends = [e for e in events if e["event_type"] == "shift_end"]
    
    total_data_collected = sum(e.get("data_collected", 0) or 0 for e in events)
    
    # Per BnB stats
    bnb_stats = {}
    for dep in deployments:
        bnb = dep["bnb"]
        if bnb not in bnb_stats:
            bnb_stats[bnb] = {
                "bnb": bnb,
                "shift": dep["shift"],
                "kits": dep["assigned_kits"],
                "shift_starts": 0,
                "shift_ends": 0,
                "data_collected": 0,
                "active_shifts": 0
            }
    
    # Map events to BnBs via kits
    kit_to_bnb = {}
    for dep in deployments:
        for kit in dep.get("assigned_kits", []):
            kit_to_bnb[kit] = dep["bnb"]
    
    for event in events:
        kit = event.get("kit")
        bnb = kit_to_bnb.get(kit)
        if bnb and bnb in bnb_stats:
            if event["event_type"] == "shift_start":
                bnb_stats[bnb]["shift_starts"] += 1
            elif event["event_type"] == "shift_end":
                bnb_stats[bnb]["shift_ends"] += 1
            bnb_stats[bnb]["data_collected"] += event.get("data_collected", 0) or 0
    
    # Calculate active shifts per BnB
    for bnb in bnb_stats:
        bnb_stats[bnb]["active_shifts"] = bnb_stats[bnb]["shift_starts"] - bnb_stats[bnb]["shift_ends"]
    
    return {
        "date": today,
        "total": {
            "shift_starts": len(shift_starts),
            "shift_ends": len(shift_ends),
            "active_shifts": len(shift_starts) - len(shift_ends),
            "data_collected": round(total_data_collected, 2),
            "total_events": len(events)
        },
        "per_bnb": list(bnb_stats.values()),
        "recent_events": events[:10]
    }

# ========================
# HEALTH CHECK
# ========================

@app.get("/api/health")
async def health():
    return {"status": "ok", "version": "2.0"}
