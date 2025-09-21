import { useState, useEffect, useRef } from 'react'
import io from 'socket.io-client'
import CallManager from './CallManager'
import './Chat.css'

const Chat = ({ user, onLogout }) => {
  const [socket, setSocket] = useState(null)
  const [messages, setMessages] = useState([])
  const [privateMessages, setPrivateMessages] = useState([])
  const [messageInput, setMessageInput] = useState('')
  const [privateMessageInput, setPrivateMessageInput] = useState('')
  const [onlineUsers, setOnlineUsers] = useState([])
  const [selectedUser, setSelectedUser] = useState(null)
  const [userSearchQuery, setUserSearchQuery] = useState('')
  const [showDropdown, setShowDropdown] = useState(null)
  const callManagerRef = useRef(null)

  const messagesEndRef = useRef(null)
  const privateMessagesEndRef = useRef(null)

  const messagesContainerRef = useRef(null)
  const emojiPickerRef = useRef(null)
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false)
  const [showEmojiPicker, setShowEmojiPicker] = useState(false)
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef(null)
  const [showTranslateMenu, setShowTranslateMenu] = useState(false)
  const [translateLanguage, setTranslateLanguage] = useState('en')


  useEffect(() => {
    const newSocket = io('http://localhost:3001')
    setSocket(newSocket)

    newSocket.emit('join', user)

    newSocket.on('receive_message', (message) => {
      setMessages(prev => [...prev, message])
    })

    newSocket.on('receive_private_message', (message) => {
      setPrivateMessages(prev => [...prev, message])
    })

    newSocket.on('message_deleted', (messageId) => {
      setMessages(prev => prev.filter(msg => msg.id !== messageId))
    })

    newSocket.on('private_message_deleted', (messageId) => {
      setPrivateMessages(prev => prev.filter(msg => msg.id !== messageId))
    })

    newSocket.on('users_update', (users) => {
      setOnlineUsers(users)
    })

    fetchMessages()

    return () => {
      newSocket.disconnect()
    }
  }, [user])


  useEffect(() => {
    const handleClickOutside = (event) => {
      if (emojiPickerRef.current && !emojiPickerRef.current.contains(event.target)) {
        setShowEmojiPicker(false)
      }
    }

    if (showEmojiPicker) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [showEmojiPicker])

  useEffect(() => {
    scrollToBottom()
    scrollToBottomPrivate()
  }, [messages, privateMessages])

  const fetchMessages = async () => {
    try {
      const response = await fetch('http://localhost:3001/api/messages')
      const data = await response.json()
      setMessages(data)
    } catch (error) {
      console.error('Failed to fetch messages:', error)
    }
  }

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }

  const scrollToBottomPrivate = () => {
    privateMessagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }





  const fetchPrivateMessages = async (userId1, userId2) => {
    try {
      const response = await fetch(`http://localhost:3001/api/private-messages/${userId1}/${userId2}`)
      const data = await response.json()
      setPrivateMessages(data)
    } catch (error) {
      console.error('Failed to fetch private messages:', error)
    }
  }



  const sendMessage = async (e) => {
    e.preventDefault()
    if (messageInput.trim() && socket) {
      socket.emit('send_message', {
        content: messageInput.trim(),
        username: user.username,
        userId: user.userId,
        type: 'text'
      })
      setMessageInput('')
    }
  }

  const sendPrivateMessage = async (e) => {
    e.preventDefault()
    if (privateMessageInput.trim() && socket && selectedUser) {
      socket.emit('send_private_message', {
        content: privateMessageInput.trim(),
        senderId: user.userId,
        senderUsername: user.username,
        receiverId: selectedUser.userId,
        receiverUsername: selectedUser.username,
        type: 'text'
      })
      setPrivateMessageInput('')
    }
  }

  const uploadImage = async (file) => {
    const formData = new FormData()
    formData.append('image', file)

    try {
      const response = await fetch('http://localhost:3001/api/upload-image', {
        method: 'POST',
        body: formData
      })

      if (!response.ok) {
        throw new Error('Failed to upload image')
      }

      const data = await response.json()
      return data.imageUrl
    } catch (error) {
      console.error('Error uploading image:', error)
      alert('Failed to upload image. Please try again.')
      return null
    }
  }

  const sendImageMessage = async (imageUrl, caption = '') => {
    if (socket && imageUrl) {
      if (selectedUser) {
        socket.emit('send_private_message', {
          content: caption,
          senderId: user.userId,
          senderUsername: user.username,
          receiverId: selectedUser.userId,
          receiverUsername: selectedUser.username,
          type: 'image',
          imageUrl: imageUrl
        })
      } else {
        socket.emit('send_message', {
          content: caption,
          username: user.username,
          userId: user.userId,
          type: 'image',
          imageUrl: imageUrl
        })
      }
    }
  }

  const handleImageSelect = async (file) => {
    if (file && file.type.startsWith('image/')) {
      const imageUrl = await uploadImage(file)
      if (imageUrl) {
        await sendImageMessage(imageUrl)
      }
    } else {
      alert('Please select a valid image file')
    }
  }

  const handleFileInputChange = (e) => {
    const file = e.target.files[0]
    if (file) {
      handleImageSelect(file)
    }
    
    e.target.value = ''
  }

  const handleDrag = (e) => {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true)
    } else if (e.type === 'dragleave') {
      setDragActive(false)
    }
  }

  const handleDrop = (e) => {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleImageSelect(e.dataTransfer.files[0])
    }
  }

  const openFileDialog = () => {
    fileInputRef.current?.click()
  }

  const translateMessage = async (text, targetLang) => {
    try {
      const response = await fetch('http://localhost:3001/api/translate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ text, targetLang }),
      })
      const data = await response.json()
      return data.translation
    } catch (error) {
      console.error('Translation failed:', error)
      return text
    }
  }

  const renderMessageContent = (content, messageId) => {
    if (!content) return null
    return (
      <div className="message-content">
        {content}
      </div>
    )
  }



  const deleteMessage = (messageId, isPrivate = false) => {
    if (socket) {
      if (isPrivate) {
        socket.emit('delete_private_message', messageId)
      } else {
        socket.emit('delete_message', messageId)
      }
    }
    setShowDropdown(null)
  }

  const formatTime = (timestamp) => {
    return new Date(timestamp).toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    })
  }

  const handleUserSelect = (selectedUser) => {
    setSelectedUser(selectedUser)
    fetchPrivateMessages(user.userId, selectedUser.userId)
  }

  const handleBackToMainChat = () => {
    setSelectedUser(null)
    setUserSearchQuery('')
  }

  const filteredUsers = onlineUsers.filter(onlineUser => 
    onlineUser.userId !== user.userId &&
    onlineUser.username.toLowerCase().includes(userSearchQuery.toLowerCase())
  )

  const handleLogout = () => {
    if (socket) {
      socket.disconnect()
    }
    onLogout()
  }

  const handleDeleteAccount = async () => {
    try {
      const response = await fetch(`http://localhost:3001/api/user/${user.userId}`, {
        method: 'DELETE',
      })
      
      if (response.ok) {
        // Disconnect socket and logout
        if (socket) {
          socket.disconnect()
        }
        onLogout()
        alert('Account deleted successfully')
      } else {
        const data = await response.json()
        alert(`Failed to delete account: ${data.error}`)
      }
    } catch (error) {
      alert('Failed to delete account. Please try again.')
    }
    setShowDeleteConfirm(false)
  }






 
  const emojis = [
    '😀', '😃', '😄', '😁', '😅', '😂', '🤣', '😊', '😇', '🙂',
    '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛',
    '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏',
    '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣', '😖', '😫',
    '😩', '🥺', '😢', '😭', '😤', '😠', '😡', '🤬', '🤯', '😳',
    '🥵', '🥶', '😱', '😨', '😰', '😥', '😓', '🤗', '🤔', '🤭',
    '🤫', '🤥', '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧',
    '👍', '👎', '👌', '✌️', '🤞', '🤟', '🤘', '🤙', '👈', '👉',
    '👆', '🖕', '👇', '☝️', '👋', '🤚', '🖐️', '✋', '🖖', '👏',
    '🙌', '🤲', '🤝', '🙏', '✍️', '💪', '🦾', '🦿', '🦵', '🦶',
    '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '🤎', '💔',
    '❣️', '💕', '💞', '💓', '💗', '💖', '💘', '💝', '💟', '💌',
    '🔥', '💯', '💢', '💨', '💫', '💦', '💨', '🕳️', '💣', '💬',
    '🗨️', '🗯️', '💭', '💤', '👁️', '🗨️', '🔇', '🔈', '🔉', '🔊'
  ]

  const addEmojiToMessage = (emoji) => {
    if (selectedUser) {
      setPrivateMessageInput(prev => prev + emoji)
    } else {
      setMessageInput(prev => prev + emoji)
    }
    setShowEmojiPicker(false)
  }

  // Handle call state changes
  const handleCallStateChange = (callState) => {
    // You can add any additional logic here when call state changes
    console.log('Call state changed to:', callState)
  }

  return (
    <div className="chat-container">
      <div className="chat-layout">

        <div className="users-sidebar glass">
          <div className="users-header">
            {selectedUser ? (
              <div className="back-button-container">
                <button onClick={handleBackToMainChat} className="back-button">
                  ← Back to Main Chat
                </button>
                <h3>Private Chat</h3>
              </div>
            ) : (
              <>
                <h3>Users</h3>
                <div className="search-container">
                  <input
                    type="text"
                    placeholder="Search users..."
                    value={userSearchQuery}
                    onChange={(e) => setUserSearchQuery(e.target.value)}
                    className="search-input"
                  />
                </div>
              </>
            )}
          </div>
          <div className="users-list">
            {!selectedUser && (
              <>

                <div className="user-section">
                  <div className="section-title">Your Profile</div>
                  <div className="user-item current-user">
                    <div className="user-avatar">{user.username.charAt(0).toUpperCase()}</div>
                    <span className="user-name">{user.username} (You)</span>
                  </div>
                </div>
                

                {filteredUsers.length > 0 && (
                  <div className="user-section">
                    <div className="section-title">Other Users</div>
                    {filteredUsers.map((onlineUser) => (
                      <div
                        key={onlineUser.userId}
                        className="user-item"
                        onClick={() => handleUserSelect(onlineUser)}
                      >
                        <div className="user-avatar">{onlineUser.username.charAt(0).toUpperCase()}</div>
                        <span className="user-name">{onlineUser.username}</span>
                      </div>
                    ))}
                  </div>
                )}
                
                {filteredUsers.length === 0 && userSearchQuery && (
                  <div className="no-users">No users found</div>
                )}
              </>
            )}
          </div>
        </div>


        <div className="chat-main glass">
          <div className="chat-header">
            <div className="chat-info">
              <h2>{selectedUser ? `Chat with ${selectedUser.username}` : 'Snug Chat'}</h2>
              <span className="online-count">
                {selectedUser ? 'Private Chat' : `${onlineUsers.length} user${onlineUsers.length !== 1 ? 's' : ''} online`}
              </span>
            </div>
            <div className="user-info">
              {selectedUser && (
                <div className="call-buttons">
                  <button 
                    className="call-btn voice-call"
                    onClick={() => callManagerRef.current?.startVoiceCall(selectedUser)}
                    disabled={callManagerRef.current?.isInCall}
                    title="Start voice call"
                  >
                    📞
                  </button>
                  <button 
                    className="call-btn video-call"
                    onClick={() => callManagerRef.current?.startVideoCall(selectedUser)}
                    disabled={callManagerRef.current?.isInCall}
                    title="Start video call"
                  >
                    📹
                  </button>
                </div>
              )}
              <span className="username">@{user.username}</span>
              <div className="user-actions">
                <button 
                  onClick={() => setShowDeleteConfirm(true)} 
                  className="delete-account-btn"
                  title="Delete Account"
                >
                  🗑️
                </button>
                <button onClick={handleLogout} className="logout-btn">
                  Sign Out
                </button>
              </div>
            </div>
          </div>



          <div className="messages-container" ref={messagesContainerRef}>
            <div className="messages-list">
              {selectedUser ? (

                privateMessages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${
                      message.senderId === user.userId ? 'own-message' : 'other-message'
                    }`}
                  >
                    <div className="message-bubble">
                      {message.senderId !== user.userId && (
                        <div className="message-sender">{message.senderUsername}</div>
                      )}
                      {message.type === 'image' ? (
                        <div className="message-image-container">
                          <img 
                            src={`http://localhost:3001${message.imageUrl}`} 
                            alt="Shared image" 
                            className="message-image"
                            onClick={() => window.open(`http://localhost:3001${message.imageUrl}`, '_blank')}
                          />
                          {message.content && <div className="image-caption">{message.content}</div>}
                        </div>
                      ) : (
                        <div className="message-content">{message.content}</div>
                      )}
                      <div className="message-time">{formatTime(message.timestamp)}</div>
                      {message.senderId === user.userId && (
                        <div className="message-options">
                          <button 
                            className="options-btn"
                            onClick={() => setShowDropdown(showDropdown === message.id ? null : message.id)}
                          >
                            ⋯
                          </button>
                          {showDropdown === message.id && (
                            <div className="dropdown-menu">
                              <button 
                                onClick={() => deleteMessage(message.id, true)}
                                className="delete-btn"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              ) : (

                messages.map((message) => (
                  <div
                    key={message.id}
                    className={`message ${
                      message.userId === user.userId ? 'own-message' : 'other-message'
                    }`}
                  >
                    <div className="message-bubble">
                      {message.userId !== user.userId && (
                        <div className="message-sender">{message.username}</div>
                      )}
                      {message.type === 'image' ? (
                        <div className="message-image-container">
                          <img 
                            src={`http://localhost:3001${message.imageUrl}`} 
                            alt="Shared image" 
                            className="message-image"
                            onClick={() => window.open(`http://localhost:3001${message.imageUrl}`, '_blank')}
                          />
                          {message.content && <div className="image-caption">{message.content}</div>}
                        </div>
                      ) : (
                        <div className="message-content">{message.content}</div>
                      )}
                      <div className="message-time">{formatTime(message.timestamp)}</div>
                      {message.userId === user.userId && (
                        <div className="message-options">
                          <button 
                            className="options-btn"
                            onClick={() => setShowDropdown(showDropdown === message.id ? null : message.id)}
                          >
                            ⋯
                          </button>
                          {showDropdown === message.id && (
                            <div className="dropdown-menu">
                              <button 
                                onClick={() => deleteMessage(message.id, false)}
                                className="delete-btn"
                              >
                                Delete
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
              <div ref={selectedUser ? privateMessagesEndRef : messagesEndRef} />
            </div>
          </div>

          <form onSubmit={selectedUser ? sendPrivateMessage : sendMessage} className="message-input-form">
            <div 
              className={`input-container glass ${dragActive ? 'drag-active' : ''}`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileInputChange}
                accept="image/*"
                style={{ display: 'none' }}
              />
              <button
                type="button"
                className="image-button"
                onClick={openFileDialog}
                title="Upload image"
              >
                📷
              </button>
              <div className="emoji-picker-container" ref={emojiPickerRef}>
                <button
                  type="button"
                  className="emoji-button"
                  onClick={() => setShowEmojiPicker(!showEmojiPicker)}
                  title="Add emoji"
                >
                  😀
                </button>
                {showEmojiPicker && (
                  <div className="emoji-picker">
                    <div className="emoji-grid">
                      {emojis.map((emoji, index) => (
                        <button
                          key={index}
                          type="button"
                          className="emoji-option"
                          onClick={() => addEmojiToMessage(emoji)}
                        >
                          {emoji}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <input
                type="text"
                value={selectedUser ? privateMessageInput : messageInput}
                onChange={(e) => selectedUser ? setPrivateMessageInput(e.target.value) : setMessageInput(e.target.value)}
                placeholder={selectedUser ? `Message ${selectedUser.username}...` : "Type a message..."}
                className="message-input"
                maxLength={500}
              />
              <button type="submit" disabled={selectedUser ? !privateMessageInput.trim() : !messageInput.trim()} className="send-button">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path
                    d="M2 21L23 12L2 3V10L17 12L2 14V21Z"
                    fill="currentColor"
                  />
                </svg>
              </button>
            </div>
          </form>
        </div>
      </div>
      

      {showDeleteConfirm && (
        <div className="modal-overlay">
          <div className="modal-content glass">
            <h3>Delete Account</h3>
            <p>Are you sure you want to delete your account? This action cannot be undone and will remove all your messages.</p>
            <div className="modal-actions">
              <button 
                onClick={() => setShowDeleteConfirm(false)} 
                className="cancel-btn"
              >
                Cancel
              </button>
              <button 
                onClick={handleDeleteAccount} 
                className="confirm-delete-btn"
              >
                Delete Account
              </button>
            </div>
          </div>
        </div>
      )}
      

      
      {/* Call Manager Component */}
      <CallManager 
        ref={callManagerRef}
        socket={socket}
        user={user}
        onlineUsers={onlineUsers}
        onCallStateChange={handleCallStateChange}
      />
    </div>
  )
}

export default Chat