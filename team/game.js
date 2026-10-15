(function () {
  "use strict";

  var COLS = 20;
  var ROWS = 20;
  var START_INTERVAL = 150;
  var MIN_INTERVAL = 60;
  var SPEED_STEP = 5;
  var SWIPE_MIN = 24;

  var VECTORS = {
    up: { x: 0, y: -1 },
    down: { x: 0, y: 1 },
    left: { x: -1, y: 0 },
    right: { x: 1, y: 0 }
  };

  var OPPOSITE = {
    up: "down",
    down: "up",
    left: "right",
    right: "left"
  };

  var KEY_DIR = {
    ArrowUp: "up",
    ArrowDown: "down",
    ArrowLeft: "left",
    ArrowRight: "right",
    w: "up",
    W: "up",
    a: "left",
    A: "left",
    s: "down",
    S: "down",
    d: "right",
    D: "right"
  };

  var BEST_KEY = "snake-high-score";

  var canvas = document.getElementById("canvas");
  var board = document.getElementById("board");
  var overlay = document.getElementById("overlay");
  var overlayTitle = document.getElementById("overlay-title");
  var overlayScore = document.getElementById("overlay-score");
  var overlayRecord = document.getElementById("overlay-record");
  var overlayBtn = document.getElementById("overlay-btn");
  var toggleBtn = document.getElementById("toggle-btn");
  var restartBtn = document.getElementById("restart-btn");
  var scoreEl = document.getElementById("score");
  var bestEl = document.getElementById("best");
  var speedEl = document.getElementById("speed");
  var ctx = canvas.getContext("2d");

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

  var state = "idle";
  var snake = [];
  var direction = "right";
  var dirQueue = [];
  var food = null;
  var score = 0;
  var best = loadBest();
  var bestAtStart = best;
  var isNewRecord = false;
  var interval = START_INTERVAL;
  var timer = null;
  var deathTimer = null;
  var swipe = null;
  var cssWidth = 0;
  var cssHeight = 0;

  function prefersReducedMotion() {
    return reduceMotion.matches;
  }

  function loadBest() {
    try {
      var value = parseInt(localStorage.getItem(BEST_KEY), 10);
      return Number.isFinite(value) && value > 0 ? value : 0;
    } catch (err) {
      return 0;
    }
  }

  function persistBest() {
    try {
      localStorage.setItem(BEST_KEY, String(best));
    } catch (err) {
      /* 隐私模式等环境可能拒绝写入 */
    }
  }

  function cssVar(name) {
    return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  }

  function speedLevel() {
    return 1 + Math.round((START_INTERVAL - interval) / SPEED_STEP);
  }

  function opposite(a, b) {
    return OPPOSITE[a] === b;
  }

  function resetRound() {
    clearTimeout(timer);
    timer = null;
    clearTimeout(deathTimer);
    deathTimer = null;
    board.classList.remove("shake");
    snake = [
      { x: 3, y: 10 },
      { x: 4, y: 10 },
      { x: 5, y: 10 }
    ];
    direction = "right";
    dirQueue = [];
    score = 0;
    interval = START_INTERVAL;
    bestAtStart = best;
    isNewRecord = false;
    spawnFood();
  }

  function spawnFood() {
    var open = [];
    var y;
    var x;
    var i;
    var occupied;
    for (y = 0; y < ROWS; y += 1) {
      for (x = 0; x < COLS; x += 1) {
        occupied = false;
        for (i = 0; i < snake.length; i += 1) {
          if (snake[i].x === x && snake[i].y === y) {
            occupied = true;
            break;
          }
        }
        if (!occupied) open.push({ x: x, y: y });
      }
    }
    if (!open.length) {
      food = null;
      return false;
    }
    food = open[Math.floor(Math.random() * open.length)];
    return true;
  }

  function queueDirection(next) {
    if (state !== "playing" || !VECTORS[next]) return;
    var tail = dirQueue.length ? dirQueue[dirQueue.length - 1] : direction;
    if (opposite(next, tail) || next === tail) return;
    if (dirQueue.length >= 2) return;
    dirQueue.push(next);
  }

  function schedule() {
    clearTimeout(timer);
    timer = setTimeout(tick, interval);
  }

  function tick() {
    if (state !== "playing") return;
    step();
    if (state === "playing") schedule();
  }

  function step() {
    if (dirQueue.length) {
      var queued = dirQueue.shift();
      if (!opposite(queued, direction)) direction = queued;
    }

    var head = snake[snake.length - 1];
    var vector = VECTORS[direction];
    var next = { x: head.x + vector.x, y: head.y + vector.y };

    if (next.x < 0 || next.y < 0 || next.x >= COLS || next.y >= ROWS) {
      die();
      return;
    }

    var willEat = food && next.x === food.x && next.y === food.y;
    var limit = willEat ? snake.length : snake.length - 1;
    var i;
    for (i = 0; i < limit; i += 1) {
      if (snake[i].x === next.x && snake[i].y === next.y) {
        die();
        return;
      }
    }

    snake.push(next);
    if (willEat) onEat();
    else snake.shift();
  }

  function onEat() {
    score += 1;
    interval = Math.max(MIN_INTERVAL, START_INTERVAL - score * SPEED_STEP);
    if (score > best) {
      best = score;
      persistBest();
    }
    if (score > bestAtStart) isNewRecord = true;
    var placed = spawnFood();
    updateUI();
    bumpScore();
    if (!placed) win();
  }

  function win() {
    if (state === "win" || state === "over" || state === "dying") return;
    state = "win";
    dirQueue = [];
    clearTimeout(timer);
    timer = null;
    updateUI();
  }

  function die() {
    if (state === "dying" || state === "over") return;
    state = "dying";
    dirQueue = [];
    clearTimeout(timer);
    timer = null;
    updateUI();

    var finish = function () {
      deathTimer = null;
      if (state !== "dying") return;
      board.classList.remove("shake");
      state = "over";
      updateUI();
    };

    if (prefersReducedMotion()) {
      finish();
      return;
    }

    board.classList.add("shake");
    deathTimer = setTimeout(finish, 200);
  }

  function startRound() {
    resetRound();
    state = "playing";
    updateUI();
    schedule();
  }

  function pause() {
    if (state !== "playing") return;
    state = "paused";
    dirQueue = [];
    clearTimeout(timer);
    timer = null;
    updateUI();
  }

  function resume() {
    if (state !== "paused") return;
    state = "playing";
    updateUI();
    schedule();
  }

  function onToggle() {
    if (state === "dying") return;
    if (state === "playing") pause();
    else if (state === "paused") resume();
    else startRound();
  }

  function bumpScore() {
    if (prefersReducedMotion()) return;
    scoreEl.classList.remove("is-pop");
    void scoreEl.offsetWidth;
    scoreEl.classList.add("is-pop");
  }

  function updateUI() {
    scoreEl.textContent = String(score);
    bestEl.textContent = String(best);
    speedEl.textContent = interval <= MIN_INTERVAL ? "速度 Lv.MAX" : "速度 Lv." + speedLevel();

    var showOverlay = state === "idle" || state === "paused" || state === "over" || state === "win";
    overlay.classList.toggle("show", showOverlay);
    if (showOverlay) overlay.removeAttribute("inert");
    else overlay.setAttribute("inert", "");
    overlay.setAttribute("aria-hidden", showOverlay ? "false" : "true");

    var showScore = state === "over" || state === "win";
    overlayScore.hidden = !showScore;
    overlayScore.textContent = showScore ? "本局得分 " + score : "";
    overlayRecord.hidden = !(showScore && isNewRecord);
    overlayRecord.textContent = state === "win" ? "新纪录" : "🎉 新纪录！";
    overlayTitle.classList.toggle("is-win", state === "win");

    if (state === "idle") {
      overlayTitle.textContent = "按 空格 或点击开始";
      overlayBtn.textContent = "开始";
      toggleBtn.textContent = "开始";
    } else if (state === "playing" || state === "dying") {
      toggleBtn.textContent = "暂停";
    } else if (state === "paused") {
      overlayTitle.textContent = "已暂停";
      overlayBtn.textContent = "继续";
      toggleBtn.textContent = "继续";
    } else if (state === "over") {
      overlayTitle.textContent = "游戏结束";
      overlayBtn.textContent = "再来一局";
      toggleBtn.textContent = "开始";
    } else if (state === "win") {
      overlayTitle.textContent = "🏆 通关！蛇已经填满棋盘";
      overlayBtn.textContent = "再来一局";
      toggleBtn.textContent = "开始";
    }
  }

  function resizeCanvas() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    var width = Math.max(1, Math.round(rect.width * dpr));
    var height = Math.max(1, Math.round(rect.height * dpr));
    cssWidth = rect.width;
    cssHeight = rect.height;
    if (canvas.width !== width || canvas.height !== height) {
      canvas.width = width;
      canvas.height = height;
    }
  }

  function roundRect(x, y, w, h, r) {
    var radius = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + radius, y);
    ctx.arcTo(x + w, y, x + w, y + h, radius);
    ctx.arcTo(x + w, y + h, x, y + h, radius);
    ctx.arcTo(x, y + h, x, y, radius);
    ctx.arcTo(x, y, x + w, y, radius);
    ctx.closePath();
  }

  function draw(now) {
    resizeCanvas();
    var dpr = Math.max(1, window.devicePixelRatio || 1);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var size = cssWidth;
    var cell = size / COLS;
    ctx.clearRect(0, 0, cssWidth, cssHeight);
    ctx.fillStyle = cssVar("--board");
    ctx.fillRect(0, 0, cssWidth, cssHeight);

    ctx.fillStyle = cssVar("--grid");
    var i;
    for (i = 1; i < COLS; i += 1) {
      ctx.fillRect(Math.round(i * cell), 0, 1, size);
      ctx.fillRect(0, Math.round(i * cell), size, 1);
    }

    if (food) {
      var pulse = prefersReducedMotion()
        ? 1
        : 0.925 + 0.075 * Math.sin((now / 1200) * Math.PI * 2);
      ctx.fillStyle = cssVar("--food");
      ctx.beginPath();
      ctx.arc((food.x + 0.5) * cell, (food.y + 0.5) * cell, cell * 0.32 * pulse, 0, Math.PI * 2);
      ctx.fill();
    }

    var pad = 0.5;
    var block = cell - 1;
    var radius = cell * 0.25;
    ctx.fillStyle = cssVar("--snake");
    for (i = 0; i < snake.length - 1; i += 1) {
      roundRect(snake[i].x * cell + pad, snake[i].y * cell + pad, block, block, radius);
      ctx.fill();
    }

    var head = snake[snake.length - 1];
    ctx.fillStyle = cssVar("--snake-head");
    roundRect(head.x * cell + pad, head.y * cell + pad, block, block, radius);
    ctx.fill();
    drawEyes(head, cell);
  }

  function drawEyes(head, cell) {
    var cx = (head.x + 0.5) * cell;
    var cy = (head.y + 0.5) * cell;
    var forward = cell * 0.16;
    var side = cell * 0.11;
    var radius = Math.max(1.2, cell * 0.07);
    var fx = 0;
    var fy = 0;
    var sx = 0;
    var sy = 0;
    if (direction === "right") fx = forward;
    else if (direction === "left") fx = -forward;
    else if (direction === "up") fy = -forward;
    else fy = forward;
    if (direction === "up" || direction === "down") sx = side;
    else sy = side;

    ctx.fillStyle = cssVar("--bg");
    var sign;
    for (sign = -1; sign <= 1; sign += 2) {
      ctx.beginPath();
      ctx.arc(cx + fx + sx * sign, cy + fy + sy * sign, radius, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function frame(now) {
    draw(now);
    requestAnimationFrame(frame);
  }

  function applySwipe(dx, dy) {
    var ax = Math.abs(dx);
    var ay = Math.abs(dy);
    if (ax <= SWIPE_MIN && ay <= SWIPE_MIN) return;
    if (ax >= ay) queueDirection(dx > 0 ? "right" : "left");
    else queueDirection(dy > 0 ? "down" : "up");
  }

  function onKeyDown(event) {
    var key = event.key;
    if (key === " " || key === "Spacebar") {
      event.preventDefault();
      if (state === "dying") return;
      onToggle();
      return;
    }
    if (key === "Enter") {
      if (state === "dying") {
        event.preventDefault();
        return;
      }
      if (state === "over" || state === "win") {
        event.preventDefault();
        startRound();
      }
      return;
    }
    var next = KEY_DIR[key];
    if (!next) return;
    if (state === "playing" && key.indexOf("Arrow") === 0) event.preventDefault();
    queueDirection(next);
  }

  board.addEventListener("touchstart", function (event) {
    var touch = event.changedTouches[0];
    swipe = { id: touch.identifier, x: touch.clientX, y: touch.clientY };
  }, { passive: true });

  board.addEventListener("touchmove", function (event) {
    if (event.cancelable) event.preventDefault();
  }, { passive: false });

  board.addEventListener("touchend", function (event) {
    if (!swipe) return;
    var touches = event.changedTouches;
    var touch = null;
    var i;
    for (i = 0; i < touches.length; i += 1) {
      if (touches[i].identifier === swipe.id) {
        touch = touches[i];
        break;
      }
    }
    if (!touch) return;
    var dx = touch.clientX - swipe.x;
    var dy = touch.clientY - swipe.y;
    swipe = null;
    applySwipe(dx, dy);
  }, { passive: true });

  board.addEventListener("touchcancel", function () {
    swipe = null;
  }, { passive: true });

  document.addEventListener("keydown", onKeyDown);

  document.addEventListener("visibilitychange", function () {
    if (document.hidden && state === "playing") pause();
  });

  toggleBtn.addEventListener("click", onToggle);
  restartBtn.addEventListener("click", startRound);
  overlayBtn.addEventListener("click", function () {
    if (state === "paused") resume();
    else startRound();
  });

  window.addEventListener("resize", resizeCanvas);
  if (window.ResizeObserver) {
    new ResizeObserver(resizeCanvas).observe(board);
  }

  function prepareWin() {
    var cells = [];
    var y;
    var x;
    var head;
    clearTimeout(timer);
    timer = null;
    clearTimeout(deathTimer);
    deathTimer = null;
    board.classList.remove("shake");
    for (y = 0; y < ROWS; y += 1) {
      if (y % 2 === 0) {
        for (x = 0; x < COLS; x += 1) cells.push({ x: x, y: y });
      } else {
        for (x = COLS - 1; x >= 0; x -= 1) cells.push({ x: x, y: y });
      }
    }
    snake = cells.slice(0, cells.length - 1);
    food = cells[cells.length - 1];
    head = snake[snake.length - 1];
    if (food.x === head.x) direction = food.y > head.y ? "down" : "up";
    else direction = food.x > head.x ? "right" : "left";
    dirQueue = [];
    score = snake.length - 3;
    interval = Math.max(MIN_INTERVAL, START_INTERVAL - score * SPEED_STEP);
    bestAtStart = best;
    isNewRecord = false;
    state = "playing";
    updateUI();
    schedule();
  }

  function placeFoodAhead() {
    var head;
    var names;
    var i;
    var name;
    var nx;
    var ny;
    var j;
    var blocked;
    if (state !== "playing") return false;
    head = snake[snake.length - 1];
    names = [direction, "up", "down", "left", "right"];
    for (i = 0; i < names.length; i += 1) {
      name = names[i];
      if (opposite(name, direction)) continue;
      nx = head.x + VECTORS[name].x;
      ny = head.y + VECTORS[name].y;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
      blocked = false;
      for (j = 0; j < snake.length; j += 1) {
        if (snake[j].x === nx && snake[j].y === ny) {
          blocked = true;
          break;
        }
      }
      if (blocked) continue;
      direction = name;
      dirQueue = [];
      food = { x: nx, y: ny };
      return true;
    }
    return false;
  }

  window.__snakeTest = {
    prepareWin: prepareWin,
    placeFoodAhead: placeFoodAhead
  };

  resetRound();
  state = "idle";
  updateUI();
  requestAnimationFrame(frame);
})();
