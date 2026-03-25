from fastapi import FastAPI, HTTPException, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from sqlalchemy import create_engine, Column, Integer, String
from sqlalchemy.orm import declarative_base, sessionmaker, Session
import os
from datetime import datetime
import random
import smtplib
from email.message import EmailMessage

app = FastAPI(title="Incle API")

# DB Setup (SQLite for production simplicity)
SQLALCHEMY_DATABASE_URL = "sqlite:///./subsync.db"
engine = create_engine(SQLALCHEMY_DATABASE_URL, connect_args={"check_same_thread": False})
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()

# DB Models
class DBUser(Base):
    __tablename__ = "users"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, unique=True, index=True)
    password = Column(String)
    name = Column(String)

class DBSubscription(Base):
    __tablename__ = "subscriptions"
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    price = Column(Integer)
    billingDate = Column(Integer)
    category = Column(String)
    iconClass = Column(String)
    bgClass = Column(String)
    user_email = Column(String, index=True)

class VerificationCode(Base):
    __tablename__ = "verification_codes"
    id = Column(Integer, primary_key=True, index=True)
    email = Column(String, index=True)
    code = Column(String)
    expires_at = Column(Integer)

Base.metadata.create_all(bind=engine)

# Dependency
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

# Pydantic Models for Input
class UserCreate(BaseModel):
    email: str
    password: str
    name: str
    verification_code: str

class UserLogin(BaseModel):
    email: str
    password: str

class EmailRequest(BaseModel):
    email: str

class SubscriptionCreate(BaseModel):
    name: str
    price: int
    billingDate: int
    category: str
    iconClass: str
    bgClass: str
    user_email: str

# Endpoints
@app.post("/api/send-code")
def send_code(req: EmailRequest, db: Session = Depends(get_db)):
    code = str(random.randint(100000, 999999))
    expires = int(datetime.utcnow().timestamp()) + 300 # 5 minutes valid
    
    db_code = VerificationCode(email=req.email, code=code, expires_at=expires)
    db.add(db_code)
    db.commit()
    
    # Send email (Real SMTP if configured, otherwise simulated in console)
    smtp_server = os.getenv("SMTP_SERVER", "")
    smtp_user = os.getenv("SMTP_USER", "")
    smtp_pass = os.getenv("SMTP_PASS", "")

    if smtp_server and smtp_user and smtp_pass:
        try:
            msg = EmailMessage()
            msg.set_content(f"Incle 회원가입 인증번호는 [{code}] 입니다.")
            msg['Subject'] = "Incle 인증번호 안내"
            msg['From'] = smtp_user
            msg['To'] = req.email
            with smtplib.SMTP(smtp_server, 587) as server:
                server.starttls()
                server.login(smtp_user, smtp_pass)
                server.send_message(msg)
        except Exception as e:
            print(f"SMTP Error: {e}")
    else:
        # Fallback for demonstration/local runs without SMTP credentials
        print(f"\n{'='*50}\n📧 [SIMULATED EMAIL] To: {req.email}\n👉 Auth Code: {code}\n{'='*50}\n")
        
    return {"message": "Verification code sent"}

@app.post("/api/signup")
def signup(user: UserCreate, db: Session = Depends(get_db)):
    # Verify the code first
    now = int(datetime.utcnow().timestamp())
    valid_code = db.query(VerificationCode).filter(
        VerificationCode.email == user.email,
        VerificationCode.code == user.verification_code,
        VerificationCode.expires_at > now
    ).order_by(VerificationCode.id.desc()).first()

    if not valid_code:
        raise HTTPException(status_code=400, detail="인증번호가 일치하지 않거나 만료되었습니다.")
        
    # Real DB Check
    db_user = db.query(DBUser).filter(DBUser.email == user.email).first()
    if db_user:
        raise HTTPException(status_code=400, detail="이미 가입된 이메일입니다.")
    new_user = DBUser(email=user.email, password=user.password, name=user.name)
    db.add(new_user)
    db.commit()
    db.refresh(new_user)
    return {"message": "success", "user": {"email": new_user.email, "name": new_user.name}}

@app.post("/api/login")
def login(user: UserLogin, db: Session = Depends(get_db)):
    db_user = db.query(DBUser).filter(DBUser.email == user.email).first()
    if not db_user or db_user.password != user.password:
        raise HTTPException(status_code=401, detail="아이디 또는 비밀번호가 일치하지 않습니다.")
    return {"message": "success", "user": {"email": db_user.email, "name": db_user.name}}

@app.post("/api/sync/{email}")
def sync_mock_email(email: str, db: Session = Depends(get_db)):
    # Simulate finding subs from email by populating DB if empty
    existing = db.query(DBSubscription).filter(DBSubscription.user_email == email).count()
    if existing == 0:
        mocks = [
            DBSubscription(name="Netflix 프리미엄", price=17000, billingDate=27, category="Entertain", iconClass="ph-video-camera", bgClass="bg-netflix", user_email=email),
            DBSubscription(name="YouTube Premium", price=14900, billingDate=2, category="Entertain", iconClass="ph-youtube-logo", bgClass="bg-youtube", user_email=email),
            DBSubscription(name="쿠팡 로켓와우", price=4990, billingDate=15, category="Shopping", iconClass="ph-shopping-cart", bgClass="bg-coupang", user_email=email),
            DBSubscription(name="Spotify Duo", price=16390, billingDate=12, category="Music", iconClass="ph-spotify-logo", bgClass="bg-spotify", user_email=email)
        ]
        db.add_all(mocks)
        db.commit()
    return {"message": "synced"}

@app.get("/api/subscriptions/{email}")
def get_subscriptions(email: str, db: Session = Depends(get_db)):
    subs = db.query(DBSubscription).filter(DBSubscription.user_email == email).all()
    return [
        {
            "id": s.id,
            "name": s.name,
            "price": s.price,
            "billingDate": s.billingDate,
            "category": s.category,
            "iconClass": s.iconClass,
            "bgClass": s.bgClass
        }
        for s in subs
    ]

@app.post("/api/subscriptions")
def add_subscription(sub: SubscriptionCreate, db: Session = Depends(get_db)):
    db_sub = DBSubscription(
        name=sub.name,
        price=sub.price,
        billingDate=sub.billingDate,
        category=sub.category,
        iconClass=sub.iconClass,
        bgClass=sub.bgClass,
        user_email=sub.user_email
    )
    db.add(db_sub)
    db.commit()
    db.refresh(db_sub)
    return {"message": "added", "id": db_sub.id}

# Serve Frontend
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

@app.get("/")
async def root():
    return FileResponse(os.path.join(BASE_DIR, "index.html"))

app.mount("/", StaticFiles(directory=BASE_DIR, html=True), name="static")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
