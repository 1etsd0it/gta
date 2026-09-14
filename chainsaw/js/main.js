/* ============================================================================
   main.js — boot: build the procedural assets, create the game, run the loop.
   ========================================================================== */
(function () {
  'use strict';
  const CR = window.CR;

  function boot() {
    const canvas = document.getElementById('view');
    const ctx = canvas.getContext('2d');

    /* a loading card while the art is generated (a few hundred ms) */
    canvas.width = 1280; canvas.height = 720;
    ctx.fillStyle = '#07070a'; ctx.fillRect(0, 0, 1280, 720);
    ctx.fillStyle = '#c0261f';
    ctx.font = '900 44px Haettenschweiler, Impact, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('GENERATING SUBURBS…', 640, 360);

    setTimeout(() => {
      CR.Assets.build();
      CR.Particles.init('high');
      CR.Rig.kit('player');                 /* warm the most important kit */

      const game = window.GAME = new CR.Game(canvas);

      window.addEventListener('resize', () => game.resize(window.innerWidth, window.innerHeight));
      const unlock = () => { game.audio.init(); game.audio.resume(); };
      window.addEventListener('pointerdown', unlock);
      window.addEventListener('keydown', unlock);

      let last = performance.now();
      let fpsAcc = 0, fpsN = 0, lowFrames = 0;
      function frame(now) {
        requestAnimationFrame(frame);
        let dt = (now - last) / 1000;
        last = now;
        if (!isFinite(dt) || dt < 0) dt = 0;
        dt = Math.min(dt, 1 / 20);          /* never simulate a huge step */

        /* global keys */
        const inp = game.input;
        if (inp.key('KeyP') || inp.key('Escape')) {
          if (game.state === 'play') game.setPaused(true);
          else if (game.state === 'pause') game.setPaused(false);
        }
        if (inp.key('KeyM')) {
          game.audio.init();
          game.ui.toast(game.audio.toggleMute() ? 'SOUND OFF' : 'SOUND ON', 1);
        }
        if (inp.key('Enter')) {
          if (game.state === 'menu') game.startLevel();
          else if (game.state === 'dead') game.startLevel();
          else if (game.state === 'complete') game.nextLevel();
        }

        game.update(dt);
        game.render();
        inp.endFrame();

        fpsAcc += dt; fpsN++;
        if (fpsAcc >= .5) {
          game.fps = fpsN / fpsAcc; fpsAcc = 0; fpsN = 0;
          /* adaptive quality: step down (never up, to avoid oscillation) when
             the frame budget is consistently missed */
          if (game.state === 'play') {
            if (game.fps < 40) lowFrames++; else lowFrames = Math.max(0, lowFrames - 1);
            if (lowFrames > 6 && game.quality === 'high') {
              game.setQuality('medium');
              document.getElementById('setQuality').value = 'medium';
              game.ui.toast('QUALITY: MEDIUM', 1.4);
              lowFrames = 0;
            } else if (lowFrames > 10 && game.quality === 'medium' && game.fps < 28) {
              game.setQuality('low');
              document.getElementById('setQuality').value = 'low';
              game.ui.toast('QUALITY: LOW', 1.4);
              lowFrames = 0;
            }
          }
        }
      }
      requestAnimationFrame(frame);
    }, 30);
  }

  if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
