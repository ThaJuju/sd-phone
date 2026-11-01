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
let opts: RecordOptions = { bytesPerSecond: 160000, maxBatchBytes: 1500000, flushMs: 100 };
// Budget en seau : il se remplit au débit moyen et se vide à chaque envoi. Sa réserve
// (BURST_SECONDS de débit) laisse passer d'un coup l'ouverture d'une appli, qui insère
// souvent plus de 150 Ko de DOM ; seul un excès qui dure fait sauter des lots.
const BURST_SECONDS = 4;
let tokens = 0;
let lastRefill = 0;
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
    const capacity = opts.bytesPerSecond * BURST_SECONDS;
    tokens = Math.min(capacity, tokens + (now - lastRefill) / 1000 * opts.bytesPerSecond);
    lastRefill = now;

    // Un lot sauté laisse les spectateurs sur un DOM faux : seul un état complet le répare,
    // envoyé dès que la réserve s'est assez reconstituée.
    if (needSnapshot && rrweb && tokens >= capacity / 2) {
        needSnapshot = false;
        queue = [];
        rrweb.record.takeFullSnapshot(true);
        pushRect(true);
    }
    if (queue.length === 0) return;

    const isSnapshot = queue.some(e => e.type === FULL_SNAPSHOT);
    const data = JSON.stringify(queue);
    queue = [];
    if (data.length > opts.maxBatchBytes || (!isSnapshot && data.length > tokens)) {
        needSnapshot = true;
        return;
    }
    // Un état complet passe toujours (il répare tout) ; la réserve peut devenir négative.
    tokens -= data.length;
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
    tokens = opts.bytesPerSecond * BURST_SECONDS;
    lastRefill = performance.now();
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
        // État complet régulier : borne la mémoire du lecteur (voir ScreenViewLayer) et
        // rattrape un spectateur dont un lot se serait perdu.
        checkoutEveryNms: 180000,
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
