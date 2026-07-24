import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';

// 🌟 PROFESSIONAL FIREBASE LOGOUT IMPORT
import { auth } from '../firebase';
import { signOut } from 'firebase/auth';

const BACKEND_URL = '';// Backend URL

export default function Profile() {
  const navigate = useNavigate();

  // SECURITY GUARD
  useEffect(() => {
    if (localStorage.getItem('aiMedicalLoggedIn') !== 'true') {
      navigate('/auth');
    }
  }, [navigate]);

  const userEmail = localStorage.getItem('aiMedicalUserEmail') || 'patient@example.com';
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('aiMedicalTheme') === 'dark');

  // DATA LOAD LOGIC (Local Fallback)
  const getSavedData = (key) => {
      const data = localStorage.getItem(`aiMedical_${key}_${userEmail}`);
      return data || '';
  };

  // 🌟 NEW: Name Edit States
  const [name, setName] = useState(() => localStorage.getItem('aiMedicalUserName') || 'Patient');
  const [isEditingName, setIsEditingName] = useState(false);

  const [age, setAge] = useState(() => getSavedData('Age'));
  const [gender, setGender] = useState(() => getSavedData('Gender'));
  const [bloodGroup, setBloodGroup] = useState(() => getSavedData('Blood'));
  const [allergies, setAllergies] = useState(() => getSavedData('Allergies'));
  const [profilePic, setProfilePic] = useState(() => getSavedData('ProfilePic'));

  const [showSaveModal, setShowSaveModal] = useState(false);
  const [showLogoutModal, setShowLogoutModal] = useState(false);

  // FETCH PROFILE FROM DATABASE ON LOAD
  useEffect(() => {
    const fetchProfile = async () => {
      if (!userEmail) return;
      try {
        const res = await fetch(`${BACKEND_URL}/api/profile/${userEmail}`);
        if (res.ok) {
          const data = await res.json();
          if (data.age) setAge(data.age);
          if (data.gender) setGender(data.gender);
          if (data.blood_group) setBloodGroup(data.blood_group);
          if (data.allergies && data.allergies !== 'None') setAllergies(data.allergies);
          if (data.profile_pic) setProfilePic(data.profile_pic);
          
          // 🌟 Update name from DB
          if (data.name) {
            setName(data.name);
            localStorage.setItem('aiMedicalUserName', data.name);
          }
        }
      } catch (err) {
        console.error("Error fetching profile from backend:", err);
      }
    };
    fetchProfile();
  }, [userEmail]);

  useEffect(() => { localStorage.setItem('aiMedicalTheme', isDarkMode ? 'dark' : 'light'); }, [isDarkMode]);

  // HANDLE IMAGE UPLOAD
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setProfilePic(reader.result);
      };
      reader.readAsDataURL(file);
    }
  };

  // DATA SAVE LOGIC (DATABASE + LOCALSTORAGE)
  const saveMedicalProfile = async (e) => {
    e.preventDefault();
    try {
      // 1. Save to Database First!
      await fetch(`${BACKEND_URL}/api/profile/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: userEmail,
          name: name, // 🌟 Updated name field
          age: age,
          gender: gender,
          blood_group: bloodGroup,
          profile_pic: profilePic,
          allergies: allergies || "None"
        })
      });

      // 2. Keep localStorage updated for fast UI loads
      localStorage.setItem('aiMedicalUserName', name); // Save new name locally
      localStorage.setItem(`aiMedical_Age_${userEmail}`, age);
      localStorage.setItem(`aiMedical_Gender_${userEmail}`, gender);
      localStorage.setItem(`aiMedical_Blood_${userEmail}`, bloodGroup);
      localStorage.setItem(`aiMedical_Allergies_${userEmail}`, allergies);
      if (profilePic) localStorage.setItem(`aiMedical_ProfilePic_${userEmail}`, profilePic);
      
      // 3. Show Success Modal
      setIsEditingName(false); // Close edit input if open
      setShowSaveModal(true); 
    } catch (err) {
      console.error('Error saving profile to database:', err);
      alert('Failed to connect to backend database!');
    }
  };

  const confirmLogout = async () => {
    try {
      await signOut(auth);
      
      const theme = localStorage.getItem('aiMedicalTheme');
      Object.keys(localStorage).forEach(key => {
        if (key.startsWith('aiMedical')) {
          localStorage.removeItem(key);
        }
      });
      if (theme) localStorage.setItem('aiMedicalTheme', theme);

      navigate('/');
    } catch (error) {
      console.error("Error logging out: ", error);
    }
  };

  const theme = {
    bgGradient: isDarkMode ? 'linear-gradient(135deg, #121212 0%, #1a242f 100%)' : 'linear-gradient(135deg, #f4f7f6 0%, #e0f7fa 100%)',
    cardBg: isDarkMode ? '#1e1e1e' : '#ffffff', textMain: isDarkMode ? '#f1f1f1' : '#333333',
    textMuted: isDarkMode ? '#aaaaaa' : '#777777', border: isDarkMode ? '#333333' : '#dddddd',
    primary: '#0277bd', danger: '#dc3545', success: '#28a745',
    avatarBg: isDarkMode ? '#2d2d2d' : '#e0f7fa', inputBg: isDarkMode ? '#2d2d2d' : '#f9f9f9'
  };

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', minHeight: '100vh', background: theme.bgGradient, color: theme.textMain, display: 'flex', flexDirection: 'column', alignItems: 'center', fontFamily: 'Arial, sans-serif', padding: '40px 0', overflowY: 'auto', transition: '0.3s' }}>
      
      <div style={{ width: '100%', maxWidth: '600px', display: 'flex', justifyContent: 'space-between', marginBottom: '20px', padding: '0 20px' }}>
        <Link to="/chat" style={{ textDecoration: 'none', color: theme.primary, fontWeight: 'bold', fontSize: '16px', display: 'flex', alignItems: 'center', gap: '5px' }}>← Back to Chat</Link>
        <button onClick={() => setShowLogoutModal(true)} style={{ backgroundColor: 'transparent', color: theme.danger, border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '5px' }}>🚪 Log Out</button>
      </div>

      <div style={{ backgroundColor: theme.cardBg, padding: '40px', borderRadius: '15px', boxShadow: isDarkMode ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.08)', width: '90%', maxWidth: '600px', borderTop: `5px solid ${theme.primary}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '25px', borderBottom: `1px solid ${theme.border}`, paddingBottom: '30px', marginBottom: '30px' }}>
          
          <div style={{ position: 'relative' }}>
            <div style={{ width: '100px', height: '100px', backgroundColor: theme.avatarBg, borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', fontSize: profilePic ? '0px' : '45px', border: `3px solid ${theme.primary}`, flexShrink: 0, overflow: 'hidden' }}>
              {profilePic ? (
                <img src={profilePic} alt="Profile" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              ) : (
                '👤'
              )}
            </div>
            <label htmlFor="photo-upload" style={{ position: 'absolute', bottom: '0', right: '0', backgroundColor: theme.primary, color: 'white', width: '32px', height: '32px', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', cursor: 'pointer', border: `2px solid ${theme.cardBg}`, fontSize: '16px', boxShadow: '0 2px 4px rgba(0,0,0,0.2)' }}>
              📷
            </label>
            <input id="photo-upload" type="file" accept="image/*" onChange={handleImageChange} style={{ display: 'none' }} />
          </div>

          <div style={{ flex: 1 }}>
            
            {/* 🌟 NEW: INLINE NAME EDITING LOGIC */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '5px' }}>
              {isEditingName ? (
                <>
                  <input 
                    type="text" 
                    value={name} 
                    onChange={(e) => setName(e.target.value)} 
                    onKeyDown={(e) => e.key === 'Enter' && setIsEditingName(false)}
                    autoFocus
                    style={{ 
                      fontSize: '20px', padding: '5px 10px', borderRadius: '5px', 
                      border: `1px solid ${theme.primary}`, backgroundColor: theme.inputBg, 
                      color: theme.textMain, outline: 'none', fontWeight: 'bold', width: '100%', maxWidth: '200px'
                    }} 
                  />
                  <button onClick={() => setIsEditingName(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '18px' }}>✔️</button>
                </>
              ) : (
                <>
                  <h2 style={{ margin: 0, fontSize: '24px' }}>{name}</h2>
                  <button onClick={() => setIsEditingName(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '16px', color: theme.textMuted }}>✏️</button>
                </>
              )}
            </div>

            <p style={{ color: theme.success, margin: '0 0 15px 0', fontSize: '14px', fontWeight: 'bold' }}>Active Member</p>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => navigate('/chat')} style={{ backgroundColor: theme.primary, color: 'white', padding: '8px 15px', borderRadius: '8px', border: 'none', fontSize: '14px', fontWeight: 'bold', cursor: 'pointer' }}>💬 Chat</button>
              <button onClick={() => setIsDarkMode(!isDarkMode)} style={{ backgroundColor: 'transparent', color: theme.textMain, padding: '8px 15px', borderRadius: '8px', border: `1px solid ${theme.border}`, fontSize: '14px', cursor: 'pointer' }}>{isDarkMode ? '☀️' : '🌙'}</button>
            </div>
          </div>
        </div>

        <div>
          <h3 style={{ margin: '0 0 20px 0', color: theme.primary, display: 'flex', alignItems: 'center', gap: '10px' }}>📋 Patient Medical Profile</h3>
          <form onSubmit={saveMedicalProfile} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
            <div style={{ display: 'flex', gap: '15px' }}>
              <div style={{ flex: 1 }}><label style={{ fontSize: '13px', color: theme.textMuted, fontWeight: 'bold' }}>Age</label><input type="number" value={age} onChange={(e) => setAge(e.target.value)} placeholder="e.g., 25" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textMain, outline: 'none', marginTop: '5px' }} /></div>
              <div style={{ flex: 1 }}><label style={{ fontSize: '13px', color: theme.textMuted, fontWeight: 'bold' }}>Gender</label><select value={gender} onChange={(e) => setGender(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textMain, outline: 'none', marginTop: '5px' }}><option value="">Select...</option><option value="Male">Male</option><option value="Female">Female</option><option value="Other">Other</option></select></div>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: theme.textMuted, fontWeight: 'bold' }}>Blood Group</label>
              <select value={bloodGroup} onChange={(e) => setBloodGroup(e.target.value)} style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textMain, outline: 'none', marginTop: '5px' }}><option value="">Select...</option><option value="A+">A+</option><option value="A-">A-</option><option value="B+">B+</option><option value="B-">B-</option><option value="O+">O+</option><option value="O-">O-</option><option value="AB+">AB+</option><option value="AB-">AB-</option></select>
            </div>
            <div>
              <label style={{ fontSize: '13px', color: theme.textMuted, fontWeight: 'bold' }}>Known Allergies / Past Illnesses</label>
              <textarea value={allergies} onChange={(e) => setAllergies(e.target.value)} placeholder="e.g., Peanut allergy..." rows="3" style={{ width: '100%', padding: '12px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textMain, outline: 'none', marginTop: '5px', resize: 'vertical' }}></textarea>
            </div>
            <button type="submit" style={{ backgroundColor: theme.success, color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer', marginTop: '10px' }}>💾 Save Medical Profile</button>
          </form>
        </div>
      </div>

      {showSaveModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: theme.cardBg, padding: '30px 40px', borderRadius: '15px', textAlign: 'center', borderTop: `5px solid ${theme.success}`, maxWidth: '350px' }}>
            <div style={{ fontSize: '50px', marginBottom: '15px' }}>✅</div><h3 style={{ margin: '0 0 10px 0', fontSize: '24px' }}>Profile Saved!</h3><p style={{ color: theme.textMuted, marginBottom: '25px', fontSize: '15px' }}>Your medical details and photo have been updated in the Database.</p><button onClick={() => setShowSaveModal(false)} style={{ backgroundColor: theme.success, color: 'white', padding: '10px 30px', borderRadius: '25px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>OK</button>
          </div>
        </div>
      )}
      
      {showLogoutModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0, 0, 0, 0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: theme.cardBg, padding: '30px', borderRadius: '15px', textAlign: 'center', borderTop: `5px solid ${theme.danger}`, maxWidth: '350px', width: '90%' }}>
            <div style={{ fontSize: '50px', marginBottom: '15px' }}>🚪</div><h3 style={{ margin: '0 0 10px 0', fontSize: '22px' }}>Logging Out?</h3><p style={{ color: theme.textMuted, marginBottom: '25px', fontSize: '15px' }}>Are you sure you want to log out?</p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}><button onClick={() => setShowLogoutModal(false)} style={{ backgroundColor: 'transparent', color: theme.textMain, padding: '10px 20px', borderRadius: '8px', border: `1px solid ${theme.border}`, cursor: 'pointer' }}>Cancel</button><button onClick={confirmLogout} style={{ backgroundColor: theme.danger, color: 'white', padding: '10px 20px', borderRadius: '8px', border: 'none', cursor: 'pointer' }}>Yes, Log Out</button></div>
          </div>
        </div>
      )}
    </div>
  );
}