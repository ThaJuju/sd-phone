// PATCH MAISON — « Regarder le téléphone » d'un autre joueur (voir PATCHES.md § 8).
// Spectateur : rejoue le flux rrweb du propriétaire dans une iframe sandboxée (sans
// scripts, interactions coupées par rrweb), recadrée sur l'écran du téléphone.
// Propriétaire : bandeau qui signale qu'on regarde son écran, avec un bouton pour couper.

import { useCallback, useEffect, useRef, useState } from 'react';
import type { eventWithTime, Replayer } from 'rrweb';

import { fetchNui } from '@/core/nui';
import { t } from '@/i18n';

import { RECT_TAG, startRecording, stopAllRecording, type RecordOptions } from './recorder';

interface Rect { x: number; y: number; w: number; h: number }
interface OwnerState { viewerName: string; count: number }

const META = 4;
const CUSTOM = 5;

function isRectEvent(e: eventWithTime): Rect | null {
    if (e.type !== CUSTOM) return null;
    const data = e.data as { tag?: string; payload?: Partial<Rect> };
    if (data.tag !== RECT_TAG || !data.payload) return null;
    const { x, y, w, h } = data.payload;
    if (![x, y, w, h].every(v => typeof v === 'number' && Number.isFinite(v)) || !w || !h) return null;
    return { x: x!, y: y!, w: w!, h: h! };
}

export function ScreenViewLayer() {
    const [viewing, setViewing] = useState(false);
    const [rect, setRect] = useState<Rect | null>(null);
    const [owner, setOwner] = useState<OwnerState | null>(null);
    const [viewport, setViewport] = useState(() => ({ w: window.innerWidth, h: window.innerHeight }));

    const hostRef = useRef<HTMLDivElement>(null);
    const replayerRef = useRef<Replayer | null>(null);
    const pendingRef = useRef<eventWithTime[] | null>(null);
    const creatingRef = useRef(false);
    const sessionRef = useRef(0);

    const teardown = useCallback(() => {
        sessionRef.current += 1;
        try { replayerRef.current?.destroy(); } catch { /* déjà détruit */ }
        replayerRef.current = null;
        pendingRef.current = null;
        creatingRef.current = false;
        if (hostRef.current) hostRef.current.innerHTML = '';
        setRect(null);
    }, []);

    // Lecteur neuf à chaque état complet : rrweb garde en mémoire tous les events reçus,
    // le propriétaire en renvoie un régulièrement pour borner cette mémoire. L'ancien
    // lecteur reste affiché jusqu'à ce que le nouveau soit prêt.
    const createReplayer = useCallback(() => {
        if (creatingRef.current) return;
        creatingRef.current = true;
        const session = sessionRef.current;
        void import('rrweb').then(({ Replayer }) => {
            if (session !== sessionRef.current) return;
            creatingRef.current = false;
            const host = hostRef.current;
            const pending = pendingRef.current;
            if (!host || !pending?.length) return;
            try { replayerRef.current?.destroy(); } catch { /* déjà détruit */ }
            host.innerHTML = '';
            const created = new Replayer([], {
                root: host,
                liveMode: true,
                mouseTail: false,
                showWarning: false,
                showDebug: false,
                triggerFocus: false,
                UNSAFE_replayCanvas: false,
                // En direct, rrweb pose « rrweb-paused » au premier état complet sans jamais le
                // retirer : les animations CSS (entrées en fondu) resteraient figées à leur 1re image.
                pauseAnimation: false,
            });
            // Les events reçus avant cet instant sont joués d'un coup, les suivants dès leur arrivée.
            created.startLive(Date.now());
            for (const e of pending) created.addEvent(e);
            replayerRef.current = created;
            pendingRef.current = null;
        });
    }, []);

    const feed = useCallback((incoming: eventWithTime[]) => {
        // Chaque event est daté de son ARRIVÉE, pas de l'horloge du propriétaire : rrweb planifie
        // le direct par rapport au premier état reçu, si bien que le temps de transfert de cet
        // état (souvent plusieurs secondes) devenait un retard permanent sur tout le reste.
        const now = Date.now();
        const events = incoming.map(e => ({ ...e, timestamp: now }) as eventWithTime);

        for (const e of events) {
            const r = isRectEvent(e);
            if (r) setRect(r);
        }

        // Rien n'est rejouable sans un état complet (Meta puis FullSnapshot) ; ce qui le
        // précède dans le lot appartient à l'état remplacé.
        const metaAt = events.findIndex(e => e.type === META);
        if (metaAt !== -1) {
            pendingRef.current = events.slice(metaAt);
            createReplayer();
            return;
        }
        if (pendingRef.current) {
            pendingRef.current.push(...events);
            return;
        }
        const replayer = replayerRef.current;
        if (replayer) for (const e of events) replayer.addEvent(e);
    }, [createReplayer]);

    useEffect(() => {
        const onMessage = (event: MessageEvent) => {
            const msg = event.data as { action?: string; data?: Record<string, unknown> } | undefined;
            switch (msg?.action) {
                case 'sd-phone:screenview:viewStart':
                    teardown();
                    setViewing(true);
                    break;
                case 'sd-phone:screenview:viewStop':
                    teardown();
                    setViewing(false);
                    break;
                case 'sd-phone:screenview:data': {
                    const raw = msg.data?.d;
                    if (typeof raw !== 'string') break;
                    try {
                        const events = JSON.parse(raw) as unknown;
                        if (Array.isArray(events)) feed(events as eventWithTime[]);
                    } catch { /* lot illisible : ignoré */ }
                    break;
                }
                case 'sd-phone:screenview:recordStart': {
                    const d = msg.data ?? {};
                    void startRecording(d as Partial<RecordOptions>);
                    setOwner({ viewerName: String(d.viewerName ?? ''), count: Number(d.count) || 1 });
                    break;
                }
                case 'sd-phone:screenview:viewers':
                    setOwner(o => o && { ...o, count: Number(msg.data?.count) || o.count });
                    break;
                case 'sd-phone:screenview:recordStop':
                    stopAllRecording();
                    setOwner(null);
                    break;
            }
        };
        const onResize = () => setViewport({ w: window.innerWidth, h: window.innerHeight });
        window.addEventListener('message', onMessage);
        window.addEventListener('resize', onResize);
        return () => {
            window.removeEventListener('message', onMessage);
            window.removeEventListener('resize', onResize);
            stopAllRecording();
            teardown();
        };
    }, [feed, teardown]);

    const targetH = Math.round(viewport.h * 0.62);
    const scale = rect ? targetH / rect.h : 1;
    const frameW = rect ? Math.round(rect.w * scale) : Math.round(targetH * 0.46);

    return (
        <>
            {viewing && (
                <div
                    style={{
                        position: 'fixed', left: '6vw', top: '50%', transform: 'translateY(-50%)',
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10,
                        pointerEvents: 'none',
                    }}
                >
                    <div
                        style={{
                            width: frameW, height: targetH, padding: 10, boxSizing: 'content-box',
                            borderRadius: frameW * 0.16, background: '#0b0b0d',
                            boxShadow: '0 24px 60px rgba(0,0,0,0.55), inset 0 0 0 2px rgba(255,255,255,0.08)',
                        }}
                    >
                        <div
                            style={{
                                position: 'relative', width: frameW, height: targetH, overflow: 'hidden',
                                borderRadius: frameW * 0.13, background: '#000',
                            }}
                        >
                            <div
                                ref={hostRef}
                                className="sv-replay-host"
                                style={{
                                    position: 'absolute', left: 0, top: 0, transformOrigin: '0 0',
                                    transform: rect ? `scale(${scale}) translate(${-rect.x}px, ${-rect.y}px)` : undefined,
                                    visibility: rect ? 'visible' : 'hidden',
                                }}
                            />
                            {!rect && (
                                <div className="font-sf" style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'rgba(255,255,255,0.6)', fontSize: 15 }}>
                                    {t('screenview.connecting', 'Connecting…')}
                                </div>
                            )}
                        </div>
                    </div>
                    <div className="font-sf" style={{ color: '#fff', fontSize: 14, textShadow: '0 1px 4px rgba(0,0,0,0.8)' }}>
                        {t('screenview.stopHint', 'Backspace: stop watching')}
                    </div>
                </div>
            )}

            {owner && (
                <div
                    className="font-sf"
                    style={{
                        position: 'fixed', top: 18, left: '50%', transform: 'translateX(-50%)',
                        display: 'flex', alignItems: 'center', gap: 12, padding: '8px 8px 8px 16px',
                        borderRadius: 999, background: 'rgba(0,0,0,0.82)', color: '#fff', fontSize: 14,
                        boxShadow: '0 8px 24px rgba(0,0,0,0.4)', pointerEvents: 'auto',
                    }}
                >
                    <span>
                        {owner.count > 1
                            ? t('screenview.watchedMany', '{count} people are watching your screen', { count: owner.count })
                            : t('screenview.watchedBy', '{name} is watching your screen', { name: owner.viewerName })}
                    </span>
                    <button
                        type="button"
                        onClick={() => { void fetchNui('sd-phone:screenview:stop'); }}
                        style={{ borderRadius: 999, background: '#ff3b30', color: '#fff', fontWeight: 600, padding: '5px 14px', fontSize: 13 }}
                    >
                        {t('screenview.stop', 'Stop')}
                    </button>
                </div>
            )}
        </>
    );
}

