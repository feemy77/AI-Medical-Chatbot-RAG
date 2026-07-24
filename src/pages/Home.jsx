import React, { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';

// 🌟 PROFESSIONAL FIREBASE AUTH IMPORTS
import { auth } from '../firebase';
import { signOut, onAuthStateChanged } from 'firebase/auth';

export default function Home() {
  const navigate = useNavigate();

  const [isLoggedIn, setIsLoggedIn] = useState(() => localStorage.getItem('aiMedicalLoggedIn') === 'true');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('aiMedicalTheme') === 'dark');
  
  // Modals State
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [showDisclaimer, setShowDisclaimer] = useState(false); // 🌟 NEW: Disclaimer State in Home

  // 🌟 HELPER: Yeh function theme ke ilawa sab kuch dho dalega
  const clearAllMedicalData = () => {
    const theme = localStorage.getItem('aiMedicalTheme');
    Object.keys(localStorage).forEach(key => {
      if (key.startsWith('aiMedical')) {
        localStorage.removeItem(key);
      }
    });
    if (theme) localStorage.setItem('aiMedicalTheme', theme); // Theme bachao
  };

  // 🌟 MAGIC FIX: Session Storage Watchdog
  useEffect(() => {
    const isNewSession = !sessionStorage.getItem('aiMedicalSessionActive');
    
    if (isNewSession) {
      signOut(auth);
      clearAllMedicalData();
      sessionStorage.setItem('aiMedicalSessionActive', 'true');
      setIsLoggedIn(false);
    }

    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) {
        setIsLoggedIn(true);
        localStorage.setItem('aiMedicalLoggedIn', 'true');
      } else {
        setIsLoggedIn(false);
        clearAllMedicalData();
      }
    });

    return () => unsubscribe();
  }, []);

  // 🌟 NEW: SHOW DISCLAIMER ON HOME SCREEN AFTER LOGIN
  useEffect(() => {
    if (isLoggedIn) {
      const userEmail = localStorage.getItem('aiMedicalUserEmail');
      // Agar email hai aur disclaimer pehle nahi dekha, toh Home par hi show karo!
      if (userEmail && localStorage.getItem(`aiMedical_DisclaimerSeen_${userEmail}`) !== 'true') {
        setShowDisclaimer(true);
      }
    }
  }, [isLoggedIn]);

  const acceptDisclaimer = () => {
    const userEmail = localStorage.getItem('aiMedicalUserEmail');
    if (userEmail) {
      localStorage.setItem(`aiMedical_DisclaimerSeen_${userEmail}`, 'true');
    }
    setShowDisclaimer(false);
  };

  useEffect(() => {
    localStorage.setItem('aiMedicalTheme', isDarkMode ? 'dark' : 'light');
  }, [isDarkMode]);

  const handleConsultationClick = () => {
    if (isLoggedIn) {
      navigate('/chat');
    } else {
      navigate('/auth');
    }
  };

  const handleLogoutClick = () => {
    setShowLogoutModal(true);
  };

  const confirmLogout = async () => {
    try {
      await signOut(auth); // Firebase se session khatam
      clearAllMedicalData(); // Local Storage khatam
      setIsLoggedIn(false); 
      setShowLogoutModal(false);
    } catch (error) {
      console.error("Error logging out: ", error);
    }
  };

  const theme = {
    bg: isDarkMode ? '#121212' : '#ffffff',
    navBg: isDarkMode ? '#1f1f1f' : 'white',
    heroBg: isDarkMode ? '#1a242f' : '#e0f7fa',
    cardBg: isDarkMode ? '#1e1e1e' : '#ffffff', 
    textMain: isDarkMode ? '#f1f1f1' : '#333333',
    textHeading: isDarkMode ? '#64b5f6' : '#01579b',
    textMuted: isDarkMode ? '#aaaaaa' : '#555555',
    border: isDarkMode ? '#333333' : '#eeeeee',
    heroBorder: isDarkMode ? '#2c3e50' : '#b2ebf2',
    danger: '#dc3545',
    primary: '#0277bd'
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0, width: '100vw', minHeight: '100vh', overflowX: 'hidden',
      fontFamily: 'Arial, sans-serif', backgroundColor: theme.bg, color: theme.textMain, display: 'flex', flexDirection: 'column',
      margin: 0, padding: 0, transition: '0.3s'
    }}>

      {/* Navigation Bar */}
      <nav style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '20px 50px', backgroundColor: theme.navBg, borderBottom: `1px solid ${theme.border}`, zIndex: 10, transition: '0.3s' }}>
        <div style={{ fontSize: '22px', fontWeight: '900', color: theme.textHeading, letterSpacing: '1px' }}>
          🩺 AI Driven Medical Chat-bot
        </div>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
          {!isLoggedIn ? (
            <Link to="/auth" style={{ textDecoration: 'none', color: theme.textMain, fontWeight: 'bold', fontSize: '16px' }}>
              Login / Signup
            </Link>
          ) : (
            <>
              <Link to="/profile" style={{ textDecoration: 'none', color: theme.textMain, fontWeight: 'bold', fontSize: '16px' }}>
                My Profile
              </Link>
              <button 
                onClick={handleLogoutClick} 
                style={{ background: 'transparent', border: 'none', color: theme.danger, fontWeight: 'bold', fontSize: '16px', cursor: 'pointer' }}
              >
                Log Out
              </button>
            </>
          )}

          <button
            onClick={() => setIsDarkMode(!isDarkMode)}
            style={{ cursor: 'pointer', background: 'transparent', border: `1px solid ${theme.border}`, borderRadius: '20px', padding: '8px 15px', color: theme.textMain, fontSize: '15px', display: 'flex', alignItems: 'center', gap: '5px', fontWeight: 'bold' }}
          >
            {isDarkMode ? '☀️ Light' : '🌙 Dark'}
          </button>
        </div>
      </nav>

      {/* Hero Section */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', textAlign: 'center', padding: '40px 20px', backgroundColor: theme.heroBg, borderBottom: `1px solid ${theme.heroBorder}`, transition: '0.3s' }}>
        <h1 style={{ fontSize: '55px', color: theme.textHeading, marginBottom: '20px', fontWeight: '900', maxWidth: '800px', lineHeight: '1.2' }}>
          Your Personal AI Medical Assistant
        </h1>
        <p style={{ fontSize: '19px', color: theme.textMuted, maxWidth: '780px', margin: '0 auto 40px auto', lineHeight: '1.6' }}>
          Get instant, AI-driven symptom analysis and preliminary medical advice 24/7.
        </p>
        <button
          onClick={handleConsultationClick}
          style={{ cursor: 'pointer', border: 'none', backgroundColor: '#0277bd', color: 'white', padding: '15px 40px', borderRadius: '30px', fontSize: '18px', fontWeight: 'bold', boxShadow: '0 4px 6px rgba(0,0,0,0.2)', transition: '0.3s' }}
        >
          Start Free Consultation 🚀
        </button>
      </div>

      {/* Features */}
      <div style={{ display: 'flex', justifyContent: 'center', gap: '30px', padding: '50px 20px', flexWrap: 'wrap', backgroundColor: theme.bg }}>
        <div style={{ backgroundColor: theme.cardBg, padding: '30px', borderRadius: '15px', width: '260px', textAlign: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', borderTop: '4px solid #0277bd' }}>
          <div style={{ fontSize: '45px', marginBottom: '15px' }}>⚡</div>
          <h3 style={{ color: theme.textMain }}>Instant Analysis</h3>
        </div>
        <div style={{ backgroundColor: theme.cardBg, padding: '30px', borderRadius: '15px', width: '260px', textAlign: 'center', boxShadow: '0 4px 10px rgba(0,0,0,0.05)', borderTop: '4px solid #28a745' }}>
          <div style={{ fontSize: '45px', marginBottom: '15px' }}>🔒</div>
          <h3 style={{ color: theme.textMain }}>Private & Secure</h3>
        </div>
      </div>

      {/* Footer */}
      <div style={{ textAlign: 'center', padding: '20px', backgroundColor: theme.navBg, color: theme.textMuted, fontSize: '14px', borderTop: `1px solid ${theme.border}` }}>
        © 2026 AI Driven Medical Chat-bot. All rights reserved.
      </div>

      {/* 🌟 NEW: DISCLAIMER MODAL IN HOME SCREEN */}
      {showDisclaimer && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.7)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 9999,
        }}>
          <div style={{
            backgroundColor: theme.cardBg, padding: '40px', borderRadius: '20px',
            textAlign: 'center', maxWidth: '450px', width: '90%',
            borderTop: `6px solid ${theme.primary}`,
          }}>
            <div style={{ fontSize: '60px', marginBottom: '20px' }}>🏥</div>
            <h2 style={{ margin: '0 0 15px 0', color: theme.textMain, fontSize: '26px', fontWeight: '900' }}>
              Medical Disclaimer
            </h2>
            <p style={{ color: theme.textMuted, marginBottom: '15px', fontSize: '16px', lineHeight: '1.6' }}>
              This AI chatbot provides <strong>general medical information only</strong>.
              It is <strong>not</strong> a replacement for professional medical advice,
              diagnosis, or treatment.
            </p>
            <div style={{
              backgroundColor: isDarkMode ? '#3a2a2a' : '#fff3cd',
              borderLeft: `4px solid ${theme.danger}`,
              padding: '15px', borderRadius: '5px', marginBottom: '30px', textAlign: 'left',
            }}>
              <p style={{ margin: 0, color: isDarkMode ? '#ffb3b3' : '#856404', fontSize: '14px', lineHeight: '1.5' }}>
                <strong>⚠️ Emergency:</strong> In a severe medical emergency, visit a hospital
                or call emergency services immediately.
              </p>
            </div>
            <button
              onClick={acceptDisclaimer}
              style={{
                backgroundColor: theme.primary, color: 'white',
                padding: '14px 30px', borderRadius: '30px', border: 'none',
                fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', width: '100%',
              }}
            >
              I Understand & Agree
            </button>
          </div>
        </div>
      )}

      {/* LOGOUT MODAL */}
      {showLogoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 1000 }}>
          <div style={{ 
            backgroundColor: theme.cardBg, 
            padding: '30px', 
            borderRadius: '15px', 
            textAlign: 'center', 
            boxShadow: '0 10px 40px rgba(0,0,0,0.5)', 
            borderTop: `5px solid ${theme.danger}`, 
            maxWidth: '350px', 
            width: '90%' 
          }}>
            <div style={{ fontSize: '50px', marginBottom: '15px' }}>🚪</div>
            <h3 style={{ margin: '0 0 10px 0', color: theme.textMain, fontSize: '22px' }}>Logging Out?</h3>
            <p style={{ color: theme.textMuted, marginBottom: '25px', fontSize: '15px', lineHeight: '1.5' }}>
              Are you sure you want to log out of your Medical Assistant account?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
              <button 
                onClick={() => setShowLogoutModal(false)} 
                style={{ backgroundColor: 'transparent', color: theme.textMain, padding: '10px 20px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '15px', fontWeight: 'bold', cursor: 'pointer' }}
              >
                Cancel
              </button>
              <button 
                onClick={confirmLogout} 
                style={{ backgroundColor: theme.danger, color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer', boxShadow: '0 4px 6px rgba(0,0,0,0.1)' }}
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}