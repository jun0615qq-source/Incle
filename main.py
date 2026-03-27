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
import base64
import re
from google.oauth2.credentials import Credentials
from googleapiclient.discovery import build

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

class PasswordReset(BaseModel):
    email: str
    verification_code: str
    new_password: str

class SubscriptionCreate(BaseModel):
    name: str
    price: int
    billingDate: int
    category: str
    iconClass: str
    bgClass: str
    user_email: str

class SyncGmailRequest(BaseModel):
    access_token: str
    user_email: str

# Endpoints
@app.get("/api/config")
def get_config():
    return {"google_client_id": os.getenv("GOOGLE_CLIENT_ID", "")}

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

@app.post("/api/reset-password")
def reset_password(req: PasswordReset, db: Session = Depends(get_db)):
    # Verify the code first
    now = int(datetime.utcnow().timestamp())
    valid_code = db.query(VerificationCode).filter(
        VerificationCode.email == req.email,
        VerificationCode.code == req.verification_code,
        VerificationCode.expires_at > now
    ).order_by(VerificationCode.id.desc()).first()

    if not valid_code:
        raise HTTPException(status_code=400, detail="인증번호가 일치하지 않거나 만료되었습니다.")
        
    db_user = db.query(DBUser).filter(DBUser.email == req.email).first()
    if not db_user:
        raise HTTPException(status_code=404, detail="가입되지 않은 계정입니다.")
        
    db_user.password = req.new_password
    db.commit()
    return {"message": "비밀번호 변경 완료"}

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

def get_msg_body(payload):
    if 'data' in payload.get('body', {}):
        try:
            return base64.urlsafe_b64decode(payload['body']['data']).decode('utf-8', errors='ignore')
        except:
            return ""
    if 'parts' in payload:
        for part in payload['parts']:
            if part.get('mimeType') in ['text/plain', 'text/html']:
                return get_msg_body(part)
    return ""

@app.post("/api/sync-gmail")
def sync_gmail_real(req: SyncGmailRequest, db: Session = Depends(get_db)):
    try:
        creds = Credentials(token=req.access_token)
        service = build('gmail', 'v1', credentials=creds)
    except Exception as e:
        raise HTTPException(status_code=400, detail="Invalid Google Token")
    
    query = "subject:결제 OR subject:영수증 OR subject:Receipt"
    try:
        results = service.users().messages().list(userId='me', q=query, maxResults=30).execute()
        messages = results.get('messages', [])
    except Exception as e:
        raise HTTPException(status_code=400, detail="Failed to fetch Gmail data")

    found_subs = []
    price_pattern = re.compile(r'([\d,]+)\s*원')
    
    for msg_ref in messages:
        try:
            msg = service.users().messages().get(userId='me', id=msg_ref['id'], format='full').execute()
            headers = msg.get('payload', {}).get('headers', [])
            subject = next((h['value'] for h in headers if h['name'].lower() == 'subject'), '')
            sender = next((h['value'] for h in headers if h['name'].lower() == 'from'), '')
            
            body = get_msg_body(msg.get('payload', {}))
            text_content = subject + " " + sender + " " + body
            
            name = None
            category = "Other"
            icon = "ph-star"
            bg = "bg-coupang"
            
            check_text = text_content.lower()
            if "netflix" in check_text or "넷플릭스" in check_text:
                name = "넷플릭스"
                category = "Entertain"
                icon = "ph-video-camera"
                bg = "bg-netflix"
            elif "youtube" in check_text or "유튜브" in check_text:
                name = "유튜브 프리미엄"
                category = "Entertain"
                icon = "ph-youtube-logo"
                bg = "bg-youtube"
            elif "spotify" in check_text or "스포티파이" in check_text:
                name = "스포티파이"
                category = "Music"
                icon = "ph-spotify-logo"
                bg = "bg-spotify"
            elif "쿠팡" in text_content or "coupang" in check_text:
                name = "쿠팡 로켓와우"
                category = "Shopping"
                icon = "ph-shopping-cart"
                bg = "bg-coupang"
                
            if name:
                prices = price_pattern.findall(text_content)
                if prices:
                    price_str = prices[0].replace(',', '')
                    if price_str.isdigit():
                        price_val = int(price_str)
                        
                        # Check exist
                        exists = db.query(DBSubscription).filter(
                            DBSubscription.user_email == req.user_email,
                            DBSubscription.name == name
                        ).first()
                        
                        if not exists:
                            b_date = random.randint(1, 28)
                            new_sub = DBSubscription(
                                name=name, price=price_val, billingDate=b_date, 
                                category=category, iconClass=icon, bgClass=bg, user_email=req.user_email
                            )
                            db.add(new_sub)
                            db.commit()
                            found_subs.append(name)
        except Exception:
            continue
            
    if found_subs:
        return {"message": f"성공! 이메일을 스캔하여 {len(set(found_subs))}개의 진짜 결제 내역( {', '.join(set(found_subs))} )을 연동했습니다."}
    else:
        return {"message": "이메일을 모두 스캔했으나 새로운 정기결제 영수증을 찾지 못했습니다."}

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
