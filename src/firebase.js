import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

// Aapki actual Firebase Config (Screenshot se li gayi hai)
const firebaseConfig = {
  apiKey: "AIzaSyBtvIadrWPbY0M7_jOB-RvoIPpzKELLmmU",
  authDomain: "ai-medical-chatbot-901c3.firebaseapp.com",
  projectId: "ai-medical-chatbot-901c3",
  storageBucket: "ai-medical-chatbot-901c3.firebasestorage.app",
  messagingSenderId: "134396278902",
  appId: "1:134396278902:web:7c3750e6c8f09f33790757",
  measurementId: "G-2PXEWTWGTZ"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);