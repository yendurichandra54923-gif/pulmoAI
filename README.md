# PulmoAI

### AI-Assisted Chest X-Ray Screening Portal

PulmoAI is a full-stack academic project that brings chest X-ray image analysis, account-based access, and scan-history review together in a single web portal. A React frontend sends uploaded images to a FastAPI service, which runs inference using a saved Keras ensemble model and returns a four-class prediction with confidence values and supporting clinical text.

> **Medical-use notice:** PulmoAI is an academic screening prototype, not a medical device. Its predictions and generated reports are not diagnoses and must not be used to make treatment decisions. Every result requires independent review by a qualified clinician or radiologist.

## Project Overview

The application is divided into a React single-page frontend and a Python/FastAPI inference backend. The backend loads `models/proposed_ensemble_model.keras`, accepts an uploaded chest X-ray, prepares an RGB tensor at 224 x 224 pixels, runs model inference, and returns the predicted class, class probability breakdown, and associated clinical information.

The current output classes are ordered as follows:

1. Lung Opacity
2. Normal
3. Pneumonia
4. Tuberculosis

The saved model is a functional Keras network combining ResNet50 and EfficientNetB0 feature branches. It accepts one `float32` input tensor shaped `(batch, 224, 224, 3)`. The model archive contains preprocessing layers in its EfficientNet branch; the API currently sends RGB float pixels in the 0-255 range and does not apply external `/255` normalization.

## Technology Stack

| Area | Technology |
| --- | --- |
| API and inference service | FastAPI, Uvicorn, Python |
| Machine learning | TensorFlow / Keras, ResNet50 + EfficientNetB0 ensemble |
| Image handling | Pillow, NumPy |
| Authentication | JWT bearer tokens, `python-jose`, salted `scrypt` password hashes |
| Database | SQLite (`app/hospital.db`) |
| Frontend | React, React Router, CSS |
| Report export | jsPDF |

## Key Features

- **Ensemble inference:** Uses the saved ResNet50/EfficientNetB0 Keras model for four-class chest X-ray screening.
- **Account registration and sign-in:** Email-based accounts with salted password hashes; passwords are not stored in plaintext for API users.
- **JWT-protected endpoints:** Authenticated API operations use bearer tokens with a 12-hour expiration.
- **Per-account scan history:** Every saved API scan references its owning user. History retrieval and clearing are filtered by the verified JWT user ID.
- **Scan result details:** Displays the top prediction, confidence, per-class probabilities, summary, severity, and recommendation.
- **Medical report export:** Generates a PDF report in the browser, with an optional automatic download after a successful scan.
- **Responsive portal views:** Includes the AI Engine, Scan History, Overview, Medical Guidelines, and Settings screens.
- **SQLite persistence:** User accounts and API scan records persist locally between server restarts.

## Repository Layout

```text
PulmoAI/
|-- main.py                              # FastAPI application and inference API
|-- requirements.txt                     # Python dependencies
|-- models/
|   |-- proposed_ensemble_model.keras    # Active inference model
|   `-- baseline_resnet50.keras          # Baseline model artifact
|-- dataset/
|   `-- Balanced_Dataset/                # Class-organized X-ray images
|-- app/
|   |-- app.py                           # Legacy Streamlit portal
|   |-- hospital.db                      # SQLite database (created/updated at runtime)
|   `-- pulmo-frontend/
|       |-- package.json
|       `-- src/                          # React application
`-- notebooks/
	`-- Model_Training.ipynb             # Training notebook placeholder
```

The API defaults to `app/hospital.db`, preserving the location of the existing Streamlit database. At startup it creates the API `users` and `scan_history` tables. If the original Streamlit `users` table is present, it is retained as `streamlit_users`; the legacy Streamlit app uses that table after migration. Legacy Streamlit accounts are not API accounts. Register an account through the React sign-up form to use the authenticated API.

## Prerequisites

- Python version supported by the TensorFlow release installed in your environment. Python 3.10 or 3.11 is a practical starting point; confirm TensorFlow's current platform support before selecting a newer Python version.
- Node.js and npm (Node.js 18 or later recommended for this frontend toolchain).
- Git, if cloning the project.
- Enough disk space and memory for TensorFlow and the Keras model artifacts.

TensorFlow installation support differs by operating system and Python version. If its native binaries fail to load on Windows, use a TensorFlow-supported environment such as WSL2/Linux and install the matching Python/TensorFlow versions there.

## Local Setup

Run backend commands from the repository root and frontend commands from `app/pulmo-frontend`.

### 1. Get the project

```bash
git clone <your-repository-url>
cd PulmoAI
```

If working from an existing local copy, change to its root directory instead.

### 2. Create a Python environment

#### Windows PowerShell

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

If PowerShell prevents activation, either configure an appropriate execution policy for your account or invoke the environment's executable directly:

```powershell
.\.venv\Scripts\python.exe -m pip install --upgrade pip
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

#### macOS / Linux

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
python -m pip install -r requirements.txt
```

### 3. Configure the JWT signing secret

The backend intentionally does not ship with a default signing key. Set `PULMOAI_JWT_SECRET` in the same terminal session used to start the API. Keep it private and stable: changing it invalidates all outstanding access tokens.

#### Windows PowerShell

```powershell
$bytes = New-Object byte[] 32
[Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
$env:PULMOAI_JWT_SECRET = [Convert]::ToBase64String($bytes)
```

#### macOS / Linux

```bash
export PULMOAI_JWT_SECRET="$(openssl rand -hex 32)"
```

Do not commit the secret to source control. For repeatable local logins across terminal sessions, keep a development secret in a local, ignored environment file or your shell environment rather than generating a different secret each time.

### 4. Start the FastAPI backend

From the repository root, with the secret set in this terminal:

```bash
python main.py
```

The API listens on `http://localhost:8000`. Interactive API documentation is available at `http://localhost:8000/docs`; the health endpoint is `http://localhost:8000/api/health`.

The model path is resolved relative to `main.py`, so launching from the repository root is recommended but not required for locating the model. The default SQLite path is also resolved relative to the project. To use a different database file, set `PULMOAI_DATABASE_PATH` before starting the backend.

#### PowerShell example for a custom database path

```powershell
$env:PULMOAI_DATABASE_PATH = Join-Path $PWD "app\hospital.db"
```

### 5. Install and start the React frontend

Open a second terminal:

```bash
cd app/pulmo-frontend
npm install
npm start
```

The development server opens the portal at `http://localhost:3000`. The frontend is configured to call the API at `http://localhost:8000`; start the backend first and keep both servers running while using the portal.

### 6. Create an account and run a scan

1. Open `http://localhost:3000/`.
2. Select **Create an account**, enter a valid email and a password of at least eight characters, then submit.
3. After signing in, open **AI Engine**, select a chest X-ray image, and start the scan.
4. Review the prediction and confidence breakdown. Scan records are saved to the signed-in user's history.
5. Open **Settings** to configure the theme and optional automatic PDF report download.

## API Reference

All paths are relative to `http://localhost:8000`.

| Method | Endpoint | Authentication | Purpose |
| --- | --- | --- | --- |
| `GET` | `/api/health` | No | API/model status and class labels |
| `POST` | `/api/register` | No | Create an account and return a JWT |
| `POST` | `/api/login` | No | Verify credentials and return a JWT |
| `POST` | `/api/analyze` | Bearer JWT | Analyze an uploaded image and save the result for the signed-in user |
| `GET` | `/api/history` | Bearer JWT | Return only the signed-in user's scan records |
| `DELETE` | `/api/history` | Bearer JWT | Delete only the signed-in user's scan records |

Registration and login accept JSON shaped like:

```json
{
	"email": "user@example.com",
	"password": "at-least-eight-characters"
}
```

For protected endpoints, send the token in the request header:

```http
Authorization: Bearer <access_token>
```

`POST /api/analyze` uses multipart form data with a required `file` and optional `patient_id`, `patient_name`, and `clinical_notes` fields. A successful inference is stored automatically in `scan_history`.

## Configuration

| Variable | Required | Default | Description |
| --- | --- | --- | --- |
| `PULMOAI_JWT_SECRET` | Yes for register/login | None | Secret used to sign and verify JWT access tokens |
| `PULMOAI_DATABASE_PATH` | No | `<project>/app/hospital.db` | Optional SQLite file path |

The frontend API base URL is currently set in `app/pulmo-frontend/src/App.js` to `http://localhost:8000`. Update it when deploying the API to another host.

## Dataset and Model Notes

The repository includes `baseline_resnet50.keras`, `proposed_ensemble_model.keras`, and a class-organized `dataset/Balanced_Dataset/` directory. The API currently loads `proposed_ensemble_model.keras`.

The checked-in `notebooks/Model_Training.ipynb` is empty, and the repository does not include a training script or verified training metrics. Therefore, this README documents the saved model's inspected input signature and the current inference implementation; it does not claim a reproducible training pipeline or independently validated clinical performance. Validate the class-index mapping and preprocessing against the original training artifacts before relying on model outputs.

## Privacy, Security, and Intended Use

- API scan history is associated with a user ID and filtered server-side using the authenticated token.
- Passwords for API accounts are stored as salted `scrypt` hashes.
- JWTs are held by the frontend in browser `localStorage`; this is convenient for a local academic demo but exposes tokens to scripts running in the same origin. A production deployment should evaluate secure, HTTP-only cookies and additional browser security controls.
- Use HTTPS, a strong managed secret, access controls, backups, and an appropriate privacy review before handling any real patient data.
- Do not place identifiable patient data in a public repository, issue, screenshot, or demo recording.
- The model and reports are not substitutes for professional review or validated clinical decision support.

## Troubleshooting

| Symptom | Checks |
| --- | --- |
| Backend reports model load failure | Confirm the `.keras` file exists under `models/`, verify the selected Python/TensorFlow versions, and inspect the backend terminal output. |
| `PULMOAI_JWT_SECRET` configuration error | Set the environment variable in the backend terminal before launching `main.py`. |
| Frontend cannot connect | Confirm FastAPI is running on port 8000 and React is running on port 3000. Check browser console/network errors and CORS configuration. |
| Protected endpoint returns `401` | Sign in again; tokens expire after 12 hours and become invalid if the JWT secret changes. |
| Model predictions or class labels appear wrong | Check the model's training-time preprocessing and class-index mapping against original training code. These training details are not supplied in the checked-in notebook. |
| TensorFlow DLL or native load error on Windows | Verify the Python/TensorFlow platform combination. If necessary, use WSL2/Linux with a TensorFlow-supported environment. |

## Academic Project

PulmoAI is intended for demonstration and academic evaluation of a full-stack machine-learning application: model serving, image upload, account authentication, user-scoped persistence, and report export. Add project-specific details such as contributor names, institution, supervisor, evaluation protocol, and validated results before using this README as a formal submission or portfolio entry.
