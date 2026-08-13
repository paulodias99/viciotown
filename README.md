# 🏢 SPPN — Escritório Virtual

MVP de um *Gather* com cara de **Habbo**: uma sala isométrica onde você personaliza
seu avatar pixel-art, anda pelo escritório, senta nas cadeiras e conversa com quem
estiver online. Renderizado com **Phaser 3**, sincronizado com **Colyseus**.

## Rodando

```bash
npm install
npm start
```

Abra <http://localhost:3000>. Para ver o multiplayer, abra em **duas abas** (ou em
outro dispositivo da mesma rede, usando o IP da máquina).

## Como jogar

| Ação | Como |
| --- | --- |
| Andar | Clique num tile do chão |
| Andar (teclado) | `W` `A` `S` `D` ou setas |
| Sentar | Clique numa cadeira ou no sofá |
| Conversar | Digite no campo de baixo e aperte `Enter` |
| Dançar | `/dance` no chat (digite de novo ou ande para parar) |
| Trocar de visual | Botão **Personalizar avatar** |

Mensagens começando com `/` são comandos e não viram fala. Hoje existem `/dance`
(alterna a dança) e `/parar`. O estado da dança mora no servidor (campo do schema),
então todo mundo vê a mesma coisa; sentar bloqueia a dança e andar cancela.

O avatar e o nome ficam salvos no `localStorage`, então ao recarregar você entra direto
— e o cliente reconecta sozinho se a conexão cair (então reiniciar o servidor não tira
ninguém da sala por muito tempo).

## Arquitetura

```
server.js              Express (estático) + Colyseus (WebSocketTransport) no mesmo http.Server
rooms/OfficeRoom.js     Room do Colyseus: schema sincronizado + A* + comandos de chat
shared/map.js           mapa do escritório, colisão e A* — usado pelo Room e pelo cliente
public/js/avatarGfx.js  avatar pixel-art desenhado com Phaser Graphics (sem sprites)
public/js/roomGfx.js    render isométrico com Phaser Graphics: tiles, móveis, paredes
public/js/main.js       Phaser.Scene (loop/câmera/input) + cliente Colyseus + UI
```

**Por que Phaser + Colyseus.** Colyseus cuida de rooms, matchmaking e sincronização de
estado autoritativa — a posição/aparência de cada jogador mora num `@colyseus/schema`
no servidor, e todo cliente que entra recebe o snapshot atual automaticamente (sem
precisar de uma mensagem `init` feita à mão). Phaser cuida do game loop, câmera,
input e do object model (`Graphics`, `Text`) — o `<canvas>` de antes virou uma
`<div id="game">` onde o Phaser planta o canvas dele.

**Movimento.** O cliente manda só o tile de destino (`room.send('move', {x,y})`). O
servidor roda o A* (o mesmo `shared/map.js`), guarda o caminho num mapa efêmero
(fora do schema — é substituído por inteiro a cada passo) e transmite via
`broadcast('path', {id, from, path})`. Cada cliente interpola a posição pelo tempo
decorrido, e o Room também resolve o caminho periodicamente (`this.clock.setInterval`)
para que o campo `x,y` do schema fique correto mesmo sem ninguém andar de novo — é o
que um jogador que entra no meio do trajeto de outro vê como posição "de verdade".

**Estado x mensagens.** Nome, aparência, posição de repouso e `dancing` moram no
schema (sincroniza sozinho via `MapSchema<Player>`). O caminho em trânsito e o chat
são `broadcast` avulsos — não fazem sentido como estado incremental, já que um é
substituído por inteiro e o outro é só um evento efêmero. No cliente, ambos chegam
via `getStateCallbacks(room)` (`$(state).players.onAdd/onChange/onRemove`) e
`room.onMessage(tipo, ...)`.

**Isométrico.** Tile de 64×32 (mesma métrica do Habbo). `toScreen` leva grade → tela;
`toTile` faz o inverso arredondando, porque o centro do tile é o valor inteiro exato
nos eixos isométricos. Tudo (móveis, paredes, avatares) entra numa lista ordenada por
profundidade `gx + gy` antes de desenhar num único `Phaser.GameObjects.Graphics`
redesenhado a cada frame — o mesmo algoritmo de pintor de antes, só que os
`ctx.fillRect/beginPath/fill` viraram `graphics.fillRect/beginPath/fillPath`. As
paredes sul e leste são sólidas mas não desenhadas — truque padrão para a câmera
enxergar a sala.

**Avatar.** Nada de spritesheet: `avatarGfx.js` desenha ~40 retângulos por frame numa
altura de 54px, espelhando a arte para as direções da esquerda. Isso deixa cada peça
(pele, cabelo, roupa, calça, sapato, acessório) recolorível de graça, que é o que
torna a customização barata. A pré-visualização do modal é uma segunda instância
minúscula do Phaser, renderizando no `<canvas id="preview">`.

As animações são tabelas de offsets indexadas pelo tempo — 4 tempos para andar e 8
para dançar (gingado lateral, quique e braços subindo em onda). O braço erguido não
é o braço normal deslocado para cima: manga e mão trocam de ponta, senão a mão fica
no meio do braço.

## Mapa

Editar a sala é editar `shared/map.js` — o Room e o cliente leem o mesmo arquivo:

```
#  parede      V  janela       W  quadro
.  chão        R  tapete       D  mesa
T  mesa de reunião             P  planta
K  cafeteira   c  cadeira      S  sofá
```

Minúsculas (`c`, `S`) e `.`/`R` são andáveis; o resto bloqueia.

## O que ficou de fora

Escopo de MVP: uma sala só, sem áudio/vídeo, sem contas e sem persistência em banco.
O servidor confia no cliente quanto ao visual do avatar (o nome e as cores são
sanitizados, mas não há autenticação). Reconexão é "entra nó de novo" (nova sessão),
não retomada de sessão — para isso o Colyseus tem suporte a `allowReconnection`, que
fica pra próxima iteração.
