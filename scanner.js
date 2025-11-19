import jsQR from 'jsqr';

export class Scanner {
    constructor(videoElement, onScanCallback, onErrorCallback) {
        this.videoElement = videoElement;
        this.onScan = onScanCallback;
        this.onError = onErrorCallback;
        this.interval = null;
        this.stream = null;
        this.isActive = false;

        // Bind tick to preserve context
        this.tick = this.tick.bind(this);
    }

    async start() {
        if (this.isActive) return;
        
        try {
            this.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
            this.videoElement.srcObject = this.stream;
            this.videoElement.setAttribute("playsinline", true); 
            await this.videoElement.play();
            
            this.isActive = true;
            requestAnimationFrame(this.tick);
        } catch (e) {
            console.error("Camera error:", e);
            if (this.onError) this.onError(e);
        }
    }

    stop() {
        this.isActive = false;
        if (this.videoElement.srcObject) {
            const tracks = this.videoElement.srcObject.getTracks();
            tracks.forEach(track => track.stop());
            this.videoElement.srcObject = null;
        }
        if (this.interval) {
            cancelAnimationFrame(this.interval);
            this.interval = null;
        }
    }

    tick() {
        if (!this.isActive) return;

        if (this.videoElement.readyState === this.videoElement.HAVE_ENOUGH_DATA) {
            const canvas = document.createElement("canvas");
            canvas.width = this.videoElement.videoWidth;
            canvas.height = this.videoElement.videoHeight;
            const ctx = canvas.getContext("2d");
            ctx.drawImage(this.videoElement, 0, 0, canvas.width, canvas.height);
            
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: "dontInvert",
            });

            if (code && code.data) {
                this.onScan(code.data);
                return; // Stop ticking if scan found? Usually yes, or let caller stop.
                // For this implementation, we keep ticking until caller calls stop()
            }
        }
        
        this.interval = requestAnimationFrame(this.tick);
    }
}