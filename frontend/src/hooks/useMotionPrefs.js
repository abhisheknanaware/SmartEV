import { useEffect, useState } from 'react';

export function usePrefersReducedMotion() {
  const query = '(prefers-reduced-motion: reduce)';
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia(query).matches);
  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setReduced(mql.matches);
    mql.addEventListener('change', onChange);
    return () => mql.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

let webglSupport;
export function hasWebGL() {
  if (webglSupport !== undefined) return webglSupport;
  try {
    const canvas = document.createElement('canvas');
    webglSupport = !!(window.WebGLRenderingContext && (canvas.getContext('webgl2') || canvas.getContext('webgl')));
  } catch {
    webglSupport = false;
  }
  return webglSupport;
}
