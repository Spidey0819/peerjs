const { PeerServer } = require('peer');
const express = require('express');
const cors = require('cors');

const app = express();

// CORS configuration
const corsOptions = {
    origin: [
        "https://web-frontend-mediconnect.onrender.com",
        "http://localhost:3000", // For development
        /https:\/\/.*\.onrender\.com$/, // Allow any Render subdomain
        /https:\/\/.*\.vercel\.app$/, // Allow Vercel deployments
        /https:\/\/.*\.netlify\.app$/ // Allow Netlify deployments
    ],
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"]
};

app.use(cors(corsOptions));
app.use(express.json());

// Determine the port from environment or default
const PORT = process.env.PORT || 9000;
const isProduction = process.env.NODE_ENV === 'production';

console.log(`[PeerJS Server] Starting in ${isProduction ? 'production' : 'development'} mode`);
console.log(`[PeerJS Server] Port: ${PORT}`);
console.log(`[PeerJS Server] CORS Origins:`, corsOptions.origin);

// Create PeerJS server configuration
const peerServerConfig = {
    port: PORT,
    path: '/peerjs',
    allow_discovery: true,
    corsOptions: corsOptions
};

// Add SSL configuration for production if needed
if (isProduction) {
    // In production on Render, the platform handles SSL termination
    // so we don't need to configure SSL certificates here
    console.log(`[PeerJS Server] Production mode - SSL handled by platform`);
}

// Create PeerJS server
const peerServer = PeerServer(peerServerConfig);

// Store for room management
const rooms = new Map();

// Health check endpoint
app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        rooms: rooms.size,
        environment: isProduction ? 'production' : 'development'
    });
});

// API endpoint to join a room
app.post('/api/rooms/:roomId/join', (req, res) => {
    const { roomId } = req.params;
    const { peerId, userInfo } = req.body;

    console.log(`[Room Management] Peer ${peerId} attempting to join room ${roomId}`);

    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            participants: [],
            createdAt: new Date()
        });
        console.log(`[Room Management] Created new room ${roomId}`);
    }

    const room = rooms.get(roomId);

    // Remove existing participant with same peer ID
    const previousCount = room.participants.length;
    room.participants = room.participants.filter(p => p.peerId !== peerId);

    // Add new participant
    room.participants.push({
        peerId,
        ...userInfo,
        joinedAt: new Date()
    });

    const currentCount = room.participants.length;
    console.log(`[Room Management] Room ${roomId} now has ${currentCount} participants (was ${previousCount})`);

    res.json({
        message: 'Joined room successfully',
        roomId,
        participantCount: currentCount,
        otherParticipants: room.participants.filter(p => p.peerId !== peerId)
    });
});

// API endpoint to get room info
app.get('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;

    if (!rooms.has(roomId)) {
        console.log(`[Room Management] Room ${roomId} not found`);
        return res.status(404).json({ error: 'Room not found' });
    }

    const room = rooms.get(roomId);
    console.log(`[Room Management] Room ${roomId} info requested - ${room.participants.length} participants`);

    res.json({
        roomId,
        participants: room.participants,
        participantCount: room.participants.length,
        createdAt: room.createdAt
    });
});

// API endpoint to leave a room
app.post('/api/rooms/:roomId/leave', (req, res) => {
    const { roomId } = req.params;
    const { peerId } = req.body;

    console.log(`[Room Management] Peer ${peerId} leaving room ${roomId}`);

    if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        const previousCount = room.participants.length;
        room.participants = room.participants.filter(p => p.peerId !== peerId);

        console.log(`[Room Management] Room ${roomId} now has ${room.participants.length} participants (was ${previousCount})`);

        // Clean up empty rooms
        if (room.participants.length === 0) {
            rooms.delete(roomId);
            console.log(`[Room Management] Room ${roomId} deleted (empty)`);
        }
    }

    res.json({ message: 'Left room successfully' });
});

// API endpoint to list all rooms (for debugging)
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

    res.json({
        totalRooms: rooms.size,
        rooms: roomList
    });
});

// Clean up disconnected peers periodically
const CLEANUP_INTERVAL = 5 * 60 * 1000; // 5 minutes
const PARTICIPANT_TIMEOUT = 30 * 60 * 1000; // 30 minutes

setInterval(() => {
    const now = new Date();
    let cleanedRooms = 0;
    let cleanedParticipants = 0;

    for (const [roomId, room] of rooms.entries()) {
        const oldCount = room.participants.length;
        room.participants = room.participants.filter(p => {
            const timeDiff = now - new Date(p.joinedAt);
            return timeDiff < PARTICIPANT_TIMEOUT;
        });

        const participantsRemoved = oldCount - room.participants.length;
        cleanedParticipants += participantsRemoved;

        if (room.participants.length === 0) {
            rooms.delete(roomId);
            cleanedRooms++;
            console.log(`[Cleanup] Room ${roomId} deleted (timeout)`);
        } else if (participantsRemoved > 0) {
            console.log(`[Cleanup] Cleaned up ${participantsRemoved} participants from room ${roomId}`);
        }
    }

    if (cleanedRooms > 0 || cleanedParticipants > 0) {
        console.log(`[Cleanup] Cleaned up ${cleanedRooms} rooms and ${cleanedParticipants} participants`);
    }
}, CLEANUP_INTERVAL);

// Error handling
app.use((err, req, res, next) => {
    console.error(`[Server Error] ${err.message}`);
    res.status(500).json({ error: 'Internal server error' });
});

// Start the server
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PeerJS Server] Server started successfully`);
    console.log(`[PeerJS Server] HTTP server listening on port ${PORT}`);
    console.log(`[PeerJS Server] PeerJS path: /peerjs`);
    console.log(`[PeerJS Server] Room management API: /api/rooms`);
    console.log(`[PeerJS Server] Health check: /health`);

    if (isProduction) {
        console.log(`[PeerJS Server] Production URL: https://peerjs-zwgq.onrender.com`);
        console.log(`[PeerJS Server] WebSocket URL: wss://peerjs-zwgq.onrender.com/peerjs`);
    } else {
        console.log(`[PeerJS Server] Development URL: http://localhost:${PORT}`);
        console.log(`[PeerJS Server] WebSocket URL: ws://localhost:${PORT}/peerjs`);
    }
});

// Graceful shutdown
process.on('SIGTERM', () => {
    console.log('[PeerJS Server] SIGTERM received, shutting down gracefully');
    server.close(() => {
        console.log('[PeerJS Server] Server closed');
        process.exit(0);
    });
});

process.on('SIGINT', () => {
    console.log('[PeerJS Server] SIGINT received, shutting down gracefully');
    server.close(() => {
        console.log('[PeerJS Server] Server closed');
        process.exit(0);
    });
});

module.exports = { app, server };