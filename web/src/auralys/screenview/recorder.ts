// PATCH MAISON — « Regarder le téléphone » d'un autre joueur, côté propriétaire
// (voir PATCHES.md § 8). Enregistre les modifications du DOM avec rrweb et les envoie
// par lots au client Lua, qui les relaie aux spectateurs. Rien ici ne lit ce que les
// spectateurs envoient : ils n'ont aucun chemin vers ce téléphone.

import type { eventWithTime } from 'rrweb';

import { fetchNui } from '@/core/nui';

export interface RecordOptions {
    bytesPerSecond: number;
    maxBatchBytes:  number;
    flushMs:        number;
}

/** Classe exclue de l'enregistrement (bandeau « on regarde ton écran »). */
export const BLOCK_CLASS = 'rr-block';
/** Tag des events rrweb qui portent la position de l'écran du téléphone. */
export const RECT_TAG = 'sv-rect';
/** EventType.FullSnapshot de rrweb, sans charger rrweb pour une constante. */
const FULL_SNAPSHOT = 2;

type RrwebModule = typeof import('rrweb');

let rrweb: RrwebModule | null = null;
let stopRecording: (() => void) | undefined;
let flushTimer: number | undefined;
let rectTimer: number | undefined;
let queue: eventWithTime[] = [];
let opts: RecordOptions = { bytesPerSecond: 160000, maxBatchBytes: 1500000, flushMs: 150 };
let windowStart = 0;
let windowBytes = 0;
let needSnapshot = false;
let lastRect = '';

function screenRect() {
    const el = document.querySelector('[data-phone-screen]');
    if (!el) return null;
    const r = el.getBoundingClientRect();
    return { x: Math.round(r.left), y: Math.round(r.top), w: Math.round(r.width), h: Math.round(r.height) };
}

function pushRect(force: boolean) {
    const rect = screenRect();
    if (!rect || !rrweb) return;
    const key = `${rect.x},${rect.y},${rect.w},${rect.h}`;
    if (!force && key === lastRect) return;
    lastRect = key;
    rrweb.record.addCustomEvent(RECT_TAG, rect);
}

function flush() {
    const now = performance.now();
    if (now - windowStart >= 1000) {
        windowStart = now;
        windowBytes = 0;
        // Un lot sauté laisse les spectateurs sur un DOM faux : seul un état complet le répare.
        if (needSnapshot && rrweb) {
            needSnapshot = false;
            queue = [];
            rrweb.record.takeFullSnapshot(true);
            pushRect(true);
        }
    }
    if (queue.length === 0) return;

    // Le plafond laisse passer un état complet, plus gros que le débit d'une seconde.
    const isSnapshot = queue.some(e => e.type === FULL_SNAPSHOT);
    const data = JSON.stringify(queue);
    queue = [];
    if (data.length > opts.maxBatchBytes) {
        needSnapshot = true;
        return;
    }
    if (!isSnapshot && windowBytes + data.length > opts.bytesPerSecond) {
        needSnapshot = true;
        return;
    }
    windowBytes += data.length;
    void fetchNui('sd-phone:screenview:push', { d: data });
}

export async function startRecording(options: Partial<RecordOptions>): Promise<void> {
    opts = { ...opts, ...Object.fromEntries(Object.entries(options).filter(([, v]) => typeof v === 'number' && v > 0)) };

    if (stopRecording) {
        // Nouveau spectateur : il lui faut un état complet pour partir.
        rrweb?.record.takeFullSnapshot(true);
        pushRect(true);
        return;
    }

    rrweb = rrweb ?? await import('rrweb');
    queue = [];
    windowStart = performance.now();
    windowBytes = 0;
    needSnapshot = false;
    lastRect = '';

    stopRecording = rrweb.record({
        emit: (event) => { queue.push(event); },
        blockClass: BLOCK_CLASS,
        // Les feuilles de style sont référencées par URL (https://cfx-nui-sd-phone/...) :
        // le spectateur a le même build, inutile de les envoyer.
        inlineStylesheet: false,
        collectFonts: false,
        recordCanvas: false,
        recordCrossOriginIframes: false,
        slimDOMOptions: 'all',
        maskInputOptions: { password: true },
        sampling: {
            mousemove: false,
            mouseInteraction: false,
            scroll: 150,
            media: 800,
            input: 'last',
        },
    }) ?? undefined;

    pushRect(true);
    flushTimer = window.setInterval(flush, opts.flushMs);
    rectTimer = window.setInterval(() => pushRect(false), 500);
}

export function stopAllRecording(): void {
    stopRecording?.();
    stopRecording = undefined;
    if (flushTimer !== undefined) window.clearInterval(flushTimer);
    if (rectTimer !== undefined) window.clearInterval(rectTimer);
    flushTimer = rectTimer = undefined;
    queue = [];
}
