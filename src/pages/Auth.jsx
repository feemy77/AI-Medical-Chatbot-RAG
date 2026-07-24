import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { auth } from '../firebase'; 
// 🌟 NEW: Added sendPasswordResetEmail
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, sendEmailVerification, sendPasswordResetEmail } from 'firebase/auth';

export default function Auth() {
  const [isLogin, setIsLogin] = useState(true);
  const [showPopup, setShowPopup] = useState(false); 
  
  // Logic States
  const [userName, setUserName] = useState(''); 
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState(''); // 🌟 NEW: State for success messages
  const [isLoading, setIsLoading] = useState(false);

  const navigate = useNavigate();
  const isDarkMode = localStorage.getItem('aiMedicalTheme') === 'dark';

  const theme = {
    bg: isDarkMode ? '#121212' : '#f4f7f6', 
    cardBg: isDarkMode ? '#1e1e1e' : '#ffffff',
    textMain: isDarkMode ? '#f1f1f1' : '#333333', 
    textMuted: isDarkMode ? '#aaaaaa' : '#777777',
    inputBg: isDarkMode ? '#2d2d2d' : '#f9f9f9', 
    border: isDarkMode ? '#333333' : '#dddddd',
    primary: '#0277bd', 
    danger: '#e63946',
    success: '#28a745'
  };

  useEffect(() => {
    if (localStorage.getItem('aiMedicalLoggedIn') === 'true') {
      navigate('/');
    }
  }, [navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault(); 
    setErrorMessage(''); 
    setSuccessMessage('');
    setIsLoading(true);

    if (!isLogin) {
      // 🌟 SIGNUP
      try {
        const userCredential = await createUserWithEmailAndPassword(auth, email, password);
        await sendEmailVerification(userCredential.user);
        localStorage.setItem('aiMedicalTempName', userName);
        setShowPopup(true); 
      } catch (error) {
        if (error.code === 'auth/email-already-in-use') {
          setErrorMessage("This email is already registered. Please Login.");
        } else if (error.code === 'auth/weak-password') {
          setErrorMessage("Password must be at least 6 characters long.");
        } else {
          setErrorMessage(error.message);
        }
      }
    } else {
      // 🌟 LOGIN
      try {
        const userCredential = await signInWithEmailAndPassword(auth, email, password);
        
        if (!userCredential.user.emailVerified) {
          setErrorMessage("Please verify your email first. Check your inbox/spam folder.");
          setIsLoading(false);
          return;
        }

        localStorage.setItem('aiMedicalLoggedIn', 'true');
        const savedName = localStorage.getItem('aiMedicalTempName') || 'Patient';
        localStorage.setItem('aiMedicalUserName', savedName); 
        localStorage.setItem('aiMedicalUserEmail', userCredential.user.email); 
        localStorage.removeItem('aiMedicalChat'); 
        
        navigate('/');
      } catch (error) {
        if (error.code === 'auth/user-not-found' || error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
          setErrorMessage("Invalid email or password!");
        } else {
          setErrorMessage(error.message);
        }
      }
    }
    setIsLoading(false);
  };

  // 🌟 NEW: FORGOT PASSWORD FUNCTION
  const handleForgotPassword = async () => {
    setErrorMessage('');
    setSuccessMessage('');
    if (!email) {
      setErrorMessage("Please enter your Email Address first to reset your password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email);
      setSuccessMessage("Password reset link has been sent to your email!");
    } catch (error) {
      if (error.code === 'auth/user-not-found') {
        setErrorMessage("No account found with this email address.");
      } else {
        setErrorMessage(error.message);
      }
    }
  };

  const closePopupAndSwitch = () => {
    setShowPopup(false);
    setIsLogin(true);
    setUserName('');
    setEmail('');
    setPassword('');
  };

  const toggleAuthMode = () => {
    setIsLogin(!isLogin);
    setErrorMessage(''); 
    setSuccessMessage('');
  };

  return (
    <div style={{ position: 'absolute', top: 0, left: 0, width: '100vw', minHeight: '100vh', backgroundColor: theme.bg, color: theme.textMain, display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', fontFamily: 'Arial, sans-serif', overflow: 'hidden', margin: 0, padding: 0 }}>
      
      <div style={{ position: 'absolute', top: '20px', left: '30px', zIndex: 10 }}>
        <Link to="/" style={{ textDecoration: 'none', color: theme.primary, fontWeight: 'bold', fontSize: '16px' }}>← Back to Home</Link>
      </div>

      <div style={{ backgroundColor: theme.cardBg, padding: '40px 50px', borderRadius: '15px', boxShadow: isDarkMode ? '0 10px 30px rgba(0,0,0,0.5)' : '0 10px 30px rgba(0,0,0,0.08)', width: '100%', maxWidth: '400px', textAlign: 'center', borderTop: `5px solid ${theme.primary}` }}>
        <div style={{ fontSize: '40px', marginBottom: '10px' }}>🩺</div>
        
        <h2 style={{ margin: '0 0 10px 0', fontSize: '28px' }}>
          {isLogin ? 'Welcome Back' : 'Create Account'}
        </h2>
        
        <p style={{ color: theme.textMuted, marginBottom: (errorMessage || successMessage) ? '15px' : '30px', fontSize: '15px' }}>
          {isLogin ? 'Login to access your AI Medical Assistant' : 'Sign up to get personalized medical advice'}
        </p>

        {errorMessage && (
          <div style={{ backgroundColor: 'rgba(230, 57, 70, 0.1)', color: theme.danger, padding: '10px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', border: `1px solid ${theme.danger}` }}>
            {errorMessage}
          </div>
        )}

        {/* 🌟 NEW: Success Message Display */}
        {successMessage && (
          <div style={{ backgroundColor: 'rgba(40, 167, 69, 0.1)', color: theme.success, padding: '10px', borderRadius: '8px', marginBottom: '20px', fontSize: '14px', border: `1px solid ${theme.success}` }}>
            {successMessage}
          </div>
        )}

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '15px' }}>
          {!isLogin && (
            <input 
              type="text" 
              placeholder="Full Name" 
              value={userName}
              onChange={(e) => setUserName(e.target.value)} 
              required 
              style={{ padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textMain, fontSize: '15px', outline: 'none' }}
            />
          )}
          <input 
            type="email" 
            placeholder="Email Address" 
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required 
            style={{ padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textMain, fontSize: '15px', outline: 'none' }} 
          />
          <input 
            type="password" 
            placeholder="Password (Min 6 chars)" 
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required={!successMessage} // Make it optional only if they are just resetting password
            minLength="6"
            style={{ padding: '15px', borderRadius: '8px', border: `1px solid ${theme.border}`, backgroundColor: theme.inputBg, color: theme.textMain, fontSize: '15px', outline: 'none' }} 
          />
          
          {/* 🌟 NEW: Forgot Password Link */}
          {isLogin && (
            <div style={{ textAlign: 'right', marginTop: '-5px' }}>
              <span onClick={handleForgotPassword} style={{ color: theme.primary, fontSize: '13px', cursor: 'pointer', fontWeight: 'bold' }}>
                Forgot Password?
              </span>
            </div>
          )}

          <button type="submit" disabled={isLoading} style={{ backgroundColor: isLoading ? theme.textMuted : theme.primary, color: 'white', padding: '15px', borderRadius: '8px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: isLoading ? 'not-allowed' : 'pointer', marginTop: '5px', transition: '0.3s' }}>
            {isLoading ? 'Processing... ⏳' : (isLogin ? 'Login 🚀' : 'Sign Up 🚀')}
          </button>
        </form>

        <div style={{ marginTop: '25px', color: theme.textMuted, fontSize: '14px' }}>
          {isLogin ? "Don't have an account? " : "Already have an account? "}
          <span onClick={toggleAuthMode} style={{ color: theme.primary, fontWeight: 'bold', cursor: 'pointer', textDecoration: 'underline' }}>{isLogin ? 'Sign Up' : 'Login'}</span>
        </div>
      </div>

      {showPopup && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh', backgroundColor: 'rgba(0,0,0,0.6)', display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100 }}>
          <div style={{ backgroundColor: theme.cardBg, padding: '30px 40px', borderRadius: '15px', textAlign: 'center', boxShadow: '0 10px 40px rgba(0,0,0,0.5)', borderTop: `5px solid ${theme.success}`, maxWidth: '350px' }}>
            <div style={{ fontSize: '50px', marginBottom: '15px' }}>📧</div>
            <h3 style={{ margin: '0 0 10px 0', fontSize: '24px' }}>Verify Your Email</h3>
            <p style={{ color: theme.textMuted, marginBottom: '25px', fontSize: '15px', lineHeight: '1.5' }}>
              We've sent a verification link to <b>{email}</b>. Please check your inbox (or spam) and click the link to activate your account.
            </p>
            <button onClick={closePopupAndSwitch} style={{ backgroundColor: theme.success, color: 'white', padding: '12px 30px', borderRadius: '25px', border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer' }}>Back to Login</button>
          </div>
        </div>
      )}
    </div>
  );
}