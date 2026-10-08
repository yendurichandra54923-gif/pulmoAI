"""
PulmoAI Neural Engine — FastAPI Backend
========================================
Production-grade inference server for chest X-ray classification using a
ResNet50/EfficientNet ensemble model (.keras).  Returns per-class probability
distributions alongside rich clinical metadata so the frontend can render a
full "decision breakdown" visualisation.
"""

from fastapi import FastAPI, UploadFile, File, Form, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
import uvicorn
import numpy as np
from PIL import Image
import io
import tensorflow as tf
from keras.models import load_model
import traceback
from datetime import datetime, timedelta, timezone
from pathlib import Path
import base64
import hashlib
import json
import os
import re
import secrets
import sqlite3
from contextlib import contextmanager
from jose import JWTError, jwt
from keras.initializers import GlorotUniform, Zeros

# ---------------------------------------------------------------------------
# App & Middleware
# ---------------------------------------------------------------------------
app = FastAPI(
    title="PulmoAI Neural Engine API",
    description="Multi-class chest X-ray classification with explainable AI",
    version="2.0.0",
)

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "https://pulmo-ai-seven.vercel.app"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,  # <--- Ikkada direct ga list variable ivvali
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DATABASE_PATH = Path(
    os.environ.get(
        "PULMOAI_DATABASE_PATH",
        str(Path(__file__).resolve().parent / "app" / "hospital.db"),
    )
).resolve()
JWT_SECRET_KEY = os.environ.get("PULMOAI_JWT_SECRET", "")
JWT_ALGORITHM = "HS256"
JWT_EXPIRE_MINUTES = 60 * 12
bearer_scheme = HTTPBearer(auto_error=False)


class Credentials(BaseModel):
    email: str = Field(min_length=3, max_length=320)
    password: str = Field(min_length=1, max_length=128)


@contextmanager
def get_db_connection():
    connection = sqlite3.connect(DATABASE_PATH)
    connection.row_factory = sqlite3.Row
    connection.execute("PRAGMA foreign_keys = ON")
    try:
        yield connection
        connection.commit()
    except Exception:
        connection.rollback()
        raise
    finally:
        connection.close()


def init_database():
    DATABASE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with get_db_connection() as connection:
        tables = {
            row["name"]
            for row in connection.execute(
                "SELECT name FROM sqlite_master WHERE type = 'table'"
            )
        }
        if "users" in tables:
            columns = {
                row["name"] for row in connection.execute("PRAGMA table_info(users)")
            }
            if not {"id", "email", "password_hash"}.issubset(columns):
                if "streamlit_users" not in tables:
                    connection.execute("ALTER TABLE users RENAME TO streamlit_users")
                else:
                    legacy_columns = {
                        row["name"]
                        for row in connection.execute(
                            "PRAGMA table_info(streamlit_users)"
                        )
                    }
                    required_legacy_columns = {
                        "username", "password", "role", "full_name"
                    }
                    if not required_legacy_columns.issubset(legacy_columns):
                        raise RuntimeError(
                            "The existing streamlit_users table has an unexpected schema."
                        )
                    connection.execute(
                        """INSERT OR IGNORE INTO streamlit_users
                           (username, password, role, full_name)
                           SELECT username, password, role, full_name FROM users"""
                    )
                    connection.execute("DROP TABLE users")

        connection.execute(
            """CREATE TABLE IF NOT EXISTS users (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL UNIQUE COLLATE NOCASE,
                password_hash TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        connection.execute(
            """CREATE TABLE IF NOT EXISTS scan_history (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                patient_id TEXT NOT NULL,
                patient_name TEXT NOT NULL,
                diagnosis TEXT NOT NULL,
                confidence REAL NOT NULL,
                severity TEXT NOT NULL,
                class_probabilities TEXT NOT NULL,
                summary TEXT NOT NULL,
                description TEXT NOT NULL,
                recommendation TEXT NOT NULL,
                clinical_notes TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        connection.execute(
            "CREATE INDEX IF NOT EXISTS idx_scan_history_user_created "
            "ON scan_history(user_id, created_at DESC)"
        )


init_database()


def normalize_email(email: str) -> str:
    normalized = email.strip().lower()
    if not re.fullmatch(r"[^@\s]+@[^@\s]+\.[^@\s]+", normalized):
        raise HTTPException(status_code=422, detail="Enter a valid email address.")
    return normalized


def hash_password(password: str) -> str:
    salt = secrets.token_bytes(16)
    password_hash = hashlib.scrypt(
        password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64
    )
    return "scrypt${}${}".format(
        base64.urlsafe_b64encode(salt).decode("ascii"),
        base64.urlsafe_b64encode(password_hash).decode("ascii"),
    )


def verify_password(password: str, encoded_hash: str) -> bool:
    try:
        scheme, salt_text, hash_text = encoded_hash.split("$", maxsplit=2)
        if scheme != "scrypt":
            return False
        salt = base64.urlsafe_b64decode(salt_text.encode("ascii"))
        expected_hash = base64.urlsafe_b64decode(hash_text.encode("ascii"))
        actual_hash = hashlib.scrypt(
            password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1, dklen=64
        )
        return secrets.compare_digest(actual_hash, expected_hash)
    except (ValueError, TypeError):
        return False


def create_access_token(user_id: int, email: str) -> str:
    if not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=500,
            detail="Server authentication is not configured. Set PULMOAI_JWT_SECRET.",
        )
    expires_at = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
    return jwt.encode(
        {"sub": str(user_id), "email": email, "exp": expires_at},
        JWT_SECRET_KEY,
        algorithm=JWT_ALGORITHM,
    )


def require_jwt_secret():
    if not JWT_SECRET_KEY:
        raise HTTPException(
            status_code=503,
            detail="Server authentication is not configured. Set PULMOAI_JWT_SECRET.",
        )


def get_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
):
    if credentials is None or not JWT_SECRET_KEY:
        raise HTTPException(status_code=401, detail="A valid bearer token is required.")
    try:
        payload = jwt.decode(
            credentials.credentials,
            JWT_SECRET_KEY,
            algorithms=[JWT_ALGORITHM],
        )
        user_id = int(payload["sub"])
    except (JWTError, KeyError, TypeError, ValueError):
        raise HTTPException(status_code=401, detail="Invalid or expired token.")

    with get_db_connection() as connection:
        user = connection.execute(
            "SELECT id, email FROM users WHERE id = ?", (user_id,)
        ).fetchone()
    if user is None:
        raise HTTPException(status_code=401, detail="Account no longer exists.")
    return {"id": user["id"], "email": user["email"]}


@app.post("/api/register")
async def register(credentials: Credentials):
    require_jwt_secret()
    email = normalize_email(credentials.email)
    if len(credentials.password) < 8:
        raise HTTPException(status_code=422, detail="Password must be at least 8 characters.")
    password_hash = hash_password(credentials.password)
    try:
        with get_db_connection() as connection:
            cursor = connection.execute(
                "INSERT INTO users (email, password_hash, created_at) VALUES (?, ?, ?)",
                (email, password_hash, datetime.now(timezone.utc).isoformat()),
            )
            user_id = cursor.lastrowid
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=409, detail="An account with this email already exists.")

    return {
        "access_token": create_access_token(user_id, email),
        "token_type": "bearer",
        "user": {"id": user_id, "email": email},
    }


@app.post("/api/login")
async def login(credentials: Credentials):
    require_jwt_secret()
    email = normalize_email(credentials.email)
    with get_db_connection() as connection:
        user = connection.execute(
            "SELECT id, email, password_hash FROM users WHERE email = ?", (email,)
        ).fetchone()
    if user is None or not verify_password(credentials.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Incorrect email or password.")

    return {
        "access_token": create_access_token(user["id"], user["email"]),
        "token_type": "bearer",
        "user": {"id": user["id"], "email": user["email"]},
    }

# ---------------------------------------------------------------------------
# Model Loading (happens once at server startup)
# ---------------------------------------------------------------------------
MODEL_PATH = Path(__file__).resolve().parent / "models" / "proposed_ensemble_model.keras"
model = None

try:
    print("=" * 60)
    print("  PulmoAI — Loading Ensemble Model …")
    print("=" * 60)
   # --- BYPASS KERAS VERSION ERRORS ---
    class SafeGlorot(GlorotUniform):
     def __init__(self, **kwargs):
        kwargs.pop('input_axes', None)
        kwargs.pop('output_axes', None)
        super().__init__(**kwargs)

    class SafeZeros(Zeros):
        def __init__(self, **kwargs):
         kwargs.pop('input_axes', None)
         kwargs.pop('output_axes', None)
        super().__init__(** kwargs)

    model = load_model(
    MODEL_PATH, 
    compile=False, 
    custom_objects={'GlorotUniform': SafeGlorot, 'Zeros': SafeZeros}
)
# -----------------------------------
    print(f"  ✓ Model loaded successfully from: {MODEL_PATH}")
    print(f"  ✓ Input shape : {model.input_shape}")
    print(f"  ✓ Output shape: {model.output_shape}")
    print("=" * 60)
except Exception as e:
    print(f"  ✗ FATAL — Failed to load model: {e}")
    traceback.print_exc()

# ---------------------------------------------------------------------------
# Class Definitions — order must match the training label encoder
# ---------------------------------------------------------------------------
CLASS_NAMES = ["Lung Opacity", "Normal", "Pneumonia", "Tuberculosis"]

# ---------------------------------------------------------------------------
# Rich Clinical Metadata per class
# ---------------------------------------------------------------------------
CLINICAL_DATA = {
    "Normal": {
        "summary": (
            "The neural network ensemble has analyzed the structural biomarkers "
            "and found no significant abnormalities. Lung fields are clear with "
            "normal cardiac silhouette and intact costophrenic angles."
        ),
        "description": (
            "A normal chest radiograph indicates healthy pulmonary and cardiac "
            "structures without any signs of active disease or trauma. The lung "
            "parenchyma is aerated, the mediastinal contour is within normal "
            "limits, and the diaphragms are well-defined. Routine screening only; "
            "no further imaging required at this time."
        ),
        "severity": "None",
        "recommendation": "Continue routine health screening. No immediate action required.",
    },
    "Pneumonia": {
        "summary": (
            "The neural network ensemble has identified significant alveolar "
            "consolidations correlating with an active infectious process. "
            "Bilateral or unilateral opacities suggest fluid accumulation in "
            "the pulmonary parenchyma."
        ),
        "description": (
            "Pneumonia is an acute lower respiratory tract infection that inflames "
            "the alveoli, causing them to fill with fluid or purulent material. "
            "Radiographic hallmarks include lobar consolidation, air bronchograms, "
            "and ground-glass opacities. Common etiologies include bacterial "
            "(Streptococcus pneumoniae), viral (Influenza, SARS-CoV-2), and "
            "atypical organisms (Mycoplasma, Legionella). Immediate clinical "
            "correlation is advised."
        ),
        "severity": "Moderate to High",
        "recommendation": "Urgent clinical correlation required. Consider sputum culture, CBC, and CRP.",
    },
    "Tuberculosis (TB)": {
        "summary": (
            "The AI engine has detected radiographic patterns consistent with "
            "pulmonary tuberculosis, including upper-lobe infiltrates, cavitary "
            "lesions, and possible hilar lymphadenopathy."
        ),
        "description": (
            "Tuberculosis (TB) is a chronic granulomatous infection caused by "
            "Mycobacterium tuberculosis. Chest X-ray findings include upper-lobe "
            "fibronodular infiltrates, cavitation, tree-in-bud opacities, and "
            "calcified granulomas (Ghon complexes). Miliary TB presents as "
            "diffuse tiny nodules. A positive sputum AFB smear and GeneXpert "
            "test are confirmatory. Treatment follows the standard DOTS regimen "
            "(Isoniazid, Rifampicin, Pyrazinamide, Ethambutol)."
        ),
        "severity": "High — Infectious",
        "recommendation": "Isolate patient. Initiate sputum AFB, GeneXpert, and Mantoux testing immediately.",
    },
    "Lung Opacity": {
        "summary": (
            "The neural network has detected regional or diffuse opacification "
            "within the lung parenchyma, indicating density changes that may "
            "represent fluid, inflammation, atelectasis, or mass effect."
        ),
        "description": (
            "Lung opacity refers to an area that appears lighter (whiter) on a "
            "chest radiograph due to increased tissue density. Differential "
            "diagnoses include pulmonary edema, pleural effusion, atelectasis, "
            "pulmonary fibrosis, lung mass/neoplasm, and organizing pneumonia. "
            "Ground-glass opacities (GGO) may indicate early infection or "
            "interstitial lung disease. Clinical correlation with CT imaging, "
            "blood work, and patient history is recommended to narrow the "
            "differential."
        ),
        "severity": "Variable — requires further workup",
        "recommendation": "Recommend follow-up CT scan, pulmonary function tests, and clinical correlation.",
    },
}

# ---------------------------------------------------------------------------
# Health-check endpoint
# ---------------------------------------------------------------------------
@app.get("/api/health")
async def health_check():
    return {
        "status": "online",
        "model_loaded": model is not None,
        "model_path": MODEL_PATH,
        "classes": CLASS_NAMES,
        "server_time": datetime.now().isoformat(),
    }


@app.get("/api/history")
async def get_history(current_user: dict = Depends(get_current_user)):
    with get_db_connection() as connection:
        rows = connection.execute(
            """SELECT id, patient_id, patient_name, diagnosis, confidence, severity,
                      class_probabilities, summary, description, recommendation,
                      clinical_notes, created_at
               FROM scan_history WHERE user_id = ? ORDER BY created_at DESC, id DESC""",
            (current_user["id"],),
        ).fetchall()

    return {
        "status": "success",
        "scans": [
            {
                "id": row["id"],
                "pid": row["patient_id"],
                "name": row["patient_name"],
                "diagnosis": row["diagnosis"],
                "confidence": f"{row['confidence']:.2f}%",
                "confidence_raw": row["confidence"],
                "severity": row["severity"],
                "class_probabilities": json.loads(row["class_probabilities"]),
                "summary": row["summary"],
                "description": row["description"],
                "recommendation": row["recommendation"],
                "clinical_notes": row["clinical_notes"],
                "timestamp": row["created_at"],
            }
            for row in rows
        ],
    }


@app.delete("/api/history")
async def delete_history(current_user: dict = Depends(get_current_user)):
    with get_db_connection() as connection:
        connection.execute(
            "DELETE FROM scan_history WHERE user_id = ?", (current_user["id"],)
        )
    return {"status": "success", "message": "Your scan history was cleared."}


# ---------------------------------------------------------------------------
# Core inference endpoint
# ---------------------------------------------------------------------------
@app.post("/api/analyze")
async def analyze_xray(
    file: UploadFile = File(...),
    patient_id: str = Form(default=""),
    patient_name: str = Form(default=""),
    clinical_notes: str = Form(default=""),
    current_user: dict = Depends(get_current_user),
):
    """
    Accepts a chest X-ray image, runs inference through the ensemble model,
    and returns:
      • Top diagnosis & confidence
      • Full probability distribution across all 4 classes
      • Rich clinical metadata (summary, description, severity, recommendation)
    """
    if model is None:
        return {
            "status": "error",
            "message": "Model failed to load. Check the server terminal for details.",
        }

    try:
        # ---- 1. Read & preprocess ----------------------------------------
        image_bytes = await file.read()
        image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        image = image.resize((224, 224))

        img_array = np.array(image, dtype=np.float32)
        img_array = np.expand_dims(img_array, axis=0)  # (1, 224, 224, 3)

        # ---- 2. Inference ------------------------------------------------
        predictions = model.predict(img_array, verbose=0)
        pred_array = predictions[0]

        # Debug logging
        print(f"[INFERENCE] Shape: {predictions.shape}  |  Raw: {pred_array}")

        # Apply softmax if the output layer doesn't include it
        if not np.isclose(pred_array.sum(), 1.0, atol=0.05):
            pred_array = tf.nn.softmax(pred_array).numpy()

        # ---- 3. Extract results -----------------------------------------
        predicted_index = int(np.argmax(pred_array))
        confidence_score = float(pred_array[predicted_index]) * 100

        diagnosis = (
            CLASS_NAMES[predicted_index]
            if predicted_index < len(CLASS_NAMES)
            else f"Unknown Pathology Class {predicted_index}"
        )

        # Build per-class probability breakdown (key feature for the UI)
        class_probabilities = {}
        for i, name in enumerate(CLASS_NAMES):
            pct = float(pred_array[i]) * 100 if i < len(pred_array) else 0.0
            class_probabilities[name] = round(pct, 2)

        # ---- 4. Attach clinical metadata --------------------------------
        clinical = CLINICAL_DATA.get(diagnosis, CLINICAL_DATA["Lung Opacity"])

        timestamp = datetime.now(timezone.utc).isoformat()
        saved_patient_id = patient_id.strip() or f"SCAN-{secrets.token_hex(4).upper()}"
        saved_patient_name = patient_name.strip() or current_user["email"]
        with get_db_connection() as connection:
            cursor = connection.execute(
                """INSERT INTO scan_history (
                    user_id, patient_id, patient_name, diagnosis, confidence, severity,
                    class_probabilities, summary, description, recommendation,
                    clinical_notes, created_at
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                (
                    current_user["id"],
                    saved_patient_id,
                    saved_patient_name,
                    diagnosis,
                    confidence_score,
                    clinical["severity"],
                    json.dumps(class_probabilities),
                    clinical["summary"],
                    clinical["description"],
                    clinical["recommendation"],
                    clinical_notes.strip(),
                    timestamp,
                ),
            )

        return {
            "status": "success",
            "scan_id": cursor.lastrowid,
            "diagnosis": diagnosis,
            "confidence": f"{confidence_score:.2f}%",
            "confidence_raw": round(confidence_score, 2),
            "class_probabilities": class_probabilities,
            "summary": clinical["summary"],
            "description": clinical["description"],
            "severity": clinical["severity"],
            "recommendation": clinical["recommendation"],
            "timestamp": timestamp,
            "patient_id": saved_patient_id,
            "patient_name": saved_patient_name,
        }

    except Exception as e:
        traceback.print_exc()
        return {"status": "error", "message": str(e)}


# ---------------------------------------------------------------------------
# Run
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)