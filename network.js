import { Peer } from 'peerjs';

export class NetworkManager {
    constructor() {
        this.peer = null;
        this.conn = null;
        this.myId = null;
        this.callbacks = {
            onConnect: () => {},
            onData: () => {},
            onDisconnect: () => {}
        };
    }

    async init(username) {
        if (this.peer) return; // Already init

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
        if (this.conn) this.conn.close();
        if (this.peer) this.peer.destroy();
        this.peer = null;
        this.conn = null;
    }

    on(event, callback) {
        if (this.callbacks[event] !== undefined) {
            this.callbacks[event] = callback;
        }
    }
}

export const network = new NetworkManager();