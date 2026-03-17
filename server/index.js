const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);
const port = 3000;

let joinedPlayers = 0;

app.use(express.static(path.join(__dirname, '../public')));

// Serve world_list.html by default
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../public/world_list.html'));
});

// Mock API for world list
app.get('/api/worlds', (req, res) => {
    const worlds = [
        {
            server_name: "World 1",
            server_description: "All Levels",
            server_utilization: joinedPlayers,
            server_capacity: 10,
            server_enabled: true
        }
    ];
    res.json(worlds);
});

io.on('connection', (socket) => {
    console.log(`[Socket] Connected: ${socket.id}`);
    
    socket.hasJoined = false;

    socket.on('joinWorld', () => {
        if (!socket.hasJoined) {
            joinedPlayers++;
            socket.hasJoined = true;
            console.log(`[Socket] ${socket.id} JOINED world. Total joined: ${joinedPlayers}`);
            io.emit('playerCountUpdate', joinedPlayers);
        } else {
            console.log(`[Socket] ${socket.id} tried to join again.`);
        }
    });

    socket.on('disconnect', (reason) => {
        if (socket.hasJoined) {
            joinedPlayers--;
            console.log(`[Socket] ${socket.id} LEFT world (${reason}). Total joined: ${joinedPlayers}`);
            io.emit('playerCountUpdate', joinedPlayers);
        } else {
            console.log(`[Socket] ${socket.id} DISCONNECTED without joining (${reason}).`);
        }
    });
});

server.listen(port, () => {
    console.log(`Gunbound Thor's Hammer server running at http://localhost:${port}`);
});
