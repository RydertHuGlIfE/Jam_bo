import { useState } from 'react'
import { sha256 } from '../utils/crypto'

const API_BASE = "";

export default function LoginOverlay({ 
  isKicked, 
  onLogin, 
  onReconnect 
}) {
  const [loginForm, setLoginForm] = useState({ username: "", password: "" })
  const [loginError, setLoginError] = useState("")

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoginError("")
    try {
      // Hash password before sending to keep it secure in the network tab
      const hashedPassword = await sha256(loginForm.password);

      const res = await fetch(`${API_BASE}/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          username: loginForm.username,
          password: hashedPassword
        })
      });
      const data = await res.json();
      if (data.success) {
        // Save to storage BEFORE updating state to avoid race conditions
        localStorage.setItem("jam_bo_session", "true")
        localStorage.setItem("jam_bo_user", loginForm.username)
        localStorage.setItem("jam_bo_token", data.token)
        onLogin(loginForm.username, data.token)
      } else {
        setLoginError(data.message)
      }
    } catch (err) {
      setLoginError("Server connection failed")
    }
  }

  if (isKicked) {
    return (
      <div className="login-overlay">
        <div className="login-card">
          <h2 style={{ color: 'var(--accent-orange)' }}>Disconnected</h2>
          <p style={{ marginBottom: '20px' }}>You have been logged in on another device.</p>
          <button className="login-btn" onClick={onReconnect}>Reconnect</button>
        </div>
      </div>
    )
  }

  return (
    <div className="login-overlay">
      <div className="login-card">
        <h2>Jam_bo</h2>
        <form className="login-form" onSubmit={handleLogin}>
          <input
            type="text"
            placeholder="Username"
            value={loginForm.username}
            onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={loginForm.password}
            onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
            required
          />
          <button type="submit" className="login-btn">Enter the Jam</button>
          {loginError && <p className="login-error">{loginError}</p>}
        </form>
      </div>
    </div>
  )
}
