import streamlit as st
from streamlit_option_menu import option_menu
import tensorflow as tf
import numpy as np
from PIL import Image
import sqlite3
import pandas as pd
from datetime import datetime

# --- 1. Page Config ---
st.set_page_config(page_title="PulmoAI Portal", page_icon="🫁", layout="wide", initial_sidebar_state="collapsed")

# --- 2. Pure White Clean UI CSS ---
st.markdown("""
    <style>
    /* Pure white background and clean text */
    html, body, .stApp { background-color: #FFFFFF !important; color: #111827; }
    
    /* Clean Cards with subtle borders instead of shadows */
    .card { border: 1px solid #E5E7EB; border-radius: 8px; padding: 25px; margin-bottom: 20px; background-color: #FFFFFF; }
    
    /* Minimalist Headers */
    .header-text { color: #111827; font-weight: 600; font-size: 24px; border-bottom: 1px solid #E5E7EB; padding-bottom: 10px; margin-bottom: 20px; }
    
    /* Hide Streamlit default marks */
    #MainMenu {visibility: hidden;}
    footer {visibility: hidden;}
    </style>
""", unsafe_allow_html=True)

# --- 3. Real Database Initialization (Users & Patients) ---
def init_db():
    conn = sqlite3.connect('hospital.db')
    c = conn.cursor()
    # Users Table for Login/Registration
    c.execute('''CREATE TABLE IF NOT EXISTS streamlit_users (username TEXT PRIMARY KEY, password TEXT, role TEXT, full_name TEXT)''')
    legacy_users = c.execute("SELECT name FROM sqlite_master WHERE type='table' AND name='users'").fetchone()
    if legacy_users:
        legacy_columns = {row[1] for row in c.execute("PRAGMA table_info(users)")}
        if {"username", "password", "role", "full_name"}.issubset(legacy_columns):
            c.execute('''INSERT OR IGNORE INTO streamlit_users (username, password, role, full_name)
                         SELECT username, password, role, full_name FROM users''')
            c.execute("DROP TABLE users")
    # Patients Records Table
    c.execute('''CREATE TABLE IF NOT EXISTS patients (id INTEGER PRIMARY KEY AUTOINCREMENT, uploaded_by TEXT, patient_name TEXT, age INTEGER, gender TEXT, diagnosis TEXT, confidence REAL, date TEXT)''')
    conn.commit()
    conn.close()

init_db()

# --- 4. Session State variables ---
if 'logged_in' not in st.session_state:
    st.session_state['logged_in'] = False
    st.session_state['username'] = ''
    st.session_state['role'] = ''
    st.session_state['full_name'] = ''

# --- 5. Authentication System (Login / Register) ---
if not st.session_state['logged_in']:
    st.markdown("<h2 style='text-align: center; color: #111827; margin-top: 30px;'>🫁 Diagnostic Portal Access</h2>", unsafe_allow_html=True)
    
    tab1, tab2 = st.tabs(["Login", "Register New Account"])
    
    with tab1:
        col1, col2, col3 = st.columns([1, 1.5, 1])
        with col2:
            st.markdown("<div class='card'>", unsafe_allow_html=True)
            login_user = st.text_input("Username", key="log_user")
            login_pass = st.text_input("Password", type="password", key="log_pass")
            if st.button("Login", use_container_width=True):
                conn = sqlite3.connect('hospital.db')
                c = conn.cursor()
                c.execute("SELECT * FROM streamlit_users WHERE username=? AND password=?", (login_user, login_pass))
                user = c.fetchone()
                conn.close()
                
                if user:
                    st.session_state['logged_in'] = True
                    st.session_state['username'] = user[0]
                    st.session_state['role'] = user[2]
                    st.session_state['full_name'] = user[3]
                    st.rerun()
                else:
                    st.error("Invalid Username or Password!")
            st.markdown("</div>", unsafe_allow_html=True)
            
    with tab2:
        col1, col2, col3 = st.columns([1, 1.5, 1])
        with col2:
            st.markdown("<div class='card'>", unsafe_allow_html=True)
            reg_name = st.text_input("Full Name")
            reg_role = st.selectbox("I am a:", ["Patient", "Doctor"])
            reg_user = st.text_input("Choose Username")
            reg_pass = st.text_input("Choose Password", type="password")
            
            if st.button("Register Account", use_container_width=True):
                if reg_name and reg_user and reg_pass:
                    try:
                        conn = sqlite3.connect('hospital.db')
                        c = conn.cursor()
                        c.execute("INSERT INTO streamlit_users VALUES (?, ?, ?, ?)", (reg_user, reg_pass, reg_role, reg_name))
                        conn.commit()
                        conn.close()
                        st.success("Account created successfully! Please login from the other tab.")
                    except sqlite3.IntegrityError:
                        st.error("Username already exists. Please choose a different one.")
                else:
                    st.warning("Please fill all fields.")
            st.markdown("</div>", unsafe_allow_html=True)

# --- 6. Main Dashboard (After Login) ---
else:
    # Role-Based Menu
    if st.session_state['role'] == "Doctor":
        menu_opts = ["New Scan Analysis", "All Patients Database", "Logout"]
    else:
        menu_opts = ["Analyze My Scan", "My Medical History", "Logout"]
        
    selected = option_menu(
        menu_title=None,
        options=menu_opts,
        icons=["cloud-upload", "clipboard-data", "box-arrow-right"],
        menu_icon="cast", default_index=0, orientation="horizontal",
        styles={
            "container": {"padding": "0!important", "background-color": "#FFFFFF", "border-bottom": "1px solid #E5E7EB"},
            "nav-link-selected": {"background-color": "#111827", "color": "white"}
        }
    )

    st.write(f"Logged in as: **{st.session_state['full_name']}** | Role: **{st.session_state['role']}**")

    # Load Model
    @st.cache_resource
    def load_model():
        try: return tf.keras.models.load_model("../models/proposed_ensemble_model.keras")
        except: return None
            
    model = load_model()
    class_names = ['Lung Opacity', 'Normal', 'Pneumonia', 'Tuberculosis']

    # --- TAB 1: Scan Analysis ---
    if selected in ["New Scan Analysis", "Analyze My Scan"]:
        st.markdown("<div class='header-text'>X-Ray Image Analysis</div>", unsafe_allow_html=True)
        
        col1, col2 = st.columns([1, 2])
        
        with col1:
            st.markdown("<div class='card'>", unsafe_allow_html=True)
            # Patient form auto-fills if logged in as Patient
            p_name = st.session_state['full_name'] if st.session_state['role'] == "Patient" else st.text_input("Patient Full Name")
            p_age = st.number_input("Age", min_value=1, max_value=120, value=30)
            p_gender = st.selectbox("Gender", ["Male", "Female", "Other"])
            st.markdown("</div>", unsafe_allow_html=True)
            
        with col2:
            st.markdown("<div class='card'>", unsafe_allow_html=True)
            uploaded_file = st.file_uploader("Upload Chest X-Ray", type=["jpg", "jpeg", "png"])
            
            if uploaded_file and p_name:
                img_col, res_col = st.columns([1, 1])
                with img_col:
                    image = Image.open(uploaded_file).convert('RGB')
                    st.image(image, use_column_width=True)
                    
                with res_col:
                    if model:
                        with st.spinner("Processing deep learning patterns..."):
                            img = image.resize((224, 224))
                            img_array = tf.keras.preprocessing.image.img_to_array(img)
                            img_array = tf.expand_dims(img_array, 0)
                            
                            predictions = model.predict(img_array)
                            diagnosis = class_names[np.argmax(predictions[0])]
                            confidence = np.max(predictions[0]) * 100
                            
                            st.write(f"### Detected: **{diagnosis}**")
                            st.write(f"Confidence: {confidence:.2f}%")
                            
                            if st.button("Save Record"):
                                current_date = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
                                conn = sqlite3.connect('hospital.db')
                                c = conn.cursor()
                                c.execute("INSERT INTO patients (uploaded_by, patient_name, age, gender, diagnosis, confidence, date) VALUES (?, ?, ?, ?, ?, ?, ?)", 
                                          (st.session_state['username'], p_name, p_age, p_gender, diagnosis, confidence, current_date))
                                conn.commit()
                                conn.close()
                                st.success("Record successfully saved to database.")
                                
                                report_data = f"Patient: {p_name}\nAge: {p_age}\nDiagnosis: {diagnosis}\nConfidence: {confidence:.2f}%\nDate: {current_date}"
                                st.download_button("Download Report", data=report_data, file_name=f"{p_name}_report.txt")
            st.markdown("</div>", unsafe_allow_html=True)

    # --- TAB 2: Database History ---
    elif selected in ["All Patients Database", "My Medical History"]:
        st.markdown("<div class='header-text'>Medical Records</div>", unsafe_allow_html=True)
        
        conn = sqlite3.connect('hospital.db')
        if st.session_state['role'] == "Patient":
            df = pd.read_sql_query(f"SELECT patient_name, age, gender, diagnosis, confidence, date FROM patients WHERE patient_name='{st.session_state['full_name']}'", conn)
        else:
            df = pd.read_sql_query("SELECT patient_name, age, gender, diagnosis, confidence, date FROM patients ORDER BY id DESC", conn)
        conn.close()
        
        st.dataframe(df, use_container_width=True)

    # --- TAB 3: Logout ---
    elif selected == "Logout":
        for key in ['logged_in', 'username', 'role', 'full_name']:
            st.session_state[key] = ''
        st.session_state['logged_in'] = False
        st.rerun()