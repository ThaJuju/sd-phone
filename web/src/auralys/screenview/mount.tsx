// PATCH MAISON — racine React séparée pour « Regarder le téléphone » (voir PATCHES.md § 8) :
// elle reste affichée téléphone fermé, et sa classe l'exclut de l'enregistrement rrweb.

import ReactDOM from 'react-dom/client';

import { BLOCK_CLASS } from './recorder';
import { ScreenViewLayer } from './ScreenViewLayer';

const STYLE = `
.sv-replay-host .replayer-wrapper { position: relative; }
.sv-replay-host .replayer-mouse, .sv-replay-host .replayer-mouse-tail { display: none; }
.sv-replay-host iframe { border: 0; background: transparent; }
`;

const root = document.createElement('div');
root.id = 'auralys-screenview';
root.className = BLOCK_CLASS;
root.style.cssText = 'position:fixed;inset:0;z-index:2147483646;pointer-events:none;';

const style = document.createElement('style');
style.textContent = STYLE;
root.appendChild(style);

const mountPoint = document.createElement('div');
root.appendChild(mountPoint);
document.body.appendChild(root);

ReactDOM.createRoot(mountPoint).render(<ScreenViewLayer />);
