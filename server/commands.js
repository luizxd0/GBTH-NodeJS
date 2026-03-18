/**
 * Command Handler for GunBound-NodeJS
 */

const Commands = {
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
            // Optional: send small system message saying "Command not found" if needed
            // But for now, just silently ignore or handle specifically.
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

        io.emit('lobby_message', {
            type: 'broadcast',
            message: broadcastMessage,
            color: 'yellow',
            icon: 'icon_frame_5'
        });
    },

    /**
     * /help - Help Command
     */
    help: function(io, socket, user, args) {
        let helpText = "Available commands: /help";
        if (user.authority === 100) {
            helpText += ", /bcm <message>";
        }
        
        socket.emit('lobby_message', {
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
