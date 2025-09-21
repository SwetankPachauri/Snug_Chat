import { useState, useEffect } from 'react'
import Auth from './components/Auth'
import Chat from './components/Chat'
import './App.css'

function App() {
  const [user, setUser] = useState(null)

  useEffect(() => {
    const savedUser = localStorage.getItem('snugUser')
    if (savedUser) {
      setUser(JSON.parse(savedUser))
    }
  }, [])

  const handleLogin = (userData) => {
    setUser(userData)
    localStorage.setItem('snugUser', JSON.stringify(userData))
  }

  const handleLogout = () => {
    setUser(null)
    localStorage.removeItem('snugUser')
  }

  return (
    <div className={`app ${!user ? 'login-mode' : 'chat-mode'}`}>
      {!user ? (
        <Auth onLogin={handleLogin} />
      ) : (
        <Chat user={user} onLogout={handleLogout} />
      )}
    </div>
  )
}

export default App