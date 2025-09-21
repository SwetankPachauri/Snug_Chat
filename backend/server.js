const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bcrypt = require('bcrypt');
const cors = require('cors');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { Low } = require('lowdb');
const { JSONFile } = require('lowdb/node');
const axios = require('axios');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "http://localhost:5173",
    methods: ["GET", "POST"]
  }
});

const adapter = new JSONFile('db.json');
const defaultData = { users: [], messages: [], privateMessages: [] };
const db = new Low(adapter, defaultData);

async function initializeDB() {
  await db.read();
  db.data = db.data || { users: [], messages: [], privateMessages: [] };
  await db.write();
}
 
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
 
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(uploadsDir));

async function translateText(text, targetLang = 'en') {
  try {
    const response = await axios.get(`https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=auto|${targetLang}`);
    return response.data.responseData.translatedText;
  } catch (error) {
    console.error('Translation Error:', error);
    return text;
  }
}


app.post('/api/register', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const existingUser = db.data.users.find(user => user.username === username);
  if (existingUser) {
    return res.status(400).json({ error: 'Username already exists' });
  }

  const hashedPassword = await bcrypt.hash(password, 10);
  const user = {
    id: Date.now().toString(),
    username,
    password: hashedPassword,
    createdAt: new Date().toISOString()
  };

  db.data.users.push(user);
  await db.write();

  res.json({ message: 'User registered successfully', userId: user.id, username: user.username });
});

app.post('/api/login', async (req, res) => {
  const { username, password } = req.body;
  
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }

  const user = db.data.users.find(user => user.username === username);
  if (!user || !await bcrypt.compare(password, user.password)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }

  res.json({ message: 'Login successful', userId: user.id, username: user.username });
});

app.get('/api/messages', (req, res) => {
  res.json(db.data.messages);
});

app.get('/api/private-messages/:userId1/:userId2', (req, res) => {
  const { userId1, userId2 } = req.params;
  const privateMessages = db.data.privateMessages.filter(msg => 
    (msg.senderId === userId1 && msg.receiverId === userId2) ||
    (msg.senderId === userId2 && msg.receiverId === userId1)
  );
  res.json(privateMessages);
});

app.delete('/api/user/:userId', async (req, res) => {
  const { userId } = req.params;
  
  const userIndex = db.data.users.findIndex(user => user.id === userId);
  
  if (userIndex === -1) {
    return res.status(404).json({ error: 'User not found' });
  }
   
  db.data.users.splice(userIndex, 1);
  db.data.messages = db.data.messages.filter(msg => msg.userId !== userId);
  db.data.privateMessages = db.data.privateMessages.filter(msg => 
    msg.senderId !== userId && msg.receiverId !== userId
  );
  
  await db.write();
  res.json({ message: 'User account deleted successfully' });
});

app.delete('/api/messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const messageIndex = db.data.messages.findIndex(msg => msg.id === messageId);
  
  if (messageIndex === -1) {
    return res.status(404).json({ error: 'Message not found' });
  }
  
  db.data.messages.splice(messageIndex, 1);
  await db.write();
  res.json({ message: 'Message deleted successfully' });
});

app.delete('/api/private-messages/:messageId', async (req, res) => {
  const { messageId } = req.params;
  const messageIndex = db.data.privateMessages.findIndex(msg => msg.id === messageId);
  
  if (messageIndex === -1) {
    return res.status(404).json({ error: 'Message not found' });
  }
  
  db.data.privateMessages.splice(messageIndex, 1);
  await db.write();
  res.json({ message: 'Message deleted successfully' });
});

app.post('/api/upload-image', upload.single('image'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file uploaded' });
    }
    
    const imageUrl = `/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload image' });
  }
});

app.post('/api/translate', async (req, res) => {
  const { text, targetLang } = req.body;
  try {
    const translation = await translateText(text, targetLang);
    res.json({ translation });
  } catch (error) {
    res.status(500).json({ error: 'Translation failed' });
  }
});


const connectedUsers = new Map();
const activeCalls = new Map();

io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  socket.on('join', (userData) => {
    connectedUsers.set(socket.id, userData);
    socket.broadcast.emit('user_joined', userData);
    io.emit('users_update', Array.from(connectedUsers.values()));
  });

  socket.on('send_message', async (messageData) => {
    const message = {
      id: Date.now().toString(),
      username: messageData.username,
      userId: messageData.userId,
      content: messageData.content,
      type: messageData.type || 'text', 
      imageUrl: messageData.imageUrl || null,
      timestamp: new Date().toISOString()
    };

    db.data.messages.push(message);
    await db.write();
    io.emit('receive_message', message);
  });

  socket.on('send_private_message', async (messageData) => {
    const message = {
      id: Date.now().toString(),
      senderId: messageData.senderId,
      senderUsername: messageData.senderUsername,
      receiverId: messageData.receiverId,
      receiverUsername: messageData.receiverUsername,
      content: messageData.content,
      type: messageData.type || 'text', 
      imageUrl: messageData.imageUrl || null,
      timestamp: new Date().toISOString()
    };

    db.data.privateMessages.push(message);
    await db.write();

    const receiverSocket = Array.from(connectedUsers.entries())
      .find(([socketId, userData]) => userData.userId === messageData.receiverId);
    
    if (receiverSocket) {
      io.to(receiverSocket[0]).emit('receive_private_message', message);
    }
    
    socket.emit('receive_private_message', message);
  });

  socket.on('delete_message', async (messageId) => {
    const messageIndex = db.data.messages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
      db.data.messages.splice(messageIndex, 1);
      await db.write();
      io.emit('message_deleted', messageId);
    }
  });

  socket.on('delete_private_message', async (messageId) => {
    const messageIndex = db.data.privateMessages.findIndex(msg => msg.id === messageId);
    if (messageIndex !== -1) {
      const message = db.data.privateMessages[messageIndex];
      db.data.privateMessages.splice(messageIndex, 1);
      await db.write();
      
      const receiverSocket = Array.from(connectedUsers.entries())
        .find(([socketId, userData]) => userData.userId === message.receiverId || userData.userId === message.senderId);
      
      if (receiverSocket) {
        io.to(receiverSocket[0]).emit('private_message_deleted', messageId);
      }
      
      socket.emit('private_message_deleted', messageId);
    }
  });

  socket.on('initiate_call', (callData) => {
    const { id, caller, participant, isVideo } = callData;
    const targetSocket = Array.from(connectedUsers.entries())
      .find(([socketId, userData]) => userData.userId === participant.userId);
    
    if (targetSocket) {
      activeCalls.set(id, {
        id,
        caller,
        participant,
        isVideo,
        status: 'ringing',
        callerSocketId: socket.id,
        participantSocketId: targetSocket[0]
      });
      
      io.to(targetSocket[0]).emit('incoming_call', callData);
    } else {
      socket.emit('call_failed', { error: 'User not available' });
    }
  });

  socket.on('accept_call', (data) => {
    const { callId } = data;
    const call = activeCalls.get(callId);
    
    if (call) {
      call.status = 'accepted';
      io.to(call.callerSocketId).emit('call_accepted', call);
    }
  });

  socket.on('reject_call', (data) => {
    const { callId } = data;
    const call = activeCalls.get(callId);
    
    if (call) {
      io.to(call.callerSocketId).emit('call_rejected', { callId });
      activeCalls.delete(callId);
    }
  });

  socket.on('end_call', (data) => {
    const { callId } = data;
    const call = activeCalls.get(callId);
    
    if (call) {
      if (socket.id === call.callerSocketId) {
        io.to(call.participantSocketId).emit('call_ended', { callId });
      } else {
        io.to(call.callerSocketId).emit('call_ended', { callId });
      }
      activeCalls.delete(callId);
    }
  });

  socket.on('webrtc_offer', (data) => {
    const { offer, callId, to } = data;
    const targetSocket = Array.from(connectedUsers.entries())
      .find(([socketId, userData]) => userData.userId === to);
    
    if (targetSocket) {
      io.to(targetSocket[0]).emit('webrtc_offer', {
        offer,
        callId,
        from: connectedUsers.get(socket.id)?.userId
      });
    }
  });

  socket.on('webrtc_answer', (data) => {
    const { answer, callId, to } = data;
    const targetSocket = Array.from(connectedUsers.entries())
      .find(([socketId, userData]) => userData.userId === to);
    
    if (targetSocket) {
      io.to(targetSocket[0]).emit('webrtc_answer', {
        answer,
        callId,
        from: connectedUsers.get(socket.id)?.userId
      });
    }
  });

  socket.on('ice_candidate', (data) => {
    const { candidate, callId, to } = data;
    const targetSocket = Array.from(connectedUsers.entries())
      .find(([socketId, userData]) => userData.userId === to);
    
    if (targetSocket) {
      io.to(targetSocket[0]).emit('ice_candidate', {
        candidate,
        callId,
        from: connectedUsers.get(socket.id)?.userId
      });
    }
  });

  socket.on('disconnect', () => {
    const userData = connectedUsers.get(socket.id);
    if (userData) {
      activeCalls.forEach((call, callId) => {
        if (call.callerSocketId === socket.id || call.participantSocketId === socket.id) {
          const otherSocketId = call.callerSocketId === socket.id ? call.participantSocketId : call.callerSocketId;
          io.to(otherSocketId).emit('call_ended', { callId });
          activeCalls.delete(callId);
        }
      });
      
      connectedUsers.delete(socket.id);
      socket.broadcast.emit('user_left', userData);
      io.emit('users_update', Array.from(connectedUsers.values()));
    }
    console.log('User disconnected:', socket.id);
  });
});

const PORT = process.env.PORT || 3001;

async function startServer() {
  await initializeDB();
  server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
