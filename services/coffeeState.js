'use strict';

// Estado global (unico processo) do cafe da Copa — compartilhado entre todas
// as instancias de GameRoom (de qualquer sala) via um EventEmitter, ja que
// cada sala e uma Room independente do Colyseus sem estado em comum.

const { EventEmitter } = require('events');

const MAX_CUPS = 20;
const bus = new EventEmitter();

const state = {
  ready: false,
  takenCount: 0,
  brewedBy: null,
};

function getState() {
  return { ready: state.ready, takenCount: state.takenCount, maxCups: MAX_CUPS, brewedBy: state.brewedBy };
}

/** Cafe pronto: reseta a contagem e avisa todas as salas (alerta + estado). */
function markReady(by) {
  state.ready = true;
  state.takenCount = 0;
  state.brewedBy = by;
  bus.emit('update', getState());
  bus.emit('ready', { by });
}

/** Tenta pegar uma xicara. Retorna false se nao ha cafe ou ja acabou. */
function takeCup() {
  if (!state.ready || state.takenCount >= MAX_CUPS) return false;
  state.takenCount += 1;
  if (state.takenCount >= MAX_CUPS) state.ready = false;
  bus.emit('update', getState());
  return true;
}

module.exports = { bus, getState, markReady, takeCup, MAX_CUPS };
