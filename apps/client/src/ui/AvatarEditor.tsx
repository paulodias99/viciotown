import type { AvatarLook } from '@viciotown/shared';
import {
  ACCESSORIES,
  ACCESSORY_LABELS,
  CLOTHES,
  COSTUMES,
  COSTUME_LABELS,
  HAIR_COLORS,
  HAIR_LABELS,
  HAIR_STYLES,
  PANTS,
  SHOES,
  SKINS,
  TOP_LABELS,
  TOP_STYLES,
  randomLook,
} from '@viciotown/shared';
import clsx from 'clsx';
import { useState } from 'react';
import { AvatarPreview } from './AvatarPreview';
import { Button, Field, inputClass } from './primitives';

interface Props {
  look: AvatarLook;
  name: string;
  onLookChange(look: AvatarLook): void;
  onNameChange(name: string): void;
  onConfirm(): void;
  confirmLabel: string;
  onCancel?: () => void;
}

/** Fantasia trava o figurino: só a pele continua escolhível. */
const isLocked = (look: AvatarLook): boolean => look.costume !== 'nenhuma';

export function AvatarEditor({
  look,
  name,
  onLookChange,
  onNameChange,
  onConfirm,
  confirmLabel,
  onCancel,
}: Props): React.ReactNode {
  const [dir, setDir] = useState(1);
  const [dancing, setDancing] = useState(false);
  const locked = isLocked(look);

  const set = <K extends keyof AvatarLook>(key: K, value: AvatarLook[K]): void =>
    onLookChange({ ...look, [key]: value });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex min-h-0 flex-1 flex-col gap-4 lg:flex-row">
      {/* --- preview + nome: fica no topo no celular, à esquerda no desktop --- */}
      <div className="flex shrink-0 flex-col gap-3 lg:w-56">
        <div className="rounded-2xl border border-ink-700 bg-ink-950/60 py-3">
          <AvatarPreview look={look} dir={dir} dancing={dancing} scale={3} />
        </div>

        <div className="grid grid-cols-4 gap-1.5">
          <Button size="sm" onClick={() => setDir((d) => (d + 3) & 3)} aria-label="Girar à esquerda">
            ◀
          </Button>
          <Button
            size="sm"
            variant={dancing ? 'primary' : 'ghost'}
            onClick={() => setDancing((d) => !d)}
            aria-label="Pré-visualizar dança"
          >
            💃
          </Button>
          <Button size="sm" onClick={() => onLookChange(randomLook())} aria-label="Visual aleatório">
            🎲
          </Button>
          <Button size="sm" onClick={() => setDir((d) => (d + 1) & 3)} aria-label="Girar à direita">
            ▶
          </Button>
        </div>

        <Field label="Seu nome">
          <input
            className={inputClass}
            value={name}
            maxLength={18}
            placeholder="Como te chamam?"
            autoComplete="off"
            onChange={(e) => onNameChange(e.target.value)}
          />
        </Field>
      </div>

      {/* --- opções --- */}
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <Section title="Fantasia">
          <Chips
            values={COSTUMES}
            labels={COSTUMES.map((c) => COSTUME_LABELS[c])}
            current={look.costume}
            onPick={(v) => set('costume', v)}
          />
        </Section>

        <Section title="Pele">
          <Swatches values={SKINS} current={look.skin} onPick={(v) => set('skin', v)} />
        </Section>

        <div className={clsx('space-y-4 transition-opacity', locked && 'pointer-events-none opacity-35')}>
          {locked ? (
            <p className="text-xs text-amber-brand">
              A fantasia define o figurino inteiro. Escolha “Nenhuma” para voltar a editar.
            </p>
          ) : null}

          <Section title="Cabelo">
            <Chips
              values={HAIR_STYLES}
              labels={HAIR_STYLES.map((h) => HAIR_LABELS[h])}
              current={look.hair}
              onPick={(v) => set('hair', v)}
            />
          </Section>
          <Section title="Cor do cabelo">
            <Swatches values={HAIR_COLORS} current={look.hairColor} onPick={(v) => set('hairColor', v)} />
          </Section>
          <Section title="Roupa">
            <Chips
              values={TOP_STYLES}
              labels={TOP_STYLES.map((t) => TOP_LABELS[t])}
              current={look.top}
              onPick={(v) => set('top', v)}
            />
          </Section>
          <Section title="Cor da roupa">
            <Swatches values={CLOTHES} current={look.topColor} onPick={(v) => set('topColor', v)} />
          </Section>
          <Section title="Calça">
            <Swatches values={PANTS} current={look.pantsColor} onPick={(v) => set('pantsColor', v)} />
          </Section>
          <Section title="Sapato">
            <Swatches values={SHOES} current={look.shoesColor} onPick={(v) => set('shoesColor', v)} />
          </Section>
          <Section title="Acessório">
            <Chips
              values={ACCESSORIES}
              labels={ACCESSORIES.map((a) => ACCESSORY_LABELS[a])}
              current={look.accessory}
              onPick={(v) => set('accessory', v)}
            />
          </Section>
        </div>
      </div>

      </div>

      {/*
        Uma única barra de ações, ancorada embaixo nos dois tamanhos de tela.
        Renderizar duas cópias (uma `lg:hidden`, outra `hidden lg:flex`) deixa
        botões duplicados no DOM — leitor de tela anuncia dois "Entrar", e
        qualquer automação clica no invisível.
      */}
      <div className="flex shrink-0 gap-2 border-t border-ink-700 pt-3">
        {onCancel ? (
          <Button size="lg" className="flex-1" onClick={onCancel}>
            Cancelar
          </Button>
        ) : null}
        <Button size="lg" variant="primary" className="flex-[2]" onClick={onConfirm}>
          {confirmLabel}
        </Button>
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }): React.ReactNode {
  return (
    <div>
      <h4 className="mb-1.5 text-xs font-bold tracking-wide text-ink-400 uppercase">{title}</h4>
      {children}
    </div>
  );
}

function Chips<T extends string>({
  values,
  labels,
  current,
  onPick,
}: {
  values: readonly T[];
  labels: readonly string[];
  current: string;
  onPick(value: T): void;
}): React.ReactNode {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((value, i) => (
        <button
          key={value}
          type="button"
          onClick={() => onPick(value)}
          aria-pressed={current === value}
          className={clsx(
            'h-9 rounded-lg border px-3 text-xs font-semibold transition-colors',
            current === value
              ? 'border-grape-400 bg-grape-400 text-white'
              : 'border-ink-600 bg-ink-800 text-ink-300 hover:border-ink-500',
          )}
        >
          {labels[i]}
        </button>
      ))}
    </div>
  );
}

function Swatches({
  values,
  current,
  onPick,
}: {
  values: readonly string[];
  current: string;
  onPick(value: string): void;
}): React.ReactNode {
  return (
    <div className="flex flex-wrap gap-1.5">
      {values.map((color) => (
        <button
          key={color}
          type="button"
          onClick={() => onPick(color)}
          aria-label={`Cor ${color}`}
          aria-pressed={current === color}
          style={{ background: color }}
          className={clsx(
            'size-9 rounded-lg border-2 transition-transform',
            current === color
              ? 'scale-110 border-white shadow-lg'
              : 'border-ink-700 hover:scale-105',
          )}
        />
      ))}
    </div>
  );
}
