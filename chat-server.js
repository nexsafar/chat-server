const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
    cors: {
        origin: "*", // Accepter toutes les origines
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
    
    // CLIENT: Rejoindre la room utilisateur
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
    
    // AGENCE: Rejoindre la room agence
    socket.on('join_agency_room', (agency_id) => {
        socket.join(`agency_${agency_id}`);
        socket.agency_id = agency_id;
        console.log(`🏢 Agence ${agency_id} connectée`);
    });
    
    // Rejoindre une conversation
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
    
    // Quitter une conversation
    socket.on('leave_conversation', (data) => {
        const { conversation_id } = data;
        if (conversation_id) {
            socket.leave(`conversation_${conversation_id}`);
            if (conversationRooms.has(conversation_id)) {
                conversationRooms.get(conversation_id).delete(socket.id);
            }
        }
    });
    
    // CLIENT envoie un message
    socket.on('send_message', (data) => {
        console.log('📨 Message client reçu:', data);
        const { conversation_id, message } = data;
        
        // Construire le message unifié
        const messageData = {
            id: message.id || data.message_id,
            conversation_id: conversation_id,
            sender_type: message.sender_type || 'user',
            sender_id: message.sender_id,
            message: message.message || message,
            created_at: message.created_at || new Date().toISOString(),
            is_read: false
        };
        
        // Émettre vers TOUS dans la conversation avec new_message
        io.to(`conversation_${conversation_id}`).emit('new_message', messageData);
        
        console.log(`✅ Message client émis vers conversation ${conversation_id}`);
    });
    
    // AGENCE envoie un message
    socket.on('agency_message', (data) => {
        console.log('📨 Message agence reçu:', data);
        const { conversation_id, message, sender_id } = data;
        
        // Construire le message unifié
        const messageData = {
            id: data.message_id || null,
            conversation_id: conversation_id,
            sender_type: 'agency',
            sender_id: sender_id || data.sender_id,
            message: typeof message === 'string' ? message : (message.message || data.message),
            created_at: data.created_at || new Date().toISOString(),
            is_read: false
        };
        
        // Émettre vers TOUS dans la conversation avec new_message
        io.to(`conversation_${conversation_id}`).emit('new_message', messageData);
        
        console.log(`✅ Message agence émis vers conversation ${conversation_id}`);
    });
    
    // Déconnexion
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

const PORT = process.env.PORT || 3001;
server.listen(PORT, () => {
    console.log(`🚀 Serveur de Chat démarré sur le port ${PORT}`);
    console.log(`📡 Socket.io prêt à recevoir des connexions`);
});
