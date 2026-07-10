// MacroSignal — 트랙 피처 플래그
export const TRACK = process.env.TRACK ?? 'private';
export const isPublic = () => TRACK === 'public';
