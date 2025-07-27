const { PeerServer } = require('peer');
const express = require('express');
const cors = require('cors');
const { ExpressPeerServer } = require('peer');

const app = express();

const corsOptions = {
    origin: [
        "https://web-frontend-mediconnect.onrender.com",
        "http://localhost:3000",
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

// Create HTTPS server object for Render (Render handles SSL termination)
const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`[PeerJS Server] Server started on port ${PORT}`);
});

// ✅ Add PeerJS server with TURN/STUN ICE config
const peerServer = ExpressPeerServer(server, {
    path: "/peerjs",
    debug: true,
    allow_discovery: true,
    proxied: true, // important on platforms like Render
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

// Optional events
peerServer.on('connection', (client) => {
    console.log(`[PeerJS] Connected: ${client.getId()}`);
});
peerServer.on('disconnect', (client) => {
    console.log(`[PeerJS] Disconnected: ${client.getId()}`);
});

// Room management (same as before)...
// Keep your existing /api/rooms/:roomId/join, leave, list, etc.

app.get('/health', (req, res) => {
    res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        environment: isProduction ? 'production' : 'development'
    });
});

process.on('SIGINT', () => {
    console.log('[PeerJS Server] SIGINT received, shutting down...');
    server.close(() => {
        console.log('[PeerJS Server] Closed.');
        process.exit(0);
    });
});

process.on('SIGTERM', () => {
    console.log('[PeerJS Server] SIGTERM received, shutting down...');
    server.close(() => {
        console.log('[PeerJS Server] Closed.');
        process.exit(0);
    });
});

module.exports = { app, server };
