import { useState } from 'react'
import { sha256 } from '../utils/crypto'
import Lanyard from './Lanyard'
import './LoginOverlay.css'

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
        localStorage.setItem("jam_bo_session", "true")
        localStorage.setItem("jam_bo_user", loginForm.username)
        localStorage.setItem("jam_bo_token", data.token)
        onLogin(loginForm.username, data.token)
      } else {
        setLoginError(data.message)
      }
    } catch (err) {
      setLoginError("SYSTEM_FAILURE: CONNECTION_LOST")
    }
  }

  return (
    <div className="login-overlay">
      <div className="pixel-bg" />
      <div className="scanlines" />

      <div className="lanyard-fullscreen">
        <Lanyard position={[0, 0, 34]} gravity={[0, -40, 0]} />
      </div>

      <div className="login-left">
        {isKicked ? (
          <div className="pixel-card">
            <h2 style={{ color: '#FF003C' }}>SYSTEM_DISCONNECT</h2>
            <p style={{ marginBottom: '20px', color: '#00FF41' }}>ERROR: SESSION_TAKEN_BY_OTHER_ID</p>
            <button className="pixel-btn" style={{ width: '100%' }} onClick={onReconnect}>RE_BOOT</button>
          </div>
        ) : (
          <div className="pixel-card">
            <h2>JAM_BO v1.0</h2>
            <form className="login-form" onSubmit={handleLogin}>
              <div className="pixel-input-wrapper">
                <input
                  className="pixel-form-input"
                  type="text"
                  placeholder="USER_ID"
                  value={loginForm.username}
                  onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                  required
                />
              </div>
              <div className="pixel-input-wrapper">
                <input
                  className="pixel-form-input"
                  type="password"
                  placeholder="ACCESS_CODE"
                  value={loginForm.password}
                  onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                  required
                />
              </div>
              <button type="submit" className="pixel-btn">INITIALIZE_JAM</button>
              {loginError && <p className="login-error">{loginError}</p>}
            </form>
          </div>
        )}
      </div>
    </div>
  )
}
