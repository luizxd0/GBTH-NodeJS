require('dotenv').config({ path: require('path').resolve(__dirname, '../.env') });
const express = require('express');
const http = require('http');
const path = require('path');
const mysql = require('mysql2/promise');
const { Server } = require("socket.io");

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Tracking online users for buddy requests
const userSockets = new Map(); // nickname -> socket.id
const socketData = new Map(); // socket.id -> { nickname, id }
const pendingNotifications = new Map(); // userId -> timeoutId

function getActivePlayerCount() {
    let count = 0;
    for (const data of socketData.values()) {
        if (data.location !== 'world_list') {
            count++;
        }
    }
    return count;
}

app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/index.html');
});

// DB Connection Pool
const pool = mysql.createPool({
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'gunbound',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0
});

// Signup Endpoint
app.post('/api/signup', async (req, res) => {
    const { username, nickname, gender, password, email } = req.body;

    const authority = 0;
    const gold = 10000;
    const cash = 10000;
    const score = 1000;
    const grade = 24;

    try {
        const connection = await pool.getConnection();
        await connection.beginTransaction();

        try {
            await connection.execute(
                `INSERT INTO user (UserId, Gender, Password, Status, Authority, E_Mail, created_at) VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
                [username, parseInt(gender), password, 'OK', authority, email]
            );

            await connection.execute(
                `INSERT INTO game (Id, Nickname, Gold, Cash, TotalScore, TotalGrade, SeasonScore, SeasonGrade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [username, nickname, gold, cash, score, grade, score, grade]
            );

            await connection.commit();
            res.status(201).json({ message: 'Account created successfully' });
        } catch (err) {
            await connection.rollback();
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(400).json({ error: 'Username or Nickname already exists' });
            }
            throw err;
        } finally {
            connection.release();
        }
    } catch (error) {
        console.error('Signup error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// Ranking Logic Function
async function updateRanks() {
    console.log('[Ranking] Updating player ranks and grades...');
    let connection;
    try {
        connection = await pool.getConnection();
        const [rows] = await connection.execute(
            `    SELECT g.Id, g.TotalScore, g.TotalGrade, g.TotalRank, u.created_at, u.Authority
             FROM game g
             JOIN user u ON g.Id = u.UserId
             ORDER BY g.TotalScore DESC, u.created_at ASC`
        );

        const dynamicRankPlayers = [];
        const fixedRankUpdates = [];
        let currentPosition = 1;

        const getRankByFixedGps = (gp) => {
            if (gp >= 6000) return 9;
            if (gp >= 5100) return 10;
            if (gp >= 4200) return 11;
            if (gp >= 3500) return 12;
            if (gp >= 2800) return 13;
            if (gp >= 2300) return 14;
            if (gp >= 1800) return 15;
            if (gp >= 1500) return 16;
            if (gp >= 1200) return 17;
            if (gp >= 1100) return 18;
            return 19;
        };

        for (const player of rows) {
            // GM Authority check
            if (player.Authority === 100) {
                fixedRankUpdates.push({ Id: player.Id, Grade: 20, Rank: 0 });
                continue;
            }

            const gp = player.TotalScore;
            const pos = currentPosition++;

            if (gp < 6900) {
                const innerRank = getRankByFixedGps(gp); // 9 to 19
                fixedRankUpdates.push({ Id: player.Id, Grade: innerRank + 5, Rank: pos });
            } else {
                dynamicRankPlayers.push({ ...player, gp, pos });
            }
        }

        const dynamicRankUpdates = [];
        const numDynamic = dynamicRankPlayers.length;

        if (numDynamic > 0) {
            let grades = [];
            grades.push(-4 + 5); // Grade 1
            for (let i = 0; i < 4; i++) grades.push(-3 + 5); // Grade 2
            for (let i = 0; i < 16; i++) grades.push(-2 + 5); // Grade 3

            const remaining = Math.max(0, numDynamic - 21);
            if (remaining > 0) {
                const percentages = [85, 65, 45, 25, 15, 10, 5, 3, 1];
                let currentInnerRank = -1;
                let distributed = 0;

                for (let i = percentages.length - 1; i >= 0; i--) {
                    const count = Math.max(1, Math.round((remaining * percentages[i]) / 100));
                    const toAdd = Math.min(count, remaining - distributed);
                    for (let j = 0; j < toAdd; j++) {
                        grades.push(currentInnerRank + 5);
                    }
                    distributed += toAdd;
                    currentInnerRank++;
                }

                while (grades.length < numDynamic) {
                    grades.push(7 + 5); // Grade 12
                }
            }

            for (let i = 0; i < numDynamic; i++) {
                const p = dynamicRankPlayers[i];
                dynamicRankUpdates.push({ Id: p.Id, Grade: grades[i] || 13, Rank: p.pos });
            }
        }

        const allUpdates = [...fixedRankUpdates, ...dynamicRankUpdates];
        for (const up of allUpdates) {
            await connection.execute(
                'UPDATE game SET TotalGrade = ?, TotalRank = ? WHERE Id = ?',
                [up.Grade, up.Rank, up.Id]
            );
        }
        console.log(`[Ranking] Successfully updated ${allUpdates.length} player ranks.`);
    } catch (err) {
        console.error('[Ranking] Error updating ranks:', err);
    } finally {
        if (connection) connection.release();
    }
}

// Schedule Ranking
updateRanks(); // Run on startup
setInterval(updateRanks, 30 * 60 * 1000); // Every 30 minutes

// ─── LOGIN ───────────────────────────────────
app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        const [users] = await pool.execute(
            `    SELECT u.UserId, u.Authority, u.Gender, g.Nickname, g.Guild, g.Gold, g.Cash, g.TotalScore, g.TotalGrade, g.TotalRank 
             FROM user u
             JOIN game g ON u.UserId = g.Id
             WHERE u.UserId = ? AND u.Password = ?`,
            [username, password]
        );

        if (users.length > 0) {
            const user = users[0];
            res.status(200).json({
                message: 'Login successful',
                user: {
                    id: user.UserId,
                    nickname: user.Nickname,
                    guild: user.Guild,
                    authority: user.Authority,
                    gender: user.Gender,
                    gold: user.Gold,
                    cash: user.Cash,
                    score: user.TotalScore,
                    grade: user.TotalGrade,
                    rank: user.TotalRank
                }
            });
        } else {
            res.status(401).json({ error: 'Invalid username or password' });
        }
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).json({ error: 'Database error' });
    }
});

// ─── WORLDS ──────────────────────────────────
app.get('/api/worlds', (req, res) => {
    // Return only 1 world as requested, counting only users in the lobby
    res.json([
        {
            server_name: 'Server 1',
            server_description: 'All',
            server_utilization: getActivePlayerCount(),
            server_capacity: 10,
            server_enabled: true
        }
    ]);
});

io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Send current lobby count to new connections (e.g. World List)
    socket.emit('playerCountUpdate', userSockets.size);

    socket.on('set_user_data', (data) => {
        if (data && data.nickname) {
            userSockets.set(data.nickname.toLowerCase(), socket.id);
            socketData.set(socket.id, {
                nickname: data.nickname,
                id: data.id,
                gender: data.gender,
                grade: data.grade,
                guild: data.guild,
                authority: data.authority || 0,
                location: data.location || 'unknown',
                serverId: data.location === 'world_list' ? 0 : 1,
                channelId: data.location === 'channel' ? 1 : (data.location === 'in_game' ? (data.roomId || 1) : 0)
            });
            console.log(`[Buddy] Linked ${data.nickname} to ${socket.id} at ${data.location || 'unknown'} (Auth: ${data.authority || 0})`);
            io.emit('playerCountUpdate', getActivePlayerCount());

            // Automatically send buddy list on identification
            sendBuddyList(socket, data.id);

            // Notify buddies that this user is now online/changed location
            // Delay = 0 means immediate update and cancel any pending "offline" notice
            notifyBuddiesOfStatusChange(data.id, 0);

            broadcastChannelUsers();
        }
    });

    socket.on('lobby_message', (message) => {
        const user = socketData.get(socket.id);
        if (user && message && message.trim() !== '') {
            const trimmedMessage = message.trim();
            
            // Check for commands
            if (trimmedMessage.startsWith('/')) {
                const Commands = require('./commands');
                Commands.handle(io, socket, user, trimmedMessage);
                return;
            }

            // Broadcasting to everyone in the lobby for now. 
            // In a multi-channel setup, we would filter by location/channel.
            io.emit('lobby_message', {
                nickname: user.nickname,
                guild: user.guild,
                message: trimmedMessage,
                authority: user.authority,
                type: 'user'
            });
        }
    });

    function broadcastChannelUsers() {
        const channelUsers = [];
        for (const [sId, data] of socketData.entries()) {
            if (data.location === 'channel') {
                channelUsers.push({
                    id: data.id,
                    nickname: data.nickname,
                    gender: data.gender,
                    grade: data.grade,
                    guild: data.guild
                });
            }
        }
        for (const [sId, data] of socketData.entries()) {
            if (data.location === 'channel') {
                io.to(sId).emit('channel_users', channelUsers);
            }
        }
    }

    async function sendBuddyList(socket, userId) {
        try {
            const connection = await pool.getConnection();
            try {
                const [buddies] = await connection.execute(
                    `SELECT b.Buddy as id, g.Nickname, g.TotalGrade as Grade, g.Guild 
                     FROM buddylist b
                     JOIN game g ON b.Buddy = g.Id
                     WHERE b.Id = ?`,
                    [userId]
                );

                const buddyListData = buddies.map(b => {
                    const buddyNicknameKey = b.Nickname.toLowerCase();
                    const isOnline = userSockets.has(buddyNicknameKey);
                    let location = 'offline';
                    let serverId = 0;
                    let channelId = 0;

                    if (isOnline) {
                        const buddySocketId = userSockets.get(buddyNicknameKey);
                        const buddyData = socketData.get(buddySocketId);
                        location = buddyData ? buddyData.location : 'online';
                        serverId = buddyData ? buddyData.serverId : 0;
                        channelId = buddyData ? buddyData.channelId : 0;
                    }

                    return {
                        id: b.id,
                        nickname: b.Nickname,
                        grade: b.Grade,
                        guild: b.Guild,
                        online: isOnline,
                        location: location,
                        serverId: serverId || 0,
                        channelId: channelId || 0
                    };
                });

                const onlineCount = buddyListData.filter(b => b.online).length;
                const totalCount = buddyListData.length;

                socket.emit('buddy_list_data', {
                    buddies: buddyListData,
                    onlineCount,
                    totalCount
                });
            } catch (err) {
                console.error('[Buddy] Error fetching list:', err);
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('[Buddy] Connection Error:', error);
        }
    }

    async function notifyBuddiesOfStatusChange(userId, delay = 0) {
        // Clear any pending notification for this user if we are sending an update (immediate or delayed)
        if (pendingNotifications.has(userId)) {
            clearTimeout(pendingNotifications.get(userId));
            pendingNotifications.delete(userId);
        }

        if (delay > 0) {
            const timeoutId = setTimeout(() => {
                pendingNotifications.delete(userId);
                notifyBuddiesOfStatusChange(userId, 0); // Execute immediately after delay
            }, delay);
            pendingNotifications.set(userId, timeoutId);
            return;
        }

        try {
            const connection = await pool.getConnection();
            try {
                const [friendsOnline] = await connection.execute(
                    `SELECT g.Nickname, g.Id
                     FROM buddylist b
                     JOIN game g ON b.Id = g.Id
                     WHERE b.Buddy = ?`,
                    [userId]
                );

                for (const friend of friendsOnline) {
                    const friendSocketId = userSockets.get(friend.Nickname.toLowerCase());
                    if (friendSocketId) {
                        const friendSocket = io.sockets.sockets.get(friendSocketId);
                        if (friendSocket) {
                            sendBuddyList(friendSocket, friend.Id);
                        }
                    }
                }
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('[Buddy] Error notifying buddies:', error);
        }
    }

    socket.on('leave_lobby', () => {
        const data = socketData.get(socket.id);
        if (data) {
            const userId = data.id;
            const nickname = data.nickname;
            userSockets.delete(nickname.toLowerCase());
            socketData.delete(socket.id);
            console.log(`[Buddy] User left lobby: ${nickname}`);
            io.emit('playerCountUpdate', getActivePlayerCount());

            // Removing immediate notification here. 
            // The disconnect handler will trigger a delayed notification instead.
            broadcastChannelUsers();
        }
    });

    socket.on('send_buddy_request', (targetNickname) => {
        const sender = socketData.get(socket.id);
        if (!sender) return;

        const targetSocketId = userSockets.get(targetNickname.toLowerCase());
        if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
            io.to(targetSocketId).emit('incoming_buddy_request', {
                fromNickname: sender.nickname,
                fromId: sender.id
            });
        }
        // No specific error if offline, as per user's "wait for answer" requirement
    });

    socket.on('get_buddy_list', async () => {
        const user = socketData.get(socket.id);
        if (user) {
            sendBuddyList(socket, user.id);
        }
    });

    socket.on('respond_buddy_request', async (data) => {
        const { fromNickname, fromId, accepted } = data;
        const receiver = socketData.get(socket.id);
        if (!receiver) return;

        const senderSocketId = userSockets.get(fromNickname.toLowerCase());

        if (accepted) {
            try {
                const connection = await pool.getConnection();
                try {
                    await connection.beginTransaction();

                    // Mutual insert into buddylist
                    // Schema: Id, Category, Buddy
                    // Assuming Category 'Friend' (0) for now
                    await connection.execute(
                        'INSERT IGNORE INTO buddylist (Id, Category, Buddy) VALUES (?, ?, ?)',
                        [receiver.id, 'Friend', fromId]
                    );
                    await connection.execute(
                        'INSERT IGNORE INTO buddylist (Id, Category, Buddy) VALUES (?, ?, ?)',
                        [fromId, 'Friend', receiver.id]
                    );

                    await connection.commit();
                    console.log(`[Buddy] Mutual relationship created for ${receiver.nickname} and ${fromNickname}`);

                    // Refresh buddy list instantly
                    sendBuddyList(socket, receiver.id);
                    if (senderSocketId && io.sockets.sockets.get(senderSocketId)) {
                        sendBuddyList(io.sockets.sockets.get(senderSocketId), fromId);
                    }

                    if (senderSocketId) {
                        io.to(senderSocketId).emit('buddy_request_accepted', { nickname: receiver.nickname });
                    }
                } catch (err) {
                    await connection.rollback();
                    console.error('[Buddy] DB Error on accept:', err);
                } finally {
                    connection.release();
                }
            } catch (error) {
                console.error('[Buddy] Connection Error:', error);
            }
        } else {
            console.log(`[Buddy] ${receiver.nickname} rejected ${fromNickname}`);
            if (senderSocketId) {
                io.to(senderSocketId).emit('buddy_request_rejected', { nickname: receiver.nickname });
            }
        }
    });

    socket.on('delete_buddy', async (targetId) => {
        const user = socketData.get(socket.id);
        if (!user) return;

        try {
            const connection = await pool.getConnection();
            try {
                await connection.beginTransaction();

                await connection.execute(
                    'DELETE FROM buddylist WHERE (Id = ? AND Buddy = ?) OR (Id = ? AND Buddy = ?)',
                    [user.id, targetId, targetId, user.id]
                );

                await connection.commit();
                console.log(`[Buddy] Deleted relationship between ${user.nickname} and ID ${targetId}`);

                // Send updated list to the user who deleted
                sendBuddyList(socket, user.id);

                // Find the target's socket
                let targetSocketId = null;
                for (const [sId, data] of socketData.entries()) {
                    if (data.id === targetId) {
                        targetSocketId = sId;
                        break;
                    }
                }

                if (targetSocketId && io.sockets.sockets.get(targetSocketId)) {
                    sendBuddyList(io.sockets.sockets.get(targetSocketId), targetId);
                }

            } catch (err) {
                await connection.rollback();
                console.error('[Buddy] DB Error on delete:', err);
            } finally {
                connection.release();
            }
        } catch (error) {
            console.error('[Buddy] Connection Error:', error);
        }
    });

    socket.on('disconnect', () => {
        const data = socketData.get(socket.id);
        if (data) {
            const userId = data.id;
            const nickname = data.nickname;
            userSockets.delete(nickname.toLowerCase());
            socketData.delete(socket.id);
            console.log(`User disconnected: ${nickname}`);
            io.emit('playerCountUpdate', getActivePlayerCount());

            // Notify buddies that this user is now offline with a short delay (100ms)
            // This allows for seamless page transitions without flickering "LOG OUT"
            notifyBuddiesOfStatusChange(userId, 100);
            broadcastChannelUsers();
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
