 "use strict";

/* TRUCO ARENA — Truco Paulista, treino local com pontos virtuais. */
(() => {
  const $ = id => document.getElementById(id);
  const dialog = $("infoDialog");
  const title = $("dialogTitle");
  const body = $("dialogBody");

  const SUITS = [
    { name: "Ouros", symbol: "♦", red: true, power: 1 },
    { name: "Espadas", symbol: "♠", red: false, power: 2 },
    { name: "Copas", symbol: "♥", red: true, power: 3 },
    { name: "Paus", symbol: "♣", red: false, power: 4 }
  ];
  const VALUES = [
    { name: "4", rank: 1 }, { name: "5", rank: 2 },
    { name: "6", rank: 3 }, { name: "7", rank: 4 },
    { name: "Q", rank: 5 }, { name: "J", rank: 6 },
    { name: "K", rank: 7 }, { name: "A", rank: 8 },
    { name: "2", rank: 9 }, { name: "3", rank: 10 }
  ];
  const TARGET = 12;
  const NEXT_STAKE = { 1: 3, 3: 6, 6: 9, 9: 12 };
  const TRICK_REVEAL_MS = 1150;
  const AUTO_NEXT_HAND_MS = 1900;

  let game = null;
  let handTimer = null;
  let botTimer = null;
  let trickTimer = null;
  let cardTimer = null;
  let stats = loadStats();

  function defaultStats() { return { points: 120, wins: 0, losses: 0 }; }
  function loadStats() {
    try {
      const s = JSON.parse(localStorage.getItem("trucoArenaStats"));
      if (!s || typeof s !== "object") return defaultStats();
      return {
        points: Number.isFinite(s.points) ? Math.max(0, s.points) : 120,
        wins: Number.isFinite(s.wins) ? Math.max(0, s.wins) : 0,
        losses: Number.isFinite(s.losses) ? Math.max(0, s.losses) : 0
      };
    } catch (_) { return defaultStats(); }
  }
  function saveStats() {
    try { localStorage.setItem("trucoArenaStats", JSON.stringify(stats)); } catch (_) {}
    if ($("points")) $("points").textContent = stats.points;
    if ($("wins")) $("wins").textContent = stats.wins;
    if ($("level")) $("level").textContent = String(Math.max(1, Math.floor(stats.wins / 3) + 1)).padStart(2, "0");
  }
  function clearTimers() {
    [handTimer, botTimer, trickTimer].forEach(t => { if (t !== null) clearTimeout(t); });
    if (cardTimer !== null) clearInterval(cardTimer);
    handTimer = botTimer = trickTimer = cardTimer = null;
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
    SUITS.forEach(suit => VALUES.forEach(v => deck.push({
      name: v.name, rank: v.rank, suit, id: `${v.name}-${suit.name}`
    })));
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
    game.raiseAvailable = false;
    game.selectedCardIndex = null;
    game.cardTimeLeft = game.turn === "player" ? 15 : 0;
    game.message = game.turn === "player" ? "Sua vez. Escolha uma carta." : "O computador começa esta mão.";
  }

  function stopCardTimer() {
    if (cardTimer !== null) clearInterval(cardTimer);
    cardTimer = null;
  }

  function startCardTimer() {
    stopCardTimer();
    if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "player" || !game.playerCards.length) return;
    game.cardTimeLeft = 15;
    renderGame();
    const current = game;
    cardTimer = setInterval(() => {
      if (game !== current || game.finished || game.handDone || game.waitingResponse || game.turn !== "player" || !game.playerCards.length) {
        stopCardTimer();
        return;
      }
      game.cardTimeLeft -= 1;
      if (game.cardTimeLeft <= 0) {
        stopCardTimer();
        game.message = "⏱️ Tempo esgotado! Sua primeira carta foi jogada automaticamente.";
        playCard(0);
        return;
      }
      renderGame();
    }, 1000);
  }
  function startGame() {
    clearTimers();
    game = {
      playerPoints: 0, botPoints: 0, stake: 1,
      playerHands: 0, botHands: 0, finished: false,
      handNumber: 1, firstPlayer: "player",
      playerTricks: 0, botTricks: 0,
      trucoAskedThisHand: false, statsRecorded: false,
      revealOnly: false
    };
    dealHand();
    if (title) title.textContent = "Partida Paulista";
    renderGame();
    if (dialog && !dialog.open) dialog.showModal();
    if (game.turn === "bot") scheduleBotOpening();
  }

  function manilhaRank() {
    const i = VALUES.findIndex(v => v.name === game.vira.name);
    return VALUES[(i + 1) % VALUES.length].rank;
  }
  function isManilha(card) { return !!game && card.rank === manilhaRank(); }
  function cardPower(card) {
    if (isManilha(card)) return 100 + card.suit.power;
    return card.rank;
  }
  function cardMarkup(card, extraClass = "", covered = false) {
    if (covered) return `<div class="played-card covered ${extraClass}" aria-label="Carta jogada encoberta"><span>🂠</span><small>ENCUBERTA</small></div>`;
    const red = card.suit.red ? "red" : "";
    const manilha = isManilha(card) ? " manilha" : "";
    return `<div class="played-card ${red}${manilha} ${extraClass}">
      <small>${escapeHTML(card.name)}${card.suit.symbol}</small><span>${card.suit.symbol}</span>
      ${isManilha(card) ? '<i class="manilha-tag">MANILHA</i>' : ""}
    </div>`;
  }
  function handCardMarkup(card, index) {
    const red = card.suit.red ? "red" : "";
    const manilha = isManilha(card) ? " manilha" : "";
    const selected = game && game.selectedCardIndex === index ? " selected" : "";
    return `<button class="hand-card ${red}${manilha}${selected}" data-card="${index}"
      aria-label="Jogar ${escapeHTML(card.name)} de ${escapeHTML(card.suit.name)}${isManilha(card) ? ', manilha' : ''}">
      <small>${escapeHTML(card.name)}<br>${card.suit.symbol}</small><span>${card.suit.symbol}</span>
      ${isManilha(card) ? '<i class="manilha-tag">MANILHA</i>' : ""}
    </button>`;
  }
  function buttonMarkup(label, action, cls = "btn-gold") {
    return `<button class="game-btn ${cls}" data-action="${action}">${label}</button>`;
  }

  // 1 = jogador, 2 = computador, 0 = empate.
  function scoreHand(r) {
    if (r.length < 2) return null;
    if (r[0] !== 0 && r[0] === r[1]) return r[0];
    if (r[0] === 0 && r[1] !== 0) return r[1];
    if (r[0] !== 0 && r[1] === 0) return r[0];
    if (r.length < 3) return null;
    if (r[0] !== 0 && r[1] !== 0 && r[0] !== r[1]) return r[2] || r[0];
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
    game.message = game.playerPoints >= TARGET ? "🏆 Você venceu a partida!" : "O computador venceu a partida.";
    if (!game.statsRecorded) {
      game.statsRecorded = true;
      if (game.playerPoints >= TARGET) { stats.wins++; stats.points += 20; }
      else { stats.losses++; stats.points = Math.max(0, stats.points - 5); }
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
      game.playerHands++;
      game.message = reason || `Você venceu a mão! +${game.stake} tento(s).`;
    } else if (winner === 2) {
      game.botPoints += game.stake;
      game.botHands++;
      game.message = reason || `O computador venceu a mão! +${game.stake} tento(s).`;
    } else game.message = reason || "Mão empatada. Ninguém marcou tentos.";

    if (!endMatchIfNeeded()) {
      game.message += " Próxima mão em instantes...";
      renderGame();
      handTimer = setTimeout(() => {
        if (!game || game.finished || !game.handDone) return;
        nextHand();
      }, AUTO_NEXT_HAND_MS);
    } else renderGame();
  }
  function awardFold(winner) {
    finishHand(winner, winner === 1
      ? `O computador correu. Você ganhou ${game.stake} tento(s).`
      : `Você correu. O computador ganhou ${game.stake} tento(s).`);
  }

  function botChooseCard() {
    if (!game.botCards.length) return -1;
    const playerEntry = game.tableCards.find(x => x.owner === 1);
    const options = game.botCards.map((card, index) => ({ index, power: cardPower(card) }))
      .sort((a, b) => a.power - b.power);
    if (!playerEntry || playerEntry.covered) {
      // Carta encoberta não revela ao computador qual foi jogada.
      // Ele escolhe sem usar a força da carta escondida.
      return Math.random() < 0.58 ? options[0].index : options[Math.floor(options.length / 2)].index;
    }
    const target = cardPower(playerEntry.card);
    const winning = options.filter(x => x.power > target);
    // Usa a menor carta capaz de vencer; se não vencer, economiza a menor.
    return winning.length ? winning[0].index : options[0].index;
  }
  function selectCard(index) {
    if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "player" || !game.playerCards[index]) return;
    game.selectedCardIndex = game.selectedCardIndex === index ? null : index;
    renderGame();
}

function playCard(index, covered = false) {
    if (!game || game.finished || game.handDone || game.waitingResponse ||
        game.turn !== "player" || !game.playerCards[index]) return;
    stopCardTimer();
    const current = game;
    game.selectedCardIndex = null;
    const card = game.playerCards.splice(index, 1)[0];
    const played = { card, owner: 1, covered: !!covered };
    const botAlreadyPlayed = game.tableCards.some(x => x.owner === 2);
    if (botAlreadyPlayed) {
      game.tableCards.push(played);
      resolveTrick(current);
      return;
    }
    game.tableCards = [played];
    game.lastLead = "player";
    game.turn = "bot";
    game.message = "Você jogou. O computador está pensando...";
    renderGame();
    botTimer = setTimeout(() => {
      if (game !== current || game.finished || game.handDone || game.turn !== "bot") return;
      const i = botChooseCard();
      if (i < 0 || !game.botCards[i]) { finishHand(0, "Não foi possível concluir a rodada."); return; }
      game.tableCards.push({ card: game.botCards.splice(i, 1)[0], owner: 2 });
      resolveTrick(current);
    }, 650);
  }
  function resolveTrick(current) {
    if (game !== current || game.finished || game.handDone) return;
    const pEntry = game.tableCards.find(x => x.owner === 1);
    const bEntry = game.tableCards.find(x => x.owner === 2);
    if (!pEntry || !bEntry) return;
    const p = cardPower(pEntry.card), b = cardPower(bEntry.card);
    const winner = p > b ? 1 : b > p ? 2 : 0;
    game.trickResults.push(winner);
    if (winner === 1) game.playerTricks++;
    if (winner === 2) game.botTricks++;
    game.message = winner === 1 ? "Você venceu esta rodada!"
      : winner === 2 ? "O computador venceu esta rodada!" : "Rodada empatada!";
    game.round = game.trickResults.length;
    const handWinner = scoreHand(game.trickResults);
    // Mantém as duas cartas abertas para o jogador conferir o resultado.
    game.revealOnly = true;
    renderGame();
    trickTimer = setTimeout(() => {
      if (game !== current || game.finished || game.handDone) return;
      game.revealOnly = false;
      if (handWinner !== null) { finishHand(handWinner); return; }
      game.tableCards = [];
      game.turn = winner === 1 ? "player" : winner === 2 ? "bot" : game.lastLead;
      game.lastLead = game.turn;
      if (game.turn === "player" && game.stake < 12) game.raiseAvailable = true;
      if (game.turn === "bot") {
        renderGame();
        scheduleBotOpening();
      } else {
        renderGame();
        scheduleBotTrucoCheck();
        startCardTimer();
      }
    }, TRICK_REVEAL_MS);
  }
  function scheduleBotOpening() {
    if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "bot") return;
    const current = game;
    botTimer = setTimeout(() => {
      if (game !== current || game.finished || game.handDone || game.waitingResponse || game.turn !== "bot") return;
      const i = botChooseCard();
      if (i < 0) return;
      game.tableCards = [{ card: game.botCards.splice(i, 1)[0], owner: 2 }];
      game.lastLead = "bot";
      game.turn = "player";
      game.message = "O computador abriu a rodada. Sua vez.";
      if (game.stake < 12) game.raiseAvailable = true;
      renderGame();
      scheduleBotTrucoCheck();
      startCardTimer();
    }, 650);
  }

  function nextStake(stake) { return NEXT_STAKE[stake] || 12; }
  function botStrength() {
    // Soma com peso maior para manilhas; valores altos indicam mão forte.
    return game.botCards.reduce((sum, c) => sum + cardPower(c), 0);
  }
  function requestRaise() {
    if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "player" || game.stake >= 12) return;
    game.trucoAskedThisHand = true;
    game.raiseAvailable = false;
    game.waitingResponse = true;
    game.botAsked = false;
    game.pendingStake = nextStake(game.stake);
    game.message = `Você pediu truco! A mão pode valer ${game.pendingStake} tentos.`;
    const strength = botStrength();
    // O computador pode aceitar, correr ou retrucar aumentando a aposta.
    const canRaise = game.pendingStake < 12 && strength >= 205 && Math.random() < 0.32;
    const accept = strength >= 105 || Math.random() < 0.48;
    renderGame();
    const current = game;
    botTimer = setTimeout(() => {
      if (game !== current || !game.waitingResponse || game.botAsked) return;
      if (canRaise) {
        game.stake = game.pendingStake;
        game.pendingStake = nextStake(game.stake);
        game.botAsked = true;
        game.message = `O computador aumentou! Agora a mão vale ${game.pendingStake} se você aceitar.`;
      } else if (accept) {
        game.stake = game.pendingStake;
        game.pendingStake = null;
        game.waitingResponse = false;
        game.trucoAskedThisHand = false;
        game.raiseAvailable = false;
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
  function requestTruco() { return requestRaise(); }

  function botCallsTruco() {
    if (!game || game.finished || game.handDone || game.waitingResponse ||
        game.stake >= 12) return false;
    const strength = botStrength();
    // O computador avalia força, placar e chance variável para não pedir sempre.
    const scoreBehind = game.botPoints < game.playerPoints;
    const chance = strength >= 210 ? 0.72 : strength >= 115 ? 0.43 : 0.16;
    const shouldCall = Math.random() < (scoreBehind ? Math.min(0.82, chance + 0.12) : chance);
    if (shouldCall) {
      game.trucoAskedThisHand = true;
      game.raiseAvailable = false;
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
    const current = game;
    botTimer = setTimeout(() => {
      if (game !== current || game.finished || game.handDone || game.turn !== "player" || game.waitingResponse) return;
      botCallsTruco();
    }, 450);
  }
  function respondTruco(accept) {
    if (!game || game.finished || game.handDone || !game.waitingResponse || !game.botAsked) return;
    if (accept) {
      game.stake = game.pendingStake;
      game.pendingStake = null;
      game.waitingResponse = false;
      game.botAsked = false;
      game.trucoAskedThisHand = false;
      game.raiseAvailable = false;
      game.message = `Você aceitou! A mão vale ${game.stake} tentos.`;
      renderGame();
      startCardTimer();
      return;
    }
    game.pendingStake = null;
    game.waitingResponse = false;
    game.botAsked = false;
    awardFold(2);
  }
  function respondTrucoRaise() {
    if (!game || game.finished || game.handDone || !game.waitingResponse || !game.botAsked || game.stake >= 9) return;
    game.stake = game.pendingStake;
    game.pendingStake = nextStake(game.stake);
    game.raiseAvailable = false;
    game.botAsked = false;
    game.waitingResponse = true;
    game.message = `Você aumentou! O computador precisa responder por ${game.pendingStake} tentos.`;
    renderGame();
    const current = game;
    const accept = botStrength() >= 125 || Math.random() < 0.38;
    botTimer = setTimeout(() => {
      if (game !== current || !game.waitingResponse || game.botAsked) return;
      if (accept) {
        stopCardTimer();
        game.stake = game.pendingStake;
        game.pendingStake = null;
        game.waitingResponse = false;
        game.raiseAvailable = false;
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
    game.handNumber++;
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
    const pCard = table.find(x => x.owner === 1);
    const bCard = table.find(x => x.owner === 2);
    const viraRed = game.vira.suit.red ? "red" : "";
    let controls = "";
    if (game.finished) {
      controls = `<div class="result-banner"><strong>${playerWon ? "🏆 VOCÊ VENCEU!" : "🤖 O COMPUTADOR VENCEU"}</strong>
        <p>Placar final: ${game.playerPoints} × ${game.botPoints}</p></div>${buttonMarkup("JOGAR NOVAMENTE", "restart", "btn-green")}`;
    } else if (game.handDone) {
      controls = `<div class="call-panel"><strong>${escapeHTML(game.message)}</strong><p>Preparando a próxima mão...</p></div>`;
    } else if (game.waitingResponse) {
      const q = game.botAsked ? `O computador pediu ${game.pendingStake}. O que você deseja fazer?`
        : `Você pediu aumento para ${game.pendingStake}. Aguarde a resposta.`;
      controls = `<div class="hand-label">SUAS CARTAS · FICAM VISÍVEIS DURANTE O TRUCO</div>
        <div class="hand">${game.playerCards.map(handCardMarkup).join("")}</div>
        <div class="call-panel"><strong>${escapeHTML(q)}</strong>
        ${game.botAsked ? `<div class="game-actions">${buttonMarkup("ACEITAR","accept","btn-green")}${buttonMarkup("CORRER","decline","btn-red")}
        ${game.stake < 9 ? buttonMarkup(`AUMENTAR PARA ${game.pendingStake}`,"raise","btn-gold") : ""}</div>` : "<p>O computador está pensando…</p>"}</div>`;
    } else {
      const canRaise = game.turn === "player" && game.raiseAvailable && game.stake < 12 && !game.waitingResponse;
      const selected = game.selectedCardIndex !== null ? game.selectedCardIndex : null;
      controls = `<div class="card-timer ${game.cardTimeLeft <= 5 ? "urgent" : ""}" aria-live="polite">
          <span>⏱️</span><strong>${game.cardTimeLeft || 15}s</strong><small>para jogar</small>
        </div>
        <div class="hand-label">SUAS CARTAS · TOQUE PARA SELECIONAR</div>
        <div class="hand">${game.playerCards.map((c,i)=>handCardMarkup(c,i)).join("")}</div>
        <div class="game-actions">
          ${selected !== null && game.turn === "player" ? buttonMarkup("JOGAR CARTA", "play-selected", "btn-green") : ""}
          ${selected !== null && game.turn === "player" && game.round >= 2 ? buttonMarkup("JOGAR ENCUBERTA", "play-covered", "btn-dark") : ""}
          ${(game.turn === "player" && game.stake === 1 && !game.trucoAskedThisHand) ? buttonMarkup("TRUCO!", "truco", "btn-gold") : ""}
          ${(game.turn === "player" && game.stake > 1 && game.raiseAvailable) ? buttonMarkup(`AUMENTAR PARA ${nextStake(game.stake)}`, "raise-now", "btn-gold") : ""}
        </div>
        ${game.waitingResponse && game.botAsked ? `<div class="call-panel"><strong>O computador pediu ${game.pendingStake}. O que você deseja fazer?</strong><div class="game-actions">${buttonMarkup("ACEITAR","accept","btn-green")}${buttonMarkup("CORRER","decline","btn-red")}${game.stake < 9 ? buttonMarkup(`AUMENTAR PARA ${game.pendingStake}`,"raise","btn-gold") : ""}</div></div>` : ""}`;
    }
    const manilhaName = VALUES[(VALUES.findIndex(v => v.name === game.vira.name) + 1) % VALUES.length].name;
    body.innerHTML = `<div class="game-shell">
      <div class="scoreboard">
        <div class="score-box"><span>VOCÊ</span><strong>${game.playerPoints}</strong><small>${game.playerTricks} rodada(s) nesta mão</small></div>
        <div class="score-box stake-box"><span>TENTOS</span><strong>${game.stake}</strong><small>vale ${game.stake}</small></div>
        <div class="score-box"><span>COMPUTADOR</span><strong>${game.botPoints}</strong><small>${game.botTricks} rodada(s) nesta mão</small></div>
      </div>
      <div class="table-wrap">
        <div class="table-top">
          <div class="player-badge opponent-badge"><span class="player-face">🤖</span><span>Computador</span></div>
          <span class="table-meta">MÃO ${game.handNumber} · ${Math.min(game.round,3)}/3</span>
        </div>
        <div class="opponent-hand">${game.botCards.map(() => '<span class="mini-back"></span>').join("") || '<span class="round-info">Sem cartas</span>'}</div>
        <div class="play-area">
          <div class="played-slot opponent-play">${bCard ? `<label>COMPUTADOR</label>${cardMarkup(bCard.card, "", bCard.covered)}` : '<div class="empty-slot"></div>'}</div>
          <div class="played-center">
            <div class="center-deck-vira">
              <div class="deck-stack" aria-label="Baralho"><span></span><span></span><b>🂠</b><small>BARALHO</small></div>
              <div class="vira-block"><span class="vira-row">VIRA</span>
                <div class="vira-card ${viraRed}"><small>${game.vira.name}</small>${game.vira.suit.symbol}</div>
                <em>MANILHA: ${manilhaName}</em>
              </div>
            </div>
          </div>
          <div class="played-slot player-play">${pCard ? `<label>VOCÊ</label>${cardMarkup(pCard.card, "", pCard.covered)}` : '<div class="empty-slot"></div>'}</div>
        </div>
        <p class="table-message" aria-live="polite">${escapeHTML(game.message)}</p>
        <div class="player-area"><span class="table-meta">TRUCO PAULISTA</span><div class="player-badge"><span class="player-face">L</span><span>Você</span></div></div>
      </div>
      ${controls}
      <p class="round-info">Treino · pontos virtuais · vence quem chegar a ${TARGET} tentos</p>
    </div>`;
    body.querySelectorAll("[data-card]").forEach(btn => btn.addEventListener("click", () => selectCard(Number(btn.dataset.card))));
    body.querySelectorAll("[data-action]").forEach(btn => btn.addEventListener("click", () => {
      switch (btn.dataset.action) {
        case "play-selected": if (game.selectedCardIndex !== null) playCard(game.selectedCardIndex, false); break;
        case "play-covered": if (game.selectedCardIndex !== null) playCard(game.selectedCardIndex, true); break;
        case "truco": requestTruco(); break;
        case "raise-now": requestRaise(); break;
        case "accept": respondTruco(true); break;
        case "decline": respondTruco(false); break;
        case "raise": respondTrucoRaise(); break;
        case "restart": startGame(); break;
      }
    }));
  }
  function escapeHTML(v) {
    return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }
  // ===== MODO ONLINE (P2P) =====
  let peer = null;
  let onlineConn = null;
  let onlineRole = null; // 1 = criador, 2 = convidado
  let online = null;
  let onlineTimer = null;

  function onlineClearTimer(){ if(onlineTimer!==null){clearInterval(onlineTimer);onlineTimer=null;} }
  function onlineDeck(){ return shuffle(createDeck()); }
  function onlineNewHand(){
    const deck=onlineDeck();
    online.p1Cards=deck.splice(0,3); online.p2Cards=deck.splice(0,3); online.vira=deck.shift();
    online.table=[]; online.tricks=[0,0,0]; online.round=1; online.turn=online.first; online.stake=1;
    online.waiting=false; online.pending=null; online.caller=null; online.message=online.turn===onlineRole?'Sua vez. Escolha uma carta.':'Aguarde o adversário.';
    online.selected=null; online.done=false; online.finished=false; online.cardTime=online.turn===onlineRole?15:0;
  }
  function onlineState(){
    return {p1Points:online.p1Points,p2Points:online.p2Points,p1Tricks:online.tricks[0],p2Tricks:online.tricks[1],
      stake:online.stake,round:online.round,turn:online.turn,first:online.first,vira:online.vira,table:online.table,
      waiting:online.waiting,pending:online.pending,caller:online.caller,message:online.message,done:online.done,finished:online.finished,
      cardTime:online.cardTime,handNumber:online.handNumber};
  }
  function onlineSend(){
    if(!onlineConn || !onlineConn.open || !online) return;
    const hand=onlineRole===1?online.p1Cards:online.p2Cards;
    onlineConn.send({type:'state',state:onlineState(),hand});
  }
  function onlineSyncGuest(){ if(onlineRole===1) onlineSend(); }
  function onlineStartTimer(){
    onlineClearTimer();
    if(!online || online.finished || online.done || online.waiting || online.turn!==onlineRole) return;
    online.cardTime=15; onlineRender();
    onlineTimer=setInterval(()=>{
      if(!online || online.finished || online.done || online.waiting || online.turn!==onlineRole){onlineClearTimer();return;}
      online.cardTime--;
      if(online.cardTime<=0){onlineClearTimer();online.message='⏱️ Tempo esgotado! A primeira carta foi jogada automaticamente.';onlinePlay(0,false);return;}
      onlineRender();
      if(onlineRole===1) onlineSend();
    },1000);
  }
  function onlineEndHand(winner,reason){
    online.done=true; online.waiting=false; online.pending=null; online.caller=null;
    if(winner===1) online.p1Points+=online.stake; else if(winner===2) online.p2Points+=online.stake;
    online.message=reason || (winner===onlineRole?'Você venceu a mão!':'O adversário venceu a mão.');
    if(online.p1Points>=TARGET || online.p2Points>=TARGET){
      online.finished=true; online.message=online.p1Points>=TARGET?'🏆 Jogador 1 venceu a partida!':'🏆 Jogador 2 venceu a partida!';
    }
    onlineClearTimer(); onlineRender(); onlineSend();
    if(!online.finished){setTimeout(()=>{if(!online||online.finished)return;online.handNumber++;online.first=online.first===1?2:1;onlineNewHand();onlineRender();onlineSend();onlineStartTimer();},1900);}
  }
  function onlineScore(){
    const r=online.tricks;
    if(r[0] && r[0]===r[1]) return r[0];
    if(r[0]===0 && r[1]) return r[1]; if(r[0] && r[1]===0) return r[0];
    if(r[0]&&r[1]&&r[0]!==r[1]) return r[2]||r[0];
    if(r[0]===0&&r[1]===0) return r[2]||0; return 0;
  }
  function onlinePower(c){ const idx=VALUES.findIndex(v=>v.name===online.vira.name); const mr=VALUES[(idx+1)%VALUES.length].rank; return c.rank===mr?100+c.suit.power:c.rank; }
  function onlinePlay(index,covered){
    if(!online||online.finished||online.done||online.waiting||online.turn!==onlineRole)return;
    const hand=onlineRole===1?online.p1Cards:online.p2Cards; if(!hand[index])return;
    if(covered && online.round===1)return;
    onlineClearTimer(); online.selected=null;
    const entry={card:hand.splice(index,1)[0],owner:onlineRole,covered:!!covered};
    if(online.table.length===0){online.table=[entry];online.turn=onlineRole===1?2:1;online.message='Carta jogada. Aguarde o adversário.';}
    else{online.table.push(entry); const a=online.table.find(x=>x.owner===1), b=online.table.find(x=>x.owner===2); const w=onlinePower(a.card)>onlinePower(b.card)?1:onlinePower(b.card)>onlinePower(a.card)?2:0; online.tricks[w===1?0:w===2?1:2]=w; online.message=w===onlineRole?'Você venceu esta rodada!':w===0?'Rodada empatada!':'O adversário venceu esta rodada!'; const hw=onlineScore(); online.turn=w||online.first; online.round=online.tricks.filter(Boolean).length+1; onlineRender(); onlineSend(); setTimeout(()=>{if(!online||online.finished)return;online.table=[]; if(hw){onlineEndHand(hw);return;} online.message=online.turn===onlineRole?'Sua vez. Escolha uma carta.':'Aguarde o adversário.';onlineRender();onlineSend();onlineStartTimer();},1150); return;}
    onlineRender(); onlineSend(); onlineStartTimer();
  }
  function onlineAction(action){
    if(onlineRole===1) onlineHandle(action,1); else if(onlineConn&&onlineConn.open) onlineConn.send({type:'action',action});
  }
  function onlineHandle(action,actor){
    if(!online || actor!==online.turn && !['accept','decline','raise'].includes(action)) return;
    if(action==='play'){onlinePlay(online.selected,false);return;} if(action==='covered'){onlinePlay(online.selected,true);return;}
    if(action==='truco' || action==='raise-now'){
      if(online.waiting || online.stake>=12 || actor!==online.turn)return;
      online.pending=NEXT_STAKE[online.stake]||12; online.waiting=true; online.caller=actor; online.message=actor===onlineRole?`Você pediu ${online.pending} tentos.`:'O adversário pediu aumento!'; onlineRender();onlineSend();return;
    }
    if(!online.waiting)return;
    const opponent=online.caller===1?2:1;
    if(action==='accept'){
      online.stake=online.pending;online.pending=null;online.waiting=false;online.message=actor===onlineRole?`Você aceitou! A mão vale ${online.stake} tentos.`:'O adversário aceitou. A mão vale '+online.stake+' tentos.';onlineRender();onlineSend();onlineStartTimer();return;
    }
    if(action==='decline'){onlineEndHand(opponent===onlineRole?onlineRole:online.caller, actor===onlineRole?'Você correu.':'O adversário correu.');return;}
    if(action==='raise'){
      if(actor!==online.caller || online.stake>=9)return;
      online.stake=online.pending;online.pending=NEXT_STAKE[online.stake]||12;online.caller=actor;online.message=actor===onlineRole?`Você aumentou para ${online.stake}.`:'O adversário aumentou para '+online.stake+'.';onlineRender();onlineSend();return;
    }
  }
  function onlineRender(){
    if(!online||!body)return;
    const myCards=onlineRole===1?online.p1Cards:online.p2Cards, oppCards=onlineRole===1?online.p2Cards:online.p1Cards;
    const myName=onlineRole===1?'Você':'Adversário', oppName=onlineRole===1?'Adversário':'Você';
    const p1=online.p1Points,p2=online.p2Points; const myPts=onlineRole===1?p1:p2, oppPts=onlineRole===1?p2:p1;
    const myTr=onlineRole===1?online.tricks[0]:online.tricks[1], oppTr=onlineRole===1?online.tricks[1]:online.tricks[0];
    const viraRed=online.vira.suit.red?'red':''; const mi=VALUES[(VALUES.findIndex(v=>v.name===online.vira.name)+1)%VALUES.length].name;
    const myTable=online.table.find(x=>x.owner===onlineRole), oppTable=online.table.find(x=>x.owner!==(onlineRole));
    let controls='';
    if(online.finished){
      controls=`<div class="result-banner"><strong>${myPts>=TARGET?'🏆 VOCÊ VENCEU!':'🤝 VOCÊ PERDEU'}</strong><p>Placar final: ${myPts} × ${oppPts}</p></div><div class="game-actions"><button class="game-btn btn-green" data-online-action="leave">SAIR DA PARTIDA</button></div>`;
    } else if(online.waiting){
      const isCaller=online.caller===onlineRole;
      controls=`<div class="hand-label">SUAS CARTAS · FICAM VISÍVEIS DURANTE O TRUCO</div><div class="hand">${myCards.map((c,i)=>handCardMarkupOnline(c,i)).join('')}</div><div class="call-panel"><strong>${isCaller?'Aguardando resposta do adversário.':`O adversário pediu ${online.pending}. O que você deseja fazer?`}</strong>${!isCaller?`<div class="game-actions"><button class="game-btn btn-green" data-online-action="accept">ACEITAR</button><button class="game-btn btn-red" data-online-action="decline">CORRER</button>${online.stake<9?`<button class="game-btn btn-gold" data-online-action="raise">AUMENTAR PARA ${online.pending}</button>`:''}</div>`:''}</div>`;
    } else {
      const sel=online.selected!==null;
      controls=`<div class="card-timer ${online.cardTime<=5?'urgent':''}"><span>⏱️</span><strong>${online.cardTime||15}s</strong><small>para jogar</small></div><div class="hand-label">SUAS CARTAS · TOQUE PARA SELECIONAR</div><div class="hand">${myCards.map((c,i)=>handCardMarkupOnline(c,i)).join('')}</div><div class="game-actions">${sel?`<button class="game-btn btn-green" data-online-action="play">JOGAR CARTA</button>`:''}${sel&&online.round>=2?`<button class="game-btn btn-dark" data-online-action="covered">JOGAR ENCUBERTA</button>`:''}${online.turn===onlineRole&&online.stake===1?`<button class="game-btn btn-gold" data-online-action="truco">TRUCO!</button>`:''}${online.turn===onlineRole&&online.stake>1?`<button class="game-btn btn-gold" data-online-action="raise-now">AUMENTAR PARA ${NEXT_STAKE[online.stake]||12}</button>`:''}</div>`;
    }
    body.innerHTML=`<div class="game-shell"><div class="scoreboard"><div class="score-box"><span>${escapeHTML(myName)}</span><strong>${myPts}</strong><small>${myTr} rodada(s) nesta mão</small></div><div class="score-box"><span>TENTOS</span><strong>${online.stake}</strong><small>vale ${online.stake}</small></div><div class="score-box"><span>${escapeHTML(oppName)}</span><strong>${oppPts}</strong><small>${oppTr} rodada(s) nesta mão</small></div></div><div class="table-wrap"><div class="table-top"><div class="player-badge opponent-badge"><span class="player-face">👤</span><span>${escapeHTML(oppName)}</span></div><span class="table-meta">MÃO ${online.handNumber} · ${Math.min(online.round,3)}/3</span></div><div class="opponent-hand">${oppCards.map(()=>'<span class="mini-back"></span>').join('')}</div><div class="play-area"><div class="played-slot opponent-play">${oppTable?`<label>${escapeHTML(oppName.toUpperCase())}</label>${cardMarkup(oppTable.card,'',oppTable.covered)}`:'<div class="empty-slot"></div>'}</div><div class="played-center"><div class="center-deck-vira"><div class="deck-stack"><span></span><span></span><b>🂠</b><small>BARALHO</small></div><div class="vira-block"><span class="vira-row">VIRA</span><div class="vira-card ${viraRed}"><small>${online.vira.name}</small>${online.vira.suit.symbol}</div><em>MANILHA: ${mi}</em></div></div></div><div class="played-slot player-play">${myTable?`<label>VOCÊ</label>${cardMarkup(myTable.card,'',myTable.covered)}`:'<div class="empty-slot"></div>'}</div></div><p class="table-message">${escapeHTML(online.message)}</p><div class="player-area"><span class="table-meta">ONLINE · ${escapeHTML(onlineRole===1?'CRIADOR':'CONVIDADO')}</span><div class="player-badge"><span class="player-face">L</span><span>${escapeHTML(myName)}</span></div></div></div>${controls}<p class="round-info">Partida online · pontos virtuais · vence quem chegar a ${TARGET} tentos</p></div>`;
    body.querySelectorAll('[data-card]').forEach(b=>b.addEventListener('click',()=>{online.selected=Number(b.dataset.card);onlineRender();}));
    body.querySelectorAll('[data-online-action]').forEach(b=>b.addEventListener('click',()=>{const a=b.dataset.onlineAction;if(a==='leave'){if(onlineConn)onlineConn.close();if(peer)peer.destroy();online=null;onlineRole=null;onlineClearTimer();dialog.close();return;}onlineAction(a);}));
  }
  function handCardMarkupOnline(card,index){const red=card.suit.red?'red':'';const man=onlinePower(card)>=100?' manilha':'';const sel=online.selected===index?' selected':'';return `<button class="hand-card ${red}${man}${sel}" data-card="${index}"><small>${escapeHTML(card.name)}<br>${card.suit.symbol}</small><span>${card.suit.symbol}</span>${man?'<i class="manilha-tag">MANILHA</i>':''}</button>`;}
  function makeOnlineGame(){return {p1Points:0,p2Points:0,handNumber:1,first:1,p1Cards:[],p2Cards:[],vira:null,table:[],tricks:[0,0,0],round:1,turn:1,stake:1,waiting:false,pending:null,caller:null,message:'',selected:null,cardTime:15,done:false,finished:false};}
  function onlineLobby(){
    if(!dialog||!body)return;
    title.textContent='Jogar com amigo';
    body.innerHTML=`<div class="online-panel"><h3>Partida entre jogadores</h3><p>Crie uma sala e envie o código para a pessoa de confiança. Ou entre usando um código recebido.</p><div class="online-actions"><button class="game-btn btn-green" id="createRoom">CRIAR SALA</button></div><div class="room-code" id="roomCode">------</div><p id="onlineStatus" class="online-status">Aguardando escolha.</p><input id="joinCode" class="room-input" maxlength="8" placeholder="CÓDIGO DA SALA"><div class="online-actions"><button class="game-btn btn-gold" id="joinRoom">ENTRAR NA SALA</button></div><p class="round-info">Teste P2P: a partida usa conexão direta entre os dois celulares.</p></div>`;
    if(!dialog.open)dialog.showModal();
    $('createRoom').onclick=()=>createRoom(); $('joinRoom').onclick=()=>joinRoom();
  }
  function createRoom(){
    if(peer)try{peer.destroy();}catch(_){ }
    const code=Math.random().toString(36).slice(2,8).toUpperCase(); const status=$('onlineStatus'), rc=$('roomCode'); if(status)status.textContent='Criando sala…';
    peer=new Peer('TA-'+code); peer.on('open',()=>{if(rc)rc.textContent=code;if(status)status.textContent='Sala criada. Envie este código para o adversário.';onlineRole=1;peer.on('connection',c=>{onlineConn=c;setupOnlineConnection();});}); peer.on('error',e=>{if(status)status.textContent='Erro na sala: '+e.type;});
  }
  function joinRoom(){const code=( $('joinCode')?.value||'').trim().toUpperCase();if(!code)return;const status=$('onlineStatus');if(status)status.textContent='Conectando…';if(peer)try{peer.destroy();}catch(_){ } peer=new Peer();peer.on('open',()=>{onlineRole=2;onlineConn=peer.connect('TA-'+code,{reliable:true});setupOnlineConnection();});peer.on('error',e=>{if(status)status.textContent='Não foi possível conectar: '+e.type;});}
  function setupOnlineConnection(){
    const status=$('onlineStatus'); if(onlineConn)onlineConn.on('open',()=>{if(status)status.textContent='Conectado! A partida vai começar.';if(onlineRole===1){online=makeOnlineGame();onlineNewHand();onlineRender();onlineSend();onlineStartTimer();}});
    onlineConn.on('data',msg=>{if(msg.type==='state'&&onlineRole===2){if(!online)online=makeOnlineGame();Object.assign(online,msg.state);online.p2Cards=msg.hand||[];online.selected=null;onlineRender();if(online.turn===2&&!online.waiting&&!online.done)onlineStartTimer();}else if(msg.type==='action'&&onlineRole===1){onlineHandle(msg.action,2);}});
    onlineConn.on('close',()=>{if(status)status.textContent='O adversário saiu da partida.';if(online)online.message='O adversário encerrou a conexão.';onlineRender();});
  }

  function showInfo(name, message) {
    if (!dialog || !body || !title) return;
    title.textContent = name;
    body.innerHTML = `<div class="info-content"><h3>${escapeHTML(name)}</h3><p>${escapeHTML(message)}</p><button class="game-btn btn-gold" id="infoOk">ENTENDI</button></div>`;
    $("infoOk").addEventListener("click", () => dialog.close());
    if (!dialog.open) dialog.showModal();
  }

  if ($("closeDialog")) $("closeDialog").addEventListener("click", () => {
    clearTimers();
    if (dialog && dialog.open) dialog.close();
    game = null;
  });
  if ($("playBtn")) $("playBtn").addEventListener("click", startGame);
  if ($("onlineBtn")) $("onlineBtn").addEventListener("click", onlineLobby);
  if ($("profileBtn")) $("profileBtn").addEventListener("click", () =>
    showInfo("Seu perfil", `Visitante · Nível ${Math.max(1, Math.floor(stats.wins / 3) + 1)} · ${stats.wins} vitória(s).`));
  document.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    if (mode === "Paulista" || mode === "Treino") startGame();
    else if (mode === "Online") onlineLobby();
    else showInfo("Truco Mineiro", "Este modo será disponibilizado em uma próxima atualização. Por enquanto, aproveite o Truco Paulista.");
  }));
  document.querySelectorAll("[data-page]").forEach(btn => btn.addEventListener("click", () => {
    document.querySelectorAll(".bottom-nav button").forEach(x => x.classList.remove("active"));
    if (btn.closest(".bottom-nav")) btn.classList.add("active");
    const pages = {
      "Início":"Você está na página inicial.",
      "Torneios":"Os torneios serão ativados em uma próxima atualização.",
      "Ranking":"O ranking será conectado quando o sistema de jogadores online estiver disponível.",
      "Amigos":"A área de amigos será ativada em uma próxima atualização.",
      "Clãs":"Os clãs serão ativados em uma próxima atualização.",
      "Menu":"Perfil, histórico e configurações serão adicionados aqui."
    };
    showInfo(btn.dataset.page, pages[btn.dataset.page] || "Em construção.");
  }));
  saveStats();

  window.TrucoArenaDebug = Object.freeze({
    target: TARGET, nextStake,
    scoreHand: results => scoreHand(results.slice()),
    getState: () => game ? JSON.parse(JSON.stringify({
      playerPoints:game.playerPoints, botPoints:game.botPoints, stake:game.stake,
      handNumber:game.handNumber, playerTricks:game.playerTricks, botTricks:game.botTricks,
      round:game.round, handDone:game.handDone, finished:game.finished,
      waitingResponse:game.waitingResponse
    })) : null
  });
})();
