import type { Brain } from '../ai/brain.js';
import type { Storage } from '../db/storage.js';
import type { WorldHub } from '../world/hub.js';
import type { MeetingService } from './meetings.js';

/** O que uma sala do Slack ou do jogo precisa para notificar o mundo real. */
export interface NotificationService {
  notifyCoffee(by: string): Promise<void>;
  notifyAnnouncement(from: string, text: string): Promise<void>;
  stop(): Promise<void>;
}

/**
 * Tudo que as salas consomem, montado uma vez no boot e injetado.
 *
 * Antes cada módulo era um singleton que se inicializava sozinho no `import`
 * (o de calendário lia o disco, o do Slack abria socket). Isso deixava a
 * ordem de boot implícita e impossível de testar: importar uma sala abria
 * conexões. Aqui as dependências são explícitas e substituíveis.
 */
export interface ServerServices {
  hub: WorldHub;
  meetings: MeetingService;
  storage: Storage;
  brain: Brain;
  slack: NotificationService | null;
}
