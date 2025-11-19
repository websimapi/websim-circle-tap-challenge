import { Peer } from 'peerjs';

// Shared WebsimSocket instance
export const room = new WebsimSocket();
// room.initialize(); // Start connection immediately

// Initialize room and announce our presence so others can see us in realtime
(async () => {
    try {
        await room.initialize();

        if (window.websim && typeof window.websim.getCurrentUser === 'function') {
            const currentUser = await window.websim.getCurrentUser();
            if (currentUser) {
                room.updatePresence({
                    username: currentUser.username,
                    avatarUrl: currentUser.avatar_url,
                    online: true,
                    lastSeen: Date.now(),
                });
            }
        } else {
            // Fallback presence if websim user info is unavailable
            room.updatePresence({
                online: true,
                lastSeen: Date.now(),
            });
        }

        // After initialization and presence announcement, emit an initial peer list
        if (window.__circleTapNetwork && typeof window.__circleTapNetwork.handlePeerUpdate === 'function') {
            window.__circleTapNetwork.handlePeerUpdate();
        }

        // Heartbeat: ensure peer lists stay fresh even if a presence event is missed
        setInterval(() => {
            if (window.__circleTapNetwork && typeof window.__circleTapNetwork.handlePeerUpdate === 'function') {
                window.__circleTapNetwork.handlePeerUpdate();
            }
        }, 5000);
    } catch (err) {
        console.error('Error initializing realtime room/presence:', err);
    }
})();

export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.myId = null;
        this.callbacks = {
            onConnect: () => {},
            onData: () => {},
            onDisconnect: () => {},
            onPeerList: () => {},
            onChallenge: () => {}
        };
        
        this.setupSignaling();
    }

    // Emit the current peer map to listeners
    handlePeerUpdate() {
        if (!this.callbacks.onPeerList) return;
        const peersMap = room.peers || {};
        this.callbacks.onPeerList(peersMap);
    }

    setupSignaling() {
        // Listen for peer list / presence updates
        room.subscribePresence((currentPresence) => {
            // currentPresence: { clientId: presenceData }
            // room.peers contains richer info (username, avatar)
            console.log("Presence updated. Peers count:", Object.keys(room.peers || {}).length);
            this.handlePeerUpdate();
        });

        // Chain any existing onmessage handler to avoid clobbering
        const previousOnMessage = room.onmessage;
        room.onmessage = (event) => {
            if (typeof previousOnMessage === 'function') {
                try {
                    previousOnMessage(event);
                } catch (e) {
                    console.error('Error in previous room.onmessage handler:', e);
                }
            }

            const data = event.data;
            if (!data) return;

            if (data.type === 'CHALLENGE_INVITE') {
                if (data.targetId === room.clientId) {
                    this.callbacks.onChallenge(data);
                }
            } else if (data.type === 'CHALLENGE_REJECT') {
                if (data.targetId === room.clientId) {
                    // Handle rejection (optional toast)
                    console.log("Challenge rejected by", data.username);
                }
            }
        };
    }

    async initPeerJS(username) {
        if (this.peer) return this.myId;

        this.peer = new Peer();

        return new Promise((resolve, reject) => {
            this.peer.on('open', (id) => {
                this.myId = id;
                console.log('My Peer ID is: ' + id);
                resolve(id);
            });

            this.peer.on('connection', (conn) => {
                this.handleConnection(conn);
            });

            this.peer.on('error', (err) => {
                console.error('PeerJS error:', err);
                reject(err);
            });
        });
    }

    // Send a challenge via WebsimSocket
    async sendChallengeInvite(targetClientId) {
        const currentUser = await window.websim.getCurrentUser();
        
        // Ensure PeerJS is ready so we have an ID to send
        if (!this.peer) {
            await this.initPeerJS(currentUser.username);
        }

        room.send({
            type: 'CHALLENGE_INVITE',
            targetId: targetClientId,
            senderId: room.clientId,
            peerId: this.myId,
            username: currentUser.username,
            avatarUrl: currentUser.avatar_url
        });
    }

    rejectChallenge(senderId) {
         room.send({
            type: 'CHALLENGE_REJECT',
            targetId: senderId,
            senderId: room.clientId
        });
    }

    connectToPeer(peerId, metadata = {}) {
        if (!this.peer) return;
        const conn = this.peer.connect(peerId, {
            metadata: metadata
        });
        this.handleConnection(conn);
    }

    handleConnection(conn) {
        if (this.conn) {
            this.conn.close();
        }
        this.conn = conn;

        this.conn.on('open', () => {
            console.log("Connected to: " + this.conn.peer);
            this.callbacks.onConnect(this.conn.metadata);
        });

        this.conn.on('data', (data) => {
            this.callbacks.onData(data);
        });

        this.conn.on('close', () => {
            console.log("Connection closed");
            this.callbacks.onDisconnect();
            this.conn = null;
        });

        this.conn.on('error', (err) => {
            console.error("Connection error:", err);
            this.callbacks.onDisconnect();
        });
    }

    send(data) {
        if (this.conn && this.conn.open) {
            this.conn.send(data);
        }
    }

    close() {
        if (this.conn) {
            this.conn.close();
            this.conn = null;
        }
        // We generally don't want to destroy the peer instance unless we are fully quitting
        // so we can receive future challenges.
    }

    on(event, callback) {
        if (this.callbacks[event] !== undefined) {
            this.callbacks[event] = callback;
        }
    }
}

export const network = new NetworkManager();
// Expose the singleton so the initializer can trigger updates after room.initialize()
window.__circleTapNetwork = network;