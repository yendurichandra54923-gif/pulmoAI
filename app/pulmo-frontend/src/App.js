import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom';
import { jsPDF } from 'jspdf';
import './App.css';

const API_BASE_URL = 'https://pulmoai-zeax.onrender.com';

/* =========================================================================
   SVG Breathing Lungs — Animated Background Element
   ========================================================================= */
const BreathingLungs = ({ size = 500, opacity = 0.12, glow = false }) => (
  <div className="breathing-lungs-wrap" style={{ opacity }}>
    <svg
      className={glow ? 'lungs-glow' : ''}
      width={size}
      height={size}
      viewBox="0 0 200 200"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Trachea */}
      <path d="M95,18 L105,18 L105,58 L95,58 Z" fill="var(--cyan)" opacity="0.6" />
      {/* Bronchi */}
      <path d="M100,58 L78,78 L83,83 L100,68 L117,83 L122,78 Z" fill="var(--cyan)" opacity="0.5" />
      {/* Left Lung */}
      <path
        className="lung-path lung-left"
        d="M78,78 C58,68 28,88 28,128 C28,168 48,180 78,180 C93,180 100,140 85,108 Z"
        fill="rgba(0,229,255,0.12)"
        stroke="var(--cyan)"
        strokeWidth="1.5"
      />
      {/* Right Lung */}
      <path
        className="lung-path lung-right"
        d="M122,78 C142,68 172,88 172,128 C172,168 152,180 122,180 C107,180 100,140 115,108 Z"
        fill="rgba(0,229,255,0.12)"
        stroke="var(--cyan)"
        strokeWidth="1.5"
      />
      {/* Vein details */}
      <path d="M85,108 L65,130 L70,145" fill="none" stroke="var(--cyan)" strokeWidth="0.8" opacity="0.3" />
      <path d="M115,108 L135,130 L130,145" fill="none" stroke="var(--cyan)" strokeWidth="0.8" opacity="0.3" />
    </svg>
  </div>
);

/* =========================================================================
   Probability Breakdown Bar Component
   ========================================================================= */
const ProbabilityBar = ({ label, percentage, colorClass, isTop }) => (
  <div className="prob-row">
    <span className="prob-label">{label}</span>
    <div className="prob-bar-track">
      <div
        className={`prob-bar-fill ${colorClass} ${isTop ? 'highlight' : ''}`}
        style={{ width: `${percentage}%` }}
      />
    </div>
    <span className={`prob-pct ${isTop ? 'glow-text' : 'text-muted'}`}>
      {percentage.toFixed(1)}%
    </span>
  </div>
);

/* =========================================================================
   Main Application
   ========================================================================= */
function App() {
  /* --- Persistent Auth State ---------------------------------------------- */
  const navigate = useNavigate();
  const location = useLocation();
  const [authToken, setAuthToken] = useState(() => localStorage.getItem('pulmo_token') || '');
  const [authChecked, setAuthChecked] = useState(() => !localStorage.getItem('pulmo_token'));
  const [userName, setUserName] = useState(
    () => localStorage.getItem('pulmo_user') || ''
  );
  const isLoggedIn = Boolean(authToken);
  const [isRegistering, setIsRegistering] = useState(false);
  const [authError, setAuthError] = useState('');
  const [authBusy, setAuthBusy] = useState(false);
  const [password, setPassword] = useState('');
  const [darkThemeEnabled, setDarkThemeEnabled] = useState(
    () => localStorage.getItem('pulmo_dark_theme') !== 'false'
  );
  const [autoDownloadReport, setAutoDownloadReport] = useState(
    () => localStorage.getItem('pulmo_auto_download') === 'true'
  );

  /* --- Navigation --------------------------------------------------------- */
  const routeForTab = {
    overview: '/overview',
    ai_engine: '/ai',
    database: '/history',
    guidelines: '/guidelines',
    settings: '/settings',
  };
  const tabForRoute = {
    '/overview': 'overview',
    '/ai': 'ai_engine',
    '/history': 'database',
    '/guidelines': 'guidelines',
    '/settings': 'settings',
  };
  const activeTab = tabForRoute[location.pathname] || 'ai_engine';
  const setActiveTab = (tab) => navigate(routeForTab[tab] || '/ai');

  useEffect(() => {
    localStorage.setItem('pulmo_dark_theme', String(darkThemeEnabled));

    const root = document.documentElement;
    const lightThemeTokens = {
      '--bg-deep': '#f3f7fa',
      '--bg-surface': 'rgba(255, 255, 255, 0.88)',
      '--bg-surface-alt': 'rgba(255, 255, 255, 0.96)',
      '--bg-input': 'rgba(255, 255, 255, 0.9)',
      '--text-primary': '#13232b',
      '--text-secondary': 'rgba(19, 35, 43, 0.72)',
      '--text-muted': 'rgba(19, 35, 43, 0.52)',
      '--border-glass': 'rgba(13, 95, 112, 0.18)',
      '--border-glow': 'rgba(13, 95, 112, 0.32)',
    };

    Object.entries(lightThemeTokens).forEach(([token, value]) => {
      if (darkThemeEnabled) root.style.removeProperty(token);
      else root.style.setProperty(token, value);
    });
  }, [darkThemeEnabled]);

  useEffect(() => {
    localStorage.setItem('pulmo_auto_download', String(autoDownloadReport));
  }, [autoDownloadReport]);

  /* --- Account-owned scan history ----------------------------------------- */
  const [scanHistory, setScanHistory] = useState([]);
  const loadScanHistory = useCallback(async () => {
    if (!authToken) {
      setScanHistory([]);
      return;
    }
    try {
      const response = await fetch(`${API_BASE_URL}/api/history`, {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (response.ok) {
        const data = await response.json();
        setScanHistory(data.scans || []);
        setAuthChecked(true);
      } else if (response.status === 401) {
        setAuthToken('');
        setUserName('');
        localStorage.removeItem('pulmo_token');
        localStorage.removeItem('pulmo_user');
        setAuthChecked(true);
        navigate('/', { replace: true });
      } else {
        setAuthToken('');
        setUserName('');
        localStorage.removeItem('pulmo_token');
        localStorage.removeItem('pulmo_user');
        setAuthChecked(true);
        navigate('/', { replace: true });
      }
    } catch (error) {
      console.error('Unable to load scan history:', error);
      setAuthToken('');
      setUserName('');
      localStorage.removeItem('pulmo_token');
      localStorage.removeItem('pulmo_user');
      setAuthChecked(true);
      navigate('/', { replace: true });
    }
  }, [authToken, navigate]);

  useEffect(() => {
    loadScanHistory();
  }, [loadScanHistory]);

  /* --- Patient Form State ------------------------------------------------- */
  const [patientId, setPatientId] = useState('');
  const [patientName, setPatientName] = useState('');
  const [patientAge, setPatientAge] = useState('');
  const [patientGender, setPatientGender] = useState('Male');
  const [clinicalNotes, setClinicalNotes] = useState('');

  /* --- Scanner State ------------------------------------------------------ */
  const [isScanning, setIsScanning] = useState(false);
  const [scanResult, setScanResult] = useState(null);
  const [imageUploaded, setImageUploaded] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  /* --- Auth Handlers ------------------------------------------------------ */
  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    setAuthBusy(true);
    try {
      const response = await fetch(`${API_BASE_URL}/api/${isRegistering ? 'register' : 'login'}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: userName.trim(), password }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || 'Authentication failed.');

      setAuthToken(data.access_token);
      setAuthChecked(true);
      setUserName(data.user.email);
      localStorage.setItem('pulmo_token', data.access_token);
      localStorage.setItem('pulmo_user', data.user.email);
      setPassword('');
      navigate('/ai', { replace: true });
    } catch (error) {
      setAuthError(error.message || 'Unable to connect to the authentication service.');
    } finally {
      setAuthBusy(false);
    }
  };

  const handleLogout = () => {
    setAuthToken('');
    setAuthChecked(true);
    setUserName('');
    setScanHistory([]);
    localStorage.removeItem('pulmo_token');
    localStorage.removeItem('pulmo_user');
    navigate('/', { replace: true });
  };

  /* --- File Upload -------------------------------------------------------- */
  const handleFileSelect = (e) => {
    const file = e.target.files[0];
    if (file) {
      setSelectedFile(file);
      setImageUploaded(true);
      setScanResult(null);

      const reader = new FileReader();
      reader.onload = (ev) => setPreviewUrl(ev.target.result);
      reader.readAsDataURL(file);
    }
  };

  /* --- Core Inference ----------------------------------------------------- */
  const handleAnalyze = async () => {
    if (!selectedFile) {
      alert('Please upload a chest X-ray image first.');
      return;
    }

    setIsScanning(true);
    setScanResult(null);

    const formData = new FormData();
    formData.append('file', selectedFile);
    formData.append('patient_id', patientId);
    formData.append('patient_name', patientName);
    formData.append('clinical_notes', clinicalNotes);

    try {
      const response = await fetch(`${API_BASE_URL}/api/analyze`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${authToken}` },
        body: formData,
      });

      const data = await response.json();

      if (response.status === 401) {
        handleLogout();
        throw new Error('Your session expired. Please sign in again.');
      }

      if (response.ok && data.status === 'success') {
        const result = {
          diagnosis: data.diagnosis,
          confidence: data.confidence,
          confidenceRaw: data.confidence_raw,
          classProbabilities: data.class_probabilities,
          summary: data.summary,
          description: data.description,
          severity: data.severity,
          recommendation: data.recommendation,
          date: new Date().toLocaleDateString(),
          time: new Date().toLocaleTimeString(),
        };

        setScanResult(result);

        await loadScanHistory();
      } else {
        alert('AI Engine Error: ' + (data.detail || data.message || 'Request failed.'));
      }
    } catch (error) {
      alert(error.message || 'Connection failed. Is the FastAPI server running on port 8000?');
      console.error(error);
    } finally {
      setIsScanning(false);
    }
  };

  /* --- Reset Scanner ------------------------------------------------------ */
  const handleNewScan = () => {
    setScanResult(null);
    setImageUploaded(false);
    setSelectedFile(null);
    setPreviewUrl(null);
    setPatientId('');
    setPatientName('');
    setPatientAge('');
    setClinicalNotes('');
  };

  /* --- Report Generation -------------------------------------------------- */
  const handleDownloadReport = useCallback(() => {
    if (!scanResult) return;

    const pdf = new jsPDF({ format: 'a4', unit: 'mm' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 18;
    const textWidth = pageWidth - margin * 2;
    let cursorY = 51;

    pdf.setFillColor(8, 35, 48);
    pdf.rect(0, 0, pageWidth, 38, 'F');
    pdf.setTextColor(255, 255, 255);
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(19);
    pdf.text('PulmoAI Diagnostic Report', margin, 18);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(9);
    pdf.setTextColor(172, 218, 225);
    pdf.text('CHEST X-RAY AI SCREENING SUMMARY', margin, 27);

    const ensureSpace = (height) => {
      if (cursorY + height > pageHeight - margin) {
        pdf.addPage();
        cursorY = margin;
      }
    };

    const addSection = (title) => {
      ensureSpace(13);
      pdf.setTextColor(10, 87, 102);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(11);
      pdf.text(title.toUpperCase(), margin, cursorY);
      pdf.setDrawColor(188, 218, 222);
      pdf.line(margin, cursorY + 2, pageWidth - margin, cursorY + 2);
      cursorY += 9;
    };

    const addField = (label, value) => {
      const lines = pdf.splitTextToSize(String(value || 'Not provided'), textWidth - 39);
      const rowHeight = Math.max(6, lines.length * 5);
      ensureSpace(rowHeight + 2);
      pdf.setFont('helvetica', 'bold');
      pdf.setFontSize(10);
      pdf.setTextColor(55, 72, 80);
      pdf.text(label, margin, cursorY);
      pdf.setFont('helvetica', 'normal');
      pdf.setTextColor(25, 39, 45);
      pdf.text(lines, margin + 39, cursorY);
      cursorY += rowHeight + 2;
    };

    pdf.setTextColor(25, 39, 45);
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(10);
    pdf.text(`Date: ${scanResult.date}`, margin, cursorY);
    pdf.text(`Time: ${scanResult.time}`, margin + 82, cursorY);
    cursorY += 12;

    addSection('Report Details');
    addField('User Email', userName);
    addField('Patient', patientName || 'Not provided');
    addField('Registration ID', patientId || 'Not provided');

    addSection('AI Prediction Result');
    addField('Prediction', scanResult.diagnosis);
    addField('Confidence Score', scanResult.confidence);
    addField('Severity', scanResult.severity);

    if (scanResult.summary) {
      addSection('Clinical Summary');
      addField('Summary', scanResult.summary);
    }
    if (scanResult.recommendation) {
      addSection('Recommendation');
      addField('Follow-up', scanResult.recommendation);
    }

    const disclaimer = 'This is an AI-generated report and should be verified by a certified radiologist/doctor.';
    const disclaimerLines = pdf.splitTextToSize(disclaimer, textWidth - 12);
    const disclaimerHeight = disclaimerLines.length * 5 + 10;
    ensureSpace(disclaimerHeight);
    pdf.setFillColor(239, 246, 247);
    pdf.setDrawColor(188, 218, 222);
    pdf.roundedRect(margin, cursorY, textWidth, disclaimerHeight, 2, 2, 'FD');
    pdf.setFont('helvetica', 'bold');
    pdf.setFontSize(9);
    pdf.setTextColor(43, 70, 78);
    pdf.text(disclaimerLines, margin + 6, cursorY + 7);

    const filenameDate = scanResult.date.replace(/[^a-z0-9-]/gi, '-');
    pdf.save(`PulmoAI_Diagnostic_Report_${filenameDate}.pdf`);
  }, [scanResult, userName, patientId, patientName]);

  const previousScanResult = useRef(null);

  useEffect(() => {
    const isNewScanResult = scanResult && scanResult !== previousScanResult.current;
    previousScanResult.current = scanResult;

    if (isNewScanResult && autoDownloadReport) {
      handleDownloadReport();
    }
  }, [scanResult, autoDownloadReport, handleDownloadReport]);

  const handlePrint = () => window.print();

  const clearDatabase = () => {
    if (window.confirm('Are you sure you want to clear the entire scan database? This action cannot be undone.')) {
      fetch(`${API_BASE_URL}/api/history`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${authToken}` },
      }).then(async (response) => {
        if (response.ok) setScanHistory([]);
        else alert('Unable to clear scan history. Please try again.');
      }).catch(() => alert('Unable to connect to the scan history service.'));
    }
  };

  /* --- Probability bar color mapping -------------------------------------- */
  const getBarColor = (className) => {
    if (className.includes('Normal'))    return 'bar-emerald';
    if (className.includes('Pneumonia')) return 'bar-rose';
    if (className.includes('TB'))        return 'bar-amber';
    if (className.includes('Opacity'))   return 'bar-violet';
    return 'bar-cyan';
  };

  /* =====================================================================
     NAVIGATION ITEMS
     ===================================================================== */
  const navItems = [
    { id: 'overview',   icon: '📊', label: 'System Overview' },
    { id: 'ai_engine',  icon: '🚀', label: 'AI Engine' },
    { id: 'database',   icon: '📂', label: 'Scan Database' },
    { id: 'guidelines', icon: '📘', label: 'Med Guidelines' },
  ];

  /* =====================================================================
     RENDER — LOGIN SCREEN
     ===================================================================== */
  if (!isLoggedIn) {
    return (
      <Routes>
        <Route
          path="/"
          element={(
            <div className="login-screen">
              <div className="ambient-blob blob-1" />
              <div className="ambient-blob blob-2" />
              <div className="particles-grid" />
              <BreathingLungs size={600} opacity={0.25} glow />

              <div className="login-card">
                <span className="login-logo">🫁</span>
                <h1 className="login-title glow-text">PulmoAI</h1>
                <p className="login-subtitle text-cyan">
                  {isRegistering ? 'Create your secure account' : 'Sign in to your account'}
                </p>

                <form onSubmit={handleAuthSubmit} autoComplete="on">
                  <div className="form-group">
                    <label htmlFor="auth-email">Email</label>
                    <input
                      id="auth-email"
                      type="email"
                      className="input-field"
                      placeholder="you@example.com"
                      value={userName}
                      onChange={(event) => setUserName(event.target.value)}
                      autoComplete="email"
                      required
                    />
                  </div>
                  <div className="form-group">
                    <label htmlFor="auth-password">Password</label>
                    <input
                      id="auth-password"
                      type="password"
                      className="input-field"
                      placeholder={isRegistering ? 'At least 8 characters' : 'Your password'}
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      autoComplete={isRegistering ? 'new-password' : 'current-password'}
                      minLength={isRegistering ? 8 : undefined}
                      required
                    />
                  </div>
                  {authError && <p role="alert" className="text-rose">{authError}</p>}
                  <button
                    id="login-submit"
                    type="submit"
                    className="btn btn-primary pulse-ring"
                    style={{ marginTop: '12px' }}
                    disabled={authBusy}
                  >
                    {authBusy ? 'Please wait…' : isRegistering ? 'Create Account' : 'Sign In'}
                  </button>
                </form>

                <button
                  type="button"
                  className="btn btn-ghost"
                  style={{ width: '100%', marginTop: '12px' }}
                  onClick={() => {
                    setIsRegistering(!isRegistering);
                    setAuthError('');
                  }}
                >
                  {isRegistering ? 'Already registered? Sign In' : 'New to PulmoAI? Create an account'}
                </button>
              </div>
            </div>
          )}
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  if (!authChecked) {
    return (
      <div className="login-screen" role="status" aria-live="polite">
        <div className="login-card">Checking your secure session…</div>
      </div>
    );
  }

  if (location.pathname === '/') {
    return <Navigate to="/ai" replace />;
  }

  /* =====================================================================
     RENDER — MAIN APPLICATION
     ===================================================================== */
    const portal = (
    <div className="app-shell">
      {/* Background FX */}
      <div className="ambient-blob blob-1" />
      <div className="ambient-blob blob-2" />
      <div className="ambient-blob blob-3" />
      <div className="particles-grid" />
      <BreathingLungs size={900} opacity={0.03} />

      {/* ── SIDEBAR ─────────────────────────────────────────────────── */}
      <aside className="sidebar no-print">
        <div className="sidebar-brand">
          <span className="sidebar-brand-icon glow-text">🫁</span>
          <h2 className="glow-text">PulmoAI</h2>
        </div>

        <div className="sidebar-profile">
          <div className="avatar-circle">
            {userName.substring(0, 2).toUpperCase()}
          </div>
          <div className="profile-meta">
            <h4>{userName}</h4>
            <p>Authorized User</p>
          </div>
        </div>

        <nav className="sidebar-nav">
          {navItems.map((item) => (
            <button
              key={item.id}
              id={`nav-${item.id}`}
              className={`nav-btn ${activeTab === item.id ? 'active' : ''}`}
              onClick={() => setActiveTab(item.id)}
            >
              <span className="nav-icon">{item.icon}</span>
              <span>{item.label}</span>
            </button>
          ))}
          <div className="nav-divider" />
          <button
            id="nav-settings"
            className={`nav-btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <span className="nav-icon">⚙️</span>
            <span>Settings</span>
          </button>
        </nav>

        <div className="sidebar-footer">
          <button id="logout-btn" onClick={handleLogout} className="logout-btn">
            ⚡ Terminate Session
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT AREA ─────────────────────────────────────── */}
      <main className="main-content">

        {/* ━━━━━━━━━━━━ SYSTEM OVERVIEW ━━━━━━━━━━━━ */}
        {activeTab === 'overview' && (
          <div className="fade-in">
            <div className="page-header">
              <h1 className="page-title glow-text">System Overview</h1>
              <p className="page-subtitle">
                Global metrics and live inference feed of the PulmoAI neural diagnostic engine.
              </p>
            </div>

            <div className="stats-row">
              <div className="stat-card cyan-accent">
                <div className="stat-icon-wrap cyan">🚀</div>
                <h3 className="text-cyan">{1024 + scanHistory.length}</h3>
                <p className="stat-label text-cyan">Total Inferences</p>
              </div>
              <div className="stat-card green-accent">
                <div className="stat-icon-wrap green">🎯</div>
                <h3 className="text-emerald">97.8%</h3>
                <p className="stat-label text-emerald">Model Precision</p>
              </div>
              <div className="stat-card rose-accent">
                <div className="stat-icon-wrap rose">⚠️</div>
                <h3 className="text-rose">{scanHistory.filter(s => s.diagnosis !== 'Normal').length}</h3>
                <p className="stat-label text-rose">Anomalies Found</p>
              </div>
              <div className="stat-card amber-accent">
                <div className="stat-icon-wrap amber">📋</div>
                <h3 className="text-amber">{scanHistory.length}</h3>
                <p className="stat-label text-amber">Session Scans</p>
              </div>
            </div>

            <div className="panel">
              <h3 className="panel-title">
                <span className="live-dot" /> Live Inference Feed
              </h3>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Time</th>
                    <th>Patient ID</th>
                    <th>Subject</th>
                    <th>AI Diagnosis</th>
                    <th>Confidence</th>
                  </tr>
                </thead>
                <tbody>
                  {scanHistory.length === 0 ? (
                    <tr>
                      <td colSpan="5" className="table-empty">
                        Awaiting live scan data…
                      </td>
                    </tr>
                  ) : (
                    scanHistory.slice(0, 6).map((scan, i) => (
                      <tr key={i}>
                        <td className="text-muted mono" style={{ fontSize: '13px' }}>
                          {scan.timestamp?.split(' ')[1] || '—'}
                        </td>
                        <td className="mono">{scan.pid}</td>
                        <td>{scan.name}</td>
                        <td>
                          <span className={`badge ${scan.diagnosis === 'Normal' ? 'badge-success' : 'badge-danger'}`}>
                            {scan.diagnosis}
                          </span>
                        </td>
                        <td className="text-cyan mono">{scan.confidence}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━ AI ENGINE ━━━━━━━━━━━━ */}
        {activeTab === 'ai_engine' && (
          <div className="fade-in">
            <div className="page-header no-print">
              <h1 className="page-title glow-text">Neural Analysis Engine</h1>
              <p className="page-subtitle">
                Upload chest radiographs (CXR) for real-time AI-assisted pathology detection and automated clinical reporting.
              </p>
            </div>

            <div className="engine-grid">
              {/* Left Column — Demographics */}
              <div className="panel">
                <h3 className="panel-title">🏥 Target Demographics</h3>

                <div className="form-group">
                  <label>Registration ID</label>
                  <input
                    id="patient-id"
                    type="text"
                    className="input-field"
                    placeholder="e.g. PID-2026-X8"
                    value={patientId}
                    onChange={(e) => setPatientId(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Full Name</label>
                  <input
                    id="patient-name"
                    type="text"
                    className="input-field"
                    placeholder="Patient full name"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                  />
                </div>

                <div className="form-group">
                  <label>Age &amp; Gender</label>
                  <div className="input-row">
                    <input
                      id="patient-age"
                      type="number"
                      className="input-field"
                      placeholder="Age"
                      value={patientAge}
                      onChange={(e) => setPatientAge(e.target.value)}
                    />
                    <select
                      id="patient-gender"
                      className="input-field"
                      value={patientGender}
                      onChange={(e) => setPatientGender(e.target.value)}
                    >
                      <option>Male</option>
                      <option>Female</option>
                      <option>Other</option>
                    </select>
                  </div>
                </div>

                <div className="form-group">
                  <label>Clinical Notes</label>
                  <textarea
                    id="clinical-notes"
                    className="input-field"
                    rows="4"
                    placeholder="Enter symptoms, medical history, or observations…"
                    value={clinicalNotes}
                    onChange={(e) => setClinicalNotes(e.target.value)}
                  />
                </div>
              </div>

              {/* Right Column — Scanner & Results */}
              <div className="panel">
                <h3 className="panel-title no-print">🩻 X-Ray Optical Scanner</h3>

                {/* Scanner Dropzone */}
                <div className={`scanner-box no-print ${isScanning ? 'active-scan' : ''}`}>
                  <div className="drop-area">
                    {!imageUploaded ? (
                      <>
                        <span className="drop-icon glow-text">🩻</span>
                        <p>Drop Radiograph Here</p>
                        <p className="drop-hint">PNG, JPG, DICOM — Max 10MB</p>
                        <input
                          id="xray-upload"
                          type="file"
                          className="file-input-hidden"
                          accept="image/*"
                          onChange={handleFileSelect}
                        />
                      </>
                    ) : (
                      <div className="scan-viewport">
                        {isScanning ? (
                          <>
                            <BreathingLungs size={160} opacity={1} glow />
                            <div className="scan-line" />
                            <div className="scan-grid" />
                          </>
                        ) : previewUrl ? (
                          <img
                            src={previewUrl}
                            alt="Uploaded X-ray"
                            style={{
                              maxWidth: '100%',
                              maxHeight: '260px',
                              objectFit: 'contain',
                              borderRadius: '8px',
                              opacity: 0.85,
                            }}
                          />
                        ) : (
                          <span className="ready-text text-cyan">
                            Matrix Loaded. Awaiting Command.
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Action Button */}
                {!isScanning && !scanResult && (
                  <button id="analyze-btn" className="btn btn-primary pulse-ring no-print" onClick={handleAnalyze}>
                    ⚡ Initialize AI Scan
                  </button>
                )}
                {isScanning && (
                  <button className="btn btn-scanning no-print" disabled>
                    Computing Neural Vectors…
                  </button>
                )}

                {/* ── Result Panel ──────────────────────────── */}
                {scanResult && (
                  <div className="result-box">
                    <div className="result-header">
                      <h4 className="glow-text">INFERENCE COMPLETE</h4>
                      <span className={`badge ${scanResult.diagnosis === 'Normal' ? 'badge-success' : 'badge-danger'}`}>
                        {scanResult.diagnosis}
                      </span>
                    </div>

                    <div className="result-body">
                      <div>
                        <p className="label-small">Confidence Matrix</p>
                        <p className="value-big text-cyan">{scanResult.confidence}</p>
                      </div>
                      <div>
                        <p className="label-small">Severity</p>
                        <span
                          className="severity-badge"
                          style={{
                            background: scanResult.diagnosis === 'Normal' ? 'var(--emerald-dim)' : 'var(--rose-dim)',
                            color: scanResult.diagnosis === 'Normal' ? 'var(--emerald)' : 'var(--rose)',
                            border: `1px solid ${scanResult.diagnosis === 'Normal' ? 'var(--emerald)' : 'var(--rose)'}`,
                          }}
                        >
                          {scanResult.severity}
                        </span>
                      </div>
                      <div className="result-actions no-print">
                        <button id="export-btn" className="btn btn-ghost" onClick={handleDownloadReport}>
                          📥 Download Medical Report (PDF)
                        </button>
                        <button id="print-btn" className="btn btn-ghost" onClick={handlePrint}>
                          🖨️ Print
                        </button>
                      </div>
                    </div>

                    {/* ── Decision Breakdown ────────────────── */}
                    {scanResult.classProbabilities && (
                      <div className="breakdown-panel">
                        <p className="breakdown-title">Decision Breakdown — Probability Distribution</p>
                        {Object.entries(scanResult.classProbabilities).map(([cls, pct]) => (
                          <ProbabilityBar
                            key={cls}
                            label={cls}
                            percentage={pct}
                            colorClass={getBarColor(cls)}
                            isTop={cls === scanResult.diagnosis}
                          />
                        ))}
                      </div>
                    )}

                    {/* ── Clinical Details ──────────────────── */}
                    <div className="result-details" style={{ marginTop: '20px' }}>
                      <div className="detail-block">
                        <p className="label-small">AI Clinical Summary</p>
                        <p className="detail-text">{scanResult.summary}</p>
                      </div>
                      <div className="detail-block">
                        <p className="label-small">Pathology Description</p>
                        <p className="detail-text">{scanResult.description}</p>
                      </div>
                      <div className="detail-block">
                        <p className="label-small">Recommendation</p>
                        <p className="detail-text">{scanResult.recommendation}</p>
                      </div>
                    </div>

                    {/* New Scan Button */}
                    <button
                      className="btn btn-primary no-print"
                      style={{ marginTop: '20px' }}
                      onClick={handleNewScan}
                    >
                      🔄 New Scan
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━ SCAN DATABASE ━━━━━━━━━━━━ */}
        {activeTab === 'database' && (
          <div className="fade-in">
            <div className="header-flex">
              <div className="page-header" style={{ marginBottom: 0 }}>
                <h1 className="page-title glow-text">Scan Database</h1>
                <p className="page-subtitle">
                  Persistent local storage tracking all past patient scans.
                </p>
              </div>
              {scanHistory.length > 0 && (
                <button id="clear-db-btn" className="btn btn-danger-outline" onClick={clearDatabase}>
                  🗑️ Clear Database
                </button>
              )}
            </div>

            <div className="panel" style={{ marginTop: '24px' }}>
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Timestamp</th>
                    <th>Patient ID</th>
                    <th>Subject Name</th>
                    <th>Diagnosis</th>
                    <th>Confidence</th>
                    <th>Severity</th>
                  </tr>
                </thead>
                <tbody>
                  {scanHistory.length === 0 ? (
                    <tr>
                      <td colSpan="6" className="table-empty">
                        Database empty. Run a scan to populate data.
                      </td>
                    </tr>
                  ) : (
                    scanHistory.map((scan, i) => (
                      <tr key={i}>
                        <td className="text-muted mono" style={{ fontSize: '13px' }}>{scan.timestamp}</td>
                        <td className="mono">{scan.pid}</td>
                        <td>{scan.name}</td>
                        <td>
                          <span className={`badge ${scan.diagnosis === 'Normal' ? 'badge-success' : 'badge-danger'}`}>
                            {scan.diagnosis}
                          </span>
                        </td>
                        <td className="text-cyan mono">{scan.confidence}</td>
                        <td className="text-muted" style={{ fontSize: '12px' }}>{scan.severity || '—'}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━ MEDICAL GUIDELINES ━━━━━━━━━━━━ */}
        {activeTab === 'guidelines' && (
          <div className="fade-in">
            <div className="page-header">
              <h1 className="page-title glow-text">Medical Guidelines Directory</h1>
              <p className="page-subtitle">
                Comprehensive clinical overviews, symptoms, and radiographic markers for all detectable lung conditions.
              </p>
            </div>

            <div className="guide-grid">
              {/* Normal */}
              <div className="guide-card emerald-edge">
                <h3 className="text-emerald">🟢 Normal Lungs</h3>
                <div className="guide-section">
                  <strong>Clinical Overview</strong>
                  <p>
                    A normal chest radiograph demonstrates clear lung fields bilaterally with no focal consolidation, 
                    effusion, or pneumothorax. The cardiac silhouette is within normal limits, and the costophrenic 
                    angles are sharp and well-defined. The mediastinal contour and tracheal position are unremarkable.
                  </p>
                </div>
                <div className="guide-section">
                  <strong>Symptoms</strong>
                  <p>No respiratory distress. Patient presents with normal breathing pattern, oxygen saturation ≥ 95%, and no cough or chest pain.</p>
                </div>
                <div className="guide-section">
                  <strong>Radiographic Markers</strong>
                  <p>Clear lung parenchyma, normal hilar structures, intact diaphragms, no air-fluid levels, and normal bone density of the thoracic cage.</p>
                </div>
              </div>

              {/* Pneumonia */}
              <div className="guide-card rose-edge">
                <h3 className="text-rose">🔴 Pneumonia</h3>
                <div className="guide-section">
                  <strong>Clinical Overview</strong>
                  <p>
                    Pneumonia is an acute lower respiratory tract infection that inflames the air sacs (alveoli) in one 
                    or both lungs. The alveoli may fill with fluid or pus, causing cough with phlegm, fever, chills, 
                    and difficulty breathing. Community-acquired pneumonia (CAP) is the most common form.
                  </p>
                </div>
                <div className="guide-section">
                  <strong>Symptoms</strong>
                  <p>Productive cough, high-grade fever (≥38.5°C), pleuritic chest pain, tachypnea, crackles on auscultation, and decreased breath sounds in affected lobes.</p>
                </div>
                <div className="guide-section">
                  <strong>Radiographic Markers</strong>
                  <p>Lobar or segmental consolidation, air bronchograms, ground-glass opacities (GGO), silhouette sign, and possible parapneumonic effusion.</p>
                </div>
              </div>

              {/* Tuberculosis */}
              <div className="guide-card amber-edge">
                <h3 className="text-amber">🟡 Tuberculosis (TB)</h3>
                <div className="guide-section">
                  <strong>Clinical Overview</strong>
                  <p>
                    Pulmonary tuberculosis is a chronic granulomatous infection caused by Mycobacterium tuberculosis. 
                    It primarily affects the lungs but can disseminate to other organs. TB remains a leading cause of 
                    death from infectious disease worldwide, particularly in developing nations.
                  </p>
                </div>
                <div className="guide-section">
                  <strong>Symptoms</strong>
                  <p>Chronic cough (≥2 weeks), hemoptysis, night sweats, weight loss, low-grade fever, and fatigue. Patients may present with a positive Mantoux or QuantiFERON test.</p>
                </div>
                <div className="guide-section">
                  <strong>Radiographic Markers</strong>
                  <p>Upper-lobe fibronodular infiltrates, cavitary lesions, tree-in-bud pattern, hilar lymphadenopathy, calcified Ghon complex, and miliary nodules in disseminated TB.</p>
                </div>
              </div>

              {/* Lung Opacity */}
              <div className="guide-card violet-edge">
                <h3 className="text-violet">🟣 Lung Opacity</h3>
                <div className="guide-section">
                  <strong>Clinical Overview</strong>
                  <p>
                    Lung opacity is a non-specific radiographic finding referring to any area of increased density in 
                    the lung parenchyma. It encompasses a broad differential including pulmonary edema, pleural 
                    effusion, atelectasis, fibrosis, and neoplastic processes. Context-dependent evaluation is crucial.
                  </p>
                </div>
                <div className="guide-section">
                  <strong>Symptoms</strong>
                  <p>Variable depending on etiology — may include dyspnea, orthopnea, dry cough, pleuritic pain, or may be asymptomatic (incidental finding).</p>
                </div>
                <div className="guide-section">
                  <strong>Radiographic Markers</strong>
                  <p>Ground-glass opacities (GGO), consolidation, reticular patterns, honeycombing (fibrosis), meniscus sign (effusion), and mass-like densities requiring CT correlation.</p>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ━━━━━━━━━━━━ SETTINGS ━━━━━━━━━━━━ */}
        {activeTab === 'settings' && (
          <div className="fade-in">
            <div className="page-header">
              <h1 className="page-title glow-text">Settings</h1>
              <p className="page-subtitle">Personalize your PulmoAI workspace.</p>
            </div>

            <div className="panel settings-panel">
              <h3 className="panel-title">Preferences</h3>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Dark Theme</div>
                  <div className="text-muted" style={{ fontSize: '13px', marginTop: '4px' }}>
                    Use a darker appearance throughout the portal.
                  </div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Dark Theme"
                    checked={darkThemeEnabled}
                    onChange={(event) => setDarkThemeEnabled(event.target.checked)}
                    style={{
                      appearance: 'none',
                      width: '46px',
                      height: '26px',
                      margin: 0,
                      borderRadius: '999px',
                      background: darkThemeEnabled ? 'var(--cyan)' : 'rgba(128, 145, 153, 0.45)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 180ms ease',
                    }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      width: '20px',
                      height: '20px',
                      marginLeft: '-42px',
                      borderRadius: '50%',
                      background: '#fff',
                      transform: darkThemeEnabled ? 'translateX(20px)' : 'translateX(0)',
                      transition: 'transform 180ms ease',
                      pointerEvents: 'none',
                    }}
                  />
                </label>
              </div>

              <div className="setting-row">
                <div>
                  <div className="setting-label">Auto-download Report</div>
                  <div className="text-muted" style={{ fontSize: '13px', marginTop: '4px' }}>
                    Download a report automatically when a scan completes.
                  </div>
                </div>
                <label style={{ display: 'inline-flex', alignItems: 'center', cursor: 'pointer' }}>
                  <input
                    type="checkbox"
                    role="switch"
                    aria-label="Auto-download Report"
                    checked={autoDownloadReport}
                    onChange={(event) => setAutoDownloadReport(event.target.checked)}
                    style={{
                      appearance: 'none',
                      width: '46px',
                      height: '26px',
                      margin: 0,
                      borderRadius: '999px',
                      background: autoDownloadReport ? 'var(--cyan)' : 'rgba(128, 145, 153, 0.45)',
                      position: 'relative',
                      cursor: 'pointer',
                      transition: 'background 180ms ease',
                    }}
                  />
                  <span
                    aria-hidden="true"
                    style={{
                      width: '20px',
                      height: '20px',
                      marginLeft: '-42px',
                      borderRadius: '50%',
                      background: '#fff',
                      transform: autoDownloadReport ? 'translateX(20px)' : 'translateX(0)',
                      transition: 'transform 180ms ease',
                      pointerEvents: 'none',
                    }}
                  />
                </label>
              </div>

              <div style={{ borderTop: '1px solid var(--border-glass)', marginTop: '24px', paddingTop: '22px' }}>
                <div className="setting-row" style={{ borderBottom: 'none', padding: 0 }}>
                  <div>
                    <div className="setting-label">Sign In / Sign Out</div>
                    <div className="text-muted" style={{ fontSize: '13px', marginTop: '4px' }}>
                      Signed in as {userName}
                    </div>
                  </div>
                  <button type="button" className="btn btn-danger-outline" onClick={handleLogout}>
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  );

  return (
    <Routes>
      <Route path="/ai" element={portal} />
      <Route path="/history" element={portal} />
      <Route path="/overview" element={portal} />
      <Route path="/guidelines" element={portal} />
      <Route path="/settings" element={portal} />
      <Route path="/" element={<Navigate to="/ai" replace />} />
      <Route path="*" element={<Navigate to="/ai" replace />} />
    </Routes>
  );
}

export default App;