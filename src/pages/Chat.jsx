import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

const BACKEND_URL = '';
export default function Chat() {
  const navigate = useNavigate();
  const userEmail = localStorage.getItem('aiMedicalUserEmail') || '';
  const storedName = localStorage.getItem('aiMedicalUserName') || 'Guest';

  useEffect(() => {
    if (localStorage.getItem('aiMedicalLoggedIn') !== 'true') {
      navigate('/auth');
    }
  }, [navigate]);

  const defaultMsg = {
    sender: 'ai',
    text: `Hello ${storedName}! I am your AI Medical Assistant. How are you feeling today? (English ya Roman Urdu mein likhein)`,
  };

  const [messages, setMessages] = useState([defaultMsg]);
  const [chatHistory, setChatHistory] = useState([]);
  const [currentChatId, setCurrentChatId] = useState(null);
  const [userProfilePic, setUserProfilePic] = useState(null);

  const [inputText, setInputText] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isDarkMode, setIsDarkMode] = useState(
    () => localStorage.getItem('aiMedicalTheme') === 'dark'
  );

  const [showDeleteModal, setShowDeleteModal] = useState(false);
  const [chatToDelete, setChatToDelete] = useState(null);
  const [editingChatId, setEditingChatId] = useState(null);
  const [editingTitle, setEditingTitle] = useState('');

  // 🌟 Naye States Emergency Popup ke liye
  const [showEmergencyModal, setShowEmergencyModal] = useState(false);
  const [emergencyMsgText, setEmergencyMsgText] = useState('');

  const messagesEndRef = useRef(null);

  // FETCH DATA FROM BACKEND
  useEffect(() => {
    const fetchData = async () => {
      if (!userEmail) return;

      try {
        const profileRes = await fetch(`${BACKEND_URL}/api/profile/${userEmail}`);
        if (profileRes.ok) {
          const profileData = await profileRes.json();
          if (profileData.profile_pic) setUserProfilePic(profileData.profile_pic);
          if (profileData.name) {
             localStorage.setItem('aiMedicalUserName', profileData.name);
          }
        }

        const chatsRes = await fetch(`${BACKEND_URL}/api/chats/${userEmail}`);
        if (chatsRes.ok) {
          const chatsData = await chatsRes.json();
          setChatHistory(chatsData);
        }
      } catch (err) {
        console.error('Error fetching data from backend:', err);
      }
    };
    fetchData();
  }, [userEmail]);

  useEffect(() => { 
    localStorage.setItem('aiMedicalTheme', isDarkMode ? 'dark' : 'light'); 
  }, [isDarkMode]);
  
  useEffect(() => { 
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }); 
  }, [messages, isTyping]);

  const handleDeleteClick = (id, e) => {
    e.stopPropagation();
    setChatToDelete(id);
    setShowDeleteModal(true);
  };

  const confirmDelete = async () => {
    if (chatToDelete !== null) {
      try {
        await fetch(`${BACKEND_URL}/api/chats/${chatToDelete}`, { method: 'DELETE' });
        setChatHistory(chatHistory.filter(c => c.id !== chatToDelete));
        if (currentChatId === chatToDelete) {
          setMessages([defaultMsg]);
          setCurrentChatId(null);
        }
      } catch (err) {
        console.error('Error deleting chat:', err);
      }
    }
    setShowDeleteModal(false);
    setChatToDelete(null);
  };

  const cancelDelete = () => {
    setShowDeleteModal(false);
    setChatToDelete(null);
  };

  const startEditing = (id, currentTitle, e) => {
    e.stopPropagation();
    setEditingChatId(id);
    setEditingTitle(currentTitle);
  };

  const saveEdit = async (id, e) => {
    if (e) e.stopPropagation();
    if (editingTitle.trim() !== '') {
      const updatedHistory = chatHistory.map(c => c.id === id ? { ...c, title: editingTitle } : c);
      setChatHistory(updatedHistory);
      setEditingChatId(null);
      
      const chatToUpdate = updatedHistory.find(c => c.id === id);
      if (chatToUpdate) {
        await fetch(`${BACKEND_URL}/api/chats/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: id,
            user_email: userEmail,
            title: editingTitle, 
            messages: chatToUpdate.savedChat
          })
        });
      }
    }
  };

  const cancelEdit = (e) => {
    if (e) e.stopPropagation();
    setEditingChatId(null);
  };

  const extractOptions = (text) => {
    const lines = text.split('\n');
    const options = [];
    lines.forEach(line => {
      const trimmed = line.trim();
      if (/^[A-E][\)\.]\s/.test(trimmed)) {
        options.push(trimmed);
      }
    });
    return options;
  };

  // 🌟 UPDATE: Ab yeh object return karega taake humein 'source' ka pata chal sake
  const getAIResponse = async (userMessageText, currentMessagesList) => {
    try {
      const patientAllergies = localStorage.getItem(`aiMedical_Allergies_${userEmail}`) || 'None';
      const conversationHistory = currentMessagesList.map(m => ({
        role: m.sender === 'user' ? 'user' : 'assistant',
        content: m.text
      }));

      const response = await fetch(`${BACKEND_URL}/api/consultation`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          symptoms:     userMessageText,
          allergies:    patientAllergies,
          conversation: conversationHistory,
        }),
      });

      if (!response.ok) {
        const err = await response.json().catch(() => ({}));
        throw new Error(err.detail || `Server error ${response.status}`);
      }

      const data = await response.json();
      return { text: data.ai_response, source: data.source }; // 🌟 Updated Return

    } catch (error) {
      console.error('Backend error:', error.message);
      return { 
        text: `⚠️ Backend se connect nahi ho saka.\n\nYeh check karo:\n• Backend chal raha hai? (uvicorn main:app --reload --port 8000)\n• Error: ${error.message}`, 
        source: 'error' 
      };
    }
  };

  const startNewChat = () => {
    setMessages([defaultMsg]);
    setCurrentChatId(null);
    setInputText('');
  };

  const sendMsg = async (textToSend) => {
    const queryText = textToSend || inputText;
    if (!queryText.trim() || isTyping) return;
    const text = queryText.trim();

    const updatedMessages = [...messages, { sender: 'user', text }];
    setMessages(updatedMessages);
    if (!textToSend) setInputText('');
    setIsTyping(true);

    const aiReplyObj = await getAIResponse(text, updatedMessages); // 🌟 Receives object
    const finalMessages = [...updatedMessages, { sender: 'ai', text: aiReplyObj.text }];

    setIsTyping(false);
    setMessages(finalMessages);

    // 🌟 🚨 EMERGENCY DETECTED - SHOW POPUP
    if (aiReplyObj.source && aiReplyObj.source.startsWith('emergency_')) {
      setEmergencyMsgText(aiReplyObj.text);
      setShowEmergencyModal(true);
    }

    // Save to Backend Database
    let chatIdToSave = currentChatId;
    let titleToSave = text.substring(0, 20) + '...';

    if (chatIdToSave !== null) {
      const existingChat = chatHistory.find(c => c.id === chatIdToSave);
      if (existingChat) {
        titleToSave = existingChat.title; 
      }
    }

    if (chatIdToSave === null) {
      chatIdToSave = Date.now().toString();
      setCurrentChatId(chatIdToSave);
      setChatHistory(prev => [{ id: chatIdToSave, title: titleToSave, savedChat: finalMessages }, ...prev]);
    } else {
      setChatHistory(prev => prev.map(c => c.id === chatIdToSave ? { ...c, savedChat: finalMessages } : c));
    }

    if (userEmail) {
      try {
        await fetch(`${BACKEND_URL}/api/chats/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            chat_id: chatIdToSave,
            user_email: userEmail,
            title: titleToSave,
            messages: finalMessages
          })
        });
      } catch (err) {
        console.error("Failed to save chat to DB:", err);
      }
    }
  };

  const theme = {
    bg:      isDarkMode ? '#121212' : '#fafbfc',
    side:    isDarkMode ? '#1e1e1e' : '#f0f4f8',
    head:    isDarkMode ? '#1f1f1f' : '#ffffff',
    text:    isDarkMode ? '#f1f1f1' : '#333333',
    border:  isDarkMode ? '#333333' : '#dddddd',
    bubble:  isDarkMode ? '#2d2d2d' : '#ffffff',
    inputBg: isDarkMode ? '#2d2d2d' : '#f9f9f9',
    muted:   isDarkMode ? '#aaaaaa' : '#888888',
    danger:  '#dc3545',
    primary: '#0277bd',
  };

  return (
    <div style={{
      position: 'absolute', top: 0, left: 0,
      width: '100vw', height: '100vh',
      display: 'flex', fontFamily: 'Arial, sans-serif',
      backgroundColor: theme.bg, color: theme.text,
      overflow: 'hidden', margin: 0, padding: 0,
    }}>

      {/* SIDEBAR */}
      <div style={{
        width: isSidebarOpen ? '280px' : '0px',
        backgroundColor: theme.side,
        borderRight: isSidebarOpen ? `1px solid ${theme.border}` : 'none',
        transition: '0.3s', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', flexShrink: 0,
      }}>
        <div style={{ width: '280px', display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div style={{ padding: '20px' }}>
            <button
              onClick={startNewChat}
              style={{
                width: '100%', padding: '12px',
                backgroundColor: theme.primary, color: 'white',
                border: 'none', borderRadius: '8px',
                cursor: 'pointer', fontWeight: 'bold', fontSize: '15px',
              }}
            >
              ➕ New Chat
            </button>
          </div>

          <div style={{ flex: 1, overflowY: 'auto', padding: '0 15px' }}>
            <p style={{ fontSize: '12px', color: theme.muted, fontWeight: 'bold', letterSpacing: '0.05em' }}>
              RECENT CHATS
            </p>

            {chatHistory.length === 0 && (
              <p style={{ fontSize: '13px', color: theme.muted, textAlign: 'center', marginTop: '30px' }}>
                No chats yet. Start a new consultation!
              </p>
            )}

            {chatHistory.map((chat) => (
              <div
                key={chat.id}
                onClick={() => {
                  if (editingChatId !== chat.id) {
                    setMessages(chat.savedChat);
                    setCurrentChatId(chat.id);
                  }
                }}
                style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                  padding: '10px',
                  backgroundColor: currentChatId === chat.id
                    ? (isDarkMode ? '#333' : '#e0eaf0') : theme.bubble,
                  borderRadius: '8px', marginBottom: '8px', cursor: 'pointer',
                  border: currentChatId === chat.id ? `1px solid ${theme.primary}` : 'none',
                }}
              >
                {editingChatId === chat.id ? (
                  <div
                    style={{ display: 'flex', width: '100%', alignItems: 'center', gap: '5px' }}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <input
                      type="text"
                      value={editingTitle}
                      onChange={(e) => setEditingTitle(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter')  saveEdit(chat.id);
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      autoFocus
                      style={{
                        flex: 1, padding: '5px', borderRadius: '4px',
                        border: `1px solid ${theme.primary}`,
                        backgroundColor: theme.inputBg, color: theme.text,
                        outline: 'none', fontSize: '13px',
                      }}
                    />
                    <span onClick={(e) => saveEdit(chat.id, e)} style={{ cursor: 'pointer' }}>✔️</span>
                    <span onClick={(e) => cancelEdit(e)}        style={{ cursor: 'pointer' }}>❌</span>
                  </div>
                ) : (
                  <>
                    <div style={{
                      fontSize: '14px', whiteSpace: 'nowrap',
                      overflow: 'hidden', textOverflow: 'ellipsis', paddingRight: '10px',
                    }}>
                      💬 {chat.title}
                    </div>
                    <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
                      <span onClick={(e) => startEditing(chat.id, chat.title, e)} style={{ cursor: 'pointer' }}>✏️</span>
                      <span onClick={(e) => handleDeleteClick(chat.id, e)}        style={{ cursor: 'pointer' }}>🗑️</span>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAIN CHAT AREA */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', height: '100vh' }}>

        {/* HEADER */}
        <div style={{
          padding: '15px 20px', borderBottom: `1px solid ${theme.border}`,
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          backgroundColor: theme.head,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              style={{ background: 'none', border: 'none', fontSize: '22px', cursor: 'pointer', color: theme.text }}
            >
              ☰
            </button>
            <div style={{
              width: '40px', height: '40px', backgroundColor: theme.primary,
              borderRadius: '50%', display: 'flex', alignItems: 'center',
              justifyContent: 'center', color: 'white', fontSize: '20px', overflow: 'hidden',
            }}>
              {userProfilePic
                ? <img src={userProfilePic} style={{ width: '100%', height: '100%', objectFit: 'cover' }} alt="Profile" />
                : '👤'}
            </div>
            <div>
              <h3 style={{ margin: 0, fontSize: '20px', fontWeight: '800' }}>🩺 Medical Chatbot</h3>
              <p style={{ margin: 0, fontSize: '13px', color: '#28a745' }}>● Online (Hybrid RAG + LLM)</p>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '15px' }}>
            <button
              onClick={() => navigate('/profile')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.text, fontSize: '15px', fontWeight: 'bold' }}
            >
              👤 Profile
            </button>
            <button
              onClick={() => navigate('/')}
              style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: theme.text, fontSize: '15px', fontWeight: 'bold' }}
            >
              🏠 Home
            </button>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              style={{
                background: 'none', border: `1px solid ${theme.border}`,
                borderRadius: '20px', padding: '5px 15px', cursor: 'pointer',
                color: theme.text, display: 'flex', alignItems: 'center', gap: '5px',
              }}
            >
              {isDarkMode ? '☀️ Light' : '🌙 Dark'}
            </button>
          </div>
        </div>

        {/* MESSAGES */}
        <div style={{ flex: 1, padding: '20px', overflowY: 'auto', backgroundColor: theme.bg }}>
          {messages.map((msg, idx) => {
            const isUser = msg.sender === 'user';
            const options = !isUser ? extractOptions(msg.text) : [];

            return (
              <div
                key={idx}
                style={{
                  display: 'flex', flexDirection: 'column',
                  alignItems: isUser ? 'flex-end' : 'flex-start',
                  marginBottom: '20px',
                }}
              >
                <div style={{
                  maxWidth: '75%', padding: '15px 20px', borderRadius: '18px',
                  backgroundColor: isUser ? theme.primary : theme.bubble,
                  color: isUser ? 'white' : theme.text,
                  border: !isUser ? `1px solid ${theme.border}` : 'none',
                  lineHeight: '1.7', whiteSpace: 'pre-wrap', fontSize: '15px',
                }}>
                  <div>{msg.text}</div>

                  {options.length > 0 && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '12px', paddingTop: '10px', borderTop: `1px solid ${theme.border}` }}>
                      <p style={{ fontSize: '12px', color: theme.primary, fontWeight: 'bold', margin: 0 }}>
                        Tap an option to respond:
                      </p>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                        {options.map((opt, optIdx) => (
                          <button
                            key={optIdx}
                            onClick={() => sendMsg(opt)}
                            disabled={isTyping}
                            style={{
                              fontSize: '13px',
                              backgroundColor: isDarkMode ? '#333' : '#eef2f5',
                              color: theme.text,
                              border: `1px solid ${theme.border}`,
                              padding: '8px 12px',
                              borderRadius: '8px',
                              cursor: isTyping ? 'not-allowed' : 'pointer',
                              textAlign: 'left',
                              fontWeight: '600',
                              transition: '0.2s',
                            }}
                          >
                            ✨ {opt}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {isTyping && (
            <div style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '20px' }}>
              <div style={{
                padding: '12px 20px', borderRadius: '18px',
                backgroundColor: theme.bubble, color: theme.muted,
                fontStyle: 'italic', border: `1px solid ${theme.border}`,
              }}>
                AI is analyzing... ⏳
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* INPUT BAR */}
        <div style={{ padding: '20px', borderTop: `1px solid ${theme.border}`, backgroundColor: theme.head }}>
          <div style={{
            display: 'flex', maxWidth: '850px', margin: '0 auto',
            border: `1px solid ${theme.border}`, borderRadius: '30px',
            overflow: 'hidden', backgroundColor: theme.inputBg,
          }}>
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMsg()}
              placeholder="Please describe your symptoms or medical condition..."
              disabled={isTyping}
              style={{
                flex: 1, padding: '16px 25px', border: 'none', outline: 'none',
                background: 'transparent', color: theme.text, fontSize: '16px',
                cursor: isTyping ? 'not-allowed' : 'text',
              }}
            />
            <button
              onClick={() => sendMsg()}
              disabled={isTyping || !inputText.trim()}
              style={{
                padding: '0 30px',
                backgroundColor: isTyping || !inputText.trim() ? theme.muted : theme.primary,
                color: 'white', border: 'none',
                cursor: isTyping || !inputText.trim() ? 'not-allowed' : 'pointer',
                fontWeight: 'bold', fontSize: '16px', transition: '0.3s',
              }}
            >
              {isTyping ? '⏳' : 'Send 🚀'}
            </button>
          </div>
          <p style={{ textAlign: 'center', fontSize: '12px', color: theme.muted, marginTop: '8px' }}>
            AI-generated advice is not a substitute for professional medical consultation.
          </p>
        </div>
      </div>

      {/* 🚨 NAYA: EMERGENCY MODAL POPUP 🚨 */}
      {showEmergencyModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(220, 53, 69, 0.2)', // Light red tint
          backdropFilter: 'blur(5px)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 999,
        }}>
          <div style={{
            backgroundColor: theme.head, padding: '30px', borderRadius: '15px',
            textAlign: 'center', borderTop: `8px solid ${theme.danger}`,
            maxWidth: '500px', width: '90%', boxShadow: '0 10px 30px rgba(0,0,0,0.3)'
          }}>
            <div style={{ fontSize: '60px', marginBottom: '10px' }}>🚨</div>
            <h2 style={{ color: theme.danger, margin: '0 0 15px 0' }}>MEDICAL EMERGENCY</h2>
            
            <div style={{ 
              color: theme.text, fontSize: '15px', lineHeight: '1.6', 
              marginBottom: '25px', whiteSpace: 'pre-wrap', textAlign: 'left', 
              padding: '15px', backgroundColor: theme.bg, 
              borderRadius: '8px', border: `1px solid ${theme.border}` 
            }}>
              {emergencyMsgText}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: '15px' }}>
              <button
                onClick={() => setShowEmergencyModal(false)}
                style={{
                  flex: 1, backgroundColor: 'transparent', color: theme.text,
                  padding: '12px', borderRadius: '8px',
                  border: `1px solid ${theme.border}`, fontSize: '15px', cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Close
              </button>
              
              {/* Direct call button - Phone mein dialer open karega */}
              <a
                href="tel:1122"
                style={{
                  flex: 1, backgroundColor: theme.danger, color: 'white',
                  padding: '12px', borderRadius: '8px', textDecoration: 'none',
                  border: 'none', fontSize: '16px', fontWeight: 'bold', cursor: 'pointer',
                  display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '8px'
                }}
              >
                📞 Call 1122
              </a>
            </div>
          </div>
        </div>
      )}

      {/* DELETE MODAL */}
      {showDeleteModal && (
        <div style={{
          position: 'fixed', top: 0, left: 0, width: '100vw', height: '100vh',
          backgroundColor: 'rgba(0,0,0,0.6)',
          display: 'flex', justifyContent: 'center', alignItems: 'center', zIndex: 100,
        }}>
          <div style={{
            backgroundColor: theme.head, padding: '30px', borderRadius: '15px',
            textAlign: 'center', borderTop: `5px solid ${theme.danger}`,
            maxWidth: '350px', width: '90%',
          }}>
            <div style={{ fontSize: '50px', marginBottom: '15px' }}>⚠️</div>
            <h3 style={{ margin: '0 0 10px 0', color: theme.text, fontSize: '22px' }}>Delete Chat?</h3>
            <p style={{ color: theme.muted, marginBottom: '25px', fontSize: '15px', lineHeight: '1.5' }}>
              Are you sure you want to permanently delete this conversation?
            </p>
            <div style={{ display: 'flex', justifyContent: 'center', gap: '15px' }}>
              <button
                onClick={cancelDelete}
                style={{
                  backgroundColor: 'transparent', color: theme.text,
                  padding: '10px 20px', borderRadius: '8px',
                  border: `1px solid ${theme.border}`, fontSize: '15px', cursor: 'pointer',
                }}
              >
                Cancel
              </button>
              <button
                onClick={confirmDelete}
                style={{
                  backgroundColor: theme.danger, color: 'white',
                  padding: '10px 20px', borderRadius: '8px',
                  border: 'none', fontSize: '15px', fontWeight: 'bold', cursor: 'pointer',
                }}
              >
                Yes, Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}