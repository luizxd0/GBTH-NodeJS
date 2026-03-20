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

function getUKTimestamp() {
    const now = new Date();
    const pad = (n) => n.toString().padStart(2, '0');
    return `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
}

function getActivePlayerCount() {
    let count = 0;
    for (const data of socketData.values()) {
        if (data.location !== 'world_list') {
            count++;
        }
    }
    return count;
}

function normalizeGender(genderValue) {
    return Number(genderValue) === 1 ? 1 : 0;
}

function normalizeAvatarCatalogGender(genderValue) {
    const raw = String(genderValue ?? '').trim().toLowerCase();
    if (raw === '1' || raw === 'f' || raw === 'female' || raw === 'girl') {
        return 'f';
    }
    if (raw === '0' || raw === 'm' || raw === 'male' || raw === 'boy') {
        return 'm';
    }
    return 'u';
}

function normalizeAvatarCatalogSlot(slotValue) {
    const raw = String(slotValue ?? '').trim().toLowerCase();
    if (raw === 'cloth' || raw === 'body') return 'body';
    if (raw === 'cap' || raw === 'head') return 'head';
    if (raw === 'glasse' || raw === 'glass' || raw === 'eyes' || raw === 'eye') return 'eyes';
    if (raw === 'flag') return 'flag';
    if (raw === 'set' || raw === 'setitem') return 'setitem';
    if (raw === 'exitem' || raw === 'background' || raw === 'foreground') return raw;
    return raw;
}

function toOptionalAvatarValue(value) {
    if (value === null || value === undefined) {
        return null;
    }
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function toBaseAvatarValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) {
        return 0;
    }
    return parsed;
}

function buildUserPayload(row) {
    return {
        id: row.UserId,
        nickname: row.Nickname,
        guild: row.Guild,
        authority: row.Authority,
        gender: normalizeGender(row.Gender),
        ahead: toBaseAvatarValue(row.ahead),
        abody: toBaseAvatarValue(row.abody),
        aeyes: toOptionalAvatarValue(row.aeyes),
        aflag: toOptionalAvatarValue(row.aflag),
        gold: row.Gold,
        cash: row.Cash,
        score: row.TotalScore,
        grade: row.TotalGrade,
        rank: row.TotalRank
    };
}


app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

// Root redirect
app.get('/', (req, res) => {
    res.redirect('/views/index.html');
});

// Backward-compatible routes after moving HTML files into /views
const viewRedirects = {
    '/index.html': '/views/index.html',
    '/world_list.html': '/views/world_list.html',
    '/lobby.html': '/views/lobby.html',
    '/avatar_shop.html': '/views/avatar_shop.html',
    '/create_account.html': '/views/create_account.html'
};

Object.entries(viewRedirects).forEach(([from, to]) => {
    app.get(from, (req, res) => {
        res.redirect(to);
    });
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
    const normalizedGender = normalizeGender(gender);

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
                [username, normalizedGender, password, 'OK', authority, email]
            );

            await connection.execute(
                `INSERT INTO game (Id, Nickname, Gold, Cash, TotalScore, TotalGrade, SeasonScore, SeasonGrade) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [username, nickname, gold, cash, score, grade, score, grade]
            );

            await connection.commit();
            res.status(201).json({
                message: 'Account created successfully',
                user: {
                    id: username,
                    nickname: nickname,
                    guild: '',
                    authority: authority,
                    gender: normalizedGender,
                    ahead: 0,
                    abody: 0,
                    aeyes: null,
                    aflag: null,
                    gold: gold,
                    cash: cash,
                    score: score,
                    grade: grade,
                    rank: 0
                }
            });
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
                fixedRankUpdates.push({ Id: player.Id, Grade: 25, Rank: 0 });
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
                user: buildUserPayload(user)
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
app.get('/api/avatar-shop/catalog', async (req, res) => {
    const nowMs = Date.now();
    try {
        const [rows] = await pool.execute('SELECT * FROM avatars');
        const normalized = (rows || [])
            .map((row) => {
                const sourceAvatarId = row?.source_avatar_id ?? row?.SourceAvatarId ?? row?.sourceAvatarId;
                const sourceRefId = row?.source_ref_id ?? row?.SourceRefId ?? row?.sourceRefId ?? row?.ref_id ?? row?.RefId ?? null;
                const avatarCode = row?.avatar_code ?? row?.AvatarCode ?? row?.item_code ?? row?.ItemCode ?? '';
                const itemName = row?.name ?? row?.Name ?? avatarCode;
                const slotValue = row?.slot ?? row?.Slot ?? row?.category ?? row?.Category;
                const genderValue = row?.gender ?? row?.Gender;
                const setKey = row?.set_key ?? row?.SetKey ?? null;
                const removeTimeRaw = row?.remove_time ?? row?.RemoveTime ?? null;
                const enabledRaw = row?.enabled ?? row?.Enabled;
                const removeTime = toOptionalAvatarValue(removeTimeRaw);
                const enabled = enabledRaw === undefined || enabledRaw === null
                    ? 1
                    : (Number(enabledRaw) === 1 ? 1 : 0);
                return {
                    id: toBaseAvatarValue(row?.id),
                    source_avatar_id: toBaseAvatarValue(sourceAvatarId),
                    source_ref_id: toOptionalAvatarValue(sourceRefId),
                    avatar_code: String(avatarCode || ''),
                    name: String(itemName || avatarCode || ''),
                    slot: normalizeAvatarCatalogSlot(slotValue),
                    gender: normalizeAvatarCatalogGender(genderValue),
                    set_key: setKey == null ? null : String(setKey),
                    remove_time: removeTime,
                    gold_week: toBaseAvatarValue(row?.gold_week),
                    gold_month: toBaseAvatarValue(row?.gold_month),
                    gold_perm: toBaseAvatarValue(row?.gold_perm),
                    cash_week: toBaseAvatarValue(row?.cash_week),
                    cash_month: toBaseAvatarValue(row?.cash_month),
                    cash_perm: toBaseAvatarValue(row?.cash_perm),
                    stat_pop: toBaseAvatarValue(row?.stat_pop),
                    stat_time: toBaseAvatarValue(row?.stat_time),
                    stat_atk: toBaseAvatarValue(row?.stat_atk),
                    stat_def: toBaseAvatarValue(row?.stat_def),
                    stat_life: toBaseAvatarValue(row?.stat_life),
                    stat_item: toBaseAvatarValue(row?.stat_item),
                    stat_dig: toBaseAvatarValue(row?.stat_dig),
                    stat_shld: toBaseAvatarValue(row?.stat_shld),
                    is_unlocked: toBaseAvatarValue(row?.is_unlocked ?? 1),
                    enabled
                };
            })
            .filter((item) =>
                item.enabled === 1
                && (item.remove_time === null || item.remove_time === 0 || item.remove_time > nowMs)
            )
            .sort((a, b) => {
                const codeCompare = String(a.avatar_code).localeCompare(String(b.avatar_code));
                if (codeCompare !== 0) {
                    return codeCompare;
                }
                return Number(a.id) - Number(b.id);
            });

        res.json({ items: normalized });
    } catch (error) {
        console.warn(`[AvatarShop] Catalog load fallback to empty list (${error?.code || 'UNKNOWN'}):`, error?.message || error);
        res.json({ items: [] });
    }
});

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

    // Send current lobby count to new connections (e.g. World List)
    socket.emit('playerCountUpdate', userSockets.size);

    socket.on('set_user_data', async (data) => {
        if (data && data.nickname) {
            // Fetch latest data from DB to ensure sync
            try {
                const [rows] = await pool.execute(
                    `SELECT u.UserId, u.Authority, u.Gender, g.Nickname, g.Guild, g.Gold, g.Cash, g.TotalScore, g.TotalGrade, g.TotalRank
                     FROM user u
                     JOIN game g ON u.UserId = g.Id
                     WHERE g.Nickname = ?`,
                    [data.nickname]
                );

                if (rows.length > 0) {
                    const dbUser = rows[0];
                    userSockets.set(dbUser.Nickname.toLowerCase(), socket.id);
                    socketData.set(socket.id, {
                        nickname: dbUser.Nickname,
                        id: dbUser.UserId,
                        gender: dbUser.Gender,
                        grade: dbUser.TotalGrade,
                        guild: dbUser.Guild,
                        authority: dbUser.Authority,
                        location: data.location || 'unknown',
                        serverId: data.location === 'world_list' ? 0 : 1,
                        channelId: data.location === 'channel' ? 1 : (data.location === 'in_game' ? (data.roomId || 1) : 0)
                    });

                    // Send updated user info back to client
                    socket.emit('user_info_update', buildUserPayload(dbUser));
                }
            } catch (err) {
                console.error('[UserSync] Error fetching latest data:', err);
            }

            console.log(`[Login] [${getUKTimestamp()}] ${data.nickname} logged in.`);
            io.emit('playerCountUpdate', getActivePlayerCount());

            // Automatically send buddy list on identification
            // Wait, we need the user id, which we now have from dbUser
            const currentData = socketData.get(socket.id);
            if (currentData) {
                sendBuddyList(socket, currentData.id);
                notifyBuddiesOfStatusChange(currentData.id, 0);
            }

            broadcastChannelUsers(currentData.channelId);
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

            console.log(`[Chat] [${getUKTimestamp()}] ${user.nickname} to Lobby/Channel: ${trimmedMessage}`);

            // Broadcasting to users in the same channel
            const usersInChannel = [];
            for (const [sId, data] of socketData.entries()) {
                if (data.location === 'channel' && data.channelId === user.channelId) {
                    io.to(sId).emit('lobby_message', {
                        nickname: user.nickname,
                        guild: user.guild,
                        message: trimmedMessage,
                        authority: user.authority,
                        type: 'user'
                    });
                }
            }
        }
    });

    socket.on('switch_channel', (newChannelId) => {
        const user = socketData.get(socket.id);
        if (user && user.location === 'channel') {
            const oldChannelId = user.channelId;
            user.channelId = parseInt(newChannelId);
            
            // Re-broadcast user lists for both channels
            broadcastChannelUsers(oldChannelId);
            broadcastChannelUsers(user.channelId);

            // Notify buddies of the channel status change
            notifyBuddiesOfStatusChange(user.id, 0);
        }
    });

    socket.on('private_message', (data) => {
        const { toNickname, message } = data;
        const sender = socketData.get(socket.id);
        if (!sender || !toNickname || !message || message.trim() === '') return;

        console.log(`[Whisper] [${getUKTimestamp()}] ${sender.nickname} to ${toNickname}: ${message.trim()}`);

        const targetSocketId = userSockets.get(toNickname.toLowerCase());
        if (targetSocketId) {
            io.to(targetSocketId).emit('private_message', {
                fromNickname: sender.nickname,
                message: message.trim()
            });
        }
    });

    function broadcastChannelUsers(channelId) {
        if (!channelId) return;
        const channelUsers = [];
        for (const [sId, data] of socketData.entries()) {
            if (data.location === 'channel' && data.channelId === channelId) {
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
            const userData = socketData.get(sId);
            if (userData && userData.location === 'channel' && userData.channelId === channelId) {
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
            const nicknameKey = nickname.toLowerCase();
            const linkedSocketId = userSockets.get(nicknameKey);
            if (linkedSocketId === socket.id) {
                userSockets.delete(nicknameKey);
            }
            socketData.delete(socket.id);
            io.emit('playerCountUpdate', getActivePlayerCount());

            broadcastChannelUsers(data.channelId);
        }
    });

    socket.on('send_buddy_request', (targetNickname) => {
        const sender = socketData.get(socket.id);
        if (!sender) return;

        console.log(`[Buddy] [${getUKTimestamp()}] ${sender.nickname} is trying to add ${targetNickname}`);

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
                    console.log(`[Buddy] [${getUKTimestamp()}] ${receiver.nickname} accepted buddy request from ${fromNickname}`);

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
            console.log(`[Buddy] [${getUKTimestamp()}] ${receiver.nickname} rejected buddy request from ${fromNickname}`);
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
                console.log(`[Buddy] [${getUKTimestamp()}] ${user.nickname} deleted a buddy (ID: ${targetId})`);

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
            const nicknameKey = nickname.toLowerCase();
            const linkedSocketId = userSockets.get(nicknameKey);
            const isCurrentLinkedSocket = linkedSocketId === socket.id;

            if (isCurrentLinkedSocket) {
                userSockets.delete(nicknameKey);
            }

            socketData.delete(socket.id);
            console.log(`[Logoff] [${getUKTimestamp()}] ${nickname} logged off.`);
            io.emit('playerCountUpdate', getActivePlayerCount());

            // Only notify offline if this socket is still the active mapping for that nickname.
            // This prevents page-transition races from clearing a newer socket status.
            if (isCurrentLinkedSocket) {
                notifyBuddiesOfStatusChange(userId, 100);
            }
            broadcastChannelUsers(data.channelId);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
