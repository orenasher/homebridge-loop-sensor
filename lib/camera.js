'use strict';

const fs = require('fs');
const dgram = require('dgram');
const { spawn, execFile } = require('child_process');

function resolveFfmpeg(configured) {
  if (configured) return configured;
  try { const p = require('ffmpeg-for-homebridge'); if (p && fs.existsSync(p)) return p; } catch (e) { /* optional */ }
  for (const p of ['/usr/bin/ffmpeg', '/usr/local/bin/ffmpeg', '/opt/homebrew/bin/ffmpeg']) {
    try { if (fs.existsSync(p)) return p; } catch (e) { /* ignore */ }
  }
  return 'ffmpeg';
}

function pickUdpPort() {
  return new Promise((resolve, reject) => {
    const s = dgram.createSocket('udp4');
    s.once('error', reject);
    s.bind(0, () => { const port = s.address().port; s.close(() => resolve(port)); });
  });
}

const PROFILES = ['baseline', 'main', 'high'];
const LEVELS = ['3.1', '3.2', '4.0'];

class WindyCameraDelegate {
  constructor(hap, log, cfg, getImagePath) {
    this.hap = hap;
    this.log = log;
    this.cfg = cfg;
    this.getImagePath = getImagePath;
    this.ffmpeg = resolveFfmpeg(cfg.streaming.ffmpegPath);
    this.pending = new Map();
    this.sessions = new Map();
    this.snapshotCache = new Map();
    this.controller = new hap.CameraController(this.controllerOptions());
  }

  controllerOptions() {
    const hap = this.hap;
    const { width, height } = this.cfg.image;
    const res = [[320, 180, 15], [640, 360, 15], [640, 480, 15], [1280, 720, 15], [1280, 960, 15]];
    res.push([Math.min(width, 1920), Math.min(height, 1080), 15]);
    return {
      cameraStreamCount: 2,
      delegate: this,
      streamingOptions: {
        supportedCryptoSuites: [hap.SRTPCryptoSuites.AES_CM_128_HMAC_SHA1_80],
        video: {
          resolutions: res,
          codec: {
            profiles: [hap.H264Profile.BASELINE, hap.H264Profile.MAIN, hap.H264Profile.HIGH],
            levels: [hap.H264Level.LEVEL3_1, hap.H264Level.LEVEL3_2, hap.H264Level.LEVEL4_0],
          },
        },
        // Intentionally no "audio" block: this camera has no audio, and declaring it without
        // supplying it in PrepareStreamResponse makes HomeKit streaming fail.
      },
    };
  }

  // ---------- snapshots ----------
  handleSnapshotRequest(request, callback) {
    const file = this.getImagePath();
    fs.readFile(file, (err, buf) => {
      if (err) { callback(err); return; }
      const w = request && request.width;
      const h = request && request.height;
      if (!w || !h) { callback(undefined, buf); return; }
      let mtime = 0;
      try { mtime = fs.statSync(file).mtimeMs; } catch (e) { /* ignore */ }
      const key = `${w}x${h}`;
      const cached = this.snapshotCache.get(key);
      if (cached && cached.mtime === mtime) { callback(undefined, cached.buf); return; }
      // downscale with ffmpeg when available (keeps HomeKit responsive); fall back to the original JPEG
      const args = ['-hide_banner', '-loglevel', 'error', '-i', file, '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease`, '-frames:v', '1', '-q:v', '3', '-f', 'mjpeg', 'pipe:1'];
      execFile(this.ffmpeg, args, { encoding: 'buffer', maxBuffer: 20 * 1024 * 1024, timeout: 15000 }, (e, out) => {
        if (e || !out || !out.length) { callback(undefined, buf); return; }
        this.snapshotCache.clear();
        this.snapshotCache.set(key, { mtime, buf: out });
        callback(undefined, out);
      });
    });
  }

  // ---------- live view ----------
  async prepareStream(request, callback) {
    try {
      const returnPort = await pickUdpPort();
      const ssrc = this.hap.CameraController.generateSynchronisationSource();
      this.pending.set(request.sessionID, {
        address: request.targetAddress,
        v6: request.addressVersion === 'ipv6',
        port: request.video.port,
        key: request.video.srtp_key,
        salt: request.video.srtp_salt,
        returnPort, ssrc,
      });
      callback(undefined, {
        video: { port: returnPort, ssrc, srtp_key: request.video.srtp_key, srtp_salt: request.video.srtp_salt },
      });
    } catch (e) { callback(e); }
  }

  handleStreamRequest(request, callback) {
    const id = request.sessionID;
    if (request.type === 'start') {
      const p = this.pending.get(id);
      if (!p) { callback(new Error('unknown session')); return; }
      if (!this.cfg.streaming.enabled) { callback(new Error('live streaming is disabled in the plugin config')); return; }
      this.pending.delete(id);
      const v = request.video;
      const fps = Math.max(1, Math.min(v.fps || 5, this.cfg.streaming.fps));
      const kbps = Math.max(100, Math.min(v.max_bit_rate || 300, this.cfg.streaming.maxBitrateKbps));
      const w = v.width - (v.width % 2);
      const h = v.height - (v.height % 2);
      const args = [
        '-hide_banner', '-loglevel', 'error',
        '-re', '-loop', '1', '-framerate', String(fps), '-i', this.getImagePath(),
        '-an', '-sn', '-dn',
        '-vf', `scale=${w}:${h}:force_original_aspect_ratio=decrease,pad=${w}:${h}:(ow-iw)/2:(oh-ih)/2,format=yuv420p`,
        '-c:v', this.cfg.streaming.videoEncoder, '-preset', 'ultrafast', '-tune', 'zerolatency',
        '-profile:v', PROFILES[v.profile] || 'main', '-level:v', LEVELS[v.level] || '4.0',
        '-r', String(fps), '-g', String(fps * 2), '-bf', '0',
        '-b:v', `${kbps}k`, '-maxrate', `${kbps}k`, '-bufsize', `${kbps * 2}k`,
        '-payload_type', String(v.pt), '-ssrc', String(p.ssrc),
        '-f', 'rtp',
        '-srtp_out_suite', 'AES_CM_128_HMAC_SHA1_80',
        '-srtp_out_params', Buffer.concat([p.key, p.salt]).toString('base64'),
        `srtp://${p.address}:${p.port}?rtcpport=${p.port}&localrtcpport=${p.returnPort}&pkt_size=${v.mtu || 1316}`,
      ];
      if (this.cfg.debug) this.log.info('ffmpeg ' + args.join(' '));
      let proc;
      try { proc = spawn(this.ffmpeg, args, { stdio: ['ignore', 'ignore', 'pipe'] }); } catch (e) { callback(e); return; }
      let responded = false;
      const done = (err) => { if (!responded) { responded = true; callback(err); } };
      proc.on('error', (e) => { this.log.error(`ffmpeg failed to start (${this.ffmpeg}): ${e.message}. Install ffmpeg (sudo apt install ffmpeg) or set streaming.ffmpegPath.`); this.sessions.delete(id); done(e); });
      proc.stderr.on('data', (d) => { if (this.cfg.debug) this.log.warn('ffmpeg: ' + String(d).trim()); });
      proc.on('exit', (code, sig) => {
        const s = this.sessions.get(id);
        if (s) { clearTimeout(s.timer); this.sessions.delete(id); }
        if (code && code !== 255 && !sig) this.log.warn(`ffmpeg exited with code ${code}`);
        if (!responded) done(new Error('ffmpeg exited early'));
      });
      const timer = setTimeout(() => this.stop(id), this.cfg.streaming.maxSessionSeconds * 1000);
      this.sessions.set(id, { proc, timer });
      setTimeout(() => done(), 300); // ffmpeg started
      return;
    }
    if (request.type === 'stop') { this.stop(id); this.pending.delete(id); callback(); return; }
    callback(); // reconfigure: nothing to do for a still image
  }

  stop(id) {
    const s = this.sessions.get(id);
    if (!s) return;
    clearTimeout(s.timer);
    this.sessions.delete(id);
    try { s.proc.kill('SIGKILL'); } catch (e) { /* ignore */ }
  }

  shutdown() { for (const id of [...this.sessions.keys()]) this.stop(id); }
}

module.exports = { WindyCameraDelegate, resolveFfmpeg };
