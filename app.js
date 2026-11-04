"use strict";

/*
 * TRUCO ARENA — versão revisada do motor local.
 * Truco Paulista para treino, somente pontos virtuais.
 *
 * Requer os IDs definidos no index.html enviado:
 * infoDialog, dialogTitle, dialogBody, closeDialog, playBtn,
 * profileBtn, points, wins, level.
 */

(() => {
  const $ = (id) => document.getElementById(id);
  const dialog = $("infoDialog");
  const title = $("dialogTitle");
  const body = $("dialogBody");

  const SUITS = [
    { name: "Ouros", symbol: "♦", red: true, power: 1 },
    { name: "Espadas", symbol: "♠", red: false, power: 2 },
    { name: "Copas", symbol: "♥", red: true, power: 3 },
    { name: "Paus", symbol: "♣", red: false, power: 4 }
  ];

  // Ordem crescente das cartas comuns no Truco Paulista.
  const VALUES = [
    { name: "4", rank: 1 }, { name: "5", rank: 2 },
    { name: "6", rank: 3 }, { name: "7", rank: 4 },
    { name: "Q", rank: 5 }, { name: "J", rank: 6 },
    { name: "K", rank: 7 }, { name: "A", rank: 8 },
    { name: "2", rank: 9 }, { name: "3", rank: 10 }
  ];

  const TARGET = 12;
  const NEXT_STAKE = { 1: 3, 3: 6, 6: 9, 9: 12 };
  const AUTO_NEXT_HAND_MS = 1900;
  let game = null;
  let handTimer = null;
  let botTimer = null;
  let stats = loadStats();

  function defaultStats() {
    return { points: 120, wins: 0, losses: 0 };
  }

  function loadStats() {
    try {
      const saved = JSON.parse(localStorage.getItem("trucoArenaStats"));
      if (!saved || typeof saved !== "object") return defaultStats();
      return {
        points: Number.isFinite(saved.points) ? Math.max(0, saved.points) : 120,
        wins: Number.isFinite(saved.wins) ? Math.max(0, saved.wins) : 0,
        losses: Number.isFinite(saved.losses) ? Math.max(0, saved.losses) : 0
      };
    } catch (_) {
      return defaultStats();
    }
  }

  function saveStats() {
    try {
      localStorage.setItem("trucoArenaStats", JSON.stringify(stats));
    } catch (_) {
      // O jogo continua funcionando mesmo se o navegador bloquear o armazenamento.
    }
    if ($("points")) $("points").textContent = stats.points;
    if ($("wins")) $("wins").textContent = stats.wins;
    if ($("level")) {
      $("level").textContent = String(Math.max(1, Math.floor(stats.wins / 3) + 1)).padStart(2, "0");
    }
  }

  function clearTimers() {
    if (handTimer !== null) window.clearTimeout(handTimer);
    if (botTimer !== null) window.clearTimeout(botTimer);
    handTimer = null;
    botTimer = null;
  }

  function shuffle(deck) {
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
  }

  function createDeck() {
    const deck = [];
    for (const suit of SUITS) {
      for (const value of VALUES) {
        deck.push({
          name: value.name,
          rank: value.rank,
          suit,
          id: `${value.name}-${suit.name}`
        });
      }
    }
    return shuffle(deck);
  }

  function dealHand() {
    const deck = createDeck();
    game.playerCards = deck.splice(0, 3);
    game.botCards = deck.splice(0, 3);
    game.vira = deck.shift();
    game.trickResults = [];
    game.playerTricks = 0;
    game.botTricks = 0;
    game.round = 1;
    game.tableCards = [];
    game.waitingResponse = false;
    game.botAsked = false;
    game.pendingStake = null;
    game.turn = game.firstPlayer;
    game.lastLead = game.firstPlayer;
    game.handDone = false;
    game.handWinner = null;
    game.trucoAskedThisHand = false;
    game.message = game.turn === "player"
      ? "Sua vez. Escolha uma carta."
      : "O computador começa esta mão.";
  }

  function startGame() {
    clearTimers();
    game = {
      playerPoints: 0,
      botPoints: 0,
      stake: 1,
      playerHands: 0,
      botHands: 0,
      finished: false,
      handNumber: 1,
      firstPlayer: "player",
      playerStartsNext: false,
      playerTricks: 0,
      botTricks: 0,
      trucoAskedThisHand: false
    };
    dealHand();
    renderGame();
    if (dialog && !dialog.open) dialog.showModal();
    if (game.turn === "bot") scheduleBotOpening();
  }

  function manilhaRank() {
    const index = VALUES.findIndex(v => v.name === game.vira.name);
    return VALUES[(index + 1) % VALUES.length].rank;
  }

  function cardPower(card) {
    if (card.rank === manilhaRank()) return 100 + card.suit.power;
    return card.rank;
  }

  function cardMarkup(card, extraClass) {
    const color = card.suit.red ? "red" : "";
    return `<div class="played-card ${color} ${extraClass || ""}">
      <small>${escapeHTML(card.name)}${card.suit.symbol}</small>${card.suit.symbol}
    </div>`;
  }

  function handCardMarkup(card, index) {
    const color = card.suit.red ? "red" : "";
    return `<button class="hand-card ${color}" data-card="${index}"
      aria-label="Jogar ${escapeHTML(card.name)} de ${escapeHTML(card.suit.name)}">
      <small>${escapeHTML(card.name)}<br>${card.suit.symbol}</small>${card.suit.symbol}
    </button>`;
  }

  function buttonMarkup(label, action, cls) {
    return `<button class="game-btn ${cls || "btn-gold"}" data-action="${action}">${label}</button>`;
  }

  /*
   * Regra da mão em melhor de três vazas:
   * - duas vitórias do mesmo lado encerram a mão;
   * - empate na primeira: a segunda vaza decide se houver vencedor;
   * - vencedor da primeira e empate na segunda: primeira vaza decide;
   * - uma vitória para cada lado: terceira vaza decide;
   * - empate na terceira após uma vitória para cada lado: prevalece
   *   quem venceu a primeira vaza.
   * - três empates: mão empatada (sem tentos).
   */
  function scoreHand(results) {
    const r = results;
    if (r.length < 2) return null;

    if (r[0] !== 0 && r[0] === r[1]) return r[0];
    if (r[0] === 0 && r[1] !== 0) return r[1];
    if (r[0] !== 0 && r[1] === 0) return r[0];

    if (r.length < 3) return null;

    if (r[0] !== 0 && r[1] !== 0 && r[0] !== r[1]) {
      return r[2] !== 0 ? r[2] : r[0];
    }
    if (r[0] === 0 && r[1] === 0) return r[2] || 0;
    return r[2] || 0;
  }

  function endMatchIfNeeded() {
    if (game.playerPoints < TARGET && game.botPoints < TARGET) return false;
    if (game.finished) return true;

    game.finished = true;
    game.handDone = true;
    game.waitingResponse = false;
    game.turn = "player";
    game.message = game.playerPoints >= TARGET
      ? "🏆 Você venceu a partida!"
      : "O computador venceu a partida.";

    if (!game.statsRecorded) {
      game.statsRecorded = true;
      if (game.playerPoints >= TARGET) {
        stats.wins += 1;
        stats.points += 20;
      } else {
        stats.losses += 1;
        stats.points = Math.max(0, stats.points - 5);
      }
      saveStats();
    }
    return true;
  }

  function finishHand(winner, reason) {
    if (game.handDone || game.finished) return;

    game.handDone = true;
    game.handWinner = winner;
    game.waitingResponse = false;
    game.pendingStake = null;
    game.turn = "player";

    if (winner === 1) {
      game.playerPoints += game.stake;
      game.playerHands += 1;
      game.message = reason || `Você venceu a mão! +${game.stake} tento(s).`;
    } else if (winner === 2) {
      game.botPoints += game.stake;
      game.botHands += 1;
      game.message = reason || `O computador venceu a mão! +${game.stake} tento(s).`;
    } else {
      game.message = reason || "Mão empatada. Ninguém marcou tentos.";
    }

    if (!endMatchIfNeeded()) {
      game.message += " Próxima mão em instantes...";
      renderGame();
      handTimer = window.setTimeout(() => {
        if (!game || game.finished || !game.handDone) return;
        nextHand();
      }, AUTO_NEXT_HAND_MS);
    } else {
      renderGame();
    }
  }

  function awardFold(winner) {
    finishHand(winner, winner === 1
      ? `O computador correu. Você ganhou ${game.stake} tento(s).`
      : `Você correu. O computador ganhou ${game.stake} tento(s).`);
  }

  function botChooseCard() {
    if (!game.botCards.length) return -1;

    const playerCard = game.tableCards.find(x => x.owner === 1);
    if (!playerCard) {
      // Quando abre a vaza, o computador varia entre carta baixa e média.
      const ordered = game.botCards
        .map((card, index) => ({ index, power: cardPower(card) }))
        .sort((a, b) => a.power - b.power);
      return Math.random() < 0.7 ? ordered[0].index : ordered[Math.floor(ordered.length / 2)].index;
    }

    const targetPower = cardPower(playerCard.card);
    const options = game.botCards.map((card, index) => ({
      index, power: cardPower(card)
    })).sort((a, b) => a.power - b.power);

    const winning = options.filter(c => c.power > targetPower);
    // Economiza a menor carta vencedora; se não puder ganhar, descarta a menor.
    return winning.length ? winning[0].index : options[0].index;
  }

  function playCard(index) {
    if (!game || game.finished || game.handDone || game.waitingResponse ||
        game.turn !== "player" || !game.playerCards[index]) return;

    const currentGame = game;
    const playerCard = game.playerCards.splice(index, 1)[0];

    // Se o computador abriu a vaza, a carta dele já está na mesa:
    // o jogador apenas responde. Caso contrário, o jogador abre e o bot responde.
    const botAlreadyPlayed = game.tableCards.some(x => x.owner === 2);
    if (botAlreadyPlayed) {
      game.tableCards.push({ card: playerCard, owner: 1 });
      resolveTrick(currentGame);
      return;
    }

    game.tableCards = [{ card: playerCard, owner: 1 }];
    game.lastLead = "player";
    game.turn = "bot";
    game.message = "Você jogou. O computador está pensando...";
    renderGame();

    botTimer = window.setTimeout(() => {
      if (game !== currentGame || game.finished || game.handDone ||
          game.turn !== "bot") return;

      const botIndex = botChooseCard();
      if (botIndex < 0 || !game.botCards[botIndex]) {
        finishHand(0, "Não foi possível concluir a vaza. Mão anulada.");
        return;
      }

      const botCard = game.botCards.splice(botIndex, 1)[0];
      game.tableCards.push({ card: botCard, owner: 2 });
      resolveTrick(currentGame);
    }, 650);
  }

  function resolveTrick(currentGame) {
    if (game !== currentGame || game.finished || game.handDone) return;
    const playerEntry = game.tableCards.find(x => x.owner === 1);
    const botEntry = game.tableCards.find(x => x.owner === 2);
    if (!playerEntry || !botEntry) return;

    const p = cardPower(playerEntry.card);
    const b = cardPower(botEntry.card);
    const winner = p > b ? 1 : b > p ? 2 : 0;
    game.trickResults.push(winner);

    if (winner === 1) game.playerTricks++;
    if (winner === 2) game.botTricks++;

    game.message = winner === 1
      ? "Você venceu esta rodada!"
      : winner === 2
        ? "O computador venceu esta rodada!"
        : "Rodada empatada!";

    game.round = game.trickResults.length;
    const handWinner = scoreHand(game.trickResults);

    if (handWinner !== null) {
      finishHand(handWinner);
      return;
    }

    game.tableCards = [];
    // Em empate, quem abriu a vaza anterior mantém a saída.
    game.turn = winner === 1 ? "player" : winner === 2 ? "bot" : game.lastLead;
    game.lastLead = game.turn;
    if (game.turn === "bot") {
      renderGame();
      scheduleBotOpening();
    } else {
      renderGame();
      scheduleBotTrucoCheck();
    }
  }

  function scheduleBotOpening() {
    if (!game || game.finished || game.handDone || game.waitingResponse ||
        game.turn !== "bot") return;

    const currentGame = game;
    botTimer = window.setTimeout(() => {
      if (game !== currentGame || game.finished || game.handDone ||
          game.waitingResponse || game.turn !== "bot") return;

      const index = botChooseCard();
      if (index < 0) return;
      const card = game.botCards.splice(index, 1)[0];
      game.tableCards = [{ card, owner: 2 }];
      game.lastLead = "bot";
      game.turn = "player";
      game.message = "O computador abriu a rodada. Sua vez.";
      renderGame();
    }, 650);
  }

  function nextStake(stake) {
    return NEXT_STAKE[stake] || 12;
  }

  function requestTruco() {
    if (!game || game.finished || game.handDone || game.waitingResponse ||
        game.stake >= 12 || game.trucoAskedThisHand) return;

    game.trucoAskedThisHand = true;
    game.waitingResponse = true;
    game.botAsked = false;
    game.pendingStake = nextStake(game.stake);
    game.message = `Você pediu truco! A mão pode valer ${game.pendingStake} tentos.`;

    const strength = game.botCards.reduce((sum, card) => sum + cardPower(card), 0);
    const accept = strength >= 75 || Math.random() < 0.28;
    renderGame();

    const currentGame = game;
    botTimer = window.setTimeout(() => {
      if (game !== currentGame || !game.waitingResponse || game.botAsked) return;

      if (accept) {
        game.stake = game.pendingStake;
        game.pendingStake = null;
        game.waitingResponse = false;
        game.message = `O computador aceitou! A mão vale ${game.stake} tentos.`;
      } else {
        game.waitingResponse = false;
        game.pendingStake = null;
        awardFold(1);
        return;
      }
      renderGame();
    }, 700);
  }

  function botCallsTruco() {
    if (!game || game.finished || game.handDone || game.waitingResponse ||
        game.stake >= 12 || game.trucoAskedThisHand) return false;

    const strength = game.botCards.reduce((sum, card) => sum + cardPower(card), 0);
    const threshold = game.stake === 1 ? 280 : 285;
    if (strength >= threshold && Math.random() < 0.35) {
      game.trucoAskedThisHand = true;
      game.waitingResponse = true;
      game.botAsked = true;
      game.pendingStake = nextStake(game.stake);
      game.message = `O computador pediu aumento para ${game.pendingStake} tentos!`;
      renderGame();
      return true;
    }
    return false;
  }

  function scheduleBotTrucoCheck() {
    const currentGame = game;
    botTimer = window.setTimeout(() => {
      if (game !== currentGame || game.finished || game.handDone ||
          game.turn !== "player" || game.waitingResponse) return;
      botCallsTruco();
    }, 450);
  }

  function respondTruco(accept) {
    if (!game || game.finished || game.handDone || !game.waitingResponse ||
        !game.botAsked) return;

    if (accept) {
      game.stake = game.pendingStake;
      game.pendingStake = null;
      game.waitingResponse = false;
      game.botAsked = false;
      game.message = `Você aceitou! A mão vale ${game.stake} tentos.`;
      renderGame();
      return;
    }

    game.pendingStake = null;
    game.waitingResponse = false;
    game.botAsked = false;
    awardFold(2);
  }

  function respondTrucoRaise() {
    if (!game || game.finished || game.handDone || !game.waitingResponse ||
        !game.botAsked || game.stake >= 12) return;

    game.stake = game.pendingStake;
    game.pendingStake = nextStake(game.stake);
    game.botAsked = false;
    game.waitingResponse = true;
    game.message = `Você aumentou! O computador precisa responder por ${game.pendingStake} tentos.`;
    renderGame();

    const currentGame = game;
    const strength = game.botCards.reduce((sum, card) => sum + cardPower(card), 0);
    const accept = strength >= 90 || Math.random() < 0.22;

    botTimer = window.setTimeout(() => {
      if (game !== currentGame || !game.waitingResponse || game.botAsked) return;
      if (accept) {
        game.stake = game.pendingStake;
        game.pendingStake = null;
        game.waitingResponse = false;
        game.message = `O computador aceitou! A mão vale ${game.stake} tentos.`;
        renderGame();
      } else {
        game.pendingStake = null;
        game.waitingResponse = false;
        awardFold(1);
      }
    }, 700);
  }

  function nextHand() {
    if (!game || game.finished || !game.handDone) return;
    clearTimers();
    game.handNumber += 1;
    game.stake = 1;
    game.firstPlayer = game.firstPlayer === "player" ? "bot" : "player";
    dealHand();
    renderGame();
    if (game.turn === "bot") scheduleBotOpening();
  }

  function renderGame() {
    if (!game || !body) return;

    const playerWon = game.playerPoints >= TARGET;
    const table = game.tableCards || [];
    const playerCard = table.find(x => x.owner === 1);
    const botCard = table.find(x => x.owner === 2);
    const viraRed = game.vira.suit.red ? "red" : "";
    let controls = "";

    if (game.finished) {
      controls = `<div class="result-banner">
        <strong>${playerWon ? "🏆 VOCÊ VENCEU!" : "🤖 O COMPUTADOR VENCEU"}</strong>
        <p>Placar final: ${game.playerPoints} × ${game.botPoints}</p>
      </div>${buttonMarkup("JOGAR NOVAMENTE", "restart", "btn-green")}`;
    } else if (game.handDone) {
      controls = `<div class="call-panel">
        <strong>${escapeHTML(game.message)}</strong>
        <p>Preparando a próxima mão automaticamente...</p>
      </div>`;
    } else if (game.waitingResponse) {
      const question = game.botAsked
        ? `O computador pediu ${game.pendingStake}. O que você deseja fazer?`
        : `Você pediu aumento para ${game.pendingStake}. Aguarde a resposta.`;

      controls = `<div class="call-panel">
        <strong>${escapeHTML(question)}</strong>
        ${game.botAsked ? `<div class="game-actions">
          ${buttonMarkup("ACEITAR", "accept", "btn-green")}
          ${buttonMarkup("CORRER", "decline", "btn-red")}
          ${game.stake < 9 ? buttonMarkup("AUMENTAR", "raise", "btn-gold") : ""}
        </div>` : `<p>O computador está pensando…</p>`}
      </div>`;
    } else if (game.turn === "bot") {
      controls = `<div class="call-panel"><strong>O computador está jogando...</strong><p>Aguarde sua vez.</p></div>`;
    } else {
      controls = `<div class="hand-label">SUAS CARTAS · TOQUE PARA JOGAR</div>
        <div class="hand">${game.playerCards.map(handCardMarkup).join("")}</div>
        <div class="game-actions">
          ${game.stake < 12 && !game.trucoAskedThisHand
            ? buttonMarkup("PEDIR TRUCO", "truco", "btn-gold") : ""}
        </div>`;
    }

    body.innerHTML = `
      <div class="game-shell">
        <div class="scoreboard">
          <div class="score-box"><span>VOCÊ</span><strong>${game.playerPoints}</strong><small>${game.playerTricks} rodadas vencidas nesta mão</small></div>
          <div class="score-box"><span>VALOR DA MÃO</span><strong>${game.stake}</strong><small>tento(s)</small></div>
          <div class="score-box"><span>COMPUTADOR</span><strong>${game.botPoints}</strong><small>${game.botTricks} rodadas vencidas nesta mão</small></div>
        </div>
        <div class="table-wrap">
          <div class="table-top">
            <div class="player-badge opponent-badge"><span class="player-face">🤖</span><span>Computador</span></div>
            <span class="table-meta">MÃO ${game.handNumber} · ${Math.min(game.round, 3)}/3</span>
          </div>
          <div class="opponent-hand">
            ${game.botCards.map(() => '<span class="mini-back"></span>').join("") || '<span class="round-info">Sem cartas</span>'}
          </div>
          <div class="vira-row">VIRA</div>
          <div class="vira-card ${viraRed}">${game.vira.name}${game.vira.suit.symbol}</div>
          <div class="play-area">
            ${botCard ? cardMarkup(botCard.card) : '<div class="empty-slot"></div>'}
            ${playerCard ? cardMarkup(playerCard.card) : '<div class="empty-slot"></div>'}
          </div>
          <p class="table-message" aria-live="polite">${escapeHTML(game.message)}</p>
          <div class="player-area">
            <span class="table-meta">TRUCO PAULISTA</span>
            <div class="player-badge"><span class="player-face">L</span><span>Você</span></div>
          </div>
        </div>
        ${controls}
        <p class="round-info">Partida de treino · pontos exclusivamente virtuais · vitória aos ${TARGET} tentos</p>
      </div>`;

    body.querySelectorAll("[data-card]").forEach(btn => {
      btn.addEventListener("click", () => playCard(Number(btn.dataset.card)));
    });

    body.querySelectorAll("[data-action]").forEach(btn => {
      btn.addEventListener("click", () => {
        switch (btn.dataset.action) {
          case "truco": requestTruco(); break;
          case "accept": respondTruco(true); break;
          case "decline": respondTruco(false); break;
          case "raise": respondTrucoRaise(); break;
          case "restart": startGame(); break;
        }
      });
    });
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, c => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    }[c]));
  }

  function showInfo(name, message) {
    if (!dialog || !body || !title) return;
    title.textContent = name;
    body.innerHTML = `<div class="info-content"><h3>${escapeHTML(name)}</h3>
      <p>${escapeHTML(message)}</p>
      <button class="game-btn btn-gold" id="infoOk">ENTENDI</button></div>`;
    $("infoOk").addEventListener("click", () => dialog.close());
    if (!dialog.open) dialog.showModal();
  }

  if ($("closeDialog")) $("closeDialog").addEventListener("click", () => {
    clearTimers();
    if (dialog && dialog.open) dialog.close();
  });

  if ($("playBtn")) $("playBtn").addEventListener("click", startGame);

  if ($("profileBtn")) $("profileBtn").addEventListener("click", () => {
    showInfo("Seu perfil", `Visitante · Nível ${Math.max(1, Math.floor(stats.wins / 3) + 1)} · ${stats.wins} vitória(s).`);
  });

  document.querySelectorAll("[data-mode]").forEach(btn => {
    btn.addEventListener("click", () => {
      const mode = btn.dataset.mode;
      if (mode === "Paulista" || mode === "Treino") startGame();
      else showInfo("Truco Mineiro", "Este modo será disponibilizado em uma próxima atualização. Por enquanto, aproveite o Truco Paulista.");
    });
  });

  document.querySelectorAll("[data-page]").forEach(btn => {
    btn.addEventListener("click", () => {
      document.querySelectorAll(".bottom-nav button").forEach(x => x.classList.remove("active"));
      if (btn.closest(".bottom-nav")) btn.classList.add("active");
      const pages = {
        "Início": "Você está na página inicial.",
        "Torneios": "Os torneios serão ativados em uma próxima atualização.",
        "Ranking": "O ranking será conectado quando o sistema de jogadores online estiver disponível.",
        "Amigos": "A área de amigos será ativada em uma próxima atualização.",
        "Clãs": "Os clãs serão ativados em uma próxima atualização.",
        "Menu": "Perfil, histórico e configurações serão adicionados aqui."
      };
      showInfo(btn.dataset.page, pages[btn.dataset.page] || "Em construção.");
    });
  });

  saveStats();

  // Interface de diagnóstico local: disponível no console para testes manuais.
  // Não altera o fluxo normal do jogo.
  window.TrucoArenaDebug = Object.freeze({
    target: TARGET,
    nextStake,
    cardPower: (cardName, suitName, viraName) => {
      if (!game) return null;
      const card = { name: cardName, rank: VALUES.find(v => v.name === cardName)?.rank,
        suit: SUITS.find(s => s.name === suitName) };
      if (!card.suit || !card.rank) return null;
      const oldGame = game;
      const vira = { name: viraName };
      game = { ...game, vira };
      const result = cardPower(card);
      game = oldGame;
      return result;
    },
    scoreHand: (results) => scoreHand(results.slice()),
    getState: () => game ? JSON.parse(JSON.stringify({
      playerPoints: game.playerPoints, botPoints: game.botPoints,
      stake: game.stake, handNumber: game.handNumber,
      playerTricks: game.playerTricks, botTricks: game.botTricks,
      round: game.round, handDone: game.handDone, finished: game.finished,
      waitingResponse: game.waitingResponse
    })) : null
  });
})();
