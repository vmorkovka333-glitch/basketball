/* =====================================================================
   GRAND PRIX 3D — season data
   Teams, drivers, tyre compounds, points, and the 25-round calendar.

   Circuits are defined in POLAR form: a list of [angleDeg, radius] nodes in
   increasing angle, stretched by (sx,sz) and rotated by rot. Because the nodes
   are angularly ordered the resulting closed spline can never self-intersect,
   while sharp radius drops read as hairpins and long angular gaps with a flat
   radius read as straights. Every layout here is an original shape that only
   evokes the character of the venue it is named after.
   ===================================================================== */
(function () {
  'use strict';

  var TEAMS = [
    { id:'aurora', name:'Scuderia Aurora',  short:'AUR', nat:'ITA', color:'#d8382c', color2:'#f4e3c8', power:0.995, grip:0.985 },
    { id:'albion', name:'Albion GP',        short:'ALB', nat:'GBR', color:'#1f7a4d', color2:'#e8f0e4', power:0.992, grip:1.000 },
    { id:'nordwerk',name:'Nordwerk Motorsport',short:'NRD',nat:'GER',color:'#aeb8c2', color2:'#2a2f36', power:1.000, grip:0.988 },
    { id:'vitesse',name:'Bleu Vitesse',     short:'BLV', nat:'FRA', color:'#2f6fd0', color2:'#f0f4fa', power:0.986, grip:0.992 },
    { id:'kuro',   name:'Kuro Racing',      short:'KUR', nat:'JPN', color:'#2b2f38', color2:'#e0483c', power:0.984, grip:0.986 },
    { id:'vantix', name:'Vantix Grand Prix',short:'VTX', nat:'USA', color:'#ef7a1f', color2:'#241c14', power:0.981, grip:0.979 },
    { id:'meridian',name:'Meridian Racing', short:'MER', nat:'AUS', color:'#15a89d', color2:'#eaf6f4', power:0.977, grip:0.982 },
    { id:'vega',   name:'Vega Dynamics',    short:'VEG', nat:'BRA', color:'#e8be1d', color2:'#2c2a20', power:0.974, grip:0.975 },
    { id:'halcon', name:'Halcon Racing',    short:'HAL', nat:'ESP', color:'#c33d86', color2:'#f6e9f1', power:0.970, grip:0.971 },
    { id:'stahl',  name:'Stahl GP',         short:'STA', nat:'AUT', color:'#7a5cf0', color2:'#ece8fb', power:0.966, grip:0.968 }
  ];

  // 20 drivers: two per team. skill drives pace, aggression drives overtaking,
  // consistency drives how often they make a mistake.
  var DRIVERS = [
    { n:'M. Bianchi',   t:'aurora',  num:7,  nat:'ITA', skill:0.99, agg:0.72, cons:0.93 },
    { n:'R. Solberg',   t:'aurora',  num:8,  nat:'NOR', skill:0.95, agg:0.58, cons:0.95 },
    { n:'T. Ashcroft',  t:'albion',  num:1,  nat:'GBR', skill:1.00, agg:0.80, cons:0.96 },
    { n:'D. Okoro',     t:'albion',  num:2,  nat:'NGA', skill:0.96, agg:0.75, cons:0.90 },
    { n:'L. Brandt',    t:'nordwerk',num:11, nat:'GER', skill:0.98, agg:0.64, cons:0.97 },
    { n:'K. Lindqvist', t:'nordwerk',num:12, nat:'SWE', skill:0.94, agg:0.69, cons:0.91 },
    { n:'E. Moreau',    t:'vitesse', num:14, nat:'FRA', skill:0.95, agg:0.77, cons:0.88 },
    { n:'P. Dubois',    t:'vitesse', num:15, nat:'BEL', skill:0.91, agg:0.61, cons:0.92 },
    { n:'H. Tanaka',    t:'kuro',    num:22, nat:'JPN', skill:0.94, agg:0.66, cons:0.94 },
    { n:'S. Park',      t:'kuro',    num:23, nat:'KOR', skill:0.90, agg:0.73, cons:0.87 },
    { n:'C. Hale',      t:'vantix',  num:4,  nat:'USA', skill:0.92, agg:0.85, cons:0.83 },
    { n:'J. Vasquez',   t:'vantix',  num:5,  nat:'MEX', skill:0.89, agg:0.79, cons:0.86 },
    { n:'A. Whitlam',   t:'meridian',num:31, nat:'AUS', skill:0.90, agg:0.68, cons:0.89 },
    { n:'N. Rangi',     t:'meridian',num:32, nat:'NZL', skill:0.87, agg:0.62, cons:0.91 },
    { n:'F. Da Silva',  t:'vega',    num:18, nat:'BRA', skill:0.89, agg:0.82, cons:0.82 },
    { n:'V. Petrova',   t:'vega',    num:19, nat:'LAT', skill:0.86, agg:0.59, cons:0.90 },
    { n:'I. Serrano',   t:'halcon',  num:44, nat:'ESP', skill:0.87, agg:0.70, cons:0.85 },
    { n:'G. Costa',     t:'halcon',  num:45, nat:'POR', skill:0.83, agg:0.64, cons:0.88 },
    { n:'B. Gruber',    t:'stahl',   num:27, nat:'AUT', skill:0.84, agg:0.66, cons:0.84 },
    { n:'O. Halvorsen', t:'stahl',   num:28, nat:'DEN', skill:0.81, agg:0.57, cons:0.87 }
  ];

  // Tyres. grip is dry grip, wet is grip on a wet surface, wear is how fast the
  // compound loses it. Intermediates and wets are slow in the dry and overheat.
  var TYRES = [
    { id:'S', name:'Soft',         label:'SOFT', color:'#d8382c', grip:1.045, wet:0.58, wear:1.55, dryOK:true },
    { id:'M', name:'Medium',       label:'MED',  color:'#e8be1d', grip:1.000, wet:0.62, wear:1.00, dryOK:true },
    { id:'H', name:'Hard',         label:'HARD', color:'#e6e2da', grip:0.962, wet:0.66, wear:0.66, dryOK:true },
    { id:'I', name:'Intermediate', label:'INTER',color:'#1f9e4d', grip:0.905, wet:0.94, wear:1.15, dryOK:false },
    { id:'W', name:'Wet',          label:'WET',  color:'#2f6fd0', grip:0.845, wet:1.02, wear:0.95, dryOK:false }
  ];

  var POINTS = [25, 18, 15, 12, 10, 8, 6, 4, 2, 1];

  var DIFFS = [
    { id:'rookie', name:'Rookie',      ai:0.930, mist:1.7, help:1.12 },
    { id:'pro',    name:'Pro',         ai:0.972, mist:1.0, help:1.00 },
    { id:'ace',    name:'Ace',         ai:1.000, mist:0.55, help:0.94 }
  ];

  /* --- the calendar -------------------------------------------------- */
  // p: [angleDeg, radius] nodes.  sx/sz: stretch.  rot: rotation in degrees.
  // w: half track width.  laps: race distance.  night: floodlit.
  // rain: chance of a wet race.  pit: where the pit lane sits (0..1 of the lap).
  var CAL = [
    { id:'melbourne', gp:'Australian Grand Prix', city:'Melbourne', nat:'AUS', env:'parkland', home:'meridian', night:false, rain:0.20, w:6.4, laps:8, pit:0.00, sx:1.30, sz:1.00, rot:0,
      p:[[0,118],[26,124],[52,112],[74,128],[96,120],[118,96],[140,104],[162,120],[184,116],[206,92],[226,104],[248,118],[268,110],[288,92],[310,100],[332,114],[352,120]] },
    { id:'sakhir', gp:'Bahrain Grand Prix', city:'Sakhir', nat:'BHR', env:'desert', home:'aurora', night:true, rain:0.02, w:6.8, laps:8, pit:0.02, sx:1.15, sz:1.00, rot:12,
      p:[[0,130],[30,132],[58,80],[76,88],[98,112],[124,118],[150,82],[168,94],[196,120],[224,124],[250,86],[272,100],[300,124],[330,132],[356,130]] },
    { id:'shanghai', gp:'Chinese Grand Prix', city:'Shanghai', nat:'CHN', cold:true, env:'metropolis', home:'kuro', night:false, rain:0.28, w:6.6, laps:8, pit:0.01, sx:1.22, sz:1.02, rot:-8,
      p:[[0,140],[24,138],[46,104],[62,72],[80,52],[104,64],[126,96],[148,118],[172,126],[198,120],[222,88],[244,72],[266,96],[292,124],[318,136],[344,142]] },
    { id:'baku', gp:'Azerbaijan Grand Prix', city:'Baku', nat:'AZE', env:'oldtown', home:'nordwerk', night:false, rain:0.10, w:5.8, laps:8, pit:0.00, sx:1.45, sz:0.86, rot:0,
      p:[[0,152],[22,150],[44,146],[68,80],[84,66],[104,74],[124,118],[146,124],[170,66],[188,78],[212,128],[238,132],[262,72],[284,86],[308,140],[334,150],[356,152]] },
    { id:'miami', gp:'Miami Grand Prix', city:'Miami', nat:'USA', env:'coast', home:'vantix', night:false, rain:0.22, w:6.2, laps:8, pit:0.03, sx:1.18, sz:1.06, rot:20,
      p:[[0,124],[28,128],[54,84],[72,68],[94,80],[116,120],[142,126],[166,90],[186,72],[206,84],[230,122],[256,126],[280,96],[304,108],[330,122],[354,126]] },
    { id:'imola', gp:'Emilia Grand Prix', city:'Imola', nat:'ITA', cold:true, env:'vineyard', home:'aurora', night:false, rain:0.24, w:6.0, laps:8, pit:0.01, sx:0.98, sz:1.22, rot:-14,
      p:[[0,112],[24,120],[48,94],[70,78],[90,92],[112,116],[134,122],[156,88],[176,70],[198,84],[222,116],[248,122],[272,92],[298,104],[324,118],[350,114]] },
    { id:'monaco', gp:'Monaco Grand Prix', city:'Monte Carlo', nat:'MON', env:'harbour', home:'vitesse', night:false, rain:0.12, w:5.0, laps:9, pit:0.00, sx:1.06, sz:0.90, rot:8,
      p:[[0,92],[22,96],[44,56],[58,40],[76,54],[96,88],[116,92],[136,50],[152,38],[172,52],[194,88],[216,92],[238,52],[254,40],[276,56],[300,90],[326,96],[352,94]] },
    { id:'barcelona', gp:'Spanish Grand Prix', city:'Barcelona', nat:'ESP', env:'dryhills', home:'halcon', night:false, rain:0.16, w:6.6, laps:8, pit:0.02, sx:1.12, sz:1.04, rot:-20,
      p:[[0,128],[26,130],[50,96],[72,86],[96,102],[120,124],[144,128],[168,92],[190,86],[212,96],[236,124],[262,128],[288,98],[314,110],[340,126],[358,130]] },
    { id:'montreal', gp:'Canadian Grand Prix', city:'Montreal', nat:'CAN', cold:true, env:'island', home:'albion', night:false, rain:0.30, w:5.8, laps:8, pit:0.01, sx:1.40, sz:0.88, rot:4,
      p:[[0,146],[24,144],[48,80],[64,66],[86,78],[110,132],[136,138],[160,74],[178,64],[200,78],[224,134],[250,140],[274,76],[296,88],[322,140],[348,146]] },
    { id:'spielberg', gp:'Austrian Grand Prix', city:'Spielberg', nat:'AUT', cold:true, env:'alpine', home:'stahl', night:false, rain:0.26, w:7.0, laps:10, pit:0.00, sx:1.10, sz:0.98, rot:-6,
      p:[[0,96],[34,100],[66,52],[84,64],[112,96],[146,100],[176,50],[196,62],[226,98],[258,100],[288,54],[308,66],[338,96]] },
    { id:'silverstone', gp:'British Grand Prix', city:'Silverstone', nat:'GBR', cold:true, env:'farmland', home:'albion', night:false, rain:0.34, w:7.2, laps:8, pit:0.02, sx:1.20, sz:1.08, rot:16,
      p:[[0,140],[28,144],[56,126],[80,138],[104,130],[126,102],[150,114],[176,136],[202,140],[228,112],[252,90],[274,104],[300,134],[326,142],[352,142]] },
    { id:'budapest', gp:'Hungarian Grand Prix', city:'Budapest', nat:'HUN', cold:true, env:'dryhills', home:'stahl', night:false, rain:0.20, w:5.6, laps:9, pit:0.01, sx:1.00, sz:1.00, rot:-30,
      p:[[0,104],[22,108],[44,66],[60,52],[80,66],[102,104],[124,108],[144,62],[160,50],[180,64],[204,104],[226,108],[248,66],[266,52],[288,68],[312,106],[338,110],[358,106]] },
    { id:'spa', gp:'Belgian Grand Prix', city:'Spa', nat:'BEL', cold:true, env:'forest', home:'vitesse', night:false, rain:0.46, w:7.0, laps:7, pit:0.00, sx:1.42, sz:1.10, rot:-12,
      p:[[0,162],[26,168],[52,150],[76,164],[100,156],[122,118],[142,96],[164,112],[188,152],[214,164],[240,146],[264,102],[286,86],[310,110],[336,152],[356,160]] },
    { id:'zandvoort', gp:'Dutch Grand Prix', city:'Zandvoort', nat:'NED', cold:true, env:'dunes', home:'nordwerk', night:false, rain:0.38, w:5.6, laps:9, pit:0.02, sx:1.00, sz:1.04, rot:22,
      p:[[0,108],[26,112],[50,72],[68,58],[90,72],[114,110],[138,114],[160,70],[178,56],[200,72],[224,112],[248,116],[272,74],[292,60],[316,76],[342,110]] },
    { id:'monza', gp:'Italian Grand Prix', city:'Monza', nat:'ITA', env:'parkland', home:'aurora', night:false, rain:0.18, w:7.2, laps:8, pit:0.00, sx:1.55, sz:1.00, rot:0,
      p:[[0,168],[30,166],[58,162],[76,86],[92,102],[120,158],[152,164],[180,160],[200,90],[216,104],[244,158],[276,166],[306,162],[326,92],[342,108],[356,150]] },
    { id:'singapore', gp:'Singapore Grand Prix', city:'Singapore', nat:'SGP', env:'metropolis', home:'kuro', night:true, rain:0.36, w:5.4, laps:9, pit:0.01, sx:1.08, sz:0.94, rot:-24,
      p:[[0,104],[20,106],[40,60],[54,46],[72,60],[92,102],[112,106],[130,58],[146,44],[164,58],[186,104],[208,108],[228,60],[244,46],[262,60],[284,104],[308,108],[332,64],[350,84]] },
    { id:'suzuka', gp:'Japanese Grand Prix', city:'Suzuka', nat:'JPN', env:'japan', home:'kuro', night:false, rain:0.32, w:6.2, laps:8, pit:0.01, sx:1.24, sz:1.00, rot:10,
      p:[[0,132],[18,136],[34,112],[50,132],[66,110],[82,130],[100,122],[122,88],[144,100],[168,128],[194,132],[220,94],[242,78],[264,96],[290,128],[318,134],[346,134]] },
    { id:'lusail', gp:'Qatar Grand Prix', city:'Lusail', nat:'QAT', env:'desert', home:'vitesse', night:true, rain:0.02, w:7.0, laps:8, pit:0.02, sx:1.16, sz:1.06, rot:-16,
      p:[[0,142],[28,146],[56,130],[82,142],[106,134],[130,104],[154,118],[180,140],[206,144],[232,114],[256,94],[280,110],[306,138],[332,146],[356,144]] },
    { id:'austin', gp:'United States Grand Prix', city:'Austin', nat:'USA', env:'prairie', home:'vantix', night:false, rain:0.24, w:6.8, laps:8, pit:0.00, sx:1.26, sz:1.06, rot:34,
      p:[[0,138],[22,142],[40,118],[56,138],[72,116],[92,134],[114,124],[138,90],[162,104],[188,132],[214,138],[240,106],[264,84],[288,102],[314,134],[342,140]] },
    { id:'mexico', gp:'Mexico City Grand Prix', city:'Mexico City', nat:'MEX', env:'plateau', home:'vantix', night:false, rain:0.18, w:6.4, laps:9, pit:0.01, sx:1.24, sz:0.96, rot:-4,
      p:[[0,134],[26,132],[50,128],[70,74],[88,88],[112,126],[138,130],[162,76],[182,88],[206,128],[232,132],[256,80],[278,68],[302,86],[328,128],[354,134]] },
    { id:'saopaulo', gp:'Sao Paulo Grand Prix', city:'Sao Paulo', nat:'BRA', cold:true, env:'hillcity', home:'vega', night:false, rain:0.40, w:6.0, laps:10, pit:0.02, sx:1.04, sz:0.94, rot:-40,
      p:[[0,100],[28,104],[54,66],[72,54],[94,70],[118,102],[144,106],[168,64],[188,52],[210,68],[234,104],[260,106],[286,70],[310,84],[336,100]] },
    { id:'vegas', gp:'Las Vegas Grand Prix', city:'Las Vegas', nat:'USA', env:'strip', home:'vantix', night:true, rain:0.06, w:6.6, laps:8, pit:0.00, sx:1.50, sz:0.84, rot:18,
      p:[[0,158],[26,156],[52,152],[74,78],[90,92],[116,146],[144,154],[170,150],[192,80],[208,94],[234,148],[262,156],[288,152],[310,80],[328,96],[352,150]] },
    { id:'yasmarina', gp:'Abu Dhabi Grand Prix', city:'Yas Marina', nat:'UAE', env:'marina', home:'albion', night:true, rain:0.02, w:6.8, laps:8, pit:0.01, sx:1.22, sz:1.00, rot:-10,
      p:[[0,136],[28,138],[56,134],[78,84],[96,98],[122,132],[150,138],[176,90],[196,76],[218,92],[244,134],[272,138],[298,98],[322,112],[350,134]] },
    { id:'jeddah', gp:'Saudi Arabian Grand Prix', city:'Jeddah', nat:'KSA', env:'coast', home:'aurora', night:true, rain:0.02, w:6.0, laps:8, pit:0.00, sx:1.48, sz:0.90, rot:6,
      p:[[0,156],[20,158],[38,138],[54,156],[72,136],[90,152],[110,144],[134,104],[158,120],[184,150],[210,156],[236,124],[258,96],[280,116],[306,148],[332,156],[354,156]] },
    { id:'portimao', gp:'Portuguese Grand Prix', city:'Portimao', nat:'POR', cold:true, env:'dryhills', home:'halcon', night:false, rain:0.28, w:6.2, laps:9, pit:0.02, sx:1.06, sz:1.10, rot:28,
      p:[[0,118],[24,124],[48,86],[66,72],[88,88],[112,122],[136,126],[158,84],[178,70],[200,86],[224,124],[250,128],[276,88],[300,102],[326,120],[352,120]] }
  ];

  // polar nodes -> world control points
  // Shaping: radii are pushed apart so a small radius reads as a hairpin and a
  // long flat stretch reads as a straight, instead of everything rounding into
  // one soft blob. K is the world scale that sets real lap lengths.
  var K = 3.5, SHAPE = 1.95, RMIN = 0.36;
  CAL.forEach(function (t) {
    var R = Math.max.apply(null, t.p.map(function (nd) { return nd[1]; }));
    t.ctrl = t.p.map(function (nd) {
      var a = nd[0] * Math.PI / 180 + (t.rot || 0) * Math.PI / 180;
      var r = R * (RMIN + (1 - RMIN) * Math.pow(nd[1] / R, SHAPE)) * K;
      return [Math.cos(a) * r * (t.sx || 1), Math.sin(a) * r * (t.sz || 1)];
    });
    t.round = 0;
  });
  CAL.forEach(function (t, i) { t.round = i + 1; });

  window.GPDATA = {
    TEAMS: TEAMS, DRIVERS: DRIVERS, TYRES: TYRES, POINTS: POINTS,
    DIFFS: DIFFS, CAL: CAL,
    team: function (id) { return TEAMS.filter(function (t) { return t.id === id; })[0]; },
    tyre: function (id) { return TYRES.filter(function (t) { return t.id === id; })[0]; },
    track: function (id) { return CAL.filter(function (t) { return t.id === id; })[0]; }
  };
})();
