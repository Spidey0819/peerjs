const express = require('express');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');

const app = express();

// CORS configuration
const corsOptions = {
    origin: [
        "https://web-frontend-mediconnect.onrender.com",
        "http://localhost:3000", // For local dev
        /https:\/\/.*\.onrender\.com$/,
        /https:\/\/.*\.vercel\.app$/,
        /https:\/\/.*\.netlify\.app$/
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(express.json());

const PORT = process.env.PORT || 9000;
const isProduction = process.env.NODE_ENV === 'production';

console.log(`[PeerJS Server] Starting on port ${PORT}`);
console.log(`[PeerJS Server] CORS Origins:`, corsOptions.origin);

// ---------- Create HTTP Server ----------
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PeerJS Server] Listening at http://localhost:${PORT}`);
});

// ---------- Configure PeerJS with STUN/TURN ----------
const peerServer = ExpressPeerServer(server, {
    path: "/peerjs",
    debug: true,
    allow_discovery: true,
    proxied: true, // ✅ Needed for Render reverse proxy
    config: {
        iceServers: [
            { urls: 'stun:stun.l.google.com:19302' },
            {
                urls: 'turn:openrelay.metered.ca:80',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            },
            {
                urls: 'turn:openrelay.metered.ca:443?transport=tcp',
                username: 'openrelayproject',
                credential: 'openrelayproject'
            }
        ]
    }
});

app.use('/peerjs', peerServer);

// ---------- Optional Peer Events ----------
peerServer.on('connection', (client) => {
    console.log(`[PeerJS] Client connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
    console.log(`[PeerJS] Client disconnected: ${client.getId()}`);
});

// ---------- Room Management ----------
const rooms = new Map();

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        environment: isProduction ? 'production' : 'development'
    });
});

app.post('/api/rooms/:roomId/join', (req, res) => {
    const { roomId } = req.params;
    const { peerId, userInfo } = req.body;

    console.log(`[Room] ${peerId} joining room ${roomId}`);

    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            participants: [],
            createdAt: new Date()
        });
    }

    const room = rooms.get(roomId);
    room.participants = room.participants.filter(p => p.peerId !== peerId);
    room.participants.push({ peerId, ...userInfo, joinedAt: new Date() });

    res.json({
        message: 'Joined room successfully',
        roomId,
        participantCount: room.participants.length,
        otherParticipants: room.participants.filter(p => p.peerId !== peerId)
    });
});

app.get('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    const room = rooms.get(roomId);

    if (!room) return res.status(404).json({ error: 'Room not found' });

    res.json({
        roomId,
        participants: room.participants,
        participantCount: room.participants.length,
        createdAt: room.createdAt
    });
});

app.post('/api/rooms/:roomId/leave', (req, res) => {
    const { roomId } = req.params;
    const { peerId } = req.body;

    const room = rooms.get(roomId);
    if (room) {
        room.participants = room.participants.filter(p => p.peerId !== peerId);
        if (room.participants.length === 0) rooms.delete(roomId);
    }

    res.json({ message: 'Left room successfully' });
});

app.get('/api/rooms', (req, res) => {
    const roomList = Array.from(rooms.entries()).map(([roomId, room]) => ({
        roomId,
        participantCount: room.participants.length,
        createdAt: room.createdAt,
        participants: room.participants.map(p => ({
            peerId: p.peerId,
            userRole: p.role,
            userName: p.name,
            joinedAt: p.joinedAt
        }))
    }));

    res.json({ totalRooms: rooms.size, rooms: roomList });
});

// ---------- Auto Cleanup ----------
const CLEANUP_INTERVAL = 5 * 60 * 1000;
const PARTICIPANT_TIMEOUT = 30 * 60 * 1000;

setInterval(() => {
    const now = Date.now();
    for (const [roomId, room] of rooms.entries()) {
        room.participants = room.participants.filter(p => now - new Date(p.joinedAt).getTime() < PARTICIPANT_TIMEOUT);
        if (room.participants.length === 0) rooms.delete(roomId);
    }
}, CLEANUP_INTERVAL);

// ---------- Error Handling ----------
app.use((err, req, res, next) => {
    console.error(`[Server Error] ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
});

// ---------- Graceful Shutdown ----------
process.on('SIGINT', () => {
    console.log('[PeerJS Server] SIGINT received, shutting down...');
    server.close(() => process.exit(0));
});
process.on('SIGTERM', () => {
    console.log('[PeerJS Server] SIGTERM received, shutting down...');
    server.close(() => process.exit(0));
});

module.exports = { app, server };
