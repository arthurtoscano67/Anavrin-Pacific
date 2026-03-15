import { useEffect, useState } from 'react';

type Mode = '3d' | 'fallback';

function canUseWebgl(): boolean {
  try {
    const canvas = document.createElement('canvas');
    return Boolean(canvas.getContext('webgl2') || canvas.getContext('webgl'));
  } catch {
    return false;
  }
}

export function useRendererTier(priority: 'portrait' | 'arena' = 'portrait') {
  const [mode, setMode] = useState<Mode>('fallback');

  useEffect(() => {
    const nav = navigator as Navigator & {
      deviceMemory?: number;
      connection?: { saveData?: boolean };
    };

    const memory = nav.deviceMemory ?? 4;
    const cores = nav.hardwareConcurrency ?? 4;
    const saveData = Boolean(nav.connection?.saveData);
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    const weakPortraitDevice = priority === 'portrait' && window.innerWidth < 480 && memory <= 4 && cores <= 4;

    if (!canUseWebgl() || saveData || reducedMotion || memory <= 2 || cores <= 2 || weakPortraitDevice) {
      setMode('fallback');
      return;
    }

    setMode('3d');
  }, [priority]);

  return {
    mode,
    allow3D: mode === '3d',
  };
}
