import React from 'react';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';

// Hamari 4 screens import ho rahi hain
import Home from './pages/Home';
import Auth from './pages/Auth';
import Chat from './pages/Chat';
import Profile from './pages/Profile';

function App() {
  return (
    <BrowserRouter>
      {/* Ye hamara Navigation Menu hai */}
      <nav style={{ padding: '15px', backgroundColor: '#e0f7fa', textAlign: 'center' }}>
        <Link to="/" style={{ margin: '10px', fontWeight: 'bold' }}>Home</Link> | 
        <Link to="/auth" style={{ margin: '10px', fontWeight: 'bold' }}>Login</Link> | 
        <Link to="/chat" style={{ margin: '10px', fontWeight: 'bold' }}>Chat</Link> | 
        <Link to="/profile" style={{ margin: '10px', fontWeight: 'bold' }}>Profile</Link>
      </nav>

      {/* Ye wo jagah hai jahan screen change hogi */}
      <div style={{ textAlign: 'center', marginTop: '30px' }}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/auth" element={<Auth />} />
          <Route path="/chat" element={<Chat />} />
          <Route path="/profile" element={<Profile />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;