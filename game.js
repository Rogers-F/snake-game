(function () {
  'use strict';

  var COLS = 20;
  var ROWS = 20;
  var START_MS = 168;
  var MIN_MS = 56;
  var STEP_MS = 7;
  var SCORE_PER_FOOD = 10;
  var HIGH_KEY = 'snake-high-score';
  var MUTE_KEY = 'snake-muted';

  var VECTORS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };
  var OPPOSITE = { up: 'down', down: 'up', left: 'right', right: 'left' };
  var KEY_DIR = {
    ArrowUp: 'up',
    ArrowDown: 'down',
    ArrowLeft: 'left',
    ArrowRight: 'right',
    KeyW: 'up',
    KeyA: 'left',
    KeyS: 'down',
    KeyD: 'right'
  };

  var HEAD = [236, 255, 240];
  var BODY = [61, 190, 122];
  var TAIL = [14, 86, 58];
  var DEAD = [186, 78, 58];

  var canvas = document.getElementById('board');
  var ctx = canvas.getContext('2d');
  var els = {
    app: document.getElementById('app'),
    wrap: document.getElementById('board-wrap'),
    overlay: document.getElementById('overlay'),
    title: document.getElementById('overlay-title'),
    text: document.getElementById('overlay-text'),
    overlayScore: document.getElementById('overlay-score'),
    action: document.getElementById('overlay-action'),
    score: document.getElementById('score'),
    high: document.getElementById('high-score'),
    highLabel: document.getElementById('high-label'),
    speed: document.getElementById('speed'),
    bar: document.getElementById('speed-bar'),
    start: document.getElementById('btn-start'),
    pause: document.getElementById('btn-pause'),
    restart: document.getElementById('btn-restart'),
    mute: document.getElementById('btn-mute'),
    live: document.getElementById('live')
  };

  if (!ctx) {
    els.text.textContent = '当前浏览器不能显示画布。';
    return;
  }

  var motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  var state = 'ready';
  var snake = [];
  var prevSnake = [];
  var dir = 'right';
  var pending = [];
  var food = null;
  var ghostFood = null;
  var foods = 0;
  var score = 0;
  var highScore = loadNumber(HIGH_KEY);
  var bestAtStart = highScore;
  var cause = null;
  var acc = 0;
  var last = 0;
  var resetClock = true;
  var flash = 0;
  var flashTint = '255, 80, 48';
  var foodAt = 0;
  var particles = [];
  var audioCtx = null;
  var muted = loadFlag(MUTE_KEY);
  var swipe = null;
  var roundId = 0;

  function motionOK() {
    return !motionQuery.matches;
  }

  function loadNumber(key) {
    try {
      var n = Number(localStorage.getItem(key));
      if (!isFinite(n) || n < 0) return 0;
      return Math.floor(n);
    } catch (err) {
      return 0;
    }
  }

  function loadFlag(key) {
    try {
      return localStorage.getItem(key) === '1';
    } catch (err) {
      return false;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, String(value));
    } catch (err) {
      /* private mode or blocked storage */
    }
  }

  function currentInterval() {
    return Math.max(MIN_MS, START_MS - foods * STEP_MS);
  }

  function speedRatio() {
    return START_MS / currentInterval();
  }

  function cloneSnake(list) {
    return list.map(function (part) {
      return { x: part.x, y: part.y };
    });
  }

  function placeFood() {
    var taken = {};
    for (var i = 0; i < snake.length; i++) {
      taken[snake[i].x + ',' + snake[i].y] = true;
    }
    var open = [];
    for (var y = 0; y < ROWS; y++) {
      for (var x = 0; x < COLS; x++) {
        if (!taken[x + ',' + y]) open.push({ x: x, y: y });
      }
    }
    if (!open.length) return null;
    return open[(Math.random() * open.length) | 0];
  }

  function announce(text) {
    els.live.textContent = text;
  }

  function pulse(el) {
    if (!motionOK()) return;
    el.classList.remove('bump');
    void el.offsetWidth;
    el.classList.add('bump');
  }

  function updateHud() {
    els.score.textContent = String(score);
    els.high.textContent = String(highScore);
    var ratio = speedRatio();
    els.speed.textContent = ratio.toFixed(2) + '×';
    els.speed.title = '每步 ' + currentInterval() + ' 毫秒';
    var span = START_MS - MIN_MS;
    var filled = (START_MS - currentInterval()) / span;
    els.bar.style.width = Math.round(filled * 100) + '%';
    var record = score > bestAtStart && score > 0;
    els.highLabel.textContent = record ? '新纪录' : '最高分';
    if (state === 'over') document.title = '贪吃蛇 · ' + score + ' 分';
    else if (state === 'paused') document.title = '贪吃蛇 · 已暂停';
    else if (score > 0) document.title = '贪吃蛇 · ' + score;
    else document.title = '贪吃蛇';
  }

  function showOverlay(title, text, action, showScore) {
    els.title.textContent = title;
    els.text.textContent = text;
    els.action.textContent = action;
    els.overlayScore.textContent = String(score);
    els.overlayScore.classList.toggle('is-on', !!showScore);
    els.overlay.classList.add('is-on');
    els.overlay.setAttribute('aria-hidden', 'false');
  }

  function hideOverlay() {
    els.overlay.classList.remove('is-on');
    els.overlay.setAttribute('aria-hidden', 'true');
  }

  function renderChrome() {
    els.app.dataset.state = state;
    els.restart.disabled = state === 'ready';
    els.mute.textContent = muted ? '声音关' : '声音开';
    els.mute.setAttribute('aria-pressed', muted ? 'true' : 'false');

    if (state === 'ready') {
      els.start.disabled = false;
      els.start.textContent = '开始';
      els.pause.disabled = true;
      els.pause.textContent = '暂停';
      showOverlay(
        '准备好了',
        '方向键 / WASD，或滑动、点按转向。吃果实会变长、变快，撞墙或咬到自己就结束。',
        '开始',
        false
      );
      return;
    }

    if (state === 'playing') {
      els.start.disabled = true;
      els.start.textContent = '开始';
      els.pause.disabled = false;
      els.pause.textContent = '暂停';
      hideOverlay();
      return;
    }

    if (state === 'paused') {
      els.start.disabled = true;
      els.start.textContent = '开始';
      els.pause.disabled = false;
      els.pause.textContent = '继续';
      showOverlay('已暂停', '按空格或点「继续」接着玩。', '继续', false);
      return;
    }

    els.start.disabled = false;
    els.start.textContent = '再来一局';
    els.pause.disabled = true;
    els.pause.textContent = '暂停';
    var title = '游戏结束';
    var detail = '撞到墙了';
    if (cause === 'self') detail = '咬到自己了';
    if (cause === 'win') {
      title = '你赢了';
      detail = '蛇占满了整个棋盘';
    } else if (score > bestAtStart && score > 0) {
      title = '新纪录';
    }
    showOverlay(title, detail + '。最高分 ' + highScore + '。', '再来一局', true);
  }

  function resetRound(autoplay) {
    roundId += 1;
    var mid = (ROWS / 2) | 0;
    var hx = 5;
    snake = [
      { x: hx, y: mid },
      { x: hx - 1, y: mid },
      { x: hx - 2, y: mid }
    ];
    prevSnake = cloneSnake(snake);
    dir = 'right';
    pending = [];
    foods = 0;
    score = 0;
    ghostFood = null;
    particles.length = 0;
    flash = 0;
    acc = 0;
    cause = null;
    food = placeFood();
    foodAt = performance.now();
    bestAtStart = highScore;
    state = autoplay ? 'playing' : 'ready';
    resetClock = true;
    els.wrap.classList.remove('shake');
    updateHud();
    renderChrome();
    announce(autoplay ? '新的一局开始了。' : '准备开始。方向键或 WASD 控制方向。');
  }

  function startFromReady() {
    if (state !== 'ready') return;
    state = 'playing';
    acc = 0;
    resetClock = true;
    unlockAudio();
    updateHud();
    renderChrome();
    announce('游戏开始。');
  }

  function pauseGame() {
    if (state !== 'playing') return;
    prevSnake = cloneSnake(snake);
    acc = 0;
    state = 'paused';
    resetClock = true;
    updateHud();
    renderChrome();
    announce('已暂停。');
  }

  function resumeGame() {
    if (state !== 'paused') return;
    state = 'playing';
    acc = 0;
    resetClock = true;
    unlockAudio();
    updateHud();
    renderChrome();
    announce('继续游戏。');
  }

  function onPrimary() {
    if (state === 'ready') startFromReady();
    else if (state === 'paused') resumeGame();
    else if (state === 'over') resetRound(true);
  }

  function onPause() {
    if (state === 'playing') pauseGame();
    else if (state === 'paused') resumeGame();
  }

  function onRestart() {
    if (state === 'ready') return;
    unlockAudio();
    resetRound(true);
  }

  function setDirection(next) {
    if (!next || !VECTORS[next]) return;
    if (state === 'over' || state === 'paused') return;
    if (state === 'ready') {
      if (next === OPPOSITE[dir]) {
        announce('开局先往前走，不能直接回头。');
        return;
      }
      dir = next;
      startFromReady();
      return;
    }
    var last = pending.length ? pending[pending.length - 1] : dir;
    if (next === last || next === OPPOSITE[last]) return;
    if (pending.length >= 2) return;
    pending.push(next);
  }

  function burst(x, y) {
    if (!motionOK()) return;
    for (var i = 0; i < 10; i++) {
      var angle = Math.random() * Math.PI * 2;
      var speed = 2.2 + Math.random() * 2.4;
      particles.push({
        x: x + 0.5,
        y: y + 0.5,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 1,
        color: Math.random() < 0.5 ? '#ffb088' : '#ffe1a8'
      });
    }
    if (particles.length > 48) particles.splice(0, particles.length - 48);
  }

  function updateParticles(dt) {
    var step = dt / 1000;
    for (var i = particles.length - 1; i >= 0; i--) {
      var p = particles[i];
      p.x += p.vx * step;
      p.y += p.vy * step;
      p.life -= dt / 420;
      if (p.life <= 0) particles.splice(i, 1);
    }
  }

  function addScore(points) {
    score += points;
    if (score > highScore) {
      highScore = score;
      save(HIGH_KEY, highScore);
      pulse(els.high);
    }
    pulse(els.score);
    updateHud();
  }

  function endGame(reason) {
    if (state === 'over') return;
    state = 'over';
    cause = reason;
    acc = 0;
    prevSnake = cloneSnake(snake);
    resetClock = true;
    flash = 1;
    flashTint = reason === 'win' ? '224, 177, 90' : '255, 80, 48';
    if (reason !== 'win' && motionOK()) {
      els.wrap.classList.remove('shake');
      void els.wrap.offsetWidth;
      els.wrap.classList.add('shake');
    }
    if (reason !== 'win') playDie();
    updateHud();
    renderChrome();
    var title = els.title.textContent;
    announce(title + '。本局 ' + score + ' 分，最高 ' + highScore + ' 分。');
  }

  function step() {
    if (pending.length) {
      var next = pending.shift();
      if (next && next !== OPPOSITE[dir]) dir = next;
    }

    ghostFood = null;
    var head = snake[0];
    var vec = VECTORS[dir];
    var nx = head.x + vec.x;
    var ny = head.y + vec.y;

    if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) {
      endGame('wall');
      return;
    }

    var eating = !!(food && food.x === nx && food.y === ny);
    var limit = eating ? snake.length : snake.length - 1;
    for (var i = 0; i < limit; i++) {
      if (snake[i].x === nx && snake[i].y === ny) {
        endGame('self');
        return;
      }
    }

    var previous = cloneSnake(snake);
    snake.unshift({ x: nx, y: ny });
    if (eating) {
      var tail = previous[previous.length - 1];
      previous.push({ x: tail.x, y: tail.y });
      foods += 1;
      ghostFood = { x: nx, y: ny };
      burst(nx, ny);
      addScore(SCORE_PER_FOOD);
      playEat();
      food = placeFood();
      foodAt = performance.now();
      if (!food) {
        prevSnake = previous;
        endGame('win');
        return;
      }
    } else {
      snake.pop();
    }
    prevSnake = previous;
  }

  function mix(a, b, t) {
    return [
      Math.round(a[0] + (b[0] - a[0]) * t),
      Math.round(a[1] + (b[1] - a[1]) * t),
      Math.round(a[2] + (b[2] - a[2]) * t)
    ];
  }

  function rgb(c, alpha) {
    if (alpha == null) return 'rgb(' + c[0] + ',' + c[1] + ',' + c[2] + ')';
    return 'rgba(' + c[0] + ',' + c[1] + ',' + c[2] + ',' + alpha + ')';
  }

  function segmentColor(t) {
    var color = t < 0.45 ? mix(HEAD, BODY, t / 0.45) : mix(BODY, TAIL, (t - 0.45) / 0.55);
    if (state === 'over' && cause !== 'win') color = mix(color, DEAD, 0.72);
    return rgb(color);
  }

  function pointFor(index, t) {
    var curr = snake[index];
    var prev = prevSnake[index] || curr;
    return {
      x: prev.x + (curr.x - prev.x) * t,
      y: prev.y + (curr.y - prev.y) * t
    };
  }

  function fitCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    var w = Math.max(1, Math.round(rect.width * dpr));
    var h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    return { width: rect.width || canvas.width, height: rect.height || canvas.height };
  }

  function viewFor(width, height) {
    var pad = Math.max(14, Math.min(width, height) * 0.045);
    var cell = (Math.min(width, height) - pad * 2) / COLS;
    var board = cell * COLS;
    return {
      cell: cell,
      board: board,
      ox: (width - board) / 2,
      oy: (height - board) / 2
    };
  }

  function gridToPx(x, y, view) {
    return {
      x: view.ox + x * view.cell,
      y: view.oy + y * view.cell
    };
  }

  function drawBerry(x, y, view, scale, alpha) {
    var center = gridToPx(x + 0.5, y + 0.5, view);
    var radius = view.cell * 0.28 * scale;
    if (radius <= 0.2) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(255, 90, 48, 0.55)';
    ctx.shadowBlur = view.cell * 0.35;
    var gradient = ctx.createRadialGradient(
      center.x - radius * 0.35,
      center.y - radius * 0.35,
      radius * 0.1,
      center.x,
      center.y,
      radius
    );
    gradient.addColorStop(0, '#ffe7c2');
    gradient.addColorStop(0.45, '#ff6a3d');
    gradient.addColorStop(1, '#c43322');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(center.x, center.y, radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#2f9d55';
    ctx.beginPath();
    ctx.ellipse(center.x + radius * 0.2, center.y - radius * 0.95, radius * 0.42, radius * 0.18, -0.7, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#6b3b24';
    ctx.lineWidth = Math.max(1, view.cell * 0.045);
    ctx.beginPath();
    ctx.moveTo(center.x, center.y - radius * 0.55);
    ctx.quadraticCurveTo(center.x + radius * 0.1, center.y - radius, center.x + radius * 0.18, center.y - radius * 1.15);
    ctx.stroke();
    ctx.restore();
  }

  function draw(now) {
    var size = fitCanvas();
    var width = size.width;
    var height = size.height;
    if (width < 20 || height < 20) return;
    var view = viewFor(width, height);
    if (view.cell <= 1) return;
    var interval = currentInterval();
    var t = state === 'playing' ? Math.min(1, acc / interval) : 1;

    ctx.clearRect(0, 0, width, height);
    ctx.fillStyle = '#1b140f';
    ctx.fillRect(0, 0, width, height);

    ctx.fillStyle = '#261c15';
    ctx.fillRect(view.ox, view.oy, view.board, view.board);

    ctx.strokeStyle = 'rgba(246, 239, 228, 0.045)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (var i = 0; i <= COLS; i++) {
      var x = view.ox + i * view.cell + 0.5;
      ctx.moveTo(x, view.oy);
      ctx.lineTo(x, view.oy + view.board);
    }
    for (var j = 0; j <= ROWS; j++) {
      var y = view.oy + j * view.cell + 0.5;
      ctx.moveTo(view.ox, y);
      ctx.lineTo(view.ox + view.board, y);
    }
    ctx.stroke();

    if (ghostFood) drawBerry(ghostFood.x, ghostFood.y, view, 1, 1);

    if (food) {
      var appear = 1;
      var pulseScale = 1;
      if (motionOK()) {
        var k = Math.min(1, (now - foodAt) / 180);
        appear = 1 - Math.pow(1 - k, 3);
        pulseScale = 1 + Math.sin(now / 280) * 0.05;
      }
      drawBerry(food.x, food.y, view, appear * pulseScale, 1);
    }

    for (var p = 0; p < particles.length; p++) {
      var bit = particles[p];
      var pos = gridToPx(bit.x, bit.y, view);
      ctx.globalAlpha = Math.max(0, bit.life);
      ctx.fillStyle = bit.color;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, view.cell * 0.08 * bit.life, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    var pts = [];
    for (var s = 0; s < snake.length; s++) {
      var grid = pointFor(s, t);
      pts.push(gridToPx(grid.x + 0.5, grid.y + 0.5, view));
    }

    if (pts.length) {
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.28)';
      ctx.lineWidth = view.cell * 0.86;
      ctx.beginPath();
      ctx.moveTo(pts[0].x + view.cell * 0.04, pts[0].y + view.cell * 0.08);
      for (var shadow = 1; shadow < pts.length; shadow++) {
        ctx.lineTo(pts[shadow].x + view.cell * 0.04, pts[shadow].y + view.cell * 0.08);
      }
      ctx.stroke();

      for (var seg = pts.length - 1; seg > 0; seg--) {
        var along = seg / (pts.length - 1);
        ctx.strokeStyle = segmentColor(along);
        ctx.lineWidth = view.cell * (0.46 + 0.32 * (1 - along));
        ctx.beginPath();
        ctx.moveTo(pts[seg].x, pts[seg].y);
        ctx.lineTo(pts[seg - 1].x, pts[seg - 1].y);
        ctx.stroke();
      }

      ctx.fillStyle = segmentColor(0);
      ctx.beginPath();
      ctx.arc(pts[0].x, pts[0].y, view.cell * 0.40, 0, Math.PI * 2);
      ctx.fill();

      var vec = VECTORS[dir];
      var px = -vec.y;
      var py = vec.x;
      ctx.fillStyle = state === 'over' && cause !== 'win' ? '#3a1814' : '#102018';
      for (var eye = -1; eye <= 1; eye += 2) {
        var ex = pts[0].x + vec.x * view.cell * 0.14 + px * view.cell * 0.14 * eye;
        var ey = pts[0].y + vec.y * view.cell * 0.14 + py * view.cell * 0.14 * eye;
        ctx.beginPath();
        ctx.arc(ex, ey, Math.max(1.2, view.cell * 0.065), 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    var vignette = ctx.createRadialGradient(
      width / 2,
      height / 2,
      width * 0.28,
      width / 2,
      height / 2,
      width * 0.72
    );
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.22)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);

    if (flash > 0) {
      ctx.fillStyle = 'rgba(' + flashTint + ',' + (flash * 0.28) + ')';
      ctx.fillRect(0, 0, width, height);
    }
  }

  function frame(now) {
    now = now || performance.now();
    if (resetClock || !last) {
      last = now;
      resetClock = false;
    }
    var dt = Math.min(48, now - last);
    last = now;
    if (flash > 0) flash = Math.max(0, flash - dt / 380);
    updateParticles(dt);
    if (state === 'playing') {
      acc += dt;
      var interval = currentInterval();
      if (acc >= interval) {
        acc -= interval;
        if (acc > interval) acc = 0;
        step();
      }
    }
    draw(now);
    requestAnimationFrame(frame);
  }

  function ensureAudio() {
    var AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return null;
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function unlockAudio() {
    if (muted) return;
    ensureAudio();
  }

  function tone(freq, dur, type, gain) {
    if (muted) return;
    var context = ensureAudio();
    if (!context) return;
    var play = function () {
      var osc = context.createOscillator();
      var amp = context.createGain();
      osc.type = type || 'sine';
      osc.frequency.value = freq;
      amp.gain.setValueAtTime(Math.max(gain, 0.0001), context.currentTime);
      amp.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + dur);
      osc.connect(amp);
      amp.connect(context.destination);
      osc.start();
      osc.stop(context.currentTime + dur);
    };
    if (context.state === 'suspended') context.resume().then(play).catch(function () {});
    else play();
  }

  function playEat() {
    tone(430 + Math.min(foods, 18) * 16, 0.07, 'sine', 0.035);
  }

  function playDie() {
    var id = roundId;
    tone(150, 0.16, 'triangle', 0.04);
    window.setTimeout(function () {
      if (id !== roundId) return;
      tone(78, 0.22, 'sine', 0.035);
    }, 80);
  }

  function toggleMute() {
    muted = !muted;
    save(MUTE_KEY, muted ? '1' : '0');
    if (!muted) unlockAudio();
    renderChrome();
    announce(muted ? '声音已关闭。' : '声音已打开。');
  }

  function onKeyDown(event) {
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    var code = event.code;
    if (KEY_DIR[code]) {
      event.preventDefault();
      unlockAudio();
      setDirection(KEY_DIR[code]);
      return;
    }
    if (event.repeat && (code === 'Space' || code === 'KeyP' || code === 'Enter' || code === 'KeyR')) {
      event.preventDefault();
      return;
    }
    if (code === 'Space' || code === 'KeyP') {
      event.preventDefault();
      unlockAudio();
      if (state === 'playing' || state === 'paused') onPause();
      else onPrimary();
      return;
    }
    if (code === 'Enter') {
      event.preventDefault();
      unlockAudio();
      onPrimary();
      return;
    }
    if (code === 'KeyR') {
      event.preventDefault();
      unlockAudio();
      if (state === 'ready') startFromReady();
      else resetRound(true);
    }
  }

  function bindPad(button) {
    var direction = button.getAttribute('data-dir');
    var release = function () {
      button.classList.remove('is-down');
    };
    button.addEventListener('pointerdown', function (event) {
      event.preventDefault();
      button.classList.add('is-down');
      unlockAudio();
      setDirection(direction);
    });
    button.addEventListener('pointerup', release);
    button.addEventListener('pointercancel', release);
    button.addEventListener('pointerleave', release);
    button.addEventListener('click', function (event) {
      event.preventDefault();
      unlockAudio();
      setDirection(direction);
    });
    button.addEventListener('touchstart', function (event) {
      event.preventDefault();
      button.classList.add('is-down');
      unlockAudio();
      setDirection(direction);
    }, { passive: false });
    button.addEventListener('touchend', release);
    button.addEventListener('touchcancel', release);
  }

  els.start.addEventListener('click', onPrimary);
  els.action.addEventListener('click', onPrimary);
  els.pause.addEventListener('click', onPause);
  els.restart.addEventListener('click', onRestart);
  els.mute.addEventListener('click', toggleMute);

  var pads = document.querySelectorAll('.pad button');
  for (var b = 0; b < pads.length; b++) bindPad(pads[b]);

  document.addEventListener('keydown', onKeyDown, true);

  els.wrap.addEventListener('contextmenu', function (event) {
    event.preventDefault();
  });

  els.wrap.addEventListener('pointerdown', function (event) {
    if (event.target.closest('button')) return;
    swipe = { id: event.pointerId, x: event.clientX, y: event.clientY };
    if (els.wrap.setPointerCapture) {
      try {
        els.wrap.setPointerCapture(event.pointerId);
      } catch (err) {
        /* capture can fail if the pointer already ended */
      }
    }
  });

  function endSwipe(id, x, y) {
    if (!swipe || swipe.id !== id) return;
    var dx = x - swipe.x;
    var dy = y - swipe.y;
    swipe = null;
    var distance = Math.sqrt(dx * dx + dy * dy);
    if (distance < 28) return;
    unlockAudio();
    if (Math.abs(dx) > Math.abs(dy)) setDirection(dx > 0 ? 'right' : 'left');
    else setDirection(dy > 0 ? 'down' : 'up');
  }

  function finishSwipe(event) {
    endSwipe(event.pointerId, event.clientX, event.clientY);
  }

  window.addEventListener('pointerup', finishSwipe);
  window.addEventListener('pointercancel', function (event) {
    if (swipe && event.pointerId === swipe.id) swipe = null;
  });

  els.wrap.addEventListener('touchstart', function (event) {
    if (event.target.closest && event.target.closest('button')) return;
    var touch = event.changedTouches[0];
    if (!touch) return;
    swipe = { id: 'touch', x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  els.wrap.addEventListener('touchend', function (event) {
    var touch = event.changedTouches[0];
    if (!touch) return;
    endSwipe('touch', touch.clientX, touch.clientY);
  }, { passive: true });

  els.wrap.addEventListener('touchcancel', function () {
    if (swipe && swipe.id === 'touch') swipe = null;
  });

  document.addEventListener('visibilitychange', function () {
    if (document.hidden && state === 'playing') pauseGame();
  });

  window.addEventListener('resize', function () {
    draw(performance.now());
  });

  els.high.textContent = String(highScore);
  resetRound(false);
  requestAnimationFrame(frame);
})();
