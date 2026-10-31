// PATCH MAISON (mainframe) — fournisseur de médias « mainframe » : PUT authentifié
// vers notre propre hébergement (vhost nginx WebDAV), à la place de Fivemanage.
// Voir PATCHES.md. Chaque .js d'une ressource partage le même scope V8 : tout est
// enfermé dans une IIFE pour ne rien entrer en collision avec upload.js/crypto.js.
(() => {

const https = require('node:https');
const crypto = require('node:crypto');

const registerExport = typeof exports === 'function' ? exports : global.exports;

// Même contrat de convars que mainframe/shared/uploads.lua (<préfixe>_image_*),
// toutes SERVEUR (jamais `setr`) : le mot de passe ne doit jamais atteindre un client.
const CONVAR = {
    upload:   'phone_image_upload_url',
    public:   'phone_image_public_url',
    user:     'phone_image_upload_user',
    password: 'phone_image_upload_password',
};

// Borne locale alignée sur le vhost (client_max_body_size) : un clip plus gros est
// refusé ici plutôt que de partir pour rien.
const MAX_BYTES = 25 * 1024 * 1024;

const done = (ticket, url, err, code) => {
    const send = typeof emit === 'function' ? emit : TriggerEvent;
    send('sd-phone:server:mfupload:done', ticket, url, err, code);
};

function settings() {
    const read = (name) => String(GetConvar(name, '') || '').trim().replace(/\/+$/, '');
    return {
        upload:   read(CONVAR.upload),
        public:   read(CONVAR.public),
        user:     String(GetConvar(CONVAR.user, '') || ''),
        password: String(GetConvar(CONVAR.password, '') || ''),
    };
}

function configured() {
    const s = settings();
    return s.upload.startsWith('https://') && s.public.startsWith('https://')
        && s.user !== '' && s.password !== '';
}

// L'extension vient des OCTETS, jamais du type annoncé par le client : c'est elle
// qui décide du Content-Type servi par nginx. sniff.lua a déjà vérifié que le type
// annoncé et les octets concordent ; on ne fait que nommer.
function extensionOf(bytes, mime) {
    const b = bytes;
    const ascii = (at, text) => b.subarray(at, at + text.length).toString('latin1') === text;
    if (b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF) return 'jpg';
    if (b[0] === 0x89 && ascii(1, 'PNG')) return 'png';
    if (ascii(0, 'GIF8')) return 'gif';
    if (ascii(0, 'RIFF') && ascii(8, 'WEBP')) return 'webp';
    if (b[0] === 0x1A && b[1] === 0x45 && b[2] === 0xDF && b[3] === 0xA3) return 'webm';
    if (ascii(4, 'ftyp')) return mime.startsWith('audio/') ? 'm4a' : 'mp4';
    if (ascii(0, 'OggS')) return 'ogg';
    if (ascii(0, 'ID3') || (b[0] === 0xFF && (b[1] & 0xE0) === 0xE0)) return 'mp3';
    if (ascii(0, 'RIFF') && ascii(8, 'WAVE')) return 'wav';
    return null;
}

function kindOf(mime) {
    if (mime.startsWith('image/')) return 'img';
    if (mime.startsWith('video/')) return 'vid';
    if (mime.startsWith('audio/')) return 'aud';
    return null;
}

function upload(ticket, dataUrl) {
    const s = settings();
    if (!configured()) {
        return done(ticket, null, 'No media host configured on this server', 'no-key');
    }

    const match = typeof dataUrl === 'string'
        ? /^data:([a-z]+\/[a-z0-9.+-]+)(?:;[^,]*)?;base64,(.*)$/is.exec(dataUrl)
        : null;
    if (!match) return done(ticket, null, 'Empty or unreadable media payload', 'bad-data');

    const mime = match[1].toLowerCase();
    let bytes;
    try { bytes = Buffer.from(match[2], 'base64'); } catch { bytes = null; }
    if (!bytes || bytes.length < 16) return done(ticket, null, 'Empty or unreadable media payload', 'bad-data');
    if (bytes.length > MAX_BYTES) return done(ticket, null, 'That file is too large', 'bad-data');

    const kind = kindOf(mime);
    const ext = extensionOf(bytes, mime);
    if (!kind || !ext) return done(ticket, null, 'Unsupported media format', 'bad-data');

    // Nom aléatoire de 128 bits : impossible à deviner, jamais réutilisé (cache immutable).
    const path = `${kind}/${crypto.randomBytes(16).toString('hex')}.${ext}`;
    const target = new URL(`${s.upload}/${path}`);
    const auth = Buffer.from(`${s.user}:${s.password}`).toString('base64');

    const req = https.request({
        host: target.hostname,
        port: target.port || 443,
        path: target.pathname,
        method: 'PUT',
        timeout: 60000,
        headers: {
            'Authorization':  `Basic ${auth}`,
            'Content-Type':   'application/octet-stream',
            'Content-Length': bytes.length,
        },
    }, (res) => {
        res.resume();
        res.on('end', () => {
            if (res.statusCode === 201 || res.statusCode === 204) {
                return done(ticket, `${s.public}/${path}`, null, null);
            }
            console.log(`^1[sd-phone:mfupload]^0 hébergement : HTTP ${res.statusCode} pour ${path}`);
            const code = res.statusCode === 401 ? 'no-key' : 'provider';
            return done(ticket, null, `Media host refused the upload: HTTP ${res.statusCode}`, code);
        });
    });

    req.on('timeout', () => req.destroy(new Error('timeout')));
    req.on('error', (err) => {
        console.log(`^1[sd-phone:mfupload]^0 hébergement injoignable : ${err?.message ?? err}`);
        done(ticket, null, 'Could not reach the media host', 'provider');
    });

    req.end(bytes);
}

registerExport('mfUploadConfigured', () => configured());
registerExport('mfUploadMedia', (ticket, dataUrl) => {
    try {
        upload(String(ticket), dataUrl);
    } catch (err) {
        console.log(`^1[sd-phone:mfupload]^0 ${err?.message ?? err}`);
        done(String(ticket), null, 'Upload failed', 'provider');
    }
});

})();
