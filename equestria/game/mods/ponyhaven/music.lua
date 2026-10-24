-- Original offline composer: phrase-based chord transitions, varied melody
-- contours, dynamic percussion and shifting voicings. Still procedural and
-- pleasing; inspired by lofigen's described approach but no code or samples
-- are redistributed (upstream has no licence).
local ph=ponyhaven;local composers={};ph.music_composers=composers
function ph.sound(kind,pos,gain,pitch)
 core.sound_play('eq_'..kind,{pos=pos,gain=gain or .4,pitch=pitch or 1,max_hear_distance=kind=='boss'and 100 or 48},true)
end
local function random(c,n)c.seed=(c.seed*48271)%2147483647;return c.seed%n+1 end
local function note(c,name,instrument,semitones,gain)
 core.sound_play('eq_'..instrument,{to_player=name,gain=gain,pitch=2^(semitones/12)},true);c.notes=c.notes+1
end
local major={0,2,4,5,7,9,11};local minor={0,2,3,5,7,8,10};local dark={0,1,3,5,7,8,10}
local function degree(scale,n)return scale[(n-1)%7+1]+12*math.floor((n-1)/7)end
-- Richer chord palette: I ii iii IV V vi viidim + secondary dominants
local roots={1,2,3,4,5,6,7}
-- Transition matrix allows more variety while keeping pleasant progressions.
-- Each entry lists possible next chords from the current chord index.
local transitions={
 {2,3,4,5,6},   -- I  -> ii, iii, IV, V, vi
 {3,5,7},        -- ii -> iii, V, vii
 {1,4,6},        -- iii-> I, IV, vi
 {1,2,5,7},      -- IV -> I, ii, V, vii
 {1,4,6},        -- V  -> I, IV, vi
 {2,3,4},        -- vi -> ii, iii, IV
 {1,3},           -- vii-> I, iii
}
-- Phrase patterns: chord sequences that create musical arcs over 4 bars.
-- Each phrase is 4 chords (one per 2 bars within a 64-step cycle).
local phrases={
 {1,5,6,4},{1,4,5,1},{6,4,1,5},{1,6,4,5},{4,5,6,1},{6,4,5,3},{1,3,4,5},{4,1,5,6},{6,2,5,1},{1,4,6,5},
}
-- Drum pattern library: each is 16 steps of {kick,snare,hat} booleans
local drum_patterns={
 -- Standard
 {kick={1,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0},snare={0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,0},hat={1,0,1,0,1,0,1,0,1,0,1,0,1,0,1,0}},
 -- Syncopated
 {kick={1,0,0,0,0,0,1,0,0,0,0,0,0,0,1,0},snare={0,0,0,0,1,0,0,0,0,0,0,1,0,0,0,0},hat={1,0,1,1,0,0,1,0,1,0,1,1,0,0,1,0}},
 -- Sparse / breathing
 {kick={1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},snare={0,0,0,0,0,0,0,0,1,0,0,0,0,0,0,0},hat={1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0}},
 -- Busy
 {kick={1,0,0,1,0,0,1,0,0,0,1,0,0,0,0,0},snare={0,0,0,0,1,0,0,0,0,0,0,0,1,0,0,1},hat={1,1,1,0,1,1,1,0,1,1,1,0,1,1,1,0}},
 -- Half-time
 {kick={1,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0},snare={0,0,0,0,0,0,0,0,0,0,0,0,1,0,0,0},hat={1,0,0,0,1,0,1,0,1,0,0,0,1,0,1,0}},
}
-- Voicing types: intervals added to the root for harmonic variety
local voicings={
 {0,2,4},     -- triad (root, 3rd, 5th)
 {0,2,4,6},   -- 7th chord
 {0,4,7},     -- open voicing (root, 5th, octave)
 {0,1,4},     -- sus2-flavoured
 {0,2,6},     -- added 7th no 5th
 {0,4},        -- power chord (sparse)
}
core.register_on_joinplayer(function(p)
 local name=p:get_player_name()
 composers[name]={seed=ph.hash(name..os.time())+1,elapsed=0,step=0,chord=1,melody=8,threat=0,notes=0,
  phrase=1,phrase_step=0,bar=0,drum=1,voicing=1,bass_pattern=1,rest_until=0,
  octave_shift=0,dynamics=.8,phrase_count=0}
end)
core.register_on_leaveplayer(function(p)composers[p:get_player_name()]=nil end)
core.register_globalstep(function(dt)
 for name,c in pairs(composers)do
  local p=core.get_player_by_name(name);local g=ph.players[name]
  if p and g and not g.travel then
   -- Boss proximity: threat rises smoothly 0-1 as you approach within 160 nodes.
   local nearest=1000;for _,obj in pairs(ph.boss_objects or{})do local e=obj:get_luaentity();if e and not e.dead then nearest=math.min(nearest,vector.distance(p:get_pos(),e.home))end end
   local target=math.max(0,math.min(1,(160-nearest)/100));c.threat=c.threat+(target-c.threat)*math.min(1,dt*.5)
   c.elapsed=c.elapsed+dt
   -- Tempo: base ~76 BPM with boss acceleration, swing feel
   local bpm=76+c.threat*14;local interval=60/bpm/4*(c.step%2==0 and 1.06 or .94)
   if c.elapsed>=interval then
    c.elapsed=c.elapsed%interval;c.step=(c.step+1)%64
    local beat=c.step%16  -- position within a 16-step bar
    -- Every 16 steps (one bar): advance chord from the current phrase
    if beat==0 then
     c.bar=(c.bar+1)%4
     local phrase=phrases[c.phrase]
     c.chord=phrase[c.bar+1]
     -- At phrase boundary (every 4 bars / 64 steps): pick a new phrase,
     -- drum pattern, voicing, and possibly introduce a rest bar.
     if c.bar==0 then
      c.phrase_count=c.phrase_count+1
      c.phrase=random(c,#phrases)
      c.drum=random(c,#drum_patterns)
      c.voicing=random(c,#voicings)
      c.dynamics=.65+random(c,35)/100  -- 0.65 to 1.0
      -- Occasionally pick a rest phrase (1 in 6 chance, never first 2 phrases).
      -- Cleared every phrase: step wraps at 64, so a stale value would mute
      -- the first half of every later phrase.
      c.rest_until=0
      if c.phrase_count>2 and random(c,6)==1 then c.rest_until=c.step+32 end
      -- Occasional phrase in the lower register; an upward shift on top of the
      -- melody's two-octave range made the piano sample shrill.
      c.octave_shift=random(c,4)==1 and -12 or 0
     end
     -- Occasional chord substitution from the transition matrix
     if c.bar>0 and random(c,4)==1 then
      local nexts=transitions[c.chord];c.chord=nexts[random(c,#nexts)]
     end
    end
    -- Scale selection: major normally, minor near bosses at 35%, dark at 55%+
    local scale=c.threat>.55 and dark or c.threat>.35 and minor or major
    local root=roots[c.chord];local tonic=c.threat>.55 and -12 or 0
    -- Rest bars: only play sparse hi-hat, skip harmony and melody
    local resting=c.step<(c.rest_until or 0)
    -- HARMONY: chord voicing on the downbeat of each bar
    if not resting and beat==0 then
     local v=voicings[c.voicing]
     local gain=.08*c.dynamics
     for _,interval in ipairs(v)do
      note(c,name,'piano',tonic+degree(scale,root+interval),gain)
     end
     -- Bass note: root, octave below. Alternate with 5th for movement.
     local bass_degree=c.bar%2==0 and root or root+4
     note(c,name,'bass',degree(scale,bass_degree)-12,.14*c.dynamics)
    end
    -- MELODY: diatonic walk with occasional leaps and rests
    if not resting then
     local play_melody=beat%4==0 or random(c,6)<=2
     if play_melody then
      -- Weighted random walk with occasional larger leaps
      local leap=random(c,8)==1 and (random(c,2)==1 and 4 or -4) or 0
      local step=random(c,5)-3+leap
      c.melody=math.max(1,math.min(12,c.melody+step))
      -- Melody gain varies with beat position for natural phrasing
      local accent=beat==0 and 1.2 or beat==8 and 1.1 or beat%4==0 and 1.0 or .85
      note(c,name,'piano',degree(scale,c.melody)+12+c.octave_shift,.055*accent*c.dynamics)
     end
    end
    -- PERCUSSION: pattern-driven with threat-based fills
    local dp=drum_patterns[c.drum]
    if dp.kick[beat+1]==1 or (c.threat>.6 and beat%4==2 and random(c,3)==1)then
     note(c,name,'kick',0,.14*c.dynamics)
    end
    if dp.snare[beat+1]==1 then
     note(c,name,'snare',0,.08*c.dynamics)
    end
    if dp.hat[beat+1]==1 or (resting and beat%4==0) then
     local hat_pitch=random(c,5)-3
     note(c,name,'hat',hat_pitch,.05*c.dynamics)
    end
    -- Ghost notes and fills near bar boundaries for variety
    if beat==15 and random(c,3)==1 then note(c,name,'snare',2,.05*c.dynamics)end
    if beat==14 and c.threat>.3 and random(c,4)==1 then note(c,name,'kick',0,.1*c.dynamics)end
   end
  end
 end
end)
