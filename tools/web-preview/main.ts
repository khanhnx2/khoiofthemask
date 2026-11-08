// Browser preview entry. Loads the real game scripts on top of the 'cc' shim.
import '../../assets/scripts/game-root';
import { bootPreview } from 'cc';

bootPreview(document.getElementById('game') as HTMLCanvasElement);
