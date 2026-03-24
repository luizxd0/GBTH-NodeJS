/**
 * Command Handler for GunBound-NodeJS
 */

const Commands = {
    emitToUser: function(socket, user, payload) {
        const location = String(user?.location || '').toLowerCase();
        if (location === 'game_room') {
            socket.emit('game_room_message', payload);
            return;
        }
        socket.emit('lobby_message', payload);
    },

    /**
     * Handle incoming command from a socket
     * @param {object} io Socket.io server instance
     * @param {object} socket Socket instance from which the command originated
     * @param {object} user The user data object from socketData
     * @param {string} message The full command string (e.g., "/bcm Hello")
     */
    handle: function(io, socket, user, message) {
        const parts = message.split(' ');
        const cmdName = parts[0].substring(1).toLowerCase(); // remove '/'
        const args = parts.slice(1);

        if (this[cmdName]) {
            this[cmdName](io, socket, user, args);
        } else {
            this.emitToUser(socket, user, {
                type: 'broadcast',
                message: 'Invalid Command',
                color: 'yellow',
                icon: 'icon_frame_5'
            });
        }
    },

    /**
     * /bcm - Broadcast Message
     * Only for GMs (authority 100)
     */
    bcm: function(io, socket, user, args) {
        if (!user || user.authority !== 100) {
            // Unauthorized
            console.log(`[Command] Unauthorized /bcm attempt from ${user ? user.nickname : 'Unknown'}`);
            return;
        }

        const broadcastMessage = args.join(' ');
        if (!broadcastMessage) return;

        console.log(`[Command] GM ${user.nickname} broadcasted: ${broadcastMessage}`);

        const payload = {
            type: 'broadcast',
            message: broadcastMessage,
            color: 'yellow',
            icon: 'icon_frame_5'
        };
        io.emit('lobby_message', payload);
        io.emit('game_room_message', payload);
    },

    /**
     * /help - Help Command
     */
    help: function(io, socket, user, args) {
        let helpText = "Available commands: /help";
        if (user.authority === 100) {
            helpText += ", /bcm <message>";
        }
        
        this.emitToUser(socket, user, {
            type: 'system',
            message: helpText,
            color: 'green'
        });
    }
};

module.exports = {
    handle: (io, socket, user, message) => {
        Commands.handle(io, socket, user, message);
    }
};
