# 🩺 AI Medical Chatbot with Hybrid RAG & Emergency Alert System

An advanced, full-stack AI healthcare assistant engineered for precise disease diagnosis, smart medication filtering, and emergency response. Developed as a Final Year Project (BSCS Artificial Intelligence) at PMAS Arid Agriculture University Rawalpindi.

## 🚀 Key Features

*   **Hybrid RAG Architecture:** Integrates ClinicalBERT dense vector embeddings with TF-IDF keyword matching for highly accurate offline medical querying.
*   **Massive Knowledge Base:** Powered by core clinical datasets combined with 10,000+ advanced records from the DDXPlus medical dataset.
*   **Smart Allergy Filter:** Automatically scans patient profiles for drug allergies and safely filters out contraindicated medications in real-time.
*   **Emergency Modal System:** Uses NLP to detect critical, life-threatening conditions (e.g., severe chest pain, strokes, breathing issues) and instantly triggers a UI blocker popup with direct 1122 dial access.
*   **Bilingual Intelligence:** Fully operational in both professional English and local Roman Urdu, automatically detecting the user's language and adapting the response format.
*   **Online/Offline Failover:** Seamlessly switches between the advanced Groq Llama-3.3 LLM (Online Mode) and the local Hybrid RAG engine (Offline Mode) without crashing.

## 📊 Datasets & Knowledge Base

Due to GitHub's file size constraints, the primary heavy dataset files and local AI models are excluded from this repository. However, the Hybrid RAG engine processes the following locally:
*   **DDXPlus Medical Dataset:** Over 10,000+ patient symptom records and clinical data (600MB+ JSON) used for pattern matching and scenario generation.
*   **Symptom & Disease Base:** Multiple CSV datasets mapping symptom severity, disease precautions, and comprehensive drug side-effects.
*   **ClinicalBERT Embeddings:** Locally cached vector embeddings optimized for offline, domain-specific medical querying without relying entirely on external APIs.

## 🛠️ Tech Stack

*   **Backend Engineering:** Python, FastAPI, SQLite
*   **Machine Learning / AI:** PyTorch, Hugging Face Transformers (ClinicalBERT), Scikit-Learn (TF-IDF)
*   **Large Language Model:** Llama-3.3-70B (via Groq API)
*   **Frontend UI:** React.js, React Router, Modern CSS
*   **Data Processing:** Pandas, NumPy

## ⚙️ How to Run Locally

### 1. Backend Setup (FastAPI)
```bash
cd backend
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn main:app --reload --port 8000
2. Frontend Setup (React)
Bash
cd ai-medical-bot
npm install
npm run dev
⚠️ Disclaimer: This AI-generated advice is for educational and preliminary relief purposes only and is not a substitute for professional medical consultation.