import { useEffect, useRef, useState } from "react";

const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** Eases a number toward its target so amounts count instead of jumping. */
export function useTween(target: number, ms = 700): number {
  const [value, setValue] = useState(target);
  const from = useRef(target);
  useEffect(() => {
    if (reduced() || from.current === target) {
      from.current = target;
      setValue(target);
      return;
    }
    const start = from.current;
    const began = performance.now();
    let frame = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - began) / ms);
      const eased = 1 - Math.pow(1 - t, 3);
      const next = start + (target - start) * eased;
      from.current = next;
      setValue(t === 1 ? target : next);
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [target, ms]);
  return value;
}

export { reduced };
