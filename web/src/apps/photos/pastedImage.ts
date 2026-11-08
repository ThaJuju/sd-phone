import { apiCall } from '@/core/api';
import { uploadViaServer } from '@/shared/mediaUpload';

// PATCH MAISON : importer dans la galerie une image collée (Ctrl+V) depuis le presse-papiers.
// L'image suit le chemin d'une photo prise à l'appareil (même slot, même plafond serveur de
// 4 Mo) : le serveur nomme toujours le fichier en .jpg, d'où la conversion systématique.

const MAX_SIDE = 1920;
const MAX_DATA_URL_CHARS = 3_900_000;
const QUALITIES = [0.9, 0.8, 0.7, 0.6, 0.5];

export function pastedImageFile(event: ClipboardEvent): File | null {
    const items = event.clipboardData?.items;
    if (!items) return null;
    for (const item of Array.from(items)) {
        if (item.kind === 'file' && item.type.startsWith('image/')) return item.getAsFile();
    }
    return null;
}

function loadImage(file: Blob): Promise<HTMLImageElement | null> {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload  = () => { URL.revokeObjectURL(url); resolve(img); };
        img.onerror = () => { URL.revokeObjectURL(url); resolve(null); };
        img.src = url;
    });
}

export async function imageToJpegDataUrl(file: Blob): Promise<string | null> {
    const img = await loadImage(file);
    if (!img || !img.naturalWidth || !img.naturalHeight) return null;

    let scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    for (let pass = 0; pass < 3; pass++, scale *= 0.7) {
        const canvas = document.createElement('canvas');
        canvas.width  = Math.max(1, Math.round(img.naturalWidth * scale));
        canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        // Le JPEG n'a pas de transparence : sans fond, un PNG détouré sortirait sur du noir.
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        for (const quality of QUALITIES) {
            const dataUrl = canvas.toDataURL('image/jpeg', quality);
            if (dataUrl.length <= MAX_DATA_URL_CHARS) return dataUrl;
        }
    }
    return null;
}

/** Lance l'envoi ; la photo arrive par `sd-phone:photos:added`, l'échec par `photos:uploadFailed`. */
export async function uploadPastedImage(image: string): Promise<boolean> {
    if (await uploadViaServer(image, 'sd-phone:camera:httpSlot', { kind: 'photo' })) return true;
    const res = await apiCall<void>('sd-phone:camera:capture', { image });
    return res.success;
}
