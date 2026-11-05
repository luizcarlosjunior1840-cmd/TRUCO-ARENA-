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
  const TRICK_REVEAL_MS = 1500;
  const AUTO_NEXT_HAND_MS = 1900;
  const CARD_TURN_SECONDS = 15;

  let game = null;
  let handTimer = null;
  let botTimer = null;
  let trickTimer = null;
  let cardTimer = null;
  let cardInterval = null;
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
    [handTimer, botTimer, trickTimer, cardTimer].forEach(t => { if (t !== null) clearTimeout(t); });
    if (cardInterval !== null) clearInterval(cardInterval);
    handTimer = botTimer = trickTimer = cardTimer = cardInterval = null;
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
    game.revealOnly = false;
    game.selectedCardIndex = null;
    game.timerRemaining = CARD_TURN_SECONDS;
    game.raiseAvailableTo = null;
    game.message = game.turn === "player" ? "Sua vez. Escolha uma carta." : "O computador começa esta mão.";
  }
  function startGame() {
    clearTimers();
    game = {
      playerPoints: 0, botPoints: 0, stake: 1,
      playerHands: 0, botHands: 0, finished: false,
      handNumber: 1, firstPlayer: "player",
      playerTricks: 0, botTricks: 0,
      trucoAskedThisHand: false, statsRecorded: false,
      revealOnly: false, raiseAvailableTo: null,
      selectedCardIndex: null, timerRemaining: CARD_TURN_SECONDS
    };
    dealHand();
    renderGame();
    if (dialog && !dialog.open) dialog.showModal();
    if (game.turn === "bot") scheduleBotOpening();
    else startCardTimer();
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
  function cardMarkup(card, extraClass = "") {
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
    const selected = game.selectedCardIndex === index ? " selected" : "";
    return `<button class="hand-card ${red}${manilha}${selected}" data-card="${index}" aria-label="Selecionar ${escapeHTML(card.name)} de ${escapeHTML(card.suit.name)}${isManilha(card) ? ', manilha' : ''}">
      <small>${escapeHTML(card.name)}<br>${card.suit.symbol}</small><span>${card.suit.symbol}</span>
      ${isManilha(card) ? '<i class="manilha-tag">MANILHA</i>' : ""}
    </button>`;
  }
  function buttonMarkup(label, action, cls = "btn-gold", disabled = false) {
    return `<button class="game-btn ${cls}" data-action="${action}"${disabled ? " disabled" : ""}>${label}</button>`;
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
    stopCardTimer();
    game.message = game.playerPoints >= TARGET ? "🏆 Você venceu a partida!" : "O computador venceu a partida.";
    if (!game.statsRecorded) {
      game.statsRecorded = true;
      if (game.playerPoints >= TARGET) { stats.wins++; stats.points += 20; }
      else { stats.losses++; stats.points = Math.max(0, stats.points - 5); }
      saveStats();
    }
    playSound(game.playerPoints >= TARGET ? "win" : "lose");
    return true;
  }

  function finishHand(winner, reason) {
    if (game.handDone || game.finished) return;
    stopCardTimer();
    game.handDone = true;
    game.handWinner = winner;
    game.waitingResponse = false;
    game.pendingStake = null;
    game.raiseAvailableTo = null;
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
    playSound("fold");
    finishHand(winner, winner === 1
      ? `O computador correu. Você ganhou ${game.stake} tento(s).`
      : `Você correu. O computador ganhou ${game.stake} tento(s).`);
  }

  function botChooseCard() {
    if (!game.botCards.length) return -1;
    const playerEntry = game.tableCards.find(x => x.owner === 1);
    const options = game.botCards.map((card, index) => ({ index, power: cardPower(card) }))
      .sort((a, b) => a.power - b.power);
    if (!playerEntry) return Math.random() < 0.58 ? options[0].index : options[Math.floor(options.length / 2)].index;
    const target = cardPower(playerEntry.card);
    const winning = options.filter(x => x.power > target);
    return winning.length ? winning[0].index : options[0].index;
  }

  function selectCard(index) {
    if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "player" || !game.playerCards[index]) return;
    game.selectedCardIndex = index;
    renderGame();
  }

  function playSelectedCard(covered = false) {
    if (!game || game.selectedCardIndex === null) return;
    playCard(game.selectedCardIndex, covered);
  }

  function playCard(index, covered = false) {
    if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "player" || !game.playerCards[index]) return;
    if (covered && game.round === 1) return;
    const current = game;
    stopCardTimer();
    const card = game.playerCards.splice(index, 1)[0];
    game.selectedCardIndex = null;
    const botAlreadyPlayed = game.tableCards.some(x => x.owner === 2);
    if (botAlreadyPlayed) {
      game.tableCards.push({ card, owner: 1, covered: !!covered });
      playSound("card");
      resolveTrick(current);
      return;
    }
    game.tableCards = [{ card, owner: 1, covered: !!covered }];
    game.lastLead = "player";
    game.turn = "bot";
    game.message = covered ? "Você jogou a carta encoberta. O computador está pensando..." : "Você jogou. O computador está pensando...";
    playSound("card");
    renderGame();
    botTimer = setTimeout(() => {
      if (game !== current || game.finished || game.handDone || game.turn !== "bot") return;
      const i = botChooseCard();
      if (i < 0 || !game.botCards[i]) { finishHand(0, "Não foi possível concluir a rodada."); return; }
      game.tableCards.push({ card: game.botCards.splice(i, 1)[0], owner: 2, covered: false });
      playSound("card");
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
    game.message = winner === 1 ? "Você venceu esta rodada!" : winner === 2 ? "O computador venceu esta rodada!" : "Rodada empatada!";
    game.round = game.trickResults.length;
    const handWinner = scoreHand(game.trickResults);
    game.revealOnly = true;
    renderGame();
    trickTimer = setTimeout(() => {
      if (game !== current || game.finished || game.handDone) return;
      game.revealOnly = false;
      if (handWinner !== null) { finishHand(handWinner); return; }
      game.tableCards = [];
      game.turn = winner === 1 ? "player" : winner === 2 ? "bot" : game.lastLead;
      game.lastLead = game.turn;
      game.selectedCardIndex = null;
      if (game.turn === "bot") {
        renderGame();
        scheduleBotOpening();
      } else {
        renderGame();
        startCardTimer();
        scheduleBotTrucoCheck();
      }
    }, TRICK_REVEAL_MS);
  }

  function scheduleBotOpening() {
    stopCardTimer();
    if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "bot") return;
    const current = game;
    botTimer = setTimeout(() => {
      if (game !== current || game.finished || game.handDone || game.waitingResponse || game.turn !== "bot") return;
      const i = botChooseCard();
      if (i < 0) return;
      game.tableCards = [{ card: game.botCards.splice(i, 1)[0], owner: 2, covered: false }];
      game.lastLead = "bot";
      game.turn = "player";
      game.message = "O computador abriu a rodada. Sua vez.";
      playSound("card");
      renderGame();
      startCardTimer();
      scheduleBotTrucoCheck();
    }, 650);
  }

  function startCardTimer() {
    stopCardTimer();
    if (!game || game.finished || game.handDone || game.waitingResponse || game.turn !== "player") return;
    if (!game.playerCards.length) return;
    game.timerRemaining = CARD_TURN_SECONDS;
    updateTimerUI();
    cardInterval = setInterval(() => {
      if (!game || game.turn !== "player" || game.waitingResponse || game.handDone || game.finished) return stopCardTimer();
      game.timerRemaining = Math.max(0, game.timerRemaining - 1);
      updateTimerUI();
    }, 1000);
    cardTimer = setTimeout(() => {
      if (!game || game.turn !== "player" || game.waitingResponse || game.handDone || game.finished) return;
      stopCardTimer();
      const autoIndex = 0;
      game.selectedCardIndex = autoIndex;
      game.message = "Tempo esgotado! A primeira carta foi jogada automaticamente.";
      playSound("timeout");
      renderGame();
      setTimeout(() => {
        if (game && game.turn === "player" && !game.handDone && !game.waitingResponse) playCard(autoIndex, false);
      }, 180);
    }, CARD_TURN_SECONDS * 1000);
  }

  function stopCardTimer() {
    if (cardTimer !== null) clearTimeout(cardTimer);
    if (cardInterval !== null) clearInterval(cardInterval);
    cardTimer = cardInterval = null;
  }

  function updateTimerUI() {
    const el = $("cardTimer");
    if (!el || !game) return;
    el.textContent = `${game.timerRemaining}s`;
    el.classList.toggle("urgent", game.timerRemaining <= 5);
  }

  function nextStake(stake) { return NEXT_STAKE[stake] || 12; }
  function botStrength() {
    return game.botCards.reduce((sum, c) => sum + cardPower(c), 0);
  }

  function requestTruco() {
    if (!game || game.finished || game.handDone || game.waitingResponse || game.stake >= 12) return;
    const proposed = nextStake(game.stake);
    if (proposed > 12) return;
    stopCardTimer();
    game.waitingResponse = true;
    game.botAsked = false;
    game.pendingStake = proposed;
    game.message = `Você pediu truco! A mão pode valer ${proposed} tentos.`;
    playSound("truco");
    animateCall("truco");
    renderGame();
    const current = game;
    botTimer = setTimeout(() => {
      if (game !== current || !game.waitingResponse || game.botAsked) return;
      const strength = botStrength();
      const canRaise = proposed < 12 && strength >= 205 && Math.random() < 0.28;
      const accept = strength >= 105 || Math.random() < 0.52;
      if (canRaise) {
        game.stake = proposed;
        game.pendingStake = nextStake(game.stake);
        game.botAsked = true;
        game.message = `O computador aumentou para ${game.pendingStake}!`;
        playSound("raise");
        animateCall(`6/9/12`);
      } else if (accept) {
        game.stake = proposed;
        game.pendingStake = null;
        game.waitingResponse = false;
        game.botAsked = false;
        game.raiseAvailableTo = game.stake < 12 ? nextStake(game.stake) : null;
        game.message = `O computador aceitou! A mão vale ${game.stake} tentos.`;
        renderGame();
        startCardTimer();
      } else {
        game.waitingResponse = false;
        game.pendingStake = null;
        game.botAsked = false;
        awardFold(1);
      }
      if (game && !game.handDone && game.waitingResponse) renderGame();
    }, 700);
  }

  function botCallsTruco() {
    if (!game || game.finished || game.handDone || game.waitingResponse || game.stake >= 12) return false;
    const strength = botStrength();
    const scoreBehind = game.botPoints < game.playerPoints;
    const chance = strength >= 210 ? 0.72 : strength >= 115 ? 0.43 : 0.16;
    const shouldCall = Math.random() < (scoreBehind ? Math.min(0.82, chance + 0.12) : chance);
    if (!shouldCall) return false;
    stopCardTimer();
    game.waitingResponse = true;
    game.botAsked = true;
    game.pendingStake = nextStake(game.stake);
    game.message = `O computador pediu truco para ${game.pendingStake}!`;
    playSound("truco");
    animateCall("truco");
    renderGame();
    return true;
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
      game.raiseAvailableTo = game.stake < 12 ? nextStake(game.stake) : null;
      game.message = `Você aceitou! A mão vale ${game.stake} tentos.`;
      playSound("accept");
      animateCall("aceitou");
      renderGame();
      startCardTimer();
      return;
    }
    game.pendingStake = null;
    game.waitingResponse = false;
    game.botAsked = false;
    playSound("fold");
    animateCall("correu");
    awardFold(2);
  }

  function respondTrucoRaise() {
    if (!game || game.finished || game.handDone || !game.waitingResponse || !game.botAsked || game.stake >= 12) return;
    const newStake = game.pendingStake;
    game.stake = newStake;
    game.pendingStake = nextStake(game.stake);
    game.botAsked = false;
    game.waitingResponse = true;
    game.message = `Você aumentou para ${game.pendingStake}. O computador precisa responder.`;
    playSound("raise");
    animateCall(String(game.pendingStake));
    renderGame();
    const current = game;
    const accept = botStrength() >= 125 || Math.random() < 0.38;
    botTimer = setTimeout(() => {
      if (game !== current || !game.waitingResponse || game.botAsked) return;
      if (accept) {
        game.stake = game.pendingStake;
        game.pendingStake = null;
        game.waitingResponse = false;
        game.botAsked = false;
        game.raiseAvailableTo = game.stake < 12 ? nextStake(game.stake) : null;
        game.message = `O computador aceitou! A mão vale ${game.stake} tentos.`;
        playSound("accept");
        renderGame();
        startCardTimer();
      } else {
        game.pendingStake = null;
        game.waitingResponse = false;
        game.botAsked = false;
        awardFold(1);
      }
    }, 700);
  }

  function playerRaise() {
    if (!game || game.finished || game.handDone || game.waitingResponse || !game.raiseAvailableTo || game.stake >= 12) return;
    const next = game.raiseAvailableTo;
    game.raiseAvailableTo = null;
    game.waitingResponse = true;
    game.botAsked = false;
    game.pendingStake = next;
    stopCardTimer();
    game.message = `Você aumentou para ${next}. O computador precisa responder.`;
    playSound("raise");
    animateCall(String(next));
    renderGame();
    const current = game;
    const accept = botStrength() >= 125 || Math.random() < 0.38;
    const counterRaise = game.pendingStake < 12 && botStrength() >= 205 && Math.random() < 0.34;
    botTimer = setTimeout(() => {
      if (game !== current || !game.waitingResponse) return;
      if (counterRaise) {
        game.stake = game.pendingStake;
        game.pendingStake = nextStake(game.stake);
        game.botAsked = true;
        game.waitingResponse = true;
        game.message = `O computador aumentou para ${game.pendingStake}!`;
        playSound("raise");
        animateCall(String(game.pendingStake));
        renderGame();
      } else if (accept) {
        game.stake = game.pendingStake;
        game.pendingStake = null;
        game.waitingResponse = false;
        game.botAsked = false;
        game.raiseAvailableTo = game.stake < 12 ? nextStake(game.stake) : null;
        game.message = `O computador aceitou! A mão vale ${game.stake} tentos.`;
        playSound("accept");
        renderGame();
        startCardTimer();
      } else {
        game.pendingStake = null;
        game.waitingResponse = false;
        game.botAsked = false;
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
    else startCardTimer();
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
      const q = game.botAsked
        ? `O computador pediu ${game.pendingStake}. O que você deseja fazer?`
        : `Você pediu aumento para ${game.pendingStake}. Aguarde a resposta.`;
      controls = `<div class="call-panel"><strong>${escapeHTML(q)}</strong>
        ${game.botAsked ? `<div class="game-actions">
          ${buttonMarkup("ACEITAR", "accept", "btn-green")}
          ${buttonMarkup("CORRER", "decline", "btn-red")}
          ${game.stake < 12 ? buttonMarkup("AUMENTAR", "raise", "btn-gold") : ""}
        </div>` : `<p>O computador está pensando…</p>`}
      </div>`;
    } else if (game.turn === "bot") {
      controls = `<div class="call-panel"><strong>O computador está jogando...</strong><p>Aguarde sua vez.</p></div>`;
    } else {
      const canPlay = game.selectedCardIndex !== null;
      const canCover = canPlay && game.round >= 2;
      const canRaise = !!game.raiseAvailableTo && game.stake < 12;
      controls = `<div class="timer-row"><span>⏱️ Tempo para jogar</span><strong id="cardTimer">${game.timerRemaining}s</strong></div>
        <div class="hand-label">SUAS CARTAS · TOQUE PARA SELECIONAR</div>
        <div class="hand">${game.playerCards.map(handCardMarkup).join("")}</div>
        <div class="game-actions main-actions">
          ${buttonMarkup("JOGAR CARTA", "play", "btn-green", !canPlay)}
          ${canCover ? buttonMarkup("JOGAR ENCOBERTA", "play-covered", "btn-light", !canPlay) : ""}
          ${game.stake < 12 && !game.waitingResponse ? buttonMarkup("TRUCO!", "truco", "btn-gold") : ""}
          ${canRaise ? buttonMarkup(`AUMENTAR PARA ${game.raiseAvailableTo}`, "player-raise", "btn-gold") : ""}
        </div>`;
    }

    const manilhaName = VALUES[(VALUES.findIndex(v => v.name === game.vira.name) + 1) % VALUES.length].name;
    body.innerHTML = `<div class="game-shell">
      <div class="scoreboard">
        <div class="score-box"><span>VOCÊ</span><strong>${game.playerPoints}</strong><small>${game.playerTricks} rodada(s) nesta mão</small></div>
        <div class="score-box stake-box"><span>TENTOS / MÃO</span><strong>${game.stake}</strong><small>vale ${game.stake}</small></div>
        <div class="score-box"><span>COMPUTADOR</span><strong>${game.botPoints}</strong><small>${game.botTricks} rodada(s) nesta mão</small></div>
      </div>
      <div class="table-wrap">
        <div class="table-top">
          <div class="player-badge opponent-badge"><span class="player-face">🤖</span><span>Computador</span></div>
          <span class="table-meta">MÃO ${game.handNumber} · ${Math.min(game.round,3)}/3</span>
        </div>
        <div class="opponent-hand">${game.botCards.map(() => '<span class="mini-back"></span>').join("") || '<span class="round-info">Sem cartas</span>'}</div>
        <div class="deck-vira-row">
          <div class="deck-stack" aria-label="Baralho"><span></span><span></span><b>🂠</b><small>BARALHO</small></div>
          <div class="vira-block"><span class="vira-row">VIRA</span>
            <div class="vira-card ${viraRed}"><small>${game.vira.name}</small>${game.vira.suit.symbol}</div>
            <em>MANILHA: ${manilhaName}</em>
          </div>
        </div>
        <div class="play-area">
          <div class="played-slot">${bCard ? `<label>COMPUTADOR</label>${bCard.covered ? '<div class="played-card card-back-table"><span>🂠</span></div>' : cardMarkup(bCard.card)}` : '<div class="empty-slot"></div>'}</div>
          <div class="played-slot">${pCard ? `<label>VOCÊ</label>${pCard.covered && !game.revealOnly ? '<div class="played-card card-back-table"><span>🂠</span></div>' : cardMarkup(pCard.card)}` : '<div class="empty-slot"></div>'}</div>
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
        case "play": playSelectedCard(false); break;
        case "play-covered": playSelectedCard(true); break;
        case "truco": requestTruco(); break;
        case "accept": respondTruco(true); break;
        case "decline": respondTruco(false); break;
        case "raise": respondTrucoRaise(); break;
        case "player-raise": playerRaise(); break;
        case "restart": startGame(); break;
      }
    }));
    updateTimerUI();
  }

  function escapeHTML(v) {
    return String(v).replace(/[&<>"']/g, c => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[c]));
  }

  function playSound(type) {
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      const now = ctx.currentTime;
      const patterns = {
        card: [[520,0,.08],[720,.06,.09]],
        truco: [[330,0,.12],[520,.12,.12],[760,.24,.16]],
        accept: [[500,0,.09],[700,.1,.12]],
        fold: [[420,0,.12],[280,.12,.18]],
        raise: [[420,0,.09],[560,.09,.09],[760,.18,.14]],
        timeout: [[300,0,.18],[220,.18,.22]],
        win: [[520,0,.1],[660,.1,.1],[820,.2,.18]],
        lose: [[300,0,.15],[220,.15,.2]]
      };
      (patterns[type] || patterns.card).forEach(([freq, offset, duration]) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = type === "card" ? "triangle" : "sine";
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(0.0001, now + offset);
        gain.gain.exponentialRampToValueAtTime(0.08, now + offset + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + offset + duration);
        osc.connect(gain).connect(ctx.destination);
        osc.start(now + offset);
        osc.stop(now + offset + duration + 0.02);
      });
      setTimeout(() => { try { ctx.close(); } catch (_) {} }, 900);
    } catch (_) {}
  }

  function animateCall(text) {
    const shell = body && body.querySelector(".game-shell");
    if (!shell) return;
    const el = document.createElement("div");
    el.className = "call-animation";
    el.textContent = String(text).toUpperCase();
    shell.appendChild(el);
    requestAnimationFrame(() => el.classList.add("show"));
    setTimeout(() => el.remove(), 1100);
  }

  function injectGameStyles() {
    if ($("trucoArenaExtraStyles")) return;
    const style = document.createElement("style");
    style.id = "trucoArenaExtraStyles";
    style.textContent = `
      .hand-card.selected{transform:translateY(-8px) scale(1.03);border-color:#4ee39b;box-shadow:0 0 0 3px #4ee39b55,0 9px 18px #001b10c9}
      .hand-card{cursor:pointer;touch-action:manipulation}
      .timer-row{display:flex;align-items:center;justify-content:center;gap:8px;margin:7px 0 3px;color:#f1d99f;font-size:10px;font-weight:800}
      .timer-row strong{min-width:42px;text-align:center;border:1px solid #d8b968;border-radius:999px;padding:5px 8px;background:#14251c;color:#fff3bd;font-size:13px}
      .timer-row strong.urgent{color:#ff7373;border-color:#ff7373;animation:timerPulse .55s ease-in-out infinite alternate}
      .btn-light{background:linear-gradient(135deg,#f5f5f0,#d9ded9);color:#17211c}
      .main-actions{margin-top:7px}
      .game-btn:disabled{opacity:.38;filter:saturate(.45);cursor:not-allowed}
      .card-back-table{background:repeating-linear-gradient(135deg,#7b1425 0,#7b1425 6px,#a51f38 6px,#a51f38 10px)!important;border-color:#d9a76c!important;color:#f4dfad!important}
      .card-back-table span{font-size:27px}
      .call-animation{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(.55);opacity:0;z-index:20;pointer-events:none;padding:11px 20px;border-radius:14px;background:linear-gradient(135deg,#f2d47d,#b98b36);color:#182018;font-weight:1000;font-size:22px;letter-spacing:1px;box-shadow:0 0 30px #f4d27b99,0 8px 20px #001b1099}
      .call-animation.show{animation:callPop 1.05s ease-out forwards}
      .table-wrap{position:relative;overflow:hidden}
      @keyframes timerPulse{from{transform:scale(1)}to{transform:scale(1.08)}}
      @keyframes callPop{0%{opacity:0;transform:translate(-50%,-50%) scale(.55)}18%{opacity:1;transform:translate(-50%,-50%) scale(1.08)}72%{opacity:1;transform:translate(-50%,-56%) scale(1)}100%{opacity:0;transform:translate(-50%,-70%) scale(1.08)}}
      @media(max-width:520px){.game-btn{min-width:94px;padding:10px 9px;font-size:9px}.call-animation{font-size:19px}}
    `;
    document.head.appendChild(style);
  }

  function showInfo(name, message) {
    if (!dialog || !body || !title) return;
    title.textContent = name;
    body.innerHTML = `<div class="info-content"><h3>${escapeHTML(name)}</h3><p>${escapeHTML(message)}</p><button class="game-btn btn-gold" id="infoOk">ENTENDI</button></div>`;
    $("infoOk").addEventListener("click", () => dialog.close());
    if (!dialog.open) dialog.showModal();
  }

  injectGameStyles();
  if ($("closeDialog")) $("closeDialog").addEventListener("click", () => {
    clearTimers();
    if (dialog && dialog.open) dialog.close();
    game = null;
  });
  if ($("playBtn")) $("playBtn").addEventListener("click", startGame);
  if ($("profileBtn")) $("profileBtn").addEventListener("click", () => showInfo("Seu perfil", `Visitante · Nível ${Math.max(1, Math.floor(stats.wins / 3) + 1)} · ${stats.wins} vitória(s).`));
  document.querySelectorAll("[data-mode]").forEach(btn => btn.addEventListener("click", () => {
    const mode = btn.dataset.mode;
    if (mode === "Paulista" || mode === "Treino") startGame();
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
    target: TARGET,
    nextStake,
    scoreHand: results => scoreHand(results.slice()),
    getState: () => game ? JSON.parse(JSON.stringify({
      playerPoints:game.playerPoints, botPoints:game.botPoints, stake:game.stake,
      handNumber:game.handNumber, playerTricks:game.playerTricks, botTricks:game.botTricks,
      round:game.round, handDone:game.handDone, finished:game.finished,
      waitingResponse:game.waitingResponse, raiseAvailableTo:game.raiseAvailableTo,
      timerRemaining:game.timerRemaining
    })) : null
  });
})();
