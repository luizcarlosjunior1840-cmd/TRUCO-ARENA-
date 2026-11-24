"use strict";
/* Truco Arena — música de fundo, efeitos de mesa e voz. Tudo gerado no aparelho (sem arquivos de áudio). */
window.FX = (() => {
  let ctx = null, music = null, timer = null, mode = 0, step = 0; // 0 tudo, 1 sem música, 2 mudo
  try { const m = parseInt(localStorage.getItem("trucoFxMode"), 10); if (m >= 0 && m <= 2) mode = m; } catch (_) {}
  const icons = ["🔊", "🔉", "🔇"];
  // Se existirem arquivos de áudio na raiz do site, eles têm prioridade. Sem eles, usa os sons gerados.
  const FILES = { card: "carta.mp3", truco: "truco.mp3", seis: "seis.mp3", nove: "nove.mp3", doze: "doze.mp3", aceito: "aceito.mp3", correu: "correu.mp3", music: "musica.mp3" };
  const clip = {};
  Object.keys(FILES).forEach(k => {
    try {
      const a = new Audio(); a.preload = "auto";
      if (k === "music") { a.loop = true; a.volume = 0.35; }
      a.addEventListener("canplaythrough", () => { clip[k] = a; }, { once: true });
      a.addEventListener("error", () => { clip[k] = null; }, { once: true });
      a.src = FILES[k];
    } catch (_) {}
  });
  function play(k, vol) {
    const a = clip[k]; if (!a || mode === 2) return false;
    try { a.currentTime = 0; a.volume = vol || 1; a.play().catch(() => {}); return true; } catch (_) { return false; }
  }
  const hz = m => 440 * Math.pow(2, (m - 69) / 12);
  function ensure() {
    if (!ctx) {
      try {
        const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
        ctx = new C(); music = ctx.createGain(); music.gain.value = 0.5; music.connect(ctx.destination);
      } catch (_) { ctx = null; return null; }
    }
    if (ctx.state === "suspended") ctx.resume().catch(() => {});
    return ctx;
  }
  function tone(dest, m, t, d, type, v, a) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type; o.frequency.value = hz(m);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(v, t + (a || 0.02)); g.gain.exponentialRampToValueAtTime(0.0001, t + d);
    o.connect(g); g.connect(dest); o.start(t); o.stop(t + d + 0.05);
  }
  const PROG = [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]];
  function bar() {
    if (!ctx || mode !== 0) return;
    const t = ctx.currentTime + 0.05, c = PROG[step++ % 4];
    c.forEach(n => tone(music, n - 12, t, 3.6, "sine", 0.05, 0.6));
    [0, 1, 2, 1, 2, 1, 0, 1].forEach((k, i) => tone(music, c[k] + 12, t + i * 0.45, 0.7, "triangle", 0.03));
  }
  function startMusic() {
    if (mode !== 0) return;
    if (clip.music) { clip.music.play().catch(() => {}); return; }
    if (!ensure()) return;
    music.gain.setTargetAtTime(0.5, ctx.currentTime, 0.1);
    if (!timer) { bar(); timer = setInterval(bar, 3600); }
  }
  function stopMusic() {
    if (clip.music) clip.music.pause();
    clearInterval(timer); timer = null;
    if (ctx && music) music.gain.setTargetAtTime(0, ctx.currentTime, 0.08);
  }
  // Carta batendo na mesa: estalo de ruído + pancada grave.
  function thump(v, delay) {
    if (mode === 2 || !ensure()) return;
    const t = ctx.currentTime + (delay || 0), vol = v || 1;
    const len = Math.floor(ctx.sampleRate * 0.09), buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    const n = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    n.buffer = buf; f.type = "lowpass"; f.frequency.value = 1400; g.gain.value = 0.5 * vol;
    n.connect(f); f.connect(g); g.connect(ctx.destination); n.start(t);
    const o = ctx.createOscillator(), og = ctx.createGain();
    o.frequency.setValueAtTime(150, t); o.frequency.exponentialRampToValueAtTime(55, t + 0.12);
    og.gain.setValueAtTime(0.5 * vol, t); og.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
    o.connect(og); og.connect(ctx.destination); o.start(t); o.stop(t + 0.16);
  }
  function say(text, bot) {
    if (mode === 2) return;
    if (play({ "Aceito!": "aceito", "Correu!": "correu" }[text], 1)) return;
    if (!("speechSynthesis" in window)) return;
    try {
      speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = "pt-BR"; u.rate = 1.0; u.pitch = bot ? 0.65 : 1.2; u.volume = 1;
      const v = speechSynthesis.getVoices().find(x => /pt[-_]BR/i.test(x.lang));
      if (v) u.voice = v;
      speechSynthesis.speak(u);
    } catch (_) {}
  }
  const WORDS = { 3: "Truco!", 6: "Seis!", 9: "Nove!", 12: "Doze!" };
  function call(stake, bot) {
    const k = { 3: "truco", 6: "seis", 9: "nove", 12: "doze" }[stake] || "truco";
    if (play(k, 1)) return;
    thump(1.4, 0); thump(1.4, 0.18); say(WORDS[stake] || "Truco!", bot);
  }
  function end(win) {
    if (mode === 2 || !ensure()) return;
    const t = ctx.currentTime + 0.05;
    (win ? [72, 76, 79, 84] : [67, 64, 60, 55]).forEach((m, i) => tone(ctx.destination, m, t + i * 0.16, 0.5, "triangle", 0.12));
  }
  function paint() { document.querySelectorAll(".fx-toggle").forEach(b => { b.textContent = icons[mode]; }); }
  function cycle() {
    mode = (mode + 1) % 3;
    try { localStorage.setItem("trucoFxMode", String(mode)); } catch (_) {}
    if (mode === 0) startMusic(); else stopMusic();
    if (mode === 2 && "speechSynthesis" in window) speechSynthesis.cancel();
    paint();
  }
  function unlock() { ensure(); startMusic(); }
  document.addEventListener("pointerdown", unlock, { once: true });
  document.addEventListener("visibilitychange", () => {
    if (!ctx && !clip.music) return;
    if (document.hidden) { if (ctx) ctx.suspend().catch(() => {}); if (clip.music) clip.music.pause(); }
    else { if (ctx) ctx.resume().catch(() => {}); if (mode === 0 && clip.music) clip.music.play().catch(() => {}); }
  });
  document.addEventListener("click", e => {
    const b = e.target.closest(".fx-toggle"); if (!b) return;
    e.preventDefault(); cycle();
  });
  document.addEventListener("DOMContentLoaded", paint);
  return { card: () => { if (!play("card", 0.9)) thump(1, 0); }, call, say, end, icon: () => icons[mode], paint };
})();
