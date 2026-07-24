from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import os
import sqlite3
import urllib.request
import pickle
import csv
from dotenv import load_dotenv
from datetime import datetime
import warnings
import json

warnings.filterwarnings("ignore")
load_dotenv()

# ── PATHS ──────────────────────────────────────────────────────────────────────
BASE_DIR    = os.path.dirname(os.path.abspath(__file__))
DATASET_DIR = os.path.join(BASE_DIR, "dataset")
MASSIVE_DIR = os.path.join(BASE_DIR, "dataset_massive")
BERT_DIR    = os.path.join(BASE_DIR, "clinicalbert_local")
CACHE_FILE  = os.path.join(BASE_DIR, "bert_clinicalbert_cache.pkl")

# ── INTERNET CHECK ─────────────────────────────────────────────────────────────
def check_internet() -> bool:
    try:
        urllib.request.urlopen("https://www.google.com", timeout=3)
        return True
    except:
        return False

# ── GROQ SETUP ─────────────────────────────────────────────────────────────────
GROQ_API_KEY = os.getenv("GROQ_API_KEY", "").strip()
groq_client  = None

if GROQ_API_KEY:
    try:
        from groq import Groq
        groq_client = Groq(api_key=GROQ_API_KEY, timeout=15.0)
        print("✅ Groq API Ready! (Using Llama-3.3-70B)")
    except Exception as e:
        print(f"⚠️  Groq setup error: {e}")

# ── CSV LOADER (NO PANDAS) ─────────────────────────────────────────────────────
def read_csv_safe(filepath):
    if not os.path.exists(filepath): return None
    try:
        with open(filepath, mode='r', encoding='utf-8-sig') as f:
            reader = csv.DictReader(f)
            if reader.fieldnames:
                reader.fieldnames = [str(c).strip() for c in reader.fieldnames if c]
            return list(reader)
    except Exception as e:
        print(f"Error reading {filepath}: {e}")
        return None

# ── DATASET LOAD ───────────────────────────────────────────────────────────────
data_disease = data_desc = data_prec = data_drugs = data_training = None
symptom_cols = []
desc_col = "Description"

try:
    data_disease  = read_csv_safe(os.path.join(DATASET_DIR, "dataset.csv"))
    data_desc     = read_csv_safe(os.path.join(DATASET_DIR, "symptom_Description.csv"))
    data_prec     = read_csv_safe(os.path.join(DATASET_DIR, "symptom_precaution.csv"))
    data_drugs    = read_csv_safe(os.path.join(DATASET_DIR, "drugs_side_effects_drugs_com.csv"))
    data_training = read_csv_safe(os.path.join(DATASET_DIR, "training.csv"))

    if data_desc and len(data_desc) > 0:
        desc_keys = list(data_desc[0].keys())
        desc_col  = next((c for c in desc_keys if 'desc' in c.lower()), desc_keys[1] if len(desc_keys) > 1 else desc_keys[0])
    
    if data_disease and len(data_disease) > 0:
        symptom_cols = [c for c in data_disease[0].keys() if c.lower() != 'disease']
        unique_diseases = len(set(row.get('Disease', '') for row in data_disease if row.get('Disease')))
        print(f"✅ Core Datasets Loaded! {unique_diseases} base diseases")
except Exception as e:
    print(f"❌ Dataset Error: {e}")

# ── MEDICINE MAPPING & ALLERGY FILTER ──────────────────────────────────────────
DISEASE_TO_CONDITION = {
    "Acne": "Acne", "ADHD": "ADHD", "AIDS": "AIDS/HIV", "Allergies": "Allergies",
    "Anxiety": "Anxiety", "Asthma": "Asthma", "Bronchitis": "Bronchitis",
    "Cancer": "Cancer", "Cholesterol": "Cholesterol", "Cold": "Colds & Flu",
    "Flu": "Colds & Flu", "Influenza": "Colds & Flu", "Covid": "Covid 19",
    "Depression": "Depression", "Diabetes": "Diabetes (Type 2)",
    "Diarrhea": "Diarrhea", "Diarrhoea": "Diarrhea", "Eczema": "Eczema",
    "GERD": "GERD (Heartburn)", "Heartburn": "GERD (Heartburn)", "Gout": "Gout",
    "Hypertension": "Hypertension", "Herpes": "Herpes", "Hayfever": "Hayfever",
    "Hair Loss": "Hair Loss", "Fever": None, "Headache": None, "Migraine": None,
    "Malaria": None, "Dengue": None, "Typhoid": None,
}

FALLBACK_MEDICINES = {
    "Fever":           ["PARACETAMOL (500mg har 6 ghante)", "IBUPROFEN (400mg bukhar ke liye)"],
    "Headache":        ["PARACETAMOL (500mg)", "IBUPROFEN (400mg)", "ASPIRIN (500mg)"],
    "Migraine":        ["SUMATRIPTAN (50mg)", "IBUPROFEN (400mg)", "PARACETAMOL (1000mg)"],
    "Malaria":         ["CHLOROQUINE (doctor se)", "ARTEMETHER (doctor se)", "QUININE (doctor se)"],
    "Dengue":          ["PARACETAMOL (fever ke liye)", "ORS (hydration)", "Doctor se zaroor milein"],
    "Typhoid":         ["AZITHROMYCIN (doctor se)", "CIPROFLOXACIN (doctor se)", "PARACETAMOL (fever)"],
    "Gastroenteritis": ["ORS", "METRONIDAZOLE (doctor se)", "LOPERAMIDE (dast ke liye)"],
    "Pneumonia":       ["AMOXICILLIN (doctor se)", "AZITHROMYCIN (doctor se)", "PARACETAMOL"],
    "Tuberculosis":    ["RIFAMPICIN (doctor se)", "ISONIAZID (doctor se)"],
    "Jaundice":        ["Doctor se zaroor milein", "REST aur pani zyada", "Greasy food avoid karein"],
    "Chicken Pox":     ["ACYCLOVIR (doctor se)", "CALAMINE LOTION", "PARACETAMOL (fever)"],
    "Arthritis":       ["IBUPROFEN (400mg)", "DICLOFENAC GEL", "NAPROXEN (doctor se)"],
    "Hypertension":    ["AMLODIPINE (doctor se)", "LISINOPRIL (doctor se)", "LOSARTAN (doctor se)"],
    "Diabetes":        ["METFORMIN (doctor se)", "INSULIN (doctor se)", "Diet control zaroor"],
}

# 🌟 NEW: SMART ALLERGY FILTER FUNCTION
def is_med_allergic(med_name: str, user_allergies: str) -> bool:
    if not user_allergies or user_allergies.strip().lower() in ["none", "no", "nothing", ""]:
        return False
    stop_words = {"allergy", "allergic", "from", "to", "have", "i", "am", "and", "or", "with", "a", "an", "the", "my"}
    raw_words = user_allergies.replace(',', ' ').lower().split()
    actual_allergies = [w for w in raw_words if w not in stop_words and len(w) > 2]
    
    if not actual_allergies: return False
    med_lower = med_name.lower()
    return any(alg in med_lower for alg in actual_allergies)

def get_medicines(disease_name: str, allergies: str) -> list:
    for key, meds in FALLBACK_MEDICINES.items():
        if key.lower() in disease_name.lower() or disease_name.lower() in key.lower():
            safe_meds = [m for m in meds if not is_med_allergic(m, allergies)]
            return safe_meds if safe_meds else ["Doctor se safe mutbadil (alternative) dawai lein (Allergy detected)"]
            
    if data_drugs is not None:
        try:
            condition = None
            for key, val in DISEASE_TO_CONDITION.items():
                if key.lower() in disease_name.lower() and val:
                    condition = val
                    break
                    
            matches = []
            search_term = disease_name.lower().split()[0] if disease_name.strip() else ""
            
            for row in data_drugs:
                med_cond = str(row.get('medical_condition', '')).strip().lower()
                if condition:
                    if med_cond == condition.lower(): matches.append(row)
                else:
                    if search_term and search_term in med_cond: matches.append(row)
                
            if matches:
                def get_rating(r):
                    try: return float(r.get('rating', 0))
                    except: return 0.0
                matches.sort(key=get_rating, reverse=True)
                
                seen = set()
                meds = []
                first_match = matches[0]
                drug_col = 'drug_name' if 'drug_name' in first_match else next((c for c in first_match if 'drug' in c.lower() or 'medicine' in c.lower()), None)
                
                if drug_col:
                    for row in matches:
                        drug = str(row.get(drug_col, '')).strip()
                        if drug and drug.lower() not in seen and drug.lower() != 'nan':
                            if not is_med_allergic(drug, allergies):
                                seen.add(drug.lower())
                                meds.append(drug.upper())
                        if len(meds) >= 4: break
                    if meds: return meds
        except Exception as e:
            print(f"⚠️ Medicine lookup: {e}")
            
    safe_fallback = ["PARACETAMOL (500mg har 6-8 ghante)"] if not is_med_allergic("paracetamol", allergies) else ["IBUPROFEN (400mg) - Alternative"]
    safe_fallback.append("Doctor se specific medicine lein")
    return safe_fallback

# ── BERT + TF-IDF SETUP ────────────────────────────────────────────────────────
bert_tokenizer   = None
bert_model       = None
disease_index    = []
tfidf_vectorizer = None
tfidf_matrix     = None

def load_bert():
    global bert_tokenizer, bert_model, disease_index, tfidf_vectorizer, tfidf_matrix
    try:
        from transformers import AutoTokenizer, AutoModel
        import torch
        import numpy as np
        from sklearn.feature_extraction.text import TfidfVectorizer
        
        if not os.path.exists(BERT_DIR):
            print(f"⚠️  {BERT_DIR} not found.")
            return
            
        print(f"⏳ Loading ClinicalBERT from {BERT_DIR}...")
        bert_tokenizer = AutoTokenizer.from_pretrained(BERT_DIR)
        bert_model     = AutoModel.from_pretrained(BERT_DIR)
        bert_model.eval()
        
        def get_embedding(text):
            inputs = bert_tokenizer(text, return_tensors="pt", truncation=True, max_length=128, padding=True)
            with torch.no_grad():
                outputs = bert_model(**inputs)
            return outputs.last_hidden_state[:, 0, :].squeeze().numpy()
            
        if os.path.exists(CACHE_FILE):
            with open(CACHE_FILE, "rb") as f:
                cache_data = pickle.load(f)
                disease_index    = cache_data['index']
                tfidf_vectorizer = cache_data['vectorizer']
                tfidf_matrix     = cache_data['matrix']
            print(f"⚡ Loaded from Cache ({len(disease_index)} vectors)")
            return
            
        print("⏳ Building Hybrid Vector Index...")
        corpus = []
        
        if data_training is not None:
            train_cols = [c for c in data_training[0].keys() if c != 'prognosis']
            from collections import defaultdict
            grouped = defaultdict(list)
            for row in data_training:
                prog = str(row.get('prognosis', '')).strip()
                if prog: grouped[prog].append(row)
                
            for disease, group_rows in grouped.items():
                symptoms = set()
                for r in group_rows:
                    for col in train_cols:
                        val = str(r.get(col, '')).strip().lower()
                        if val and val != '0' and val != 'nan':
                            symptoms.add(val.replace("_", " "))
                text = f"{disease} symptoms: {' '.join(symptoms)}"
                disease_index.append({"disease": disease, "vector": get_embedding(text)})
                corpus.append(text)
                
        massive_path = os.path.join(MASSIVE_DIR, "Symptom2Disease.csv")
        data_massive = read_csv_safe(massive_path)
        if data_massive:
            for row in data_massive:
                label = str(row.get('label', '')).strip()
                text = str(row.get('text', '')).strip()
                if label and text:
                    disease_index.append({"disease": label, "vector": get_embedding(text)})
                    corpus.append(text)

        # ── 🌟 DDXPlus CSV Sample Integration ──
        ddx_csv_path = os.path.join(DATASET_DIR, "ddxplus_sample.csv")
        data_ddx = read_csv_safe(ddx_csv_path)
        if data_ddx:
            print("⏳ Loading DDXPlus sample into knowledge base...")
            try:
                count = 0
                for row in data_ddx:
                    if count >= 10000: break 
                    disease_name = str(row.get('PATHOLOGY', 'Unknown')).strip()
                    evidences = str(row.get('EVIDENCES', '')).strip()
                    
                    if disease_name and evidences and disease_name != 'Unknown':
                        text = f"{disease_name} symptoms: {evidences}"
                        disease_index.append({"disease": disease_name, "vector": get_embedding(text)})
                        corpus.append(text)
                        count += 1
                print(f"✅ Successfully added {count} records from DDXPlus dataset!")
            except Exception as e:
                print(f"⚠️ Error loading DDXPlus CSV: {e}")
                    
        tfidf_vectorizer = TfidfVectorizer(stop_words='english')
        tfidf_matrix     = tfidf_vectorizer.fit_transform(corpus)
        
        with open(CACHE_FILE, "wb") as f:
            pickle.dump({'index': disease_index, 'vectorizer': tfidf_vectorizer, 'matrix': tfidf_matrix}, f)
            
        print("✅ Hybrid RAG Engine Ready!")
        
    except Exception as e:
        print(f"⚠️  BERT/TFIDF error (Safe to ignore on Vercel): {e}")

# ── SQLite ─────────────────────────────────────────────────────────────────────
DB_NAME = os.path.join(BASE_DIR, "medical_data.db")

def get_db():
    conn = sqlite3.connect(DB_NAME)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db()
    conn.execute("""CREATE TABLE IF NOT EXISTS chat_history (
        id INTEGER PRIMARY KEY AUTOINCREMENT, user_input TEXT, allergies TEXT DEFAULT 'None',
        source TEXT, ai_response TEXT, created_at DATETIME DEFAULT CURRENT_TIMESTAMP)""")
        
    conn.execute("""CREATE TABLE IF NOT EXISTS user_profiles (
        email TEXT PRIMARY KEY, name TEXT DEFAULT 'Patient', profile_pic TEXT,
        age TEXT DEFAULT '', gender TEXT DEFAULT '', blood_group TEXT DEFAULT '', allergies TEXT DEFAULT 'None')""")
        
    try:
        conn.execute("ALTER TABLE user_profiles ADD COLUMN name TEXT DEFAULT 'Patient'")
        conn.execute("ALTER TABLE user_profiles ADD COLUMN age TEXT DEFAULT ''")
        conn.execute("ALTER TABLE user_profiles ADD COLUMN gender TEXT DEFAULT ''")
        conn.execute("ALTER TABLE user_profiles ADD COLUMN blood_group TEXT DEFAULT ''")
    except: pass
    
    conn.execute("""CREATE TABLE IF NOT EXISTS user_chats (
        chat_id TEXT PRIMARY KEY, user_email TEXT, title TEXT,
        messages_json TEXT, updated_at DATETIME DEFAULT CURRENT_TIMESTAMP)""")
        
    conn.commit()
    conn.close()

def save_to_db(user_input, allergies, source, response):
    try:
        conn = get_db()
        conn.execute(
            "INSERT INTO chat_history (user_input,allergies,source,ai_response,created_at) VALUES(?,?,?,?,?)",
            (user_input, allergies, source, response, datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        )
        conn.commit()
        conn.close()
    except: pass

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    load_bert()
    yield

app = FastAPI(title="AI Medical Chatbot", lifespan=lifespan)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=False, allow_methods=["*"], allow_headers=["*"])

# ── PROFILE & CHAT ENDPOINTS ───────────────────────────────────────────────────
class ProfileData(BaseModel):
    email: str
    name: str = "Patient"
    profile_pic: str = None
    age: str = ""
    gender: str = ""
    blood_group: str = ""
    allergies: str = "None"

class ChatSaveData(BaseModel):
    chat_id: str
    user_email: str
    title: str
    messages: list

@app.post("/api/profile/save")
def save_profile(data: ProfileData):
    conn = get_db()
    conn.execute("""INSERT INTO user_profiles (email,name,profile_pic,age,gender,blood_group,allergies)
        VALUES(?,?,?,?,?,?,?) ON CONFLICT(email) DO UPDATE SET
        name=excluded.name, profile_pic=excluded.profile_pic, age=excluded.age,
        gender=excluded.gender, blood_group=excluded.blood_group, allergies=excluded.allergies""",
        (data.email, data.name, data.profile_pic, data.age, data.gender, data.blood_group, data.allergies))
    conn.commit(); conn.close()
    return {"status": "success"}

@app.get("/api/profile/{email}")
def get_profile(email: str):
    conn = get_db()
    user = conn.execute("SELECT * FROM user_profiles WHERE email = ?", (email,)).fetchone()
    conn.close()
    if user: return dict(user)
    return {"name": "Patient", "profile_pic": None, "age": "", "gender": "", "blood_group": "", "allergies": "None"}

@app.post("/api/chats/save")
def save_chat(data: ChatSaveData):
    conn = get_db()
    conn.execute("""INSERT INTO user_chats (chat_id,user_email,title,messages_json)
        VALUES(?,?,?,?) ON CONFLICT(chat_id) DO UPDATE SET
        title=excluded.title, messages_json=excluded.messages_json, updated_at=CURRENT_TIMESTAMP""",
        (data.chat_id, data.user_email, data.title, json.dumps(data.messages)))
    conn.commit(); conn.close()
    return {"status": "success"}

@app.get("/api/chats/{email}")
def get_chats(email: str):
    conn = get_db()
    chats = conn.execute("SELECT chat_id,title,messages_json FROM user_chats WHERE user_email=? ORDER BY updated_at DESC", (email,)).fetchall()
    conn.close()
    return [{"id": c["chat_id"], "title": c["title"], "savedChat": json.loads(c["messages_json"])} for c in chats]

@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str):
    conn = get_db()
    conn.execute("DELETE FROM user_chats WHERE chat_id=?", (chat_id,))
    conn.commit(); conn.close()
    return {"status": "success"}

# ── PYDANTIC ───────────────────────────────────────────────────────────────────
class ConsultationRequest(BaseModel):
    symptoms:     str
    allergies:    str  = "None"
    conversation: list = []

class ConsultationResponse(BaseModel):
    ai_response: str
    source:      str
    timestamp:   str

# ── LANGUAGE DETECTION ─────────────────────────────────────────────────────────
def detect_language(text: str) -> str:
    urdu_keywords = {"hai","mera","mujhe","dard","bukhar","khansi","pait","sar","sir","gala","kia",
                     "kya","hun","ho","gaya","mein","mn","aur","ya","yeh","woh","takleef","masla",
                     "dawain","dawai","kaisa","ilaaj","ulta","ulti","qay","dast","nai","nahi","han",
                     "kese","kesa","theek"}
    if set(text.lower().split()).intersection(urdu_keywords):
        return "roman_urdu"
    return "english"

# ── NON-MEDICAL WORDS FOR OFFLINE MODE ─────────────────────────────────
NON_MEDICAL_WORDS_EN = {
    "hello", "hi", "hey", "how are you", "good morning", "good night",
    "what is your name", "who are you", "thanks", "thank you", "ok", "okay",
    "bye", "goodbye", "help me", "how old are you", "what can you do"
}

NON_MEDICAL_WORDS_UR = {
    "kasa ho", "kaise ho", "kaisa ho", "aap kaisa", "shukriya", "salam",
    "assalam", "hello", "hi", "theek ho", "kya haal", "acha", "khuda hafiz",
    "bye", "jaan", "yaar", "dost"
}

def is_non_medical_offline(text: str) -> bool:
    text_lower = text.lower().strip()
    if any(w in text_lower for w in NON_MEDICAL_WORDS_UR):
        return True
    if any(w == text_lower for w in NON_MEDICAL_WORDS_EN):
        return True
    return False

# ── EMERGENCY DETECTION ────────────────────────────────────────────────────────
EMERGENCY_PATTERNS = {
    "chest_cardiac": {
        "en": ["chest pain","chest pressure","chest tightness","crushing pain in chest","heart attack","pain radiating to arm","pain in jaw and chest"],
        "ur": ["seena dard","chest mein dard","seene mein jalan","seene mein bojh","dil ka dora","bayen hath mein dard","seena aur jabra dard"]
    },
    "breathing": {
        "en": ["difficulty breathing","can't breathe","cannot breathe","shortness of breath","struggling to breathe","gasping for air","choking"],
        "ur": ["saans nahi aa rahi","saans lene mein takleef","saans phool raha","saans ruk raha","dam ghut raha","gala band ho raha"]
    },
    "neuro_stroke": {
        "en": ["face drooping","slurred speech","sudden numbness one side","sudden confusion","can't move one side","loss of balance suddenly","worst headache of my life"],
        "ur": ["chehra tirha ho gaya","zaban larkharana","aik taraf sunn ho gaya","achanak behoshi","achanak chakkar aur girna","zindagi ka sab se shadeed sar dard"]
    },
    "unconscious_seizure": {
        "en": ["unconscious","passed out","fainted and not waking","seizure","convulsions","not responding"],
        "ur": ["behosh","behoshi ho gayi","dora para","jhatkay lag rahe","hosh nahi aa raha","koi response nahi de raha"]
    },
    "severe_bleeding": {
        "en": ["severe bleeding","heavy bleeding","won't stop bleeding","blood loss a lot","vomiting blood","coughing up blood"],
        "ur": ["zyada khoon beh raha","khoon rukk nahi raha","khoon ki qay","khansi mein khoon","bohat zyada khoon aa raha"]
    },
    "allergic_severe": {
        "en": ["throat swelling","swelling of throat","can't swallow suddenly","severe allergic reaction","anaphylaxis","face swelling after eating"],
        "ur": ["gala soojh gaya","achanak nigal nahi pa raha","shadeed allergy","khanay ke baad chehra soojh gaya"]
    },
    "poisoning_overdose": {
        "en": ["overdose","took too many pills","swallowed poison","drank poison","accidental poisoning"],
        "ur": ["zeher kha liya","zeher pi liya","zyada dawai kha li","goliyan zyada kha lin"]
    },
    "self_harm": {
        "en": ["want to die","kill myself","end my life","suicidal","hurting myself","self harm","no reason to live"],
        "ur": ["khudkushi","marna chahta hun","marna chahti hun","jaan dena chahta","zindagi khatam karna","apne aap ko nuksan"]
    },
    "severe_burn_trauma": {
        "en": ["severe burn","third degree burn","deep wound","broken bone visible","major accident injury"],
        "ur": ["shadeed jalna","haddi tot gayi bahar nazar aa rahi","gehra zakhm","bara accident lagi hai"]
    }
}

def detect_emergency(text: str):
    text_lower = text.lower().strip()
    for category, langs in EMERGENCY_PATTERNS.items():
        for phrase in langs["en"] + langs["ur"]:
            if phrase in text_lower:
                return category
    return None

def get_emergency_response(category: str, lang: str) -> str:
    if category == "self_harm":
        if lang == "roman_urdu":
            return "🚨 FORI TAWAJAH ZAROORI HAI\n──────────────────────────────\nAap ne jo baat share ki hai, wo bohat sanjeedgi se lene wali hai. Aap akele nahi hain aur madad mojood hai.\n\nBarae meharbani abhi kisi qareebi trusted insaan se baat karein, ya foran kisi mental health helpline / emergency services (1122) se raabta karein.\n\nYeh chatbot is qisam ki situation mein madad dene ke liye tayyar nahi hai."
        else:
            return "🚨 IMMEDIATE ATTENTION NEEDED\n──────────────────────────────\nWhat you've shared is serious, and you don't have to go through it alone.\n\nPlease reach out right now to someone you trust, or contact a mental health helpline or emergency services (1122) immediately.\n\nThis chatbot isn't equipped to support this kind of situation."
            
    if lang == "roman_urdu":
        return "🚨 YEH EK MEDICAL EMERGENCY HO SAKTI HAI\n──────────────────────────────\nAap ne jo alamat batayi hain, un mein foran professional madad zaroori ho sakti hai.\n\n⚠️ FORAN QAREEBI HOSPITAL JAYEN YA EMERGENCY (1122) PAR CALL KAREIN.\n──────────────────────────────\n• Khud gaari na chalayen, kisi aur se madad lein\n• Mareez ko akela na chorein\n• Yeh chatbot emergency situations ka ilaj nahi kar sakta"
    else:
        return "🚨 THIS MAY BE A MEDICAL EMERGENCY\n──────────────────────────────\nThe symptoms you've described may require immediate professional attention.\n\n⚠️ PLEASE GO TO THE NEAREST HOSPITAL OR CALL EMERGENCY SERVICES (1122) RIGHT AWAY.\n──────────────────────────────\n• Do not drive yourself — get someone to help\n• Do not leave the person alone\n• This chatbot cannot treat emergencies"

# ── GROQ RESPONSE ──────────────────────────────────────────────────────────────
def get_groq_response(user_text: str, allergies: str, conversation: list) -> str:
    if not groq_client: return None
    lang = detect_language(user_text)
    
    if lang == "english":
        system_prompt = f"""You are an elite, highly intelligent Medical AI.
CRITICAL LANGUAGE RULE: You MUST respond entirely in pure, professional ENGLISH. Do not use a single word of Urdu.
CRITICAL DOMAIN RULE: If the input is non-medical, refuse to answer exactly with: "I am a specialized Medical AI Chatbot designed exclusively for healthcare purposes. I cannot assist with non-medical topics. Please describe your medical symptoms."

CRITICAL MEDICAL RULE: YOU MUST STRICTLY FILTER MEDICINES. If the user has "Known Allergies", YOU MUST NEVER recommend any medicine that matches or contains those allergies. Provide safe alternatives instead.

⚠️ NOTE: Words like 'ulti', 'qay', 'matli', 'dast', 'chakkar' are valid local terms for vomiting, nausea, diarrhea, dizziness etc. TREAT THEM AS VALID MEDICAL SYMPTOMS.
YOUR JOB:
1. AMBIGUOUS SYMPTOMS: If the user's CURRENT message contains ONLY a broad symptom like 'headache', 'stomach pain', 'fever' WITHOUT extra details, you MUST ask a clarifying multiple-choice question with exactly 5 options (A-E). E = Other / None of these. STOP THERE — do not give diagnosis yet.
2. CLEAR SYMPTOMS OR OPTION SELECTED: If the user provides a clear symptom OR selects an option (A, B, C, D, E), YOU MUST NEVER ASK ANOTHER QUESTION. IMMEDIATELY provide the diagnosis in EXACTLY this format:
🩺 DIAGNOSIS / CONDITION
──────────────────────────────
[Name]
📋 DESCRIPTION
──────────────────────────────
[Description]
💊 RECOMMENDED MEDICINES
──────────────────────────────
• [MEDICINE] (Dosage)
🛡️ PRECAUTIONS & HOME CARE
──────────────────────────────
• [Precaution]
⚠️ IMPORTANT MEDICAL ADVICE
──────────────────────────────
Please consult a doctor.
Known Allergies: {allergies}"""
    else:
        system_prompt = f"""You are an elite, highly intelligent Medical AI.
CRITICAL LANGUAGE RULE: You MUST respond entirely in pure ROMAN URDU. Do not write English sentences.
CRITICAL DOMAIN RULE: Agar user ki baat bimari se mutaliq nahi hai, toh inkaar karein: "Main ek Medical Chatbot hoon jo sirf tibbi maqasid ke liye banaya gaya hai. Barae meharbani apni bimari batayein."

CRITICAL MEDICAL RULE: DAWAIYON KA KHAS KHAYAL RAKHEIN. Agar user ki "Known Allergies" di gayi hain, toh HARGIZ aisi koi dawai nahi batani jo us allergy se match karti ho. Sirf safe mutbadil (alternative) dawaiyan batayen.

⚠️ DHEYAN RAHE: Alfaz jaise 'ulti', 'qay', 'matli', 'dast', 'chakkar', 'bukhar' pure medical symptoms hain. Inhein hargiz non-medical mat samjhna!
YOUR JOB:
1. AMBIGUOUS SYMPTOMS: Agar user ki CURRENT message mein sirf ek aam symptom ho jaise 'sar dard', 'stomach pain', 'bukhar' BINA kisi aur detail ke, toh LAZMI 5 options wala sawal poochein (A se E tak). E = Koi aur. Wahin ruk jayen — dawaiyan abhi mat dein.
2. CLEAR SYMPTOMS OR OPTION SELECTED: Agar user koi option chune ya detail bataye, toh HARGIZ DOBARA SAWAL MAT POOCHEIN. Foran is EXACT format mein ilaj batayen:
🩺 DIAGNOSIS / CONDITION
──────────────────────────────
[Bimari Ka Naam]
📋 DESCRIPTION
──────────────────────────────
[Tafseel]
💊 RECOMMENDED MEDICINES
──────────────────────────────
• [MEDICINE] (Meqdar)
🛡️ PRECAUTIONS & HOME CARE
──────────────────────────────
• [Ehtiyat]
⚠️ IMPORTANT MEDICAL ADVICE
──────────────────────────────
Kisi qualified doctor se zaroor mashwara karein.
Known Allergies: {allergies}"""

    lang_name = "ENGLISH" if lang == "english" else "ROMAN URDU"
    messages  = [{"role": "system", "content": system_prompt}]
    
    for msg in conversation[-4:]:
        msg_content = msg.get("content", "")
        if msg_content and detect_language(msg_content) == lang:
            messages.append({"role": msg.get("role", "user"), "content": msg_content})
            
    reinforced_text = f"{user_text}\n\n[SYSTEM REMINDER: Reply strictly in {lang_name}. Treat 'qay','ulti' as medical symptoms. IF current message is ONLY a vague symptom like headache/fever/stomach pain/sar dard/pait dard/bukhar with NO other details, ASK clarifying options first. IF user selected an option (A,B,C,D,E) OR gave more details, give diagnosis IMMEDIATELY in the exact format — DO NOT ask more questions.]"
    messages.append({"role": "user", "content": reinforced_text})
    
    try:
        completion = groq_client.chat.completions.create(messages=messages, model="llama-3.3-70b-versatile", temperature=0.2)
        result = completion.choices[0].message.content.strip().replace("*", "")
        
        refusal_markers   = ["specialized Medical AI Chatbot designed exclusively", "Main ek Medical Chatbot hoon jo sirf tibbi"]
        symptom_words     = ["pain","dard","ache","fever","bukhar","hurt","sick","bimar","takleef","symptom","alamat","sore","swelling","soojan","cough","khansi","vomit","ulti","qay","dizzy","chakkar"]
        
        is_refusal        = any(m in result for m in refusal_markers)
        has_symptom       = any(w in user_text.lower() for w in symptom_words)
        is_wrong_lang     = lang == "english" and detect_language(result) == "roman_urdu"
        
        if (is_refusal and has_symptom) or is_wrong_lang:
            retry_msgs = [{"role": "system", "content": system_prompt}, {"role": "user", "content": reinforced_text}]
            retry      = groq_client.chat.completions.create(messages=retry_msgs, model="llama-3.3-70b-versatile", temperature=0.2)
            return retry.choices[0].message.content.strip().replace("*", "")
            
        return result
    except Exception as e:
        print(f"⚠️  Groq error: {e}")
        return None

# ── OFFLINE DIRECT SYMPTOMS ────────────────────────────────────────────────────
OFFLINE_DIRECT_SYMPTOMS = {
    "headache": "headache", "sar dard": "headache", "sir dard": "headache",
    "fever": "fever", "bukhar": "fever", "tez bukhar": "fever", "high fever": "fever",
    "stomach pain": "stomach pain", "pait dard": "stomach pain", "maida dard": "stomach pain",
    "cough": "cough", "khansi": "cough", "cold": "cold", "nazla": "cold", "zukaam": "cold",
    "vomiting": "vomiting", "ulti": "vomiting", "matli": "vomiting", "qay": "vomiting",
    "diarrhea": "diarrhea", "dast": "diarrhea", "loose motion": "diarrhea",
    "body pain": "body pain", "badan dard": "body pain", "pathon ka dard": "body pain",
    "chest pain": "chest pain", "seena dard": "chest pain"
}

OFFLINE_DIRECT_MEDICINES = {
    "headache":    {"en": {"medicines": ["PARACETAMOL (500mg)", "IBUPROFEN (400mg)"], "precautions": ["Rest in a dark room", "Stay hydrated"]},
                    "ur": {"medicines": ["PARACETAMOL (500mg)", "IBUPROFEN (400mg)"], "precautions": ["Andhere kamre mein aaram karein", "Pani zyada piyein"]}},
    "fever":       {"en": {"medicines": ["PARACETAMOL (500mg)", "IBUPROFEN (400mg)"], "precautions": ["Drink lots of fluids", "Rest completely"]},
                    "ur": {"medicines": ["PARACETAMOL (500mg)", "IBUPROFEN (400mg)"], "precautions": ["Pani aur juice zyada piyein", "Mukammal aaram karein"]}},
    "stomach pain":{"en": {"medicines": ["ANTACID (MAALOX)", "OMEPRAZOLE"], "precautions": ["Eat light food", "Avoid spicy food"]},
                    "ur": {"medicines": ["ANTACID (MAALOX)", "OMEPRAZOLE"], "precautions": ["Halka khana khayen", "Masalay wali khorak se parhez karein"]}},
    "cough":       {"en": {"medicines": ["DEXTROMETHORPHAN", "HONEY + GINGER"], "precautions": ["Drink warm water", "Avoid cold items"]},
                    "ur": {"medicines": ["DEXTROMETHORPHAN", "SHAHED + ADRAK"], "precautions": ["Garam pani piyein", "Thandi cheezon se parhez karein"]}},
    "cold":        {"en": {"medicines": ["CETIRIZINE", "PARACETAMOL"], "precautions": ["Take steam", "Rest"]},
                    "ur": {"medicines": ["CETIRIZINE", "PARACETAMOL"], "precautions": ["Bhaap (steam) lein", "Aaram karein"]}},
    "vomiting":    {"en": {"medicines": ["DOMPERIDONE (10mg)", "ORS"], "precautions": ["Drink small sips of water", "Avoid solid food"]},
                    "ur": {"medicines": ["DOMPERIDONE (10mg)", "ORS"], "precautions": ["Pani ke chote ghoont piyein", "Thos khorak na khayen"]}},
    "diarrhea":    {"en": {"medicines": ["LOPERAMIDE (2mg)", "ORS"], "precautions": ["Drink plenty of fluids", "Avoid dairy products"]},
                    "ur": {"medicines": ["LOPERAMIDE (2mg)", "ORS"], "precautions": ["Pani aur ORS zyada piyein", "Doodh wali cheezon se parhez karein"]}},
    "body pain":   {"en": {"medicines": ["IBUPROFEN (400mg)", "PARACETAMOL"], "precautions": ["Rest", "Apply warm compress"]},
                    "ur": {"medicines": ["IBUPROFEN (400mg)", "PARACETAMOL"], "precautions": ["Aaram karein", "Garam patti se senk karein"]}},
    "chest pain":  {"en": {"medicines": ["⚠️ SEEK EMERGENCY CARE IMMEDIATELY"], "precautions": ["Rest immediately", "Do not exert yourself"]},
                    "ur": {"medicines": ["⚠️ FORAN HOSPITAL JAYEN"], "precautions": ["Foran aaram karein", "Koi zor wala kaam na karein"]}}
}

# 🌟 FIX 3: ADDED ALLERGIES FILTER IN DIRECT OFFLINE TOO
def format_offline_direct_response(symptom: str, allergies: str, lang: str) -> str:
    lang_key = "ur" if lang == "roman_urdu" else "en"
    data = OFFLINE_DIRECT_MEDICINES.get(symptom, {}).get(lang_key)
    if not data: return None
    
    safe_medicines = [m for m in data["medicines"] if not is_med_allergic(m, allergies)]
    if not safe_medicines:
        safe_medicines = ["Doctor se safe mutbadil dawai lein (Allergy Detected)"] if lang == "roman_urdu" else ["Consult doctor for safe alternative (Allergy Detected)"]
        
    meds_formatted = '\n'.join(['• ' + m for m in safe_medicines])
    prec_formatted = '\n'.join(['• ' + p for p in data["precautions"]])
    
    if lang == "roman_urdu":
        desc = "Yeh aam alamat (symptom) hai. Fori aaram ke liye neechay di gayi hidayat par amal karein."
        return f"🩺 PRELIMINARY RELIEF / CONDITION\n──────────────────────────────\n{symptom.upper()}\n📋 DESCRIPTION\n──────────────────────────────\n{desc}\n💊 RECOMMENDED MEDICINES (Tajaweez Karda Dawaiyan)\n──────────────────────────────\n{meds_formatted}\n🛡️ PRECAUTIONS & HOME CARE (Ehtiyati Tadabeer)\n──────────────────────────────\n{prec_formatted}\n⚠️ IMPORTANT MEDICAL ADVICE (Zaroori Mashwara)\n──────────────────────────────\nThis is offline AI-assisted info. Please consult a doctor.\nKnown Allergies: {allergies}"
    else:
        desc = "This is a common symptom. Follow the preliminary relief guidelines below."
        return f"🩺 PRELIMINARY RELIEF / CONDITION\n──────────────────────────────\n{symptom.upper()}\n📋 DESCRIPTION\n──────────────────────────────\n{desc}\n💊 RECOMMENDED MEDICINES\n──────────────────────────────\n{meds_formatted}\n🛡️ PRECAUTIONS & HOME CARE\n──────────────────────────────\n{prec_formatted}\n⚠️ IMPORTANT MEDICAL ADVICE\n──────────────────────────────\nThis is offline AI-assisted info. Please consult a doctor.\nKnown Allergies: {allergies}"

def normalize_for_bert(text: str) -> str:
    text_lower = text.lower().strip()
    mapping = {
        "sar dard": "headache", "sir dard": "headache", "bukhar": "fever", "tez bukhar": "high fever",
        "pait dard": "stomach pain", "maida dard": "stomach pain", "khansi": "continuous cough",
        "nazla": "runny nose", "ulti": "vomiting", "matli": "nausea", "dast": "diarrhea loose motion",
        "qay": "vomiting", "badan dard": "muscle pain body ache", "kamar dard": "back pain",
        "gala dard": "sore throat", "khujli": "itching skin rash", "aankh": "eye", "aankhon": "eyes",
        "dard": "pain", "chati": "chest", "seena": "chest", "dil": "heart", "chakkar": "dizziness",
        "thakan": "fatigue", "kamzori": "weakness", "saans": "breath", "khoon": "blood", "jild": "skin",
    }
    for k in sorted(mapping.keys(), key=len, reverse=True):
        if k in text_lower:
            text_lower = text_lower.replace(k, mapping[k])
    return text_lower

def format_disease_response(disease: str, allergies: str, lang: str) -> str:
    description = ""
    if data_desc:
        for row in data_desc:
            if disease.lower() in str(row.get('Disease', '')).lower():
                description = str(row.get(desc_col, ''))
                break
        
    precautions = []
    if data_prec:
        for row in data_prec:
            if disease.lower() in str(row.get('Disease', '')).lower():
                for i in range(1, 5):
                    col = f'Precaution_{i}'
                    val = str(row.get(col, '')).strip()
                    if val and val.lower() != 'nan':
                        precautions.append(val.capitalize())
                break
                    
    medicines = get_medicines(disease, allergies)
    
    if lang == "roman_urdu":
        description = description or "Tafseel local database mein mojood nahi. Doctor se ruju karein."
        prec_text   = "\n".join([f"• {p}" for p in precautions]) if precautions else "• Aaram karein\n• Pani zyada piyein\n• Doctor se milein"
        med_h, pr_h, adv_h = "RECOMMENDED MEDICINES (Tajaweez Karda Dawaiyan)", "PRECAUTIONS & HOME CARE (Ehtiyati Tadabeer)", "IMPORTANT MEDICAL ADVICE (Zaroori Mashwara)"
    else:
        description = description or "Clinical data not found locally. Consult a doctor."
        prec_text   = "\n".join([f"• {p}" for p in precautions]) if precautions else "• Rest and hydrate\n• See a doctor."
        med_h, pr_h, adv_h = "RECOMMENDED MEDICINES", "PRECAUTIONS & HOME CARE", "IMPORTANT MEDICAL ADVICE"
        
    med_text = "\n".join([f"• {m}" for m in medicines])
    return f"🩺 DIAGNOSIS / CONDITION\n──────────────────────────────\n{disease}\n📋 DESCRIPTION\n──────────────────────────────\n{description}\n💊 {med_h}\n──────────────────────────────\n{med_text}\n🛡️ {pr_h}\n──────────────────────────────\n{prec_text}\n⚠️ {adv_h}\n──────────────────────────────\nThis is offline AI-assisted information. Always consult a qualified doctor.\nKnown Allergies: {allergies}"

def hybrid_rag_search(user_text: str):
    if not disease_index or bert_model is None or tfidf_vectorizer is None: return None, 0.0
    try:
        import torch
        import numpy as np
        from sklearn.metrics.pairwise import cosine_similarity
        
        inputs = bert_tokenizer(user_text, return_tensors="pt", truncation=True, max_length=128, padding=True)
        with torch.no_grad(): out = bert_model(**inputs)
        
        user_emb     = out.last_hidden_state[:, 0, :].squeeze().numpy()
        user_tfidf   = tfidf_vectorizer.transform([user_text])
        tfidf_scores = cosine_similarity(user_tfidf, tfidf_matrix).flatten()
        
        best_disease, best_score = None, 0.0
        
        for idx, item in enumerate(disease_index):
            bert_score   = float(np.dot(user_emb, item["vector"]) / (np.linalg.norm(user_emb) * np.linalg.norm(item["vector"]) + 1e-8))
            hybrid_score = (bert_score * 0.4) + (tfidf_scores[idx] * 0.6)
            if hybrid_score > best_score:
                best_score   = hybrid_score
                best_disease = item["disease"]
                
        if best_score < 0.55: return None, best_score
        return best_disease, best_score
    except Exception as e:
        return None, 0.0

# ── MAIN ENDPOINT ──────────────────────────────────────────────────────────────
@app.post("/api/consultation", response_model=ConsultationResponse)
def get_diagnosis(request: ConsultationRequest):
    if not request.symptoms.strip():
        raise HTTPException(status_code=422, detail="Symptoms cannot be empty.")
        
    user_text    = request.symptoms.strip()
    allergies    = request.allergies.strip() or "None"
    conversation = request.conversation or []
    timestamp    = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    lang         = detect_language(user_text)
    
    # ── Emergency check — sab se pehle ────────────────────────────────────────
    emergency_cat = detect_emergency(user_text)
    if emergency_cat:
        response_text = get_emergency_response(emergency_cat, lang)
        save_to_db(user_text, allergies, f"emergency_{emergency_cat}", response_text)
        return ConsultationResponse(ai_response=response_text, source=f"emergency_{emergency_cat}", timestamp=timestamp)
        
    internet      = check_internet()
    response_text = None
    source        = "unknown"
    
    # ── ONLINE: Groq handles everything ───────────────────────────────────────
    if internet and groq_client:
        response_text = get_groq_response(user_text, allergies, conversation)
        if response_text: source = "groq_llama3_70b"
        
    # ── OFFLINE: Local system ──────────────────────────────────────────────────
    if not response_text:
        if is_non_medical_offline(user_text):
            if lang == "roman_urdu":
                response_text = "Main ek Medical AI Chatbot hoon. Main sirf bimariyon aur sehat se mutaliq sawaalon ka jawab de sakta hoon.\n\nBarae meharbani apni takleef ya symptoms batayein."
            else:
                response_text = "I am a Medical AI Chatbot. I can only assist with health and medical related questions.\n\nPlease describe your symptoms or medical condition."
            source = "non_medical_offline"
        else:
            text_lower = user_text.lower().strip()
            matched    = None
            for keyword, mapped in OFFLINE_DIRECT_SYMPTOMS.items():
                if keyword in text_lower:
                    matched = mapped
                    break
                    
            if matched:
                response_text = format_offline_direct_response(matched, allergies, lang)
                source        = "offline_direct"
            else:
                expanded       = normalize_for_bert(user_text)
                disease, score = hybrid_rag_search(expanded)
                
                if disease:
                    response_text = format_disease_response(disease, allergies, lang)
                    source        = "hybrid_rag_offline"
                else:
                    if lang == "roman_urdu":
                        response_text = f"⚠️ DIAGNOSIS UNCONFIRMED\n──────────────────────────────\nMeri offline database aapki alamat ('{user_text}') ko theek se pehchan nahi pa rahi.\n\nGhalat dawai dene se behtar hai ke main aapse maazrat karun. Barae meharbani internet connect karein (online mode ke liye) ya kisi qualified doctor se ruju karein."
                    else:
                        response_text = f"⚠️ DIAGNOSIS UNCONFIRMED\n──────────────────────────────\nMy offline database cannot confidently diagnose your symptom ('{user_text}').\n\nTo ensure your safety, I will not recommend unverified medications. Please connect to the internet for the advanced online AI or consult a qualified doctor."
                    source = "not_found"
                    
    save_to_db(user_text, allergies, source, response_text)
    return ConsultationResponse(ai_response=response_text, source=source, timestamp=timestamp)

# ── HEALTH CHECK ───────────────────────────────────────────────────────────────
@app.get("/")
def health_check():
    internet = check_internet()
    return {
        "status":           "Active",
        "mode":             "Online (Groq LLM)" if internet else "Offline (Hybrid RAG)",
        "internet":         internet,
        "vectors_indexed":  len(disease_index),
        "version":          "8.5.1 — Super Smart Allergy Filter Added & Vercel Optimized"
    }