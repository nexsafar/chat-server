const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: ["http://localhost", "http://localhost:80", "http://127.0.0.1"],
        methods: ["GET", "POST"],
        credentials: true
    },
    transports: ['websocket', 'polling'],
    pingTimeout: 60000,
    pingInterval: 25000
});

app.use(cors());
app.use(express.json());

const connectedUsers = new Map();
const conversationRooms = new Map();

app.get('/', (req, res) => {
    res.send(`
        <html>
            <head>
                <title>Chat Server Status</title>
                <style>
                    body { font-family: Arial, sans-serif; max-width: 800px; margin: 50px auto; padding: 20px; background: #f5f5f5; }
                    .status { background: white; padding: 20px; border-radius: 10px; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
                    .success { color: #27ae60; font-weight: bold; }
                    h1 { color: #2c3e50; }
                </style>
            </head>
            <body>
                <div class="status">
                    <h1>✅ Chat Server en ligne</h1>
                    <p class="success">Le serveur Socket.io fonctionne correctement</p>
                    <p>Utilisateurs connectés : <strong>${connectedUsers.size}</strong></p>
                    <p>Conversations actives : <strong>${conversationRooms.size}</strong></p>
                </div>
            </body>
        </html>
    `);
});

io.on('connection', (socket) => {
    console.log(`✅ Nouvelle connexion : ${socket.id}`);
    
    socket.on('join_user_room', (data) => {
        const { user_id } = data;
        if (user_id) {
            if (connectedUsers.has(user_id)) {
                const oldSocketId = connectedUsers.get(user_id);
                const oldSocket = io.sockets.sockets.get(oldSocketId);
                if (oldSocket) {
                    oldSocket.disconnect(true);
                }
            }
            connectedUsers.set(user_id, socket.id);
            socket.user_id = user_id;
            socket.join(`user_${user_id}`);
            console.log(`👤 Utilisateur ${user_id} connecté`);
        }
    });
    
    socket.on('join_conversation', (data) => {
        const { conversation_id, user_id } = data;
        if (conversation_id) {
            const roomName = `conversation_${conversation_id}`;
            socket.join(roomName);
            if (!conversationRooms.has(conversation_id)) {
                conversationRooms.set(conversation_id, new Set());
            }
            conversationRooms.get(conversation_id).add(socket.id);
            console.log(`💬 Utilisateur ${user_id} a rejoint conversation ${conversation_id}`);
        }
    });
    
    socket.on('leave_conversation', (data) => {
        const { conversation_id } = data;
        if (conversation_id) {
            socket.leave(`conversation_${conversation_id}`);
            if (conversationRooms.has(conversation_id)) {
                conversationRooms.get(conversation_id).delete(socket.id);
            }
        }
    });
    
    socket.on('send_message', (data) => {
        const { conversation_id, sender_id, recipient_id, message, message_id } = data;
        const roomName = `conversation_${conversation_id}`;
        io.to(roomName).emit('receive_message', {
            id: message_id,
            conversation_id,
            sender_id,
            recipient_id,
            message,
            created_at: new Date().toISOString()
        });
    });
    
    socket.on('disconnect', () => {
        console.log(`❌ Déconnexion : ${socket.id}`);
        if (socket.user_id && connectedUsers.get(socket.user_id) === socket.id) {
            connectedUsers.delete(socket.user_id);
        }
        conversationRooms.forEach((sockets, conversationId) => {
            sockets.delete(socket.id);
        });
    });
});

const PORT = 3001;
server.listen(PORT, () => {
    console.log(`🚀 Serveur de Chat démarré sur le port ${PORT}`);
});
