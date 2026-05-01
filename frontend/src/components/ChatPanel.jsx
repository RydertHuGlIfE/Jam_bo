import { useState, useRef, useEffect } from 'react'

const EMOJIS = [
  '😅', '😶', '🥲', '😑', '🙂', '🙃', '😁', '😺',
  '😂', '😭', '💀', '🔥', '❤️', '😍', '🥹', '😊', '😎', '🤩',
  '🫡', '🤙', '👀', '💯', '🎵', '🎶', '🎤', '🎧', '🥳', '🤯',
  '😤', '😩', '🫠', '😴', '🤤', '👻', '💥', '✨', '🌟', '💫',
  '🍕', '🍔', '🍜', '🧃', '🧋', '🫶', '🤝', '👑', '🐐', '🚀'
]

export default function ChatPanel({ 
  chatMessages, 
  sessionUser, 
  onSendChat 
}) {
  const [chatInput, setChatInput] = useState('')
  const [chatOpen, setChatOpen] = useState(false)
  const [emojiOpen, setEmojiOpen] = useState(false)
  const chatEndRef = useRef(null)
  const emojiPanelRef = useRef(null)

  // Close emoji panel on outside click
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (emojiPanelRef.current && !emojiPanelRef.current.contains(e.target)) {
        setEmojiOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatOpen) chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages, chatOpen]);

  const sendChat = (e) => {
    e.preventDefault();
    const text = chatInput.trim();
    if (!text) return;
    onSendChat(text);
    setChatInput('');
  };

  return (
    <div className="chat-panel">
      <button className="chat-toggle" onClick={() => setChatOpen(o => !o)}>
        💬 {chatOpen ? 'Hide Chat' : 'Jam Chat'}
        {!chatOpen && chatMessages.length > 0 && <span className="chat-badge">{chatMessages.length}</span>}
      </button>
      {chatOpen && (
        <div className="chat-body">
          <div className="chat-messages">
            {chatMessages.length === 0 && <div className="chat-empty">No messages yet. Say hi! 👋</div>}
            {chatMessages.map((m, i) => (
              <div key={i} className={`chat-msg ${m.user === sessionUser ? 'chat-msg-self' : ''}`}>
                <span className="chat-user">{m.user}: </span>
                <span className="chat-text">{m.text}</span>
              </div>
            ))}
            <div ref={chatEndRef} />
          </div>
          <div className="chat-input-area" ref={emojiPanelRef}>
            {emojiOpen && (
              <div className="emoji-panel">
                {EMOJIS.map((emoji, i) => (
                  <button
                    key={i}
                    className="emoji-btn"
                    type="button"
                    onClick={() => setChatInput(prev => prev + emoji)}
                  >{emoji}</button>
                ))}
              </div>
            )}
            <form className="chat-form" onSubmit={sendChat}>
              <button
                type="button"
                className="emoji-toggle-btn"
                onClick={() => setEmojiOpen(o => !o)}
              >😊</button>
              <input
                type="text"
                className="chat-input-field"
                placeholder="Say something..."
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
              />
              <button type="submit" className="chat-send-btn">→</button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
