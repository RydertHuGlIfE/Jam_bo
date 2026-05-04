import { useState } from 'react'
import { sha256 } from '../utils/crypto'
import Lanyard from './Lanyard'
import MagicRings from './MagicRings'
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
        <div className="lanyard-fullscreen">
          <Lanyard position={[0, 0, 34]} gravity={[0, -40, 0]} />
        </div>
        <div className="login-left">
          <div style={{ width: '500px', height: '450px', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'visible' }}>
            <div style={{ position: 'absolute', inset: '-80px', zIndex: 0, pointerEvents: 'none' }}>
              <MagicRings
                color="#FF3B30"
                colorTwo="#FF6B6B"
                ringCount={6}
                speed={1}
                attenuation={10}
                lineThickness={2}
                baseRadius={0.35}
                radiusStep={0.1}
                scaleRate={0.1}
                opacity={1}
                blur={0}
                noiseAmount={0.1}
                rotation={0}
                ringGap={1.5}
                fadeIn={0.7}
                fadeOut={0.5}
                followMouse={false}
                mouseInfluence={0.2}
                hoverScale={1.2}
                parallax={0.05}
                clickBurst={false}
              />
            </div>
            <div className="login-card" style={{ position: 'relative', zIndex: 1 }}>
              <h2 style={{ color: 'var(--accent-orange)' }}>Disconnected</h2>
              <p style={{ marginBottom: '20px' }}>You have been logged in on another device.</p>
              <button className="login-btn" onClick={onReconnect}>Reconnect</button>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="login-overlay">
      <div className="lanyard-fullscreen">
        <Lanyard position={[0, 0, 34]} gravity={[0, -40, 0]} />
      </div>
      <div className="login-left">
        <div style={{ width: '500px', height: '550px', position: 'relative', display: 'flex', justifyContent: 'center', alignItems: 'center', overflow: 'visible' }}>
          <div style={{ position: 'absolute', inset: '-80px', zIndex: 0, pointerEvents: 'none' }}>
            <MagicRings
              color="#FF3B30"
              colorTwo="#FF6B6B"
              ringCount={6}
              speed={1}
              attenuation={10}
              lineThickness={2}
              baseRadius={0.35}
              radiusStep={0.1}
              scaleRate={0.1}
              opacity={1}
              blur={0}
              noiseAmount={0.1}
              rotation={0}
              ringGap={1.5}
              fadeIn={0.7}
              fadeOut={0.5}
              followMouse={false}
              mouseInfluence={0.2}
              hoverScale={1.2}
              parallax={0.05}
              clickBurst={false}
            />
          </div>
          <div className="login-card" style={{ position: 'relative', zIndex: 1 }}>
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
      </div>
    </div>
  )
}
