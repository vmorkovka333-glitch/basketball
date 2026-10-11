// Zombie Squad - the GameDistribution bridge. Loads the GD HTML5 SDK once, before the game
// starts, and connects it to the game's portal hooks:
//   window.gameShowAd(kind, done)   'preroll' on PLAY, 'midgame' on Next / Retry / Menu / Quit.
//                                   Only ever called from a button the player pressed, never in play.
//   window.gameShowRewarded(cb)     a rewarded video the player asked for; cb(true) only after
//                                   SDK_REWARDED_WATCH_COMPLETE, so an error or a skip pays nothing.
//   window.gameRewardedReady()      true once a rewarded ad is preloaded; the game hides its
//                                   reward buttons until then (and forever if rewarded ads are off).
// SDK_GAME_PAUSE freezes the world and mutes all sound, SDK_GAME_START brings both back.
// Without a game ID (local testing) or with the SDK blocked, every call just continues the game.
(function(){
  var ID = String(window.GD_GAME_ID || '').trim();
  var configured = /^[0-9a-z-]{8,64}$/i.test(ID) && !/your|game.?id|x{6}/i.test(ID);
  var st = { ready:false, adOn:false, rewardOk:false, rewardDone:false, busy:false, listeners:[] };
  var GD = window.GDBridge = st;

  function pauseGame(on){ if(typeof window.gamePauseForAd === 'function'){ try{ window.gamePauseForAd(on); }catch(e){} } }
  function sdk(){ return configured && typeof window.gdsdk !== 'undefined' && window.gdsdk && typeof window.gdsdk.showAd === 'function'; }
  function changed(){ for(var i = 0; i < st.listeners.length; i++){ try{ st.listeners[i](); }catch(e){} } }
  GD.onChange = function(f){ st.listeners.push(f); };

  function preloadRewarded(){
    if(!sdk() || typeof window.gdsdk.preloadAd !== 'function' || st.rewardOk) return;
    try{
      window.gdsdk.preloadAd('rewarded').then(function(){ st.rewardOk = true; changed(); })
        .catch(function(){ st.rewardOk = false; changed(); });
    }catch(e){}
  }

  window.GD_OPTIONS = {
    gameId: ID,
    onEvent: function(event){
      switch(event && event.name){
        case 'SDK_READY': st.ready = true; preloadRewarded(); break;
        case 'SDK_GAME_PAUSE': st.adOn = true; pauseGame(true); break;     // an ad is about to play
        case 'SDK_GAME_START': st.adOn = false; pauseGame(false); break;   // the ad is over
        case 'SDK_REWARDED_WATCH_COMPLETE': st.rewardDone = true; break;
      }
    },
  };
  if(configured){
    (function(d, s, id){
      var js, fjs = d.getElementsByTagName(s)[0];
      if(d.getElementById(id)) return;
      js = d.createElement(s); js.id = id; js.src = 'https://html5.api.gamedistribution.com/main.min.js';
      fjs.parentNode.insertBefore(js, fjs);
    }(document, 'script', 'gamedistribution-jssdk'));
  }

  // an interstitial between rounds; done() always runs exactly once
  window.gameShowAd = function(kind, done){
    done = typeof done === 'function' ? done : function(){};
    if(!sdk() || st.busy){ done(); return; }
    st.busy = true; GD.waiting(true);
    var over = false, t0 = Date.now();
    function finish(){
      if(over) return; over = true; clearInterval(guard); st.busy = false; GD.waiting(false);
      if(st.adOn){ st.adOn = false; pauseGame(false); }
      done();
    }
    // the SDK resolves right away when no ad is due; if an ad never starts (or never reports its end),
    // do not keep the player behind the veil
    var guard = setInterval(function(){ var t = Date.now() - t0; if((!st.adOn && t > 9000) || t > 90000) finish(); }, 250);
    try{ var p = window.gdsdk.showAd(); if(p && p.then) p.then(finish, finish); else finish(); }
    catch(e){ finish(); }
  };

  window.gameRewardedReady = function(){ return sdk() && st.rewardOk && !st.busy; };
  window.gameShowRewarded = function(cb){
    cb = typeof cb === 'function' ? cb : function(){};
    if(!window.gameRewardedReady()){ cb(false); return; }
    st.busy = true; st.rewardOk = false; st.rewardDone = false; GD.waiting(true); changed();
    var over = false, t0 = Date.now();
    function finish(ok){
      if(over) return; over = true; clearInterval(guard); st.busy = false; GD.waiting(false);
      if(st.adOn){ st.adOn = false; pauseGame(false); }
      cb(!!ok && st.rewardDone); preloadRewarded(); changed();
    }
    // same safety net as the interstitial; a reward still needs SDK_REWARDED_WATCH_COMPLETE
    var guard = setInterval(function(){ var t = Date.now() - t0; if((!st.adOn && t > 9000) || t > 90000) finish(st.rewardDone); }, 250);
    try{
      var p = window.gdsdk.showAd('rewarded');
      // the reward needs SDK_REWARDED_WATCH_COMPLETE; give the event a moment if the promise is first
      if(p && p.then) p.then(function(){ if(st.rewardDone) finish(true); else setTimeout(function(){ finish(st.rewardDone); }, 600); }, function(){ finish(false); });
      else finish(false);
    }catch(e){ finish(false); }
  };

  // a quiet veil while the SDK fetches an ad, so a second click cannot start anything
  GD.waiting = function(on){
    var el = document.getElementById('adWait'); if(el) el.classList.toggle('show', !!on);
  };
})();
