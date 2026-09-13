/* =============================================================================
 *  main.js — оболочка игры: канвас и масштабирование, главный цикл с фиксиро-
 *  ванным шагом, состояния (меню / игра / пауза / смерть / итоги уровня).
 * ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR, U = CR.Utils, Snd = CR.Sound, FX = CR.FX;
  const $ = (id) => document.getElementById(id);
  const W = CR.W, H = CR.H;

  const Game = CR.Game = {
    state: 'title',        /* title | play | pause | dead | done | win */
    level: null,
    levelIndex: 0,
    totalScore: 0,
    totalStats: null,
    last: 0,
    acc: 0,
    fps: 60, _fpsT: 0, _fpsN: 0
  };

  const STEP = 1 / 60;

  /* ------------------------------ инициализация ---------------------------- */
  Game.init = function () {
    const canvas = Game.canvas = $('game');
    const g = Game.g = canvas.getContext('2d', { alpha: false });

    CR.Art.build();
    CR.Input.init(canvas);

    Game.attract = { world: new CR.World(0), x: 0 };
    Game.resetTotals();

    window.addEventListener('resize', Game.resize);
    Game.resize();

    /* кнопки экранов */
    $('btnStart').addEventListener('click', () => Game.start(0, true));
    $('btnResume').addEventListener('click', () => Game.togglePause(false));
    $('btnQuit').addEventListener('click', () => Game.toTitle());
    $('btnRetry').addEventListener('click', () => Game.start(Game.levelIndex, false));
    $('btnRetryMenu').addEventListener('click', () => Game.toTitle());
    $('btnNext').addEventListener('click', () => Game.nextLevel());
    $('btnWinMenu').addEventListener('click', () => Game.toTitle());

    /* звук инициализируем только по жесту пользователя (политика браузеров) */
    const unlock = () => { Snd.init(); Snd.resume(); };
    window.addEventListener('pointerdown', unlock, { once: false });
    window.addEventListener('keydown', unlock, { once: false });

    Game.show('screenTitle');
    Game.last = performance.now();
    requestAnimationFrame(Game.frame);
  };

  Game.resetTotals = function () {
    Game.totalScore = 0;
    Game.totalStats = { kills: 0, civ: 0, cops: 0, dogs: 0, bosses: 0, houses: 0, cars: 0, pickups: 0, maxCombo: 0, time: 0 };
  };

  /* ------------------------------ масштабирование -------------------------- */
  Game.resize = function () {
    const canvas = Game.canvas;
    const wrap = canvas.parentElement;
    const availW = wrap.clientWidth, availH = wrap.clientHeight;
    const scale = Math.min(availW / W, availH / H);
    const cssW = Math.floor(W * scale), cssH = Math.floor(H * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.style.width = cssW + 'px';
    canvas.style.height = cssH + 'px';
    canvas.width = Math.round(cssW * dpr);
    canvas.height = Math.round(cssH * dpr);
    const s = (cssW * dpr) / W;
    Game.g.setTransform(s, 0, 0, s, 0, 0);
    Game.g.imageSmoothingEnabled = false;
  };

  /* -------------------------------- экраны --------------------------------- */
  const SCREENS = ['screenTitle', 'screenPause', 'screenOver', 'screenDone', 'screenWin'];
  Game.show = function (id) {
    SCREENS.forEach((s) => $(s).classList.toggle('hidden', s !== id));
    $('screens').classList.toggle('hidden', !id);
  };

  Game.toTitle = function () {
    Game.state = 'title';
    Game.level = null;
    Snd.sawLevel(0);
    Snd.stopMusic();
    Game.resetTotals();
    CR.Input.clear();
    Game.show('screenTitle');
  };

  Game.start = function (index, resetTotals) {
    Snd.init(); Snd.resume();
    if (resetTotals) Game.resetTotals();
    Game.levelIndex = U.clamp(index, 0, CR.LEVELS.length - 1);
    FX.reset();
    Game.level = new CR.Level(Game.levelIndex, Game);
    Game.state = 'play';
    CR.Input.clear();
    Snd.startMusic(Game.levelIndex);
    Game.show(null);
  };

  Game.nextLevel = function () {
    if (Game.levelIndex + 1 >= CR.LEVELS.length) { Game.toTitle(); return; }
    Game.start(Game.levelIndex + 1, false);
  };

  Game.togglePause = function (force) {
    if (Game.state !== 'play' && Game.state !== 'pause') return;
    const want = force === undefined ? Game.state === 'play' : force;
    if (want) {
      Game.state = 'pause';
      Snd.sawLevel(0);
      Snd.stopMusic();
      Game.show('screenPause');
    } else {
      Game.state = 'play';
      Snd.resume();
      Snd.startMusic(Game.levelIndex);
      CR.Input.clear();
      Game.show(null);
    }
  };

  /* ------------------------------- итоги ----------------------------------- */
  function mergeStats(L) {
    const t = Game.totalStats, s = L.stats;
    ['kills', 'civ', 'cops', 'dogs', 'bosses', 'houses', 'cars', 'pickups'].forEach((k) => { t[k] += s[k]; });
    t.maxCombo = Math.max(t.maxCombo, s.maxCombo);
    t.time += L.time;
  }

  function statRows(L, extra) {
    const s = L.stats;
    const rows = [
      ['Убито людей', s.kills],
      ['— бензопилой', s.sawKills],
      ['— из пистолета', s.gunKills],
      ['— взрывами', s.boomKills],
      ['Мини-боссов', s.bosses],
      ['Взорвано зданий', s.houses],
      ['Уничтожено машин', s.cars],
      ['Лучшее комбо', 'x' + Math.max(1, 1 + Math.floor(s.maxCombo / 4)) + ' (' + s.maxCombo + ')'],
      ['Время', L.time.toFixed(1) + ' c']
    ];
    return rows.concat(extra || []);
  }

  function fillStats(el, rows) {
    el.innerHTML = rows.map((r) =>
      '<div class="row"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>').join('');
  }

  Game.onLevelComplete = function () {
    const L = Game.level;
    mergeStats(L);
    Game.totalScore += L.score;
    Game.state = 'done';
    Snd.stopMusic();

    const last = Game.levelIndex + 1 >= CR.LEVELS.length;
    if (last) {
      fillStats($('winStats'), [
        ['Всего убито', Game.totalStats.kills],
        ['Мини-боссов', Game.totalStats.bosses],
        ['Взорвано зданий', Game.totalStats.houses],
        ['Уничтожено машин', Game.totalStats.cars],
        ['Общее время', Game.totalStats.time.toFixed(1) + ' c'],
        ['ИТОГОВЫЕ ОЧКИ', U.fmt(Game.totalScore)]
      ]);
      Game.state = 'win';
      Snd.win();
      Game.show('screenWin');
      return;
    }
    $('doneTitle').textContent = 'УРОВЕНЬ ПРОЙДЕН';
    $('doneSub').textContent = L.cfg.name + ' зачищен. Дальше — ' + CR.LEVELS[Game.levelIndex + 1].name + '.';
    fillStats($('doneStats'), statRows(L, [
      ['Бонус за здоровье', '+' + U.fmt(L.bonus || 0)],
      ['Очки за уровень', U.fmt(L.score)],
      ['Всего очков', U.fmt(Game.totalScore)]
    ]));
    Game.show('screenDone');
  };

  Game.onGameOver = function () {
    const L = Game.level;
    Game.state = 'dead';
    Snd.stopMusic();
    Snd.sawLevel(0);
    fillStats($('overStats'), statRows(L, [
      ['Очки', U.fmt(L.score)],
      ['Пройдено маршрута', Math.round(L.progress() * 100) + '%']
    ]));
    Game.show('screenOver');
  };

  /* ------------------------------ главный цикл ----------------------------- */
  Game.frame = function (ts) {
    requestAnimationFrame(Game.frame);
    let dt = (ts - Game.last) / 1000;
    Game.last = ts;
    if (!isFinite(dt) || dt < 0) dt = 0;
    dt = Math.min(dt, 0.1);

    Game._fpsT += dt; Game._fpsN++;
    if (Game._fpsT >= 0.5) { Game.fps = Game._fpsN / Game._fpsT; Game._fpsT = 0; Game._fpsN = 0; }

    /* глобальные клавиши */
    if (CR.Input.pressed('KeyM')) { Snd.init(); Snd.toggleMute(); }
    if (CR.Input.pressed('KeyP') || CR.Input.pressed('Escape')) {
      if (Game.state === 'play' || Game.state === 'pause') Game.togglePause();
    }
    if (CR.Input.pressed('Enter') || CR.Input.pressed('NumpadEnter')) {
      if (Game.state === 'title') Game.start(0, true);
      else if (Game.state === 'dead') Game.start(Game.levelIndex, false);
      else if (Game.state === 'done') Game.nextLevel();
      else if (Game.state === 'win') Game.toTitle();
      else if (Game.state === 'pause') Game.togglePause(false);
    }

    if (Game.state === 'play' && Game.level) {
      Game.acc += dt;
      let guard = 0;
      while (Game.acc >= STEP && guard++ < 5) {
        Game.level.update(STEP);
        Game.acc -= STEP;
      }
      Snd.update();
    } else {
      Game.acc = 0;
      Snd.update();
      if (Game.state === 'title') Game.attract.x += dt * 90;
      /* в паузе/на экране итогов частицы замирают — это намеренно */
    }

    Game.draw();
    CR.Input.endFrame();
  };

  /* ------------------------------- отрисовка -------------------------------- */
  Game.draw = function () {
    const g = Game.g;
    if (Game.level && Game.state !== 'title') {
      Game.level.draw(g);
      CR.HUD.draw(g, Game.level);
      if (Game.state === 'pause') {
        g.fillStyle = 'rgba(6,4,10,.55)';
        g.fillRect(0, 0, W, H);
      }
    } else {
      /* фон титульного экрана — медленно ползущая улица */
      const A = Game.attract;
      A.world.drawSky(g, A.x);
      A.world.drawHouses(g, A.x);
      A.world.drawGround(g, A.x);
      A.world.drawLamps(g, A.x, false);
      A.world.drawFore(g, A.x);
      g.fillStyle = 'rgba(10,6,16,.18)';
      g.fillRect(0, 0, W, H);
    }
  };

  window.addEventListener('DOMContentLoaded', Game.init);
})();
