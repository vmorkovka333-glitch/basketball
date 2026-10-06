// Zombie Squad - map themes, the zone-based map generator and the campaign.
// A map is a 4x3 grid of zones. Zone borders are walls with a gap that is open, a door
// (bought with points in Survival, opened by the mission in the campaign), a shortcut gate
// with a lever, or a sealed secret door. One zone is the secret room, the farthest is the arena.
(function(ZD){

// ---- seeded random ----------------------------------------------------------
function hashStr(s){ let h = 2166136261; for(let i=0;i<s.length;i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function RNG(seed){ let s = (seed >>> 0) || 1; return ()=>{ s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s/4294967296; }; }
ZD.RNG = RNG; ZD.hashStr = hashStr;
const pickW = (rng, weights)=>{ let tot = 0; for(const k in weights) tot += weights[k]; let r = rng()*tot; for(const k in weights){ r -= weights[k]; if(r <= 0) return k; } return Object.keys(weights)[0]; };
const shuffle = (rng, a)=>{ for(let i=a.length-1;i>0;i--){ const j = (rng()*(i+1))|0; const t = a[i]; a[i] = a[j]; a[j] = t; } return a; };

// ---- props: footprint w (x) x d (z) and height --------------------------------
ZD.PROPS = {
  car:[4.4,1.9,1.5], bus:[11,2.8,3], barrier:[3,0.7,0.95], dumpster:[1.8,1.2,1.4], crates:[2.4,1.2,2.2], crate:[1.2,1.2,1.2],
  barrel:[0.8,0.8,1.1], bench:[2.2,0.6,0.5], sandbags:[3,0.9,1.0], container:[6,2.4,2.6], tent:[5,4,2.6], truck:[6.2,2.4,2.8],
  tower:[2.6,2.6,6], bed:[2.1,1.0,0.8], cabinet:[1.6,0.6,2.0], desk:[1.8,0.9,0.9], curtain:[2.4,0.14,2.1], gurney:[2,0.7,0.9],
  chairs:[2,0.6,0.9], labtable:[3,1.2,1.0], tank:[1.6,1.6,2.6], server:[1.0,1.0,2.2], table:[2.2,1.2,0.85], shelf:[4,0.8,2.2],
  kiosk:[3,2,1.2], planter:[2,2,0.8], mannequin:[0.7,0.7,1.9], cart:[1.2,0.8,1.1], pillar:[0.9,0.9,4.5], trash:[0.7,0.7,1.0],
  tree:[0.6,0.6,5], pine:[0.6,0.6,6], rock:[2.2,1.8,1.4], log:[4,0.7,0.7], stump:[0.9,0.9,0.6], machine:[3,2,2.4],
  conveyor:[6,1.2,1.0], pipes:[4,0.8,1.6], forklift:[2.6,1.4,2.2], bollard:[0.6,0.6,0.8], crystal:[1.2,1.2,2.4],
  cactus:[0.7,0.7,2.4], wreck:[4.4,1.9,1.3],
  // features
  reception:[6,1.4,1.1], cells:[12,3,3.2], fountain:[4,4,1.0], traincar:[14,3,3.4], bigmachine:[6,4,3.6], tankrow:[6,1.8,2.6],
};
const ORIENTED = { car:1, bus:1, wreck:1, truck:1, container:1, sandbags:1, log:1, bed:1, labtable:1, shelf:1, conveyor:1, pipes:1, bench:1, chairs:1,
  barrier:1, desk:1, curtain:1, gurney:1, table:1, forklift:1, tent:1, reception:1, cells:1, traincar:1, bigmachine:1, tankrow:1, kiosk:1, crates:1, cabinet:1 };

// ---- themes -----------------------------------------------------------------
// env: lighting preset in world.js. wallH: [min, max] wall height. density: props per zone.
ZD.THEMES = {
  city:      { outdoor:true,  zone:30, wallH:[7, 11], wall:'facade',     floor:'asphalt', buildings:['brick','teal','beige','brick2','beige2','diner'], buildRate:0.7,
               props:{ car:3, barrier:2, dumpster:1.5, bus:0.4, crates:1, barrel:1, bench:0.6, wreck:0.6 }, density:1, env:'dusk', weather:'rain', door:'gate', evac:'heli', amb:'city', lamps:'post' },
  military:  { outdoor:true,  zone:30, wallH:[3.2, 3.6], wall:'hesco',   floor:'dirt', buildings:['bunker','hangar'], buildRate:0.55,
               props:{ sandbags:3, container:1.5, tent:1.2, truck:1, crates:2, barrel:1.5, tower:0.35 }, density:1, env:'overcast', weather:'wind', door:'gate', evac:'heli', amb:'wind', lamps:'flood' },
  hospital:  { outdoor:false, zone:24, wallH:[4.6, 4.6], wall:'tile',    floor:'tiles',
               props:{ bed:3, cabinet:1.5, desk:1, curtain:1.5, gurney:1.2, chairs:1 }, features:['reception','beds'], density:1, env:'indoorGreen', weather:'storm', door:'metal', evac:'exit', amb:'hum', lamps:'ceiling' },
  lab:       { outdoor:false, zone:24, wallH:[5, 5], wall:'metal',         floor:'metal',
               props:{ labtable:2, tank:1.5, server:2, crates:1, cabinet:1 }, features:['tankrow'], density:1, env:'indoorCyan', weather:null, door:'shutter', evac:'exit', amb:'hum', lamps:'ceiling' },
  prison:    { outdoor:false, zone:24, wallH:[5, 5], wall:'concrete',      floor:'concrete',
               props:{ bench:1.5, table:1.2, bed:1.5, crates:1, barrel:1 }, features:['cells'], density:1, env:'indoorYellow', weather:null, door:'bars', evac:'exit', amb:'drip', lamps:'ceiling' },
  mall:      { outdoor:false, zone:24, wallH:[5.4, 5.4], wall:'shops',     floor:'marble',
               props:{ shelf:3, kiosk:1.2, bench:1, planter:1.5, mannequin:1, cart:1 }, features:['fountain'], density:1, env:'indoorWarm', weather:null, door:'shutter', evac:'exit', amb:'hum', lamps:'ceiling' },
  subway:    { outdoor:false, zone:24, wallH:[4.8, 4.8], wall:'subtile',   floor:'concrete',
               props:{ bench:2, pillar:2.5, barrier:1, crates:0.8, trash:1 }, features:['traincar'], density:0.9, env:'indoorDark', weather:null, door:'metal', evac:'train', amb:'tunnel', lamps:'ceiling' },
  forest:    { outdoor:true,  zone:30, wallH:[5, 7], wall:'treeline',      floor:'grass', buildings:['cabin'], buildRate:0.35,
               props:{ tree:5, rock:2, log:2, tent:0.5, stump:1 }, density:1.2, env:'night', weather:'fog', door:'wood', evac:'heli', amb:'forest', lamps:'lantern' },
  factory:   { outdoor:false, zone:24, wallH:[6, 6], wall:'brickin',       floor:'concrete',
               props:{ machine:2, conveyor:1.5, crates:2, barrel:2, container:0.4, pipes:0.8 }, features:['bigmachine'], density:1, env:'indoorOrange', weather:null, door:'shutter', evac:'exit', amb:'machines', lamps:'ceiling' },
  harbor:    { outdoor:true,  zone:30, wallH:[5.2, 5.2], wall:'containers', floor:'concrete', buildings:['warehouse'], buildRate:0.4,
               props:{ container:2, crates:2, barrel:2, forklift:0.8, bollard:1 }, density:1, env:'harbor', weather:'fog', door:'gate', evac:'heli', amb:'sea', lamps:'flood' },
  underground:{ outdoor:false, zone:24, wallH:[5.5, 5.5], wall:'rock',     floor:'rock',
               props:{ rock:3, pipes:1, tank:0.8, crates:1, barrel:1, crystal:1.2 }, features:['tankrow'], density:1, env:'indoorPurple', weather:null, door:'metal', evac:'exit', amb:'cave', lamps:'crystal' },
  desert:    { outdoor:true,  zone:30, wallH:[3.4, 4.2], wall:'adobe',     floor:'sand', buildings:['adobe'], buildRate:0.6,
               props:{ cactus:3, rock:2, wreck:1, barrel:1, crates:1 }, density:1, env:'day', weather:'sand', door:'wood', evac:'heli', amb:'wind', lamps:'post' },
  snow:      { outdoor:true,  zone:30, wallH:[3.2, 3.6], wall:'palisade',  floor:'snow', buildings:['cabin'], buildRate:0.5,
               props:{ pine:3, rock:2, crates:1, barrel:1, wreck:0.8, log:1 }, density:1, env:'snow', weather:'snow', door:'wood', evac:'heli', amb:'wind', lamps:'lantern' },
};

// ---- maps and the campaign ------------------------------------------------------
// zone roles in steps: start | near | mid | far | arena | any
ZD.MAPS = [
  { id:'city', name:'ABANDONED CITY', theme:'city', boss:'butcher', secret:'raygun', mix:{ runner:0.14, brute:0.04, bloater:0.04 },
    missions:[
      { id:'city1', name:'FIRST CONTACT', intensity:1, par:330, brief:'An old generator still works. Fuel it up, then get to the chopper.', mix:{ runner:0.12, brute:0.03 },
        steps:[ { type:'reach', zone:'near', text:'Move into the city' },
                { type:'collect', item:'fuel', count:4, zones:['near','mid','mid','far','near'], text:'Collect fuel cans' },
                { type:'activate', zone:'mid', time:14, horde:16, label:'GENERATOR', text:'Refuel the generator' },
                { type:'evac', zone:'arena', wait:30, text:'Reach the evac point' } ] },
      { id:'city2', name:'SUPPLY RUN', intensity:2, par:420, brief:'The clinic left medicine behind. Grab it and burn the nests on the way out.',
        steps:[ { type:'reach', zone:'mid', text:'Get to the old clinic' },
                { type:'collect', item:'medkit', count:5, zones:['mid','mid','far','near','far','mid'], text:'Collect medkits' },
                { type:'destroy', count:3, zones:['far','mid','arena'], nestHp:1100, text:'Destroy the zombie nests' },
                { type:'evac', zone:'arena', wait:32, text:'Reach the evac point' } ] },
      { id:'city3', name:"BUTCHER'S BLOCK", intensity:2, par:420, brief:'Something big runs this block. Find the gate code and end it.',
        steps:[ { type:'code', zones:['near','mid','far'], panel:'mid', text:'Find the 3 parts of the gate code' },
                { type:'boss', zone:'arena', text:'Kill the Butcher' },
                { type:'evac', zone:'arena', wait:22, text:'Hold out for the chopper' } ] },
    ] },
  { id:'military', name:'MILITARY BASE', theme:'military', boss:'general', secret:'storm', mix:{ runner:0.18, brute:0.06, bloater:0.05, armored:0.1 },
    missions:[
      { id:'mil1', name:'LOCKDOWN', intensity:2, par:420, brief:'The base is sealed. Bring the fuses back, power the gates and find the radio.',
        steps:[ { type:'collect', item:'fuse', count:3, zones:['near','mid','far'], text:'Find the fuse boxes' },
                { type:'activate', zone:'mid', time:10, horde:14, label:'POWER PANEL', text:'Restore power' },
                { type:'signal', zone:'far', text:'Follow the radio signal' },
                { type:'evac', zone:'arena', wait:30, text:'Reach the evac point' } ] },
      { id:'mil2', name:'GENERAL GORE', intensity:3, par:480, brief:'The base commander turned. Gather the intel and take him down.',
        steps:[ { type:'investigate', count:3, zones:['near','mid','far'], time:3, label:'INTEL', text:'Scan the intel' },
                { type:'kill', count:40, timeLimit:150, text:'Hold the line' },
                { type:'boss', zone:'arena', text:'Kill General Gore' },
                { type:'evac', zone:'arena', wait:22, text:'Hold out for the chopper' } ] },
    ] },
  { id:'hospital', name:'ST. MARY HOSPITAL', theme:'hospital', boss:'doctor', secret:'dragon', mix:{ runner:0.16, brute:0.05, bloater:0.06, armored:0.06, healer:0.08 },
    missions:[
      { id:'hos1', name:'CODE BLUE', intensity:2, par:420, brief:'A nurse is still alive on the top floor. Get medicine and get her out.',
        steps:[ { type:'reach', zone:'near', text:'Enter the wards' },
                { type:'collect', item:'medkit', count:4, zones:['near','mid','mid','far','far'], text:'Collect medkits' },
                { type:'rescue', zone:'far', text:'Find the survivor' },
                { type:'evac', zone:'start', wait:26, escort:true, text:'Get her to the exit' } ] },
      { id:'hos2', name:'DR. ROT', intensity:3, par:480, brief:'The chief doctor kept experimenting. Collect his samples, then stop him.',
        steps:[ { type:'investigate', count:3, zones:['near','mid','far'], time:3, label:'SAMPLE', text:'Collect the samples' },
                { type:'activate', zone:'mid', time:12, horde:14, label:'GENERATOR', text:'Turn the power back on' },
                { type:'boss', zone:'arena', text:'Kill Dr. Rot' },
                { type:'evac', zone:'arena', wait:20, text:'Get to the exit' } ] },
    ] },
  { id:'lab', name:'HELIX LAB', theme:'lab', boss:'specimen', secret:'void', mix:{ runner:0.16, brute:0.05, armored:0.08, healer:0.06, teleport:0.08, mutant:0.08 },
    missions:[
      { id:'lab1', name:'CONTAINMENT', intensity:3, par:450, brief:'Restart the containment relays and find the vaccine crate.',
        steps:[ { type:'activate', multi:['near','mid','far'], time:8, horde:8, label:'RELAY', text:'Switch on the relays' },
                { type:'search', zone:'far', count:3, text:'Find the vaccine crate' },
                { type:'evac', zone:'arena', wait:30, text:'Get to the exit' } ] },
      { id:'lab2', name:'SPECIMEN X', intensity:3, par:480, brief:'Specimen X broke out. Unlock its wing and finish it.',
        steps:[ { type:'code', zones:['near','mid','far'], panel:'mid', text:'Find the 3 parts of the wing code' },
                { type:'destroy', count:2, zones:['mid','far'], nestHp:1300, text:'Burn the growths' },
                { type:'boss', zone:'arena', text:'Kill Specimen X' },
                { type:'evac', zone:'arena', wait:20, text:'Get to the exit' } ] },
    ] },
  { id:'prison', name:'BLACKGATE PRISON', theme:'prison', boss:'warden', secret:'raygun', mix:{ runner:0.18, brute:0.06, armored:0.08, shield:0.1, mutant:0.05 },
    missions:[
      { id:'pri1', name:'RIOT', intensity:3, par:450, brief:'Our gear is in the cell blocks, guarded by something huge.',
        steps:[ { type:'gear', zone:'far', text:'Recover the lost gear' },
                { type:'activate', multi:['mid','far'], time:8, horde:10, label:'CELL LOCK', text:'Lock the cell blocks' },
                { type:'evac', zone:'arena', wait:30, text:'Get to the exit' } ] },
      { id:'pri2', name:'THE WARDEN', intensity:4, par:480, brief:'The Warden runs when he is hurt. Chase him down.',
        steps:[ { type:'chase', zones:['mid','far','arena'], text:'Hunt the Warden' },
                { type:'evac', zone:'arena', wait:20, text:'Get to the exit' } ] },
    ] },
  { id:'mall', name:'HARBOR MALL', theme:'mall', boss:'mannequin', secret:'storm', mix:{ runner:0.2, brute:0.06, bloater:0.06, shield:0.06, stealth:0.1 },
    missions:[
      { id:'mal1', name:'BLACK FRIDAY', intensity:3, par:300, brief:'Grab every supply bag before the doors seal. Clock is ticking.',
        steps:[ { type:'collect', item:'bag', count:6, zones:['near','near','mid','mid','far','far','arena'], timeLimit:200, text:'Grab the supply bags' },
                { type:'evac', zone:'arena', wait:28, text:'Get to the exit' } ] },
      { id:'mal2', name:'THE MANNEQUIN', intensity:4, par:480, brief:'Something moves when nobody looks. Check the cameras.',
        steps:[ { type:'investigate', count:3, zones:['near','mid','far'], time:3, label:'CAMERA', text:'Check the security cameras' },
                { type:'kill', count:50, text:'Clear the food court' },
                { type:'boss', zone:'arena', text:'Kill the Mannequin' },
                { type:'evac', zone:'arena', wait:20, text:'Get to the exit' } ] },
    ] },
  { id:'subway', name:'LINE 9 SUBWAY', theme:'subway', boss:'conductor', secret:'dragon', mix:{ runner:0.2, brute:0.06, climber:0.12, stealth:0.06, armored:0.06 },
    missions:[
      { id:'sub1', name:'LAST TRAIN', intensity:4, par:480, brief:'Power up the line and hold the controls until the train is ready.',
        steps:[ { type:'collect', item:'fuse', count:3, zones:['near','mid','far'], text:'Find the fuses' },
                { type:'activate', zone:'mid', time:10, horde:12, label:'POWER', text:'Power up the line' },
                { type:'hold', zone:'far', time:30, text:'Defend the train controls' },
                { type:'evac', zone:'arena', wait:16, text:'Board the train' } ] },
      { id:'sub2', name:'THE CONDUCTOR', intensity:4, par:480, brief:'The Conductor keeps moving between platforms. Follow him.',
        steps:[ { type:'chase', zones:['mid','far','arena'], text:'Hunt the Conductor' },
                { type:'evac', zone:'arena', wait:18, text:'Board the train' } ] },
    ] },
  { id:'forest', name:'BLACKWOOD FOREST', theme:'forest', boss:'stalker', secret:'void', mix:{ runner:0.24, brute:0.05, stealth:0.14, climber:0.08 },
    missions:[
      { id:'for1', name:'LOST PATROL', intensity:4, par:480, brief:'A patrol went dark in the woods. Follow their radio.',
        steps:[ { type:'signal', zone:'mid', text:'Follow the patrol\'s radio' },
                { type:'rescue', zone:'far', text:'Find the survivor' },
                { type:'evac', zone:'arena', wait:30, escort:true, text:'Get him to the chopper' } ] },
      { id:'for2', name:'THE STALKER', intensity:4, par:480, brief:'Something hunts the hunters out here.',
        steps:[ { type:'investigate', count:3, zones:['near','mid','far'], time:3, label:'TRACKS', text:'Follow the tracks' },
                { type:'boss', zone:'arena', text:'Kill the Stalker' },
                { type:'evac', zone:'arena', wait:22, text:'Hold out for the chopper' } ] },
    ] },
  { id:'factory', name:'IRONWORKS', theme:'factory', boss:'golem', secret:'raygun', mix:{ runner:0.2, brute:0.08, armored:0.1, mutant:0.06, giant:0.02 },
    missions:[
      { id:'fac1', name:'MELTDOWN', intensity:5, par:480, brief:'Close the valves before the boilers blow.',
        steps:[ { type:'activate', multi:['near','mid','far'], time:8, horde:10, label:'VALVE', text:'Close the valves' },
                { type:'kill', count:60, text:'Clear the floor' },
                { type:'evac', zone:'arena', wait:30, text:'Get to the exit' } ] },
      { id:'fac2', name:'IRON GOLEM', intensity:5, par:480, brief:'They welded armor onto it. Find the override code.',
        steps:[ { type:'code', zones:['near','mid','far'], panel:'mid', text:'Find the 3 parts of the override code' },
                { type:'boss', zone:'arena', text:'Kill the Iron Golem' },
                { type:'evac', zone:'arena', wait:20, text:'Get to the exit' } ] },
    ] },
  { id:'harbor', name:'GREY HARBOR', theme:'harbor', boss:'captain', secret:'storm', mix:{ runner:0.2, brute:0.06, bloater:0.1, mutant:0.08, armored:0.06 },
    missions:[
      { id:'har1', name:'DOCK SHIFT', intensity:5, par:480, brief:'Fuel the crane and lift the container blocking the pier.',
        steps:[ { type:'collect', item:'fuel', count:4, zones:['near','mid','far','far','mid'], text:'Collect fuel cans' },
                { type:'activate', zone:'mid', time:14, horde:18, label:'CRANE', text:'Start the crane' },
                { type:'evac', zone:'arena', wait:30, text:'Reach the evac point' } ] },
      { id:'har2', name:'CAPTAIN BLOAT', intensity:5, par:480, brief:'The captain spreads the rot from his nests.',
        steps:[ { type:'destroy', count:3, zones:['near','mid','far'], nestHp:1400, text:'Destroy the nests' },
                { type:'boss', zone:'arena', text:'Kill Captain Bloat' },
                { type:'evac', zone:'arena', wait:20, text:'Reach the evac point' } ] },
    ] },
  { id:'desert', name:'DRY CREEK', theme:'desert', boss:'titan', secret:'dragon', mix:{ runner:0.24, brute:0.08, climber:0.12, mutant:0.06, giant:0.02 },
    missions:[
      { id:'des1', name:'DRY RUN', intensity:5, par:480, brief:'The water pump needs power. The supply drop has the parts.',
        steps:[ { type:'search', zone:'mid', count:3, text:'Find the supply drop' },
                { type:'collect', item:'fuse', count:3, zones:['near','far','far'], text:'Find the fuses' },
                { type:'activate', zone:'far', time:10, horde:14, label:'PUMP', text:'Start the water pump' },
                { type:'evac', zone:'arena', wait:30, text:'Reach the evac point' } ] },
      { id:'des2', name:'SAND TITAN', intensity:6, par:480, brief:'The Titan retreats into the dunes. Do not let it rest.',
        steps:[ { type:'chase', zones:['mid','far','arena'], text:'Hunt the Sand Titan' },
                { type:'evac', zone:'arena', wait:20, text:'Reach the evac point' } ] },
    ] },
  { id:'snow', name:'FROSTPEAK', theme:'snow', boss:'frost', secret:'void', mix:{ runner:0.2, brute:0.08, armored:0.08, shield:0.06, giant:0.03 },
    missions:[
      { id:'sno1', name:'WHITEOUT', intensity:6, par:480, brief:'A climber is freezing in a cabin. Warm the station and bring her back.',
        steps:[ { type:'rescue', zone:'far', text:'Find the survivor' },
                { type:'activate', zone:'mid', time:12, horde:16, label:'HEATER', text:'Start the heater' },
                { type:'evac', zone:'arena', wait:30, escort:true, text:'Get her to the chopper' } ] },
      { id:'sno2', name:'FROST GIANT', intensity:6, par:480, brief:'Recover the climbing gear, then face the giant.',
        steps:[ { type:'gear', zone:'mid', text:'Recover the climbing gear' },
                { type:'boss', zone:'arena', text:'Kill the Frost Giant' },
                { type:'evac', zone:'arena', wait:20, text:'Reach the evac point' } ] },
    ] },
  { id:'underground', name:'THE HIVE', theme:'underground', boss:'king', secret:'storm', mix:{ runner:0.2, brute:0.07, bloater:0.05, armored:0.07, healer:0.05, shield:0.05, stealth:0.05, climber:0.05, teleport:0.05, mutant:0.05, giant:0.02 },
    missions:[
      { id:'und1', name:'THE DESCENT', intensity:6, par:500, brief:'Follow the Watcher\'s marks down to where it all began.',
        steps:[ { type:'code', zones:['near','mid','far'], panel:'mid', text:'Find the 3 parts of the seal code' },
                { type:'investigate', count:3, zones:['near','mid','far'], time:3, label:'RUNE', text:'Read the runes' },
                { type:'activate', zone:'far', time:15, horde:20, label:'SEAL', text:'Break the seal' },
                { type:'reach', zone:'arena', text:'Go deeper' } ] },
      { id:'und2', name:'THE KING', intensity:7, par:600, brief:'The first of them. End this.',
        steps:[ { type:'boss', zone:'arena', text:'Kill the Zombie King' },
                { type:'evac', zone:'arena', wait:25, text:'Get out alive' } ] },
    ] },
];
ZD.MISSION_LIST = []; ZD.MAPS.forEach((m, mi)=>m.missions.forEach((ms, k)=>{ ms.mapIndex = mi; ms.index = k; ZD.MISSION_LIST.push(ms); }));

// the Watcher's notes, two per map
ZD.NOTES = [
  'Day 3. The sirens stopped. The dead did not. If you are reading this, you are not alone. - W.',
  'I left marks on these walls so I can find my way back in. Count the lines under each mark. - W.',
  'The soldiers were told it was a vaccine trial. It was not a vaccine. - W.',
  'Every sealed door here opens for three marks, in the order of their lines. - W.',
  'Patient Zero never had a fever. He just stopped sleeping. Then he stopped breathing. - W.',
  'Dr. Rot asked for more samples every day. I should have said no. - W.',
  'Helix built the cure and the weapon in the same room. Guess which one they finished. - W.',
  'I hid what I built where only the marks lead. Use it better than I did. - W.',
  'The Warden kept the worst ones locked below. The locks were never the problem. - W.',
  'Some of them heal each other now. They are learning. - W.',
  'The mannequins in the shop windows turned to watch me. I know how that sounds. - W.',
  'If the lights go out, keep moving. They hunt by sound in the dark. - W.',
  'Line 9 still runs at night. Nobody drives it. - W.',
  'I hear the radio in my sleep. It is my own voice reading coordinates. - W.',
  'There are footprints in the forest that only go one way. Into it. - W.',
  'The Stalker was a hunter once. It still remembers how. - W.',
  'They forged armor for the Golem out of the factory gates. It wanted to be kept. - W.',
  'The ironworks furnaces never cooled. Something keeps feeding them. - W.',
  'Ships still come into the harbor. Their crews are already turned. - W.',
  'The Captain swallowed the cargo. All of it. - W.',
  'The creek dried the week it began. Sand fills the mouths of the dead out here. - W.',
  'In the desert they stand still at noon and face the same direction. North. - W.',
  'Cold slows them. It does not stop them. Nothing stops them. - W.',
  'The Giant guards the pass because the King told it to. They obey him. - W.',
  'The King is below everything. He was the first. I was the second. - W.',
  'If you open the altar, you will meet what is left of me. Forgive me. - W.',
];
ZD.GLYPH_COUNT = 9;

// ---- the generator ---------------------------------------------------------------
const WT = 1;                 // inner wall thickness
const COLS = 4, ROWS = 3;
function overlaps(a, b, m){ m = m || 0; return a.x0 < b.x1 + m && b.x0 < a.x1 + m && a.z0 < b.z1 + m && b.z0 < a.z1 + m; }
function rectAt(x, z, w, d){ return { x0:x - w/2, x1:x + w/2, z0:z - d/2, z1:z + d/2 }; }

ZD.generateMap = function(mapIndex){
  const def = ZD.MAPS[mapIndex], T = ZD.THEMES[def.theme], rng = RNG(hashStr(def.id) ^ 0x9e3779b9);
  const S = T.zone, W = COLS*S, H = ROWS*S, X0 = -W/2, Z0 = -H/2;
  const M = { id:def.id, index:mapIndex, def, theme:def.theme, T, outdoor:T.outdoor, zoneSize:S, W, H, X0, Z0, x1:X0 + W, z1:Z0 + H,
    zones:[], borders:[], walls:[], doors:[], buildings:[], props:[], items:[], lamps:[], spawns:[], symbols:[], notes:[] };
  const rh = ()=>T.wallH[0] + rng()*(T.wallH[1] - T.wallH[0]);
  // zones
  for(let r=0; r<ROWS; r++) for(let c=0; c<COLS; c++){ const x0 = X0 + c*S, z0 = Z0 + r*S;
    M.zones.push({ i:r*COLS + c, c, r, x0, x1:x0 + S, z0, z1:z0 + S, cx:x0 + S/2, cz:z0 + S/2, depth:-1, kind:'normal', reserve:[], spots:[], spawns:[], nb:[] }); }
  const Z = (c, r)=>M.zones[r*COLS + c];
  const pairs = [];
  for(const z of M.zones){ if(z.c < COLS-1) pairs.push({ a:z.i, b:Z(z.c+1, z.r).i, dir:'x' }); if(z.r < ROWS-1) pairs.push({ a:z.i, b:Z(z.c, z.r+1).i, dir:'z' }); }
  const neighbors = i => pairs.filter(p=>p.a === i || p.b === i).map(p=>p.a === i ? p.b : p.a);
  // start in the bottom row, secret room somewhere that does not cut the map in two
  const start = Z(1 + (rng() < 0.5 ? 0 : 1), ROWS - 1); start.kind = 'start';
  const connectedWithout = skip=>{ const seen = new Set([start.i]), q = [start.i]; while(q.length){ const i = q.shift(); for(const n of neighbors(i)) if(n !== skip && !seen.has(n)){ seen.add(n); q.push(n); } } return seen.size === M.zones.length - 1; };
  const cands = shuffle(rng, M.zones.filter(z=>z !== start && !neighbors(start.i).includes(z.i) && connectedWithout(z.i)));
  cands.sort((a, b)=>neighbors(a.i).length - neighbors(b.i).length);   // corners first
  const secret = cands[0]; secret.kind = 'secret';
  // a random spanning tree over the rest gives the main routes
  const treeKey = new Set(), seen = new Set([start.i]);
  (function dfs(i){ for(const n of shuffle(rng, neighbors(i))){ if(n === secret.i || seen.has(n)) continue; seen.add(n); treeKey.add(Math.min(i, n) + ':' + Math.max(i, n)); dfs(n); } })(start.i);
  const secretNb = shuffle(rng, neighbors(secret.i).filter(n=>n !== start.i))[0];
  for(const p of pairs){
    const key = Math.min(p.a, p.b) + ':' + Math.max(p.a, p.b);
    if(p.a === secret.i || p.b === secret.i) p.type = (p.a === secretNb || p.b === secretNb) ? 'secret' : 'wall';
    else if(treeKey.has(key)) p.type = (p.a === start.i || p.b === start.i) ? 'door' : (rng() < 0.3 ? 'open' : 'door');
    else p.type = rng() < 0.45 ? 'shortcut' : 'wall';
  }
  // depth over the routes that can always be opened
  start.depth = 0; const q = [start.i];
  while(q.length){ const i = q.shift(); for(const p of pairs){ if(p.type !== 'open' && p.type !== 'door') continue; const o = p.a === i ? p.b : (p.b === i ? p.a : -1);
    if(o >= 0 && M.zones[o].depth < 0){ M.zones[o].depth = M.zones[i].depth + 1; q.push(o); } } }
  secret.depth = (M.zones[secretNb].depth || 1) + 1;
  M.maxDepth = Math.max(...M.zones.filter(z=>z.kind !== 'secret').map(z=>z.depth));
  const arena = shuffle(rng, M.zones.filter(z=>z.kind === 'normal' && z.depth === M.maxDepth))[0]; arena.kind = 'arena';
  M.start = start.i; M.secret = secret.i; M.arena = arena.i;
  // borders: walls with a gap
  const SV = ZD.SURVIVAL;
  for(const p of pairs){
    const A = M.zones[p.a], B = M.zones[p.b], h = rh();
    const line = p.dir === 'x' ? A.x1 : A.z1, s0 = p.dir === 'x' ? A.z0 : A.x0, s1 = s0 + S;
    const gw = { open:6, door:4, shortcut:3.4, secret:3.4, wall:0 }[p.type];
    const gc = gw ? s0 + 5 + gw/2 + rng()*(S - 10 - gw) : 0;
    const seg = (a, b)=>{ if(b - a < 0.05) return; M.walls.push(p.dir === 'x' ? { x0:line - WT/2, x1:line + WT/2, z0:a, z1:b, y0:0, y1:h, h, kind:'wall', border:M.borders.length }
      : { x0:a, x1:b, z0:line - WT/2, z1:line + WT/2, y0:0, y1:h, h, kind:'wall', border:M.borders.length }); };
    if(gw){ seg(s0, gc - gw/2); seg(gc + gw/2, s1); } else seg(s0, s1);
    const border = { i:M.borders.length, a:p.a, b:p.b, dir:p.dir, type:p.type, line, s0, s1, gc, gw, h, door:-1 };
    if(gw){
      const gapRect = p.dir === 'x' ? { x0:line - WT/2, x1:line + WT/2, z0:gc - gw/2, z1:gc + gw/2 } : { x0:gc - gw/2, x1:gc + gw/2, z0:line - WT/2, z1:line + WT/2 };
      border.gap = gapRect;
      const sideA = p.dir === 'x' ? { x:line - 1.9, z:gc } : { x:gc, z:line - 1.9 }, sideB = p.dir === 'x' ? { x:line + 1.9, z:gc } : { x:gc, z:line + 1.9 };
      border.sideA = sideA; border.sideB = sideB;
      if(p.type !== 'open'){
        const dmin = Math.min(A.depth < 0 ? 99 : A.depth, B.depth < 0 ? 99 : B.depth);
        const cost = p.type === 'door' ? Math.min(SV.doorMax, SV.doorBase + SV.doorStep*Math.max(0, dmin)) : (p.type === 'shortcut' ? 0 : 0);
        border.door = M.doors.length;
        M.doors.push({ i:M.doors.length, kind:p.type, border:border.i, a:p.a, b:p.b, dir:p.dir, box:Object.assign({ y0:0, y1:h, h }, gapRect), cost, open:false, sideA, sideB });
      }
      // keep the gap approaches clear on both sides
      const reach = 4.2, wide = gw/2 + 1.4;
      const rA = p.dir === 'x' ? { x0:line - reach, x1:line, z0:gc - wide, z1:gc + wide } : { x0:gc - wide, x1:gc + wide, z0:line - reach, z1:line };
      const rB = p.dir === 'x' ? { x0:line, x1:line + reach, z0:gc - wide, z1:gc + wide } : { x0:gc - wide, x1:gc + wide, z0:line, z1:line + reach };
      A.reserve.push(rA); B.reserve.push(rB);
    }
    M.borders.push(border); A.nb.push(border.i); B.nb.push(border.i);
  }
  // two plain walls that can fall later (map evolution): only between zones that are not the secret room
  shuffle(rng, M.borders.filter(b=>b.type === 'wall' && b.a !== secret.i && b.b !== secret.i)).slice(0, 2).forEach(b=>{ b.collapsible = true;
    M.walls.forEach(w=>{ if(w.border === b.i) w.collapse = b.i; }); });
  // the outer wall
  const OT = 2, oh = T.wallH[1] + 1;
  M.walls.push({ x0:X0 - OT, x1:X0, z0:Z0 - OT, z1:M.z1 + OT, y0:0, y1:oh, h:oh, kind:'outer' }, { x0:M.x1, x1:M.x1 + OT, z0:Z0 - OT, z1:M.z1 + OT, y0:0, y1:oh, h:oh, kind:'outer' },
    { x0:X0, x1:M.x1, z0:Z0 - OT, z1:Z0, y0:0, y1:oh, h:oh, kind:'outer' }, { x0:X0, x1:M.x1, z0:M.z1, z1:M.z1 + OT, y0:0, y1:oh, h:oh, kind:'outer' });
  // inner bounds of a zone (inside its walls)
  const inner = z=>({ x0:z.x0 + (z.c === 0 ? 0 : WT/2), x1:z.x1 - (z.c === COLS-1 ? 0 : WT/2), z0:z.z0 + (z.r === 0 ? 0 : WT/2), z1:z.z1 - (z.r === ROWS-1 ? 0 : WT/2) });
  M.inner = inner;
  for(const z of M.zones){ const c = z.kind === 'start' ? 5.5 : (z.kind === 'arena' ? 7 : 3.6); z.reserve.push(rectAt(z.cx, z.cz, c*2, c*2)); }
  const solids = ()=>M.buildings.concat(M.props, M.items.filter(it=>it.solid));
  const free = (r, m, zone)=>{ for(const o of zone.reserve) if(overlaps(r, o, 0.2)) return false; for(const o of solids()) if(overlaps(r, o, m)) return false; return true; };
  // buildings at zone corners (outdoor themes)
  if(T.buildings){
    for(const z of M.zones){
      if(z.kind === 'secret') continue;
      let n = rng() < T.buildRate ? (rng() < 0.45 ? 2 : 1) : 0; if(z.kind === 'arena') n = Math.min(n, 1); if(z.kind === 'start') n = Math.min(n, 1);
      const ib = inner(z), corners = shuffle(rng, [[-1,-1],[1,-1],[-1,1],[1,1]]);
      for(const [sx, sz] of corners){ if(n <= 0) break;
        let bw = 6 + rng()*S*0.3, bd = 6 + rng()*S*0.3, ok = false;
        for(let k=0; k<4 && !ok; k++){
          const x = sx < 0 ? ib.x0 + bw/2 : ib.x1 - bw/2, zz = sz < 0 ? ib.z0 + bd/2 : ib.z1 - bd/2, r = rectAt(x, zz, bw, bd);
          if(free(r, 1.8, z)){ const bh = def.theme === 'city' ? 5 + rng()*6 : 3.2 + rng()*2.6;
            M.buildings.push(Object.assign(r, { y0:0, y1:bh, h:bh, kind:'building', style:T.buildings[(rng()*T.buildings.length)|0], zone:z.i })); ok = true; n--; }
          else { bw *= 0.8; bd *= 0.8; if(bw < 5 || bd < 5) break; }
        }
      }
    }
  }
  // indoor centerpieces
  const placeProp = (z, kind, x, zz, rot)=>{ const [w0, d0, h] = ZD.PROPS[kind], w = rot ? d0 : w0, d = rot ? w0 : d0;
    const r = rectAt(x, zz, w, d); if(!free(r, 1.7, z)) return null;
    const ib = inner(z); if(r.x0 < ib.x0 + 0.3 || r.x1 > ib.x1 - 0.3 || r.z0 < ib.z0 + 0.3 || r.z1 > ib.z1 - 0.3) return null;
    const p = Object.assign(r, { y0:0, y1:h, h, kind, rot:!!rot, zone:z.i, seed:(rng()*1e6)|0 }); M.props.push(p); return p; };
  if(T.features) for(const z of M.zones){
    if(z.kind !== 'normal' || rng() > 0.75) continue;
    const f = T.features[(rng()*T.features.length)|0], ib = inner(z);
    if(f === 'beds'){ const rot = rng() < 0.5, side = rng() < 0.5 ? -1 : 1;
      for(let k=0; k<4; k++){ const t = -0.36 + k*0.24; if(rot) placeProp(z, 'bed', z.cx + t*S, side < 0 ? ib.z0 + 1.6 : ib.z1 - 1.6, true); else placeProp(z, 'bed', side < 0 ? ib.x0 + 1.6 : ib.x1 - 1.6, z.cz + t*S, false); }
      continue; }
    const kind = { reception:'reception', tankrow:'tankrow', cells:'cells', fountain:'fountain', traincar:'traincar', bigmachine:'bigmachine' }[f];
    const rot = rng() < 0.5;
    for(let k=0; k<10; k++){ const x = z.cx + (rng() - 0.5)*S*0.45, zz = z.cz + (rng() - 0.5)*S*0.45; if(placeProp(z, kind, x, zz, rot)) break; }
  }
  // things that sit against a zone wall, facing into the zone
  const sideInfo = (z, side)=>{ const ib = inner(z);
    if(side === 'n') return { line:ib.z0, a:ib.x0, b:ib.x1, yaw:Math.PI, axis:'x', into:1 };
    if(side === 's') return { line:ib.z1, a:ib.x0, b:ib.x1, yaw:0, axis:'x', into:-1 };
    if(side === 'w') return { line:ib.x0, a:ib.z0, b:ib.z1, yaw:-Math.PI/2, axis:'z', into:1 };
    return { line:ib.x1, a:ib.z0, b:ib.z1, yaw:Math.PI/2, axis:'z', into:-1 }; };
  const gapNear = (z, side, t, clear)=>{ for(const bi of z.nb){ const b = M.borders[bi]; if(!b.gw) continue;
      const onSide = b.dir === 'x' ? ((side === 'e' && b.a === z.i) || (side === 'w' && b.b === z.i)) : ((side === 's' && b.a === z.i) || (side === 'n' && b.b === z.i));
      if(onSide && Math.abs(b.gc - t) < b.gw/2 + clear) return true; } return false; };
  const wallSpot = (z, w, d, opts)=>{ opts = opts || {};
    for(let k=0; k<40; k++){
      const side = opts.side || 'nsew'[(rng()*4)|0], si = sideInfo(z, side), t = si.a + 2.5 + w/2 + rng()*Math.max(0, si.b - si.a - 5 - w);
      if(gapNear(z, side, t, 3 + w/2)) continue;
      const off = si.line + si.into*(d/2 + 0.05), x = si.axis === 'x' ? t : off, zz = si.axis === 'x' ? off : t;
      const r = si.axis === 'x' ? rectAt(x, zz, w, d) : rectAt(x, zz, d, w);
      if(!free(r, opts.margin != null ? opts.margin : 0.8, z)) continue;
      const fx = si.axis === 'x' ? 0 : si.into, fz = si.axis === 'x' ? si.into : 0;
      return Object.assign(r, { x, z:zz, yaw:si.yaw, zone:z.i, front:{ x:x + fx*(d/2 + 1.1), z:zz + fz*(d/2 + 1.1) }, nx:fx, nz:fz, side });
    }
    return null; };
  const addItem = (kind, z, w, d, h, extra, opts)=>{ const s = wallSpot(z, w, d, opts); if(!s) return null;
    const it = Object.assign(s, { kind, y0:0, y1:h, h, solid:h > 0.3 }, extra || {}); M.items.push(it);
    z.reserve.push(rectAt(it.front.x, it.front.z, 2, 2)); return it; };
  const zonesBy = f => M.zones.filter(z=>z.kind !== 'secret' && f(z));
  // Survival gear: wall-buys, perk machines, power, mystery box spots, the upgrade station, ammo crates
  const buyTiers = [['smg','shotgun'], ['rifle','magnum'], ['dmr','hornet'], ['sniper','bulldog'], ['riot','lmg']], used = new Set();
  for(const z of zonesBy(()=>true)){
    const tier = buyTiers[Math.min(buyTiers.length - 1, z.depth)].filter(w=>!used.has(w)), n = z.kind === 'start' ? 2 : 1;
    for(let k=0; k<n && tier.length; k++){ const w = tier.splice((rng()*tier.length)|0, 1)[0]; used.add(w); addItem('wallbuy', z, 1.8, 0.12, 0, { weapon:w, y:1.5 }); }
  }
  const perkZones = shuffle(rng, zonesBy(z=>z.depth >= 1));
  ZD.PERK_ORDER.forEach((p, k)=>addItem('perk', perkZones[k % perkZones.length], 1.3, 0.9, 2.3, { perk:p }));
  const midDepth = Math.max(1, Math.round(M.maxDepth/2));
  addItem('power', shuffle(rng, zonesBy(z=>z.depth === midDepth))[0] || perkZones[0], 1.0, 0.5, 1.8, {});
  shuffle(rng, zonesBy(z=>z.depth >= 1 && z.kind !== 'arena')).slice(0, 3).forEach(z=>addItem('box', z, 1.9, 0.9, 1.0, {}));
  addItem('upgrade', arena, 2.2, 1.4, 2.4, {});
  shuffle(rng, zonesBy(z=>z.kind !== 'arena')).slice(0, 5).forEach(z=>addItem('ammo', z, 1.1, 0.7, 0.6, {}));
  // the mystery: three marks, a keypad by the sealed door, the pedestal and the altar inside
  const symZones = shuffle(rng, zonesBy(z=>z.kind !== 'start')).slice(0, 3), glyphs = shuffle(rng, [...Array(ZD.GLYPH_COUNT).keys()]);
  symZones.forEach((z, k)=>{ const it = addItem('symbol', z, 0.9, 0.06, 0, { glyph:glyphs[k], order:k, y:2.1 }, { margin:0.3 }); if(it) M.symbols.push(it); });
  M.code = M.symbols.map(s=>s.glyph); M.decoys = glyphs.slice(3, 6);
  const sb = M.borders.find(b=>b.type === 'secret'), outsideZone = M.zones[sb.a === secret.i ? sb.b : sb.a];
  { const side = sb.dir === 'x' ? (sb.a === outsideZone.i ? 'e' : 'w') : (sb.a === outsideZone.i ? 's' : 'n'), si = sideInfo(outsideZone, side);
    const t = sb.gc + (sb.gc - sb.s0 > S/2 ? -1 : 1)*(sb.gw/2 + 1.2), off = si.line + si.into*0.08;
    const x = si.axis === 'x' ? t : off, zz = si.axis === 'x' ? off : t;
    M.items.push({ kind:'keypad', x, z:zz, yaw:si.yaw, zone:outsideZone.i, y:1.4, h:0, solid:false, x0:x - 0.3, x1:x + 0.3, z0:zz - 0.3, z1:zz + 0.3,
      front:{ x:x + (si.axis === 'x' ? 0 : si.into*1.3), z:zz + (si.axis === 'x' ? si.into*1.3 : 0) } }); }
  M.items.push({ kind:'pedestal', x:secret.cx, z:secret.cz, yaw:0, zone:secret.i, solid:true, h:1.1, y0:0, y1:1.1, ...rectAt(secret.cx, secret.cz, 1.0, 1.0), front:{ x:secret.cx, z:secret.cz + 1.4 } });
  M.items.push({ kind:'altar', x:secret.cx, z:secret.cz - 6, yaw:0, zone:secret.i, solid:true, h:1.0, y0:0, y1:1.0, ...rectAt(secret.cx, secret.cz - 6, 2.2, 1.2), front:{ x:secret.cx, z:secret.cz - 4.4 } });
  shuffle(rng, zonesBy(()=>true)).slice(0, 2).forEach((z, k)=>{ const it = addItem('note', z, 0.5, 0.04, 0, { note:mapIndex*2 + k, y:1.45 }, { margin:0.3 }); if(it) M.notes.push(it); });
  // scattered props
  for(const z of M.zones){
    const mul = z.kind === 'arena' ? 0.35 : (z.kind === 'start' ? 0.6 : (z.kind === 'secret' ? 0.25 : 1));
    const n = Math.round((5 + rng()*5)*T.density*mul), ib = inner(z);
    for(let k=0, placed=0; k<n*6 && placed<n; k++){
      const kind = pickW(rng, T.props), rot = ORIENTED[kind] ? rng() < 0.5 : false, [w0, d0] = ZD.PROPS[kind], w = rot ? d0 : w0, d = rot ? w0 : d0;
      const x = ib.x0 + 1.2 + w/2 + rng()*Math.max(0, (ib.x1 - ib.x0) - 2.4 - w), zz = ib.z0 + 1.2 + d/2 + rng()*Math.max(0, (ib.z1 - ib.z0) - 2.4 - d);
      if(placeProp(z, kind, x, zz, rot)) placed++;
    }
  }
  // spawn points along the walls, lamps
  for(const z of M.zones){ for(let k=0; k<14 && z.spawns.length < 6; k++){ const s = wallSpot(z, 1.2, 1.2, { margin:0.5 }); if(s) z.spawns.push({ x:s.front.x - s.nx*0.6, z:s.front.z - s.nz*0.6, zone:z.i }); }
    if(T.lamps === 'ceiling' || T.lamps === 'crystal'){ for(const [a, b] of [[-0.25,-0.25],[0.25,-0.25],[-0.25,0.25],[0.25,0.25]]) M.lamps.push({ x:z.cx + a*S, z:z.cz + b*S, y:T.wallH[0] - 0.3, ceiling:true, zone:z.i }); }
    else for(let k=0; k<2; k++){ const s = wallSpot(z, 0.4, 0.4, { margin:0.4 }); if(s) M.lamps.push({ x:s.x, z:s.z, yaw:s.yaw, zone:z.i }); } }
  // free spots for mission objectives
  const blockedAt = (x, zz, r)=>{ const rr = rectAt(x, zz, r*2, r*2); for(const o of solids()) if(overlaps(rr, o, 0)) return true; for(const w of M.walls) if(overlaps(rr, w, 0)) return true; return false; };
  for(const z of M.zones){ const ib = inner(z);
    for(let k=0; k<60 && z.spots.length < 10; k++){ const x = ib.x0 + 2.5 + rng()*(ib.x1 - ib.x0 - 5), zz = ib.z0 + 2.5 + rng()*(ib.z1 - ib.z0 - 5);
      if(!blockedAt(x, zz, 1.3) && !z.spots.some(s=>Math.hypot(s.x - x, s.z - zz) < 3)) z.spots.push({ x, z:zz }); } }
  validate(M);
  // the start: the middle of the start zone, facing into the map
  M.startPos = { x:start.cx, z:start.cz + 2, yaw:0 };
  M.seed = hashStr(def.id);
  return M;
};

// every point the game needs must be reachable on foot; drop props until it is
function validate(M){
  const cs = 1, nx = Math.round(M.W/cs), nz = Math.round(M.H/cs), pad = 0.45;
  const run = ()=>{
    const bl = new Uint8Array(nx*nz);
    const mark = b=>{ const ix0 = Math.max(0, Math.floor((b.x0 - pad - M.X0)/cs)), ix1 = Math.min(nx-1, Math.floor((b.x1 + pad - M.X0)/cs));
      const iz0 = Math.max(0, Math.floor((b.z0 - pad - M.Z0)/cs)), iz1 = Math.min(nz-1, Math.floor((b.z1 + pad - M.Z0)/cs));
      for(let iz=iz0; iz<=iz1; iz++) for(let ix=ix0; ix<=ix1; ix++){ const x = M.X0 + (ix+0.5)*cs, z = M.Z0 + (iz+0.5)*cs;
        if(x > b.x0 - pad && x < b.x1 + pad && z > b.z0 - pad && z < b.z1 + pad) bl[iz*nx + ix] = 1; } };
    M.walls.forEach(mark); M.buildings.forEach(mark); M.props.forEach(mark); M.items.filter(i=>i.solid).forEach(mark);
    const cell = (x, z)=>{ const ix = Math.floor((x - M.X0)/cs), iz = Math.floor((z - M.Z0)/cs); return ix < 0 || iz < 0 || ix >= nx || iz >= nz ? -1 : iz*nx + ix; };
    const reach = new Uint8Array(nx*nz), st = M.zones[M.start], s = cell(st.cx, st.cz + 2), q = [s]; reach[s] = 1;
    while(q.length){ const k = q.pop(), kx = k % nx, kz = (k/nx)|0;
      for(const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const x = kx + dx, z = kz + dz; if(x < 0 || z < 0 || x >= nx || z >= nz) continue; const j = z*nx + x; if(!bl[j] && !reach[j]){ reach[j] = 1; q.push(j); } } }
    return (x, z)=>{ const c = cell(x, z); if(c < 0) return false; if(reach[c]) return true;
      for(const [dx, dz] of [[1,0],[-1,0],[0,1],[0,-1]]){ const c2 = cell(x + dx, z + dz); if(c2 >= 0 && reach[c2]) return true; } return false; };
  };
  const required = ()=>{ const r = [];
    for(const z of M.zones) r.push({ x:z.cx, z:z.cz });
    for(const b of M.borders) if(b.gw){ r.push(b.sideA, b.sideB); }
    for(const it of M.items) if(it.front) r.push(it.front);
    return r; };
  for(let iter=0; iter<60; iter++){
    const ok = run(), bad = required().find(p=>!ok(p.x, p.z));
    if(!bad) break;
    // remove the prop closest to the unreachable point
    let best = -1, bd = 1e9; M.props.forEach((p, k)=>{ const dx = Math.max(p.x0 - bad.x, 0, bad.x - p.x1), dz = Math.max(p.z0 - bad.z, 0, bad.z - p.z1), d = Math.hypot(dx, dz); if(d < bd){ bd = d; best = k; } });
    if(best < 0 || bd > 8){ // a building may be the culprit
      let bb = -1, bbd = 1e9; M.buildings.forEach((p, k)=>{ const dx = Math.max(p.x0 - bad.x, 0, bad.x - p.x1), dz = Math.max(p.z0 - bad.z, 0, bad.z - p.z1), d = Math.hypot(dx, dz); if(d < bbd){ bbd = d; bb = k; } });
      if(bb >= 0 && bbd < 8){ M.buildings.splice(bb, 1); continue; }
      break; }
    M.props.splice(best, 1);
  }
  const ok = run();
  for(const z of M.zones){ z.spots = z.spots.filter(s=>ok(s.x, s.z)); z.spawns = z.spawns.filter(s=>ok(s.x, s.z)); }
}

})(window.ZD);
