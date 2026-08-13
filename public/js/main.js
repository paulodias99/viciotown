/* eslint-env browser */
(() => {
  const Art = window.AvatarGfx;
  const R = window.RoomGfx;

  if (location.protocol === 'file:' || !window.MapEngine || !window.MAPS || !window.Colyseus || !window.Phaser) {
    document.getElementById('fatal').classList.remove('hidden');
    return;
  }

  const now = () => performance.now();

  const netState = {
    myId: null,
    connected: false,
    hover: null,
    target: null,
    targetUntil: 0,
  };

  let currentRoomName = 'salaPrincipal'; // hub do jogo — todo mundo comeca aqui
  let Map_ = window.MapEngine.createMapApi(window.MAPS[currentRoomName]);
  R.setTheme(window.MAPS[currentRoomName].theme);

  let salaRoxaState = { occupied: false, current: null, queue: [] };
  let coffeeState = { ready: false, takenCount: 0, maxCups: 20, brewedBy: null };
  let currentStationAction = null;

  const players = new Map(); // id -> {id,name,look,x,y,path,pathStart,dancing,bubble}
  const DANCE_MS = 125; // passinho é rápido: 8 tempos ≈ 1s por ciclo
  const WALK_MS = 260; // precisa bater com o servidor (rooms/GameRoom.js)

  // ================================================================ posicao

  function dirFromDelta(dx, dy) {
    const sdx = dx - dy;
    const sdy = dx + dy;
    if (sdy >= 0) return sdx >= 0 ? 1 : 0;
    return sdx >= 0 ? 2 : 3;
  }

  /** Interpola a posicao do jogador ao longo do caminho. Muta p (dir/sitting). */
  function poseOf(p) {
    if (!p.path || !p.path.length) {
      p.sitting = Map_.isSeat(p.x, p.y);
      if (p.dancing && !p.sitting) {
        return {
          x: p.x, y: p.y, dir: p.dir, frame: Math.floor(now() / DANCE_MS) % 8,
          sitting: false, dancing: true,
        };
      }
      if (p.sitting) {
        let facingDesk = false;
        for (const [dx, dy] of [[0, -1], [-1, 0], [1, 0], [0, 1]]) {
          const t = Map_.tileAt(p.x + dx, p.y + dy);
          if (t === 'D' || t === 'T') {
            p.dir = dirFromDelta(dx, dy);
            facingDesk = true;
            break;
          }
        }
        // sem mesa/bancada do lado (ex: cadeiras da Copa): senta de frente pra
        // camera em vez de manter a direcao de quando ainda estava andando.
        if (!facingDesk) p.dir = 1;
      }
      return { x: p.x, y: p.y, dir: p.dir, frame: 0, sitting: p.sitting };
    }

    const elapsed = now() - p.pathStart;
    const t = elapsed / WALK_MS;
    const i = Math.floor(t);

    if (i >= p.path.length) {
      const last = p.path[p.path.length - 1];
      p.x = last.x;
      p.y = last.y;
      p.path = [];
      return poseOf(p);
    }

    const from = i === 0 ? { x: p.x, y: p.y } : p.path[i - 1];
    const to = p.path[i];
    const f = t - i;
    p.dir = dirFromDelta(to.x - from.x, to.y - from.y);
    p.sitting = false;

    return {
      x: from.x + (to.x - from.x) * f,
      y: from.y + (to.y - from.y) * f,
      dir: p.dir,
      frame: Math.floor(elapsed / 125) % 4,
      sitting: false,
    };
  }

  // ================================================================ Phaser scene

  let sceneRef = null;
  const labelObjs = new Map(); // id -> {name, bubble} (jogadores)
  let doorLabels = []; // rotulos estaticos das portas da sala atual

  function ensureLabels(scene, id, isMe) {
    let l = labelObjs.get(id);
    if (l) return l;
    const name = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#ffffff',
      backgroundColor: isMe ? '#2f7de1' : '#14161c',
      padding: { x: 6, y: 2 },
    }).setOrigin(0.5, 0).setDepth(1000);
    const bubble = scene.add.text(0, 0, '', {
      fontFamily: 'Verdana, Geneva, sans-serif',
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#1b1f27',
      backgroundColor: '#ffffff',
      padding: { x: 8, y: 4 },
      align: 'center',
      wordWrap: { width: 160 },
    }).setOrigin(0.5, 1).setDepth(1001).setVisible(false);
    l = { name, bubble };
    labelObjs.set(id, l);
    return l;
  }

  function destroyLabels(id) {
    const l = labelObjs.get(id);
    if (!l) return;
    l.name.destroy();
    l.bubble.destroy();
    labelObjs.delete(id);
  }

  /** Recria os letreiros das portas da sala atual (chamado ao trocar de sala). */
  function rebuildDoorLabels(scene) {
    doorLabels.forEach((l) => l.destroy());
    doorLabels = (Map_.doors || []).map((door) => {
      const { x, y } = R.toScreen(door.x, door.y);
      if (door.special === 'salaRoxa') {
        const occ = salaRoxaState.occupied;
        return scene.add.text(x, y - 14, `${occ ? '🔴' : '🟢'} ${door.label}`, {
          fontFamily: 'Verdana, Geneva, sans-serif',
          fontSize: '11px',
          fontStyle: 'bold',
          color: '#ffffff',
          backgroundColor: occ ? 'rgba(224,67,63,0.85)' : 'rgba(63,174,99,0.85)',
          padding: { x: 6, y: 2 },
        }).setOrigin(0.5, 1).setDepth(900);
      }
      const built = !!door.to;
      return scene.add.text(x, y - 14, built ? `${door.label} →` : `🚧 ${door.label}`, {
        fontFamily: 'Verdana, Geneva, sans-serif',
        fontSize: '11px',
        fontStyle: 'bold',
        color: built ? '#ffffff' : '#c9c9c9',
        backgroundColor: built ? 'rgba(47,125,225,0.85)' : 'rgba(30,34,42,0.7)',
        padding: { x: 6, y: 2 },
      }).setOrigin(0.5, 1).setDepth(900);
    });
  }

  class GameScene extends Phaser.Scene {
    create() {
      this.world = this.add.graphics();
      sceneRef = this;

      this.fitCamera();
      this.scale.on('resize', () => this.fitCamera());

      this.input.on('pointermove', (pointer) => {
        netState.hover = R.toTile(pointer.worldX, pointer.worldY);
      });
      this.input.on('gameout', () => {
        netState.hover = null;
      });
      this.input.on('pointerdown', (pointer) => {
        if (pointer.button !== 0 || climbLock || brewLock) return;
        const t = R.toTile(pointer.worldX, pointer.worldY);
        if (!Map_.isWalkable(t.x, t.y)) return;
        netState.target = t;
        netState.targetUntil = now() + 700;
        send('move', { x: t.x, y: t.y });
      });

      // scroll do mouse/trackpad da zoom, MANTENDO o ponto sob o cursor fixo —
      // so trocar o zoom sem isso faz a camera "pular" de volta pro centro da
      // sala a cada scroll, que e exatamente o "perde o foco" que queremos evitar.
      this.zoomFactor = 1;
      this.input.on('wheel', (pointer, _objs, _dx, dy) => {
        const cam = this.cameras.main;
        const before = cam.getWorldPoint(pointer.x, pointer.y);
        this.zoomFactor = Phaser.Math.Clamp(this.zoomFactor - dy * 0.0015, 0.5, 3);
        cam.setZoom(this.baseZoom * this.zoomFactor);
        // getWorldPoint le uma matriz cacheada que so e recalculada no
        // preRender (uma vez por frame) — sem forcar aqui, a leitura "after"
        // ainda usaria a matriz de ANTES do zoom, e a compensacao ficava errada
        // (a camera "perdia o foco" a cada scroll).
        cam.preRender();
        const after = cam.getWorldPoint(pointer.x, pointer.y);
        cam.scrollX += before.x - after.x;
        cam.scrollY += before.y - after.y;
      });

      rebuildDoorLabels(this);
    }

    fitCamera() {
      const b = R.bounds(Map_.MAP_W, Map_.MAP_H);
      const roomW = b.maxX - b.minX;
      const roomH = b.maxY - b.minY;
      const w = this.scale.width;
      const h = this.scale.height;
      const fit = Math.min((w - 24) / roomW, (h - 40) / roomH);
      this.baseZoom = fit >= 2 ? 2 : fit >= 0.9 ? 1 : Math.max(0.4, fit);
      this.centerX = b.minX + roomW / 2;
      this.centerY = b.minY + roomH / 2;
      this.zoomFactor = 1;
      this.applyZoom();
    }

    applyZoom() {
      this.cameras.main.setZoom(this.baseZoom * this.zoomFactor);
      this.cameras.main.centerOn(this.centerX, this.centerY);
    }

    update() {
      const g = this.world;
      g.clear();

      R.drawFloor(g, Map_);

      for (const door of Map_.doors || []) {
        const { x, y } = R.toScreen(door.x, door.y);
        const statusColor = door.special === 'salaRoxa' ? (salaRoxaState.occupied ? '#e0433f' : '#3fae63') : null;
        R.drawDoor(g, x, y, !!door.to, statusColor);
      }

      if (netState.hover && Map_.isWalkable(netState.hover.x, netState.hover.y)) {
        R.highlight(g, netState.hover.x, netState.hover.y, 0xffffff, 0.85);
      }
      if (netState.target && now() < netState.targetUntil) {
        R.highlight(g, netState.target.x, netState.target.y, 0x5fd0e6, 0.95);
      }

      const list = [];
      for (let gy = 0; gy < Map_.MAP_H; gy++) {
        for (let gx = 0; gx < Map_.MAP_W; gx++) {
          const t = Map_.tileAt(gx, gy);
          const { x, y } = R.toScreen(gx, gy);
          if (t === '#' || t === 'V' || t === 'W' || t === 'Y' || t === 'L') {
            if (gy === 0 || gx === 0) list.push({ d: gx + gy, fn: () => R.drawWall(g, x, y, t) });
            continue;
          }
          const fn = R.FURNITURE[t];
          if (fn) list.push({ d: gx + gy, fn: () => fn(g, x, y) });
        }
      }

      const poses = [];
      for (const p of players.values()) {
        const pose = poseOf(p);
        poses.push({ p, pose });
        const { x, y } = R.toScreen(pose.x, pose.y);

        // animacao de "subindo a escada": anda por cima dos MESMOS degraus
        // desenhados por R.FURNITURE.A (ver getStairClimbOffset), de costas,
        // enquanto o servidor segura a troca de sala de verdade.
        let drawX = x;
        let drawY = y;
        let scale = 1;
        let drawPose = pose;
        if (p.climbUntil && now() < p.climbUntil) {
          const t = Phaser.Math.Clamp((now() - p.climbStart) / (p.climbUntil - p.climbStart), 0, 1);
          const off = R.getStairClimbOffset();
          drawX = x + off.dx * t;
          drawY = y + off.dy * t;
          scale = 1 - t * 0.15;
          drawPose = {
            ...pose,
            dir: 2,
            frame: Math.floor((now() - p.climbStart) / 120) % 4,
            sitting: false,
            dancing: false,
          };
        } else if (p.brewUntil && now() < p.brewUntil) {
          // "fazendo cafe": sem arte nova — o boneco vira de frente pra
          // cafeteira e balanca levemente, tipo mexendo/servindo.
          const t = now() - p.brewStart;
          drawY = y + Math.sin(t / 140) * 3;
          drawPose = {
            ...pose,
            dir: 2,
            frame: Math.floor(t / 150) % 4,
            sitting: false,
            dancing: false,
          };
        }

        list.push({
          d: pose.x + pose.y + 0.45,
          fn: () => {
            g.save();
            g.translateCanvas(drawX, drawY);
            if (scale !== 1) g.scaleCanvas(scale, scale);
            Art.drawShadow(g, drawPose.sitting ? 0.12 : 0.22);
            if (drawPose.sitting) g.translateCanvas(0, 5);
            Art.draw(g, p.look, drawPose);
            if (p.holdingCoffee) {
              g.fillStyle(0xffffff, 1);
              g.fillRect(9, -36, 6, 5);
              g.lineStyle(1, 0x9a8f80, 1);
              g.strokeRect(9, -36, 6, 5);
              g.fillStyle(0x6b4a2b, 1);
              g.fillRect(10, -35, 4, 2);
            }
            g.restore();
          },
        });
      }

      list.sort((a, b) => a.d - b.d);
      for (const item of list) item.fn();

      for (const { p, pose } of poses) {
        const { x, y } = R.toScreen(pose.x, pose.y);
        const labels = ensureLabels(this, p.id, p.id === netState.myId);
        labels.name.setPosition(x, y + 6);
        if (labels.name.text !== p.name) labels.name.setText(p.name);
        if (p.bubble && now() < p.bubble.until) {
          if (labels.bubble.text !== p.bubble.text) labels.bubble.setText(p.bubble.text);
          labels.bubble.setPosition(x, y - Art.H - 10);
          labels.bubble.setVisible(true);
        } else {
          labels.bubble.setVisible(false);
        }
      }

      // botao contextual (cafeteira/pia): so existe na Copa, so aparece
      // quando o jogador esta parado em cima da estacao certa.
      const meEntry = poses.find((e) => e.p.id === netState.myId);
      let action = null;
      if (currentRoomName === 'salaCopa' && meEntry && Map_.stationAt) {
        const tx = Math.round(meEntry.pose.x);
        const ty = Math.round(meEntry.pose.y);
        const station = Map_.stationAt(tx, ty);
        const me = meEntry.p;
        if (station?.type === 'coffee') {
          if (!coffeeState.ready && !brewLock) action = { type: 'coffee:fazer', label: '☕ Fazer café' };
          else if (coffeeState.ready && !me.holdingCoffee) action = { type: 'coffee:pegar', label: '☕ Pegar café' };
        } else if (station?.type === 'sink' && me.holdingCoffee) {
          action = { type: 'coffee:descartar', label: '🚰 Descartar xícara' };
        }
      }
      const btn = document.getElementById('stationBtn');
      if (action) {
        if (btn.textContent !== action.label) btn.textContent = action.label;
        btn.classList.remove('hidden');
      } else {
        btn.classList.add('hidden');
      }
      currentStationAction = action;
    }
  }

  const game = new Phaser.Game({
    type: Phaser.CANVAS,
    parent: 'game',
    scale: { mode: Phaser.Scale.RESIZE, width: '100%', height: '100%' },
    backgroundColor: '#00000000',
    transparent: true,
    render: { pixelArt: true, antialias: false },
    scene: GameScene,
  });

  // ================================================================ rede (Colyseus)

  let room = null;
  let joined = false;
  let switching = false; // true durante uma troca de sala deliberada (nao deve reconectar na antiga)
  let climbLock = false; // true durante a animacao de subir a escada (trava input)
  let brewLock = false; // true durante a animacao de fazer cafe (trava input)
  let reconnectTimer = null;

  const send = (type, msg) => {
    if (room) room.send(type, msg);
  };

  /** Anuncia o jogador para a sala. Chamado ao confirmar o avatar (ou ao trocar de sala). */
  function enterRoom() {
    joined = true;
    send('hello', { name: UI.name(), look: UI.look() });
  }

  function setStatus(text, ok) {
    const el = document.getElementById('status');
    el.textContent = text;
    el.className = ok ? 'ok' : 'bad';
  }

  function scheduleReconnect() {
    clearTimeout(reconnectTimer);
    reconnectTimer = setTimeout(() => connect(currentRoomName, {}), 1500);
  }

  function resetWorldForNewRoom() {
    players.clear();
    for (const id of [...labelObjs.keys()]) destroyLabels(id);
    netState.hover = null;
    netState.target = null;
    climbLock = false;
    brewLock = false;
    currentStationAction = null;
    document.getElementById('stationBtn').classList.add('hidden');
    if (sceneRef) {
      sceneRef.fitCamera();
      rebuildDoorLabels(sceneRef);
    }
  }

  /** Sai da sala atual (se houver) e entra em outra, preservando nome/visual. */
  async function switchRoom(toRoomName, spawnAt) {
    switching = true;
    if (room) {
      try { await room.leave(); } catch { /* ja desconectado, tudo bem */ }
    }
    switching = false;

    currentRoomName = toRoomName;
    Map_ = window.MapEngine.createMapApi(window.MAPS[toRoomName]);
    R.setTheme(window.MAPS[toRoomName].theme);
    resetWorldForNewRoom();
    await connect(toRoomName, { spawnAt, autoHello: true });
  }

  async function connect(roomName, opts = {}) {
    setStatus('conectando...', false);
    try {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      const client = new Colyseus.Client(`${proto}://${location.host}`);
      room = await client.joinOrCreate(roomName, opts.spawnAt ? { spawnAt: opts.spawnAt } : {});
      currentRoomName = roomName;
      netState.myId = room.sessionId;

      await new Promise((resolve) => room.onStateChange.once(resolve));

      const $ = Colyseus.getStateCallbacks(room);

      $(room.state).players.onAdd((p, id) => {
        // onAdd pode disparar mais de uma vez para a mesma entrada (ex: uma
        // passada de "catch-up" do estado inicial mais o patch incremental
        // que chega quase junto) — o Map ja e idempotente, so o log nao era.
        const isNew = !players.has(id);
        const local = players.get(id) || {
          id,
          path: [],
          pathStart: now(),
          bubble: null,
        };
        local.name = p.name;
        local.look = extractLook(p);
        local.x = p.x;
        local.y = p.y;
        local.dir = local.dir ?? 1;
        local.dancing = p.dancing;
        local.holdingCoffee = p.holdingCoffee;
        players.set(id, local);
        if (isNew && id !== netState.myId) log(`${p.name} entrou na sala`, 'sys');

        $(p).onChange(() => {
          local.name = p.name;
          local.look = extractLook(p);
          local.dancing = p.dancing;
          local.holdingCoffee = p.holdingCoffee;
          if (!local.path || !local.path.length) {
            local.x = p.x;
            local.y = p.y;
          }
          renderRoster();
        });

        renderRoster();
      });

      $(room.state).players.onRemove((p, id) => {
        const local = players.get(id);
        if (local) log(`${local.name} saiu da sala`, 'sys');
        destroyLabels(id);
        players.delete(id);
        renderRoster();
      });

      room.onMessage('path', (m) => {
        const p = players.get(m.id);
        if (p) {
          p.x = m.from.x;
          p.y = m.from.y;
          p.path = m.path;
          p.pathStart = now();
          p.dancing = false;
        }
      });

      room.onMessage('chat', (m) => {
        const p = players.get(m.id);
        if (p) p.bubble = { text: m.text, until: now() + 6000 };
        log(`${m.name}: ${m.text}`, m.id === netState.myId ? 'me' : '');
      });

      room.onMessage('system', (m) => log(m.text, 'sys'));

      room.onMessage('climb', (m) => {
        climbLock = true;
        const me = players.get(netState.myId);
        if (me) {
          me.climbStart = now();
          me.climbUntil = now() + (m.ms || 1400);
        }
      });

      room.onMessage('changeRoom', (m) => switchRoom(m.to, m.spawnAt));

      room.onMessage('salaRoxa:open', (m) => {
        salaRoxaState = m;
        openSalaRoxaModal();
      });

      room.onMessage('salaRoxa:update', (m) => {
        salaRoxaState = m;
        if (!document.getElementById('salaRoxaModal').classList.contains('hidden')) renderSalaRoxaStatus();
        if (sceneRef && currentRoomName === 'salaCentral') rebuildDoorLabels(sceneRef);
      });

      room.onMessage('salaRoxa:reservarResult', (m) => {
        const msgEl = document.getElementById('roxaMsg');
        if (m.ok) {
          msgEl.textContent = 'Reserva confirmada!';
          msgEl.className = 'roxa-msg ok';
          document.getElementById('roxaForm').reset();
        } else {
          msgEl.textContent = m.error || 'Não foi possível reservar.';
          msgEl.className = 'roxa-msg error';
        }
      });

      room.onMessage('coffee:state', (m) => {
        coffeeState = m;
        renderCoffeeNotice();
      });

      room.onMessage('coffee:alert', () => {
        showCoffeeAlert();
      });

      room.onMessage('coffee:brewing', (m) => {
        const p = players.get(m.id);
        const ms = m.ms || 2600;
        if (p) {
          p.brewStart = now();
          p.brewUntil = now() + ms;
          if (m.id === netState.myId) p.bubble = { text: '☕ Fazendo café...', until: p.brewUntil };
        }
        if (m.id === netState.myId) {
          brewLock = true;
          setTimeout(() => { brewLock = false; }, ms);
        }
      });

      room.onLeave(() => {
        if (switching) return; // saida deliberada: switchRoom ja assume o proximo passo
        netState.connected = false;
        setStatus('reconectando...', false);
        players.clear();
        for (const id of [...labelObjs.keys()]) destroyLabels(id);
        scheduleReconnect();
      });

      netState.connected = true;
      setStatus('conectado', true);
      document.getElementById('roomName').textContent = window.MAPS[roomName].name;

      if (opts.autoHello || UI.hasSavedAvatar() || joined) enterRoom();
      if (roomName === 'salaPrincipal') showWelcomeBanner();
    } catch (err) {
      console.error(err);
      setStatus('sem conexão', false);
      scheduleReconnect();
    }
  }

  function extractLook(p) {
    return {
      skin: p.skin, hair: p.hair, hairColor: p.hairColor, top: p.top,
      topColor: p.topColor, pantsColor: p.pantsColor, shoesColor: p.shoesColor, accessory: p.accessory,
      fantasia: p.fantasia,
    };
  }

  // ================================================================ apresentacao VicioTown

  let welcomeShown = false;
  function showWelcomeBanner() {
    if (welcomeShown) return;
    welcomeShown = true;
    const banner = document.getElementById('welcome');
    banner.classList.remove('hidden');
    requestAnimationFrame(() => banner.classList.add('show'));
    setTimeout(() => {
      banner.classList.remove('show');
      setTimeout(() => banner.classList.add('hidden'), 400);
    }, 4200);
  }

  // ================================================================ Sala Roxa

  function formatDateTime(iso) {
    return new Date(iso).toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
    });
  }

  function renderSalaRoxaStatus() {
    const badge = document.getElementById('roxaBadge');
    const text = document.getElementById('roxaStatusText');
    badge.className = 'roxa-badge ' + (salaRoxaState.occupied ? 'occupied' : 'free');
    text.textContent = salaRoxaState.occupied && salaRoxaState.current
      ? `Em reunião: "${salaRoxaState.current.title}" — agendada por ${salaRoxaState.current.organizer || 'alguém'}, até ${formatDateTime(salaRoxaState.current.endISO)}`
      : 'Livre';

    const ul = document.getElementById('roxaQueue');
    ul.innerHTML = '';
    const queue = salaRoxaState.queue || [];
    if (!queue.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = 'Nenhuma reserva agendada.';
      ul.append(li);
      return;
    }
    queue.forEach((ev) => {
      const li = document.createElement('li');
      const when = document.createElement('span');
      when.textContent = `${formatDateTime(ev.startISO)} — ${ev.title}`;
      const who = document.createElement('span');
      who.className = 'who';
      who.textContent = ev.organizer || '';
      li.append(when, who);
      ul.append(li);
    });
  }

  function openSalaRoxaModal() {
    renderSalaRoxaStatus();
    const msgEl = document.getElementById('roxaMsg');
    msgEl.textContent = '';
    msgEl.className = 'roxa-msg';
    document.getElementById('salaRoxaModal').classList.remove('hidden');
  }

  document.getElementById('roxaClose').onclick = () => {
    document.getElementById('salaRoxaModal').classList.add('hidden');
  };

  document.getElementById('roxaForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const msgEl = document.getElementById('roxaMsg');
    const startVal = document.getElementById('roxaStart').value;
    if (!startVal) {
      msgEl.textContent = 'Escolha um horário de início.';
      msgEl.className = 'roxa-msg error';
      return;
    }
    const title = document.getElementById('roxaTitle').value.trim() || 'Reunião';
    const duration = Number(document.getElementById('roxaDuration').value);
    const start = new Date(startVal);
    const end = new Date(start.getTime() + duration * 60000);

    msgEl.textContent = 'Reservando...';
    msgEl.className = 'roxa-msg';
    send('salaRoxa:reservar', { title, startISO: start.toISOString(), endISO: end.toISOString() });
  });

  // ================================================================ Cafe da Copa

  function renderCoffeeNotice() {
    const notice = document.getElementById('coffeeNotice');
    if (coffeeState.ready) {
      document.getElementById('coffeeCount').textContent =
        `${coffeeState.takenCount}/${coffeeState.maxCups} xícaras servidas`;
      notice.classList.remove('hidden');
    } else {
      notice.classList.add('hidden');
    }
  }

  let coffeeAlertTimer = null;
  function showCoffeeAlert() {
    const el = document.getElementById('coffeeAlert');
    el.classList.remove('hidden');
    requestAnimationFrame(() => el.classList.add('show'));
    clearTimeout(coffeeAlertTimer);
    coffeeAlertTimer = setTimeout(() => {
      el.classList.remove('show');
      setTimeout(() => el.classList.add('hidden'), 400);
    }, 4500);
  }

  document.getElementById('stationBtn').onclick = () => {
    if (currentStationAction) send(currentStationAction.type, {});
  };

  // ================================================================ input (teclado)

  // setas cardeais na propria grade — simples de raciocinar pra navegar ate
  // as portas da Sala Principal (esquerda/cima/direita levam direto a elas).
  const KEY_DIRS = {
    ArrowUp: [0, -1], w: [0, -1], W: [0, -1],
    ArrowDown: [0, 1], s: [0, 1], S: [0, 1],
    ArrowLeft: [-1, 0], a: [-1, 0], A: [-1, 0],
    ArrowRight: [1, 0], d: [1, 0], D: [1, 0],
  };

  window.addEventListener('keydown', (e) => {
    if (document.activeElement && document.activeElement.tagName === 'INPUT') return;
    if (climbLock || brewLock) return;
    const d = KEY_DIRS[e.key];
    if (!d) return;
    e.preventDefault();
    const me = players.get(netState.myId);
    if (!me) return;
    const pose = poseOf(me);
    const tx = Math.round(pose.x) + d[0];
    const ty = Math.round(pose.y) + d[1];
    if (Map_.isWalkable(tx, ty)) send('move', { x: tx, y: ty });
  });

  // ================================================================ UI

  const UI = (() => {
    const nameInput = document.getElementById('nameInput');
    const chatInput = document.getElementById('chatInput');
    const modal = document.getElementById('modal');
    const preview = document.getElementById('preview');
    const opts = document.getElementById('options');

    let look = load() || Art.defaultLook();
    let previewDir = 1;
    let previewFrame = 0;

    function load() {
      try {
        const raw = localStorage.getItem('sppn:avatar');
        if (!raw) return null;
        const d = JSON.parse(raw);
        nameInput.value = d.name || '';
        return d.look;
      } catch {
        return null;
      }
    }

    function save() {
      localStorage.setItem('sppn:avatar', JSON.stringify({ name: nameInput.value, look }));
    }

    // ---- construcao dos controles
    function section(title, node, meta) {
      const wrapEl = document.createElement('div');
      wrapEl.className = 'section';
      if (meta && meta.fantasiaLocked) wrapEl.dataset.fantasiaLocked = '1';
      const h = document.createElement('h4');
      h.textContent = title;
      wrapEl.append(h, node);
      opts.append(wrapEl);
    }

    function swatches(colors, key) {
      const row = document.createElement('div');
      row.className = 'row';
      colors.forEach((c) => {
        const b = document.createElement('button');
        b.className = 'sw';
        b.style.background = c;
        b.dataset.value = c;
        b.onclick = () => { look[key] = c; sync(); };
        row.append(b);
      });
      row.dataset.key = key;
      return row;
    }

    function choices(values, labels, key) {
      const row = document.createElement('div');
      row.className = 'row';
      values.forEach((v, i) => {
        const b = document.createElement('button');
        b.className = 'chip';
        b.textContent = labels[i];
        b.dataset.value = v;
        b.onclick = () => { look[key] = v; sync(); };
        row.append(b);
      });
      row.dataset.key = key;
      return row;
    }

    section('Fantasia', choices(Art.FANTASIAS, Art.FANTASIAS.map((f) => Art.FANTASIA_LABELS[f]), 'fantasia'));
    section('Pele', swatches(Art.SKINS, 'skin'));
    section('Cabelo', choices(Art.HAIR_STYLES, ['curto', 'longo', 'coque', 'black', 'moicano', 'boné', 'careca'], 'hair'), { fantasiaLocked: true });
    section('Cor do cabelo', swatches(Art.HAIR_COLORS, 'hairColor'), { fantasiaLocked: true });
    section('Roupa', choices(Art.TOP_STYLES, ['camiseta', 'moletom', 'blazer'], 'top'), { fantasiaLocked: true });
    section('Cor da roupa', swatches(Art.CLOTHES, 'topColor'), { fantasiaLocked: true });
    section('Calça', swatches(Art.PANTS, 'pantsColor'), { fantasiaLocked: true });
    section('Sapato', swatches(Art.SHOES, 'shoesColor'), { fantasiaLocked: true });
    section('Acessório', choices(Art.ACCESSORIES, ['nenhum', 'óculos', 'escuros', 'fone'], 'accessory'), { fantasiaLocked: true });

    function sync() {
      opts.querySelectorAll('.row').forEach((row) => {
        const key = row.dataset.key;
        row.querySelectorAll('button').forEach((b) => {
          b.classList.toggle('on', b.dataset.value === look[key]);
        });
      });
      const locked = !!(look.fantasia && look.fantasia !== 'nenhuma');
      opts.querySelectorAll('.section[data-fantasia-locked]').forEach((el) => {
        el.classList.toggle('locked', locked);
      });
    }

    // ---- preview: uma segunda instancia minuscula do Phaser
    class PreviewScene extends Phaser.Scene {
      create() {
        this.g = this.add.graphics();
      }
      update() {
        this.g.clear();
        this.g.save();
        this.g.translateCanvas(preview.width / 2, preview.height - 14);
        this.g.scaleCanvas(2, 2);
        this.g.fillStyle(0x000000, 0.15);
        this.g.fillEllipse(0, 0, 24, 10);
        Art.draw(this.g, look, { dir: previewDir, frame: previewFrame });
        this.g.restore();
      }
    }

    const previewGame = new Phaser.Game({
      type: Phaser.CANVAS,
      canvas: preview,
      width: preview.width,
      height: preview.height,
      transparent: true,
      render: { pixelArt: true, antialias: false },
      scene: PreviewScene,
    });

    setInterval(() => {
      if (!modal.classList.contains('hidden')) previewFrame = (previewFrame + 1) % 4;
    }, 150);

    document.getElementById('rotL').onclick = () => { previewDir = (previewDir + 3) & 3; };
    document.getElementById('rotR').onclick = () => { previewDir = (previewDir + 1) & 3; };
    document.getElementById('randomize').onclick = () => { look = Art.randomLook(); sync(); };

    document.getElementById('customize').onclick = () => {
      modal.classList.remove('hidden');
      sync();
    };

    document.getElementById('confirm').onclick = () => {
      if (!nameInput.value.trim()) nameInput.value = 'Convidado';
      save();
      modal.classList.add('hidden');
      if (joined) send('look', { name: nameInput.value, look });
      else enterRoom();
      if (!netState.connected) log('Sem conexão com o servidor — tentando reconectar...', 'sys');
    };

    chatInput.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      const text = chatInput.value.trim();
      if (!text) return;
      send('chat', { text });
      chatInput.value = '';
    });

    document.getElementById('sendChat').onclick = () => {
      const text = chatInput.value.trim();
      if (!text) return;
      send('chat', { text });
      chatInput.value = '';
    };

    sync();

    return {
      look: () => look,
      name: () => nameInput.value.trim() || 'Convidado',
      hasSavedAvatar: () => !!localStorage.getItem('sppn:avatar'),
      openIfFirstTime: () => {
        if (!localStorage.getItem('sppn:avatar')) modal.classList.remove('hidden');
      },
    };
  })();

  function log(text, cls) {
    const el = document.getElementById('chatLog');
    const line = document.createElement('div');
    line.className = `line ${cls || ''}`;
    line.textContent = text;
    el.append(line);
    while (el.childElementCount > 60) el.firstElementChild.remove();
    el.scrollTop = el.scrollHeight;
  }

  function renderRoster() {
    const el = document.getElementById('roster');
    el.innerHTML = '';
    for (const p of players.values()) {
      const row = document.createElement('div');
      row.className = 'who' + (p.id === netState.myId ? ' me' : '');
      const dot = document.createElement('span');
      dot.className = 'dot';
      dot.style.background = p.look.topColor;
      row.append(dot, document.createTextNode(p.name));
      el.append(row);
    }
    document.getElementById('count').textContent = players.size;
  }

  // ================================================================ boot

  window.__sppn = {
    players, netState, send, poseOf, UI, switchRoom,
    getRoomName: () => currentRoomName,
    getSalaRoxaState: () => salaRoxaState,
    getCoffeeState: () => coffeeState,
    get sceneRef() { return sceneRef; },
  };

  UI.openIfFirstTime();
  connect(currentRoomName, {});
})();
