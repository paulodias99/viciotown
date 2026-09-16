import type { ThemeName } from '@viciotown/shared';

export interface Theme {
  floorA: string;
  floorB: string;
  floorLine: string;
  rug: string;
  rugAlt: string;
  deck: string;
  deckAlt: string;
  grass: string;
  grassAlt: string;
  stage: string;
  stageAlt: string;
  wallTop: string;
  wallLeft: string;
  wallRight: string;
  wallAccent: string;
  /** Cor de fundo da cena (fora da sala). */
  backdrop: string;
}

/** Cores de piso/parede variam por sala; móveis são iguais em todo lugar. */
export const THEMES: Record<ThemeName, Theme> = {
  office: {
    floorA: '#54585f',
    floorB: '#4a4e55',
    floorLine: '#3d4046',
    rug: '#6b6f78',
    rugAlt: '#787c85',
    deck: '#8a5a34',
    deckAlt: '#7a4d2c',
    grass: '#3f7d4f',
    grassAlt: '#367044',
    stage: '#6b5f3a',
    stageAlt: '#5d5232',
    wallTop: '#f0b93a',
    wallLeft: '#d9a52c',
    wallRight: '#b8871f',
    wallAccent: '#5b3a8f',
    backdrop: '#191b22',
  },
  hub: {
    floorA: '#8a5a34',
    floorB: '#7a4d2c',
    floorLine: '#5e3a20',
    rug: '#6b6f78',
    rugAlt: '#787c85',
    deck: '#8a5a34',
    deckAlt: '#7a4d2c',
    grass: '#3f7d4f',
    grassAlt: '#367044',
    stage: '#6b5f3a',
    stageAlt: '#5d5232',
    wallTop: '#4a2f7a',
    wallLeft: '#3d2566',
    wallRight: '#2f1c52',
    wallAccent: '#7a5bb0',
    backdrop: '#17131f',
  },
  copa: {
    floorA: '#e8e6e0',
    floorB: '#dcd8d0',
    floorLine: '#c5c0b6',
    rug: '#c9c5bb',
    rugAlt: '#d4d0c6',
    deck: '#c9a86a',
    deckAlt: '#b8975c',
    grass: '#3f7d4f',
    grassAlt: '#367044',
    stage: '#d4d0c6',
    stageAlt: '#c9c5bb',
    wallTop: '#4a2f7a',
    wallLeft: '#3d2566',
    wallRight: '#2f1c52',
    wallAccent: '#e0508a',
    backdrop: '#1d1a24',
  },
  garden: {
    floorA: '#4b8a58',
    floorB: '#437e50',
    floorLine: '#3a6e45',
    rug: '#6b6f78',
    rugAlt: '#787c85',
    deck: '#c9a86a',
    deckAlt: '#b8975c',
    grass: '#4b8a58',
    grassAlt: '#437e50',
    stage: '#c9a86a',
    stageAlt: '#b8975c',
    wallTop: '#9fc4a8',
    wallLeft: '#86ab8f',
    wallRight: '#6d8f76',
    wallAccent: '#f0b93a',
    backdrop: '#16231a',
  },
  stage: {
    floorA: '#2f3340',
    floorB: '#2a2e3a',
    floorLine: '#23262f',
    rug: '#3a2f4f',
    rugAlt: '#443860',
    deck: '#6b5f3a',
    deckAlt: '#5d5232',
    grass: '#3f7d4f',
    grassAlt: '#367044',
    stage: '#7b4a3a',
    stageAlt: '#6d4033',
    wallTop: '#3d2566',
    wallLeft: '#311e54',
    wallRight: '#251742',
    wallAccent: '#f0b93a',
    backdrop: '#12111a',
  },
};

export const getTheme = (name: ThemeName): Theme => THEMES[name] ?? THEMES.office;
