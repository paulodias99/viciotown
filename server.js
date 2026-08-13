'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('colyseus');
const { WebSocketTransport } = require('@colyseus/ws-transport');
const { GameRoom } = require('./rooms/GameRoom');
const MAPS = require('./shared/maps');
const { startSlackBot } = require('./services/slackBot');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');
const SHARED_DIR = path.join(__dirname, 'shared');
const PHASER_DIST = path.join(__dirname, 'node_modules', 'phaser', 'dist');
const COLYSEUS_JS_DIST = path.join(__dirname, 'node_modules', 'colyseus.js', 'dist');

// Servidor http "de sempre": nesta versao do colyseus (0.16.x) nao existe a
// opcao `express` do Server (isso so chegou na 0.17+), entao montamos nosso
// proprio app Express como request handler ANTES de criar o Server. O
// attach() do colyseus intercepta so as rotas de matchmaking e repassa o
// resto para os listeners de 'request' ja existentes (o nosso, aqui).
const app = express();
app.use('/shared', express.static(SHARED_DIR));
app.use('/vendor/phaser', express.static(PHASER_DIST));
app.use('/vendor/colyseus.js', express.static(COLYSEUS_JS_DIST));
app.use(express.static(PUBLIC_DIR));

const httpServer = http.createServer(app);
const transport = new WebSocketTransport({ server: httpServer });

const gameServer = new Server({ transport, greet: false });
for (const mapKey of Object.keys(MAPS)) {
  gameServer.define(mapKey, GameRoom, { mapKey });
}

gameServer.listen(PORT).then(() => {
  console.log(`\n  🏙️  VicioTown (Phaser 3 + Colyseus) rodando em http://localhost:${PORT}`);
  console.log(`     Salas: ${Object.keys(MAPS).join(', ')}`);
  console.log('     Abra em duas abas para ver o multiplayer.\n');
});

startSlackBot().catch((err) => console.error('  💬 Slack bot falhou ao conectar:', err.message));
