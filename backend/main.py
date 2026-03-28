from fastapi import FastAPI, Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy import create_engine, Column, Integer, String, ForeignKey, Date, func
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker, Session, relationship
from passlib.hash import pbkdf2_sha256
from jose import JWTError, jwt
from datetime import date, datetime, timedelta
from pydantic import BaseModel
from typing import Optional, List

SECRET_KEY = "habittracker-super-secret-key-2024"
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = 60 * 24 * 7

DATABASE_URL = "sqlite:///./habittracker.db"
engine = create_engine(DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

app = FastAPI(title="HabitTracker API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/auth/login")


# ── Models ───────────────────────────────────────────────────────────────────
class User(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    hashed_password = Column(String)
    habits = relationship("Habit", back_populates="owner", cascade="all, delete")

class Habit(Base):
    __tablename__ = "habits"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    streak = Column(Integer, default=0)
    user_id = Column(Integer, ForeignKey("users.id"))
    owner = relationship("User", back_populates="habits")
    logs = relationship("Log", back_populates="habit", cascade="all, delete")

class Log(Base):
    __tablename__ = "logs"
    id = Column(Integer, primary_key=True, index=True)
    habit_id = Column(Integer, ForeignKey("habits.id"))
    execution_date = Column(Date)
    habit = relationship("Habit", back_populates="logs")

Base.metadata.create_all(bind=engine)


# ── Schemas ───────────────────────────────────────────────────────────────────
class UserCreate(BaseModel):
    username: str
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str

class HabitCreate(BaseModel):
    name: str

class HabitUpdate(BaseModel):
    name: str

class BackfillRequest(BaseModel):
    date: str


# ── Helpers ───────────────────────────────────────────────────────────────────
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def create_access_token(data: dict):
    to_encode = data.copy()
    expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme), db: Session = Depends(get_db)):
    exc = HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Недействительный токен", headers={"WWW-Authenticate": "Bearer"})
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        username: str = payload.get("sub")
        if not username:
            raise exc
    except JWTError:
        raise exc
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise exc
    return user

def compute_streak(habit_id: int, db: Session) -> int:
    logs = db.query(Log.execution_date).filter(Log.habit_id == habit_id).order_by(Log.execution_date.desc()).all()
    dates = sorted(set(l[0] for l in logs), reverse=True)
    if not dates:
        return 0
    today = date.today()
    streak = 0
    expected = today
    for d in dates:
        if d == expected:
            streak += 1
            expected -= timedelta(days=1)
        elif d < expected:
            break
    if streak == 0 and dates and dates[0] == today - timedelta(days=1):
        streak = 1
        expected = dates[0] - timedelta(days=1)
        for d in dates[1:]:
            if d == expected:
                streak += 1
                expected -= timedelta(days=1)
            else:
                break
    return streak

def validate_password(password: str):
    if len(password) < 8:
        raise HTTPException(status_code=400, detail="Пароль должен содержать минимум 8 символов")
    if not any(c.isdigit() for c in password):
        raise HTTPException(status_code=400, detail="Пароль должен содержать хотя бы одну цифру")
    if not any(c.isalpha() for c in password):
        raise HTTPException(status_code=400, detail="Пароль должен содержать хотя бы одну букву")


# ── Startup ───────────────────────────────────────────────────────────────────
@app.on_event("startup")
def create_test_user():
    db = SessionLocal()
    try:
        if not db.query(User).filter(User.username == "test").first():
            user = User(username="test", hashed_password=pbkdf2_sha256.hash("test1234"))
            db.add(user)
            db.commit()
            db.refresh(user)
            for name in ["Медитация 10 мин", "Читать 30 мин", "Зарядка"]:
                db.add(Habit(name=name, user_id=user.id))
            db.commit()
    finally:
        db.close()


# ── Auth ──────────────────────────────────────────────────────────────────────
@app.post("/auth/register", response_model=Token)
def register(user_data: UserCreate, db: Session = Depends(get_db)):
    validate_password(user_data.password)
    if db.query(User).filter(User.username == user_data.username).first():
        raise HTTPException(status_code=400, detail="Пользователь уже существует")
    user = User(username=user_data.username, hashed_password=pbkdf2_sha256.hash(user_data.password))
    db.add(user)
    db.commit()
    return {"access_token": create_access_token({"sub": user.username}), "token_type": "bearer"}

@app.post("/auth/login", response_model=Token)
def login(form_data: OAuth2PasswordRequestForm = Depends(), db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == form_data.username).first()
    if not user or not pbkdf2_sha256.verify(form_data.password, user.hashed_password):
        raise HTTPException(status_code=401, detail="Неверный логин или пароль")
    return {"access_token": create_access_token({"sub": user.username}), "token_type": "bearer"}


# ── Habits ────────────────────────────────────────────────────────────────────
@app.get("/habits")
def list_habits(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habits = db.query(Habit).filter(Habit.user_id == current_user.id).all()
    today = date.today()
    week_start = today - timedelta(days=6)
    habit_ids = [h.id for h in habits]

    logs = db.query(Log).filter(Log.habit_id.in_(habit_ids), Log.execution_date >= week_start).all()
    log_map = {}
    for log in logs:
        log_map.setdefault(log.habit_id, set()).add(log.execution_date)

    result = []
    for habit in habits:
        streak = compute_streak(habit.id, db)
        week_history = []
        for i in range(6, -1, -1):
            d = today - timedelta(days=i)
            week_history.append({"date": d.isoformat(), "done": d in log_map.get(habit.id, set())})
        result.append({
            "id": habit.id,
            "name": habit.name,
            "streak": streak,
            "done_today": today in log_map.get(habit.id, set()),
            "week_history": week_history
        })
    return result

@app.post("/habits")
def create_habit(data: HabitCreate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
    habit = Habit(name=data.name.strip(), user_id=current_user.id)
    db.add(habit)
    db.commit()
    db.refresh(habit)
    return {"id": habit.id, "name": habit.name, "streak": 0, "done_today": False, "week_history": []}

@app.patch("/habits/{habit_id}")
def update_habit(habit_id: int, data: HabitUpdate, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.user_id == current_user.id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    if not data.name.strip():
        raise HTTPException(status_code=400, detail="Название не может быть пустым")
    habit.name = data.name.strip()
    db.commit()
    return {"id": habit.id, "name": habit.name}

@app.delete("/habits/{habit_id}")
def delete_habit(habit_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.user_id == current_user.id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    db.delete(habit)
    db.commit()
    return {"ok": True}

@app.post("/habits/{habit_id}/complete")
def complete_habit(habit_id: int, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.user_id == current_user.id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    today = date.today()
    existing = db.query(Log).filter(Log.habit_id == habit_id, Log.execution_date == today).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"toggled": False, "done": False}
    db.add(Log(habit_id=habit_id, execution_date=today))
    db.commit()
    return {"toggled": True, "done": True}

@app.post("/habits/{habit_id}/backfill")
def backfill_habit(habit_id: int, req: BackfillRequest, current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habit = db.query(Habit).filter(Habit.id == habit_id, Habit.user_id == current_user.id).first()
    if not habit:
        raise HTTPException(status_code=404, detail="Привычка не найдена")
    try:
        target_date = date.fromisoformat(req.date)
    except ValueError:
        raise HTTPException(status_code=400, detail="Неверный формат даты")
    if target_date > date.today():
        raise HTTPException(status_code=400, detail="Нельзя отмечать будущие даты")
    existing = db.query(Log).filter(Log.habit_id == habit_id, Log.execution_date == target_date).first()
    if existing:
        db.delete(existing)
        db.commit()
        return {"toggled": False}
    db.add(Log(habit_id=habit_id, execution_date=target_date))
    db.commit()
    return {"toggled": True}


# ── Stats ─────────────────────────────────────────────────────────────────────
@app.get("/stats")
def get_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habits = db.query(Habit).filter(Habit.user_id == current_user.id).all()
    total = len(habits)
    today = date.today()
    done_today = 0
    best_streak = 0
    milestones = []

    for habit in habits:
        streak = compute_streak(habit.id, db)
        if streak > best_streak:
            best_streak = streak
        if db.query(Log).filter(Log.habit_id == habit.id, Log.execution_date == today).first():
            done_today += 1
        if streak >= 7:
            milestones.append({"name": habit.name, "streak": streak, "level": "week"})
        elif streak >= 3:
            milestones.append({"name": habit.name, "streak": streak, "level": "three"})

    return {
        "total": total,
        "done_today": done_today,
        "best_streak": best_streak,
        "milestones": milestones,
        "progress": round(done_today / total * 100) if total else 0
    }

@app.get("/stats/week")
def get_week_stats(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habits = db.query(Habit).filter(Habit.user_id == current_user.id).all()
    habit_ids = [h.id for h in habits]
    today = date.today()
    week_start = today - timedelta(days=6)

    logs = db.query(Log.execution_date, func.count(Log.id)).filter(
        Log.habit_id.in_(habit_ids), Log.execution_date >= week_start
    ).group_by(Log.execution_date).all()

    log_map = {l[0]: l[1] for l in logs}
    total = len(habits)
    days_ru = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"]

    return [
        {"date": (today - timedelta(days=i)).isoformat(),
         "label": days_ru[(today - timedelta(days=i)).weekday()],
         "done": log_map.get(today - timedelta(days=i), 0),
         "total": total}
        for i in range(6, -1, -1)
    ]

@app.get("/export")
def export_data(current_user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    habits = db.query(Habit).filter(Habit.user_id == current_user.id).all()
    return {
        "username": current_user.username,
        "exported_at": datetime.utcnow().isoformat(),
        "habits": [
            {"id": h.id, "name": h.name, "streak": h.streak,
             "logs": [l.execution_date.isoformat() for l in h.logs]}
            for h in habits
        ]
    }
