import { useEffect, useRef, useState } from 'react';
import { worldScene } from '../game/handle';
import { useGame } from '../store/game';

const RADIUS = 52;
const DEAD_ZONE = 14;
/** Um passo a cada 260ms enquanto o dedo está fora da zona morta. */
const STEP_INTERVAL_MS = 260;

/**
 * Joystick virtual.
 *
 * O toque no chão funciona bem para ir a um lugar específico, mas é péssimo
 * para ajustar posição — e no celular o dedo cobre justamente o tile de
 * destino. O joystick resolve o ajuste fino sem tirar o toque do caminho.
 *
 * Ele traduz a direção da tela para a direção da GRADE (o mundo é isométrico,
 * então "para cima" na tela é diagonal na grade) — senão empurrar para cima
 * move o avatar na diagonal e ninguém entende por quê.
 */
export function Joystick(): React.ReactNode {
  const locked = useGame((s) => s.locked);
  const [knob, setKnob] = useState<{ x: number; y: number } | null>(null);
  const originRef = useRef<{ x: number; y: number } | null>(null);
  const lastStepRef = useRef(0);
  const vectorRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    if (!knob) return;
    const id = setInterval(() => {
      const vector = vectorRef.current;
      if (!vector || locked) return;
      const now = performance.now();
      if (now - lastStepRef.current < STEP_INTERVAL_MS) return;
      lastStepRef.current = now;

      // Tela → grade: x_grade = (sx/(W/2) + sy/(H/2)) / 2, e o simétrico em y.
      // Na prática basta o sinal das duas projeções para escolher o passo.
      const a = vector.x / 32 + vector.y / 16;
      const b = vector.y / 16 - vector.x / 32;
      const dx = Math.abs(a) > 0.4 ? Math.sign(a) : 0;
      const dy = Math.abs(b) > 0.4 ? Math.sign(b) : 0;
      if (dx !== 0 || dy !== 0) worldScene()?.step(dx, dy);
    }, 60);
    return () => clearInterval(id);
  }, [knob, locked]);

  const start = (event: React.PointerEvent<HTMLDivElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    const rect = event.currentTarget.getBoundingClientRect();
    originRef.current = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    setKnob({ x: 0, y: 0 });
    lastStepRef.current = 0;
  };

  const move = (event: React.PointerEvent<HTMLDivElement>): void => {
    const origin = originRef.current;
    if (!origin) return;
    let dx = event.clientX - origin.x;
    let dy = event.clientY - origin.y;
    const distance = Math.hypot(dx, dy);
    if (distance > RADIUS) {
      dx = (dx / distance) * RADIUS;
      dy = (dy / distance) * RADIUS;
    }
    setKnob({ x: dx, y: dy });
    vectorRef.current = distance > DEAD_ZONE ? { x: dx, y: dy } : null;
  };

  const end = (): void => {
    originRef.current = null;
    vectorRef.current = null;
    setKnob(null);
  };

  return (
    <div
      onPointerDown={start}
      onPointerMove={move}
      onPointerUp={end}
      onPointerCancel={end}
      role="application"
      aria-label="Joystick de movimento"
      className="pointer-events-auto relative size-32 touch-none rounded-full border border-ink-600/70 bg-ink-900/55 backdrop-blur-sm select-none"
    >
      <span
        className="absolute size-14 rounded-full border border-grape-300/60 bg-grape-400/70 transition-transform"
        style={{
          left: '50%',
          top: '50%',
          transform: `translate(calc(-50% + ${knob?.x ?? 0}px), calc(-50% + ${knob?.y ?? 0}px))`,
        }}
      />
    </div>
  );
}
