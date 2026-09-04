import systems from '../../assets/game_platforms.json';
export const GAME_SYSTEMS = systems;
export const GAME_EXTENSIONS = [...new Set(systems.flatMap(s => s.extensions))];
export const compatibleSystems = file => systems.filter(s => s.extensions.includes(String(file || '').split('.').pop().toLowerCase()));
export function systemForGame(game) {
  const explicit = systems.find(s => s.id === game?.platform || s.appPlatformId === game?.platform);
  if (explicit) return explicit;
  const extension = String(game?.file || game?.relativePath || '').split('.').pop().toLowerCase();
  if (extension === 'chd') return systems.find(s => s.id === 'neogeocd');
  const matches = compatibleSystems(game?.file || game?.relativePath);
  return matches.length === 1 ? matches[0] : null;
}
