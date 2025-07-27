const { PeerServer } = require('peer');
const express = require('express');
const cors = require('cors');

const app = express();
app.use(cors({
    origin: "https://web-frontend-mediconnect.onrender.com",
    credentials: true
}));
app.use(express.json());

// Create PeerJS server
const peerServer = PeerServer({
    port: 9000,
    path: '/peerjs',
    allow_discovery: true,
    corsOptions: {
        origin: "https://web-frontend-mediconnect.onrender.com",
        credentials: true
    }
});

// Store for room management
const rooms = new Map();

// API endpoint to join a room
app.post('/api/rooms/:roomId/join', (req, res) => {
    const { roomId } = req.params;
    const { peerId, userInfo } = req.body;
    
    if (!rooms.has(roomId)) {
        rooms.set(roomId, {
            participants: [],
            createdAt: new Date()
        });
    }
    
    const room = rooms.get(roomId);
    
    // Remove existing participant with same peer ID
    room.participants = room.participants.filter(p => p.peerId !== peerId);
    
    // Add new participant
    room.participants.push({
        peerId,
        ...userInfo,
        joinedAt: new Date()
    });
    
    console.log(`Peer ${peerId} joined room ${roomId}`);
    
    res.json({
        message: 'Joined room successfully',
        roomId,
        otherParticipants: room.participants.filter(p => p.peerId !== peerId)
    });
});

// API endpoint to get room info
app.get('/api/rooms/:roomId', (req, res) => {
    const { roomId } = req.params;
    
    if (!rooms.has(roomId)) {
        return res.status(404).json({ error: 'Room not found' });
    }
    
    const room = rooms.get(roomId);
    res.json({
        roomId,
        participants: room.participants,
        createdAt: room.createdAt
    });
});

// API endpoint to leave a room
app.post('/api/rooms/:roomId/leave', (req, res) => {
    const { roomId } = req.params;
    const { peerId } = req.body;
    
    if (rooms.has(roomId)) {
        const room = rooms.get(roomId);
        room.participants = room.participants.filter(p => p.peerId !== peerId);
        
        console.log(`Peer ${peerId} left room ${roomId}`);
        
        // Clean up empty rooms
        if (room.participants.length === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (empty)`);
        }
    }
    
    res.json({ message: 'Left room successfully' });
});

// Clean up disconnected peers periodically
setInterval(() => {
    const now = new Date();
    for (const [roomId, room] of rooms.entries()) {
        const oldCount = room.participants.length;
        room.participants = room.participants.filter(p => {
            const timeDiff = now - new Date(p.joinedAt);
            return timeDiff < 30 * 60 * 1000; // Remove participants older than 30 minutes
        });
        
        if (room.participants.length === 0) {
            rooms.delete(roomId);
            console.log(`Room ${roomId} deleted (timeout)`);
        } else if (room.participants.length !== oldCount) {
            console.log(`Cleaned up ${oldCount - room.participants.length} participants from room ${roomId}`);
        }
    }
}, 5 * 60 * 1000); // Run every 5 minutes

console.log('PeerJS server started on port 9000');
console.log('Room management API available at /api/rooms');