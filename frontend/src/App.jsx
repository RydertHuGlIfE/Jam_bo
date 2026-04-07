import { useState } from 'react'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="premium-container">
      <h1>Jam_bo</h1>
      <p>A premium React starter for your next big idea.</p>
      
      <button 
        className="btn-primary"
        onClick={() => setCount((count) => count + 1)}
      >
        Interacted {count} times
      </button>

      <div style={{ marginTop: '3rem', fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
        Edit <code>src/App.jsx</code> and save to test HMR
      </div>
    </div>
  )
}

export default App
