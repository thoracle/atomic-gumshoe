# Atomic Gumshoe

A 3D third-person hover-car racer set in a 1950s atomic-age city. Race three
rivals for 3 laps around a figure-eight street circuit while a flying saucer
tries to laser you off the road.

**Play:** https://thoracle.github.io/atomic-gumshoe/

**Stack:** vanilla JavaScript ES modules and three.js r160 loaded from a CDN through an
import map, with an optional Python/Flask server for a shared leaderboard. No Node, npm, or
build step.

## Run locally

```bash
python3 -m venv .venv
.venv/bin/pip install -r requirements.txt
.venv/bin/python app.py            # http://127.0.0.1:5000
PORT=5057 .venv/bin/python app.py  # use another port if 5000 is taken
```

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | drive |
| Space | drift: hold a slide (sparks go blue, then orange), release for a mini-boost |
| Shift | atomic boost (meter under the speedometer) |
| E or click the shield | force shield (3.5 s, 14 s cooldown) |
| R | reset onto the track |
| M | mute |
| F | full screen (also the corner button, where the browser supports it; not iPhone Safari) |

A red ring on the road means the saucer is about to fire there: dodge it or
shield up. Green crosses repair 30 health, atoms add 45 boost.

## Layout

```
index.html             HUD markup, import map (plain static page)
app.py                 optional Flask server: the page + shared JSON leaderboard (scores.json)
static/css/style.css   HUD + menus
static/img/title.jpg   title-screen art
static/audio/          race music, one faster take per lap
static/js/
  main.js      game loop, player physics, rival AI, saucer attacks, race flow
  track.js     figure-eight centreline, spatial lookup, road/sidewalk meshes
  city.js      procedural buildings (merged per material), lamps, ground
  car.js       hover car + shield bubble built from primitives
  ufo.js       flying saucer
  effects.js   sparks, laser beams, target marker, shockwaves
  hud.js       speedometer + minimap canvases, HUD updates
  audio.js     synthesized WebAudio sound effects + streamed music
  textures.js  procedural canvas textures
```

Add `?debug` to the URL to expose `window.gumshoe` (game state) in the console.

## Phones

Touch controls appear automatically: a floating joystick on the left (touch anywhere in the
lower-left area; sideways push steers, analog) and GAS / BRAKE / DRIFT / BOOST / shield on the right.

## Deployment

**GitHub Pages:** the repo root is the site (`index.html` + `static/`). Pages serves `main`
directly, so pushing to `main` deploys. With no server there, the leaderboard keeps each
player's best times on their own device.

**Flask (optional):** `app.py` serves the same page plus a shared leaderboard at `api/scores`.
Behind a reverse proxy at a sub-path, pass `X-Forwarded-Prefix`; production can run it with
`gunicorn --workers 1 --threads 4 app:app` (one worker: the leaderboard's write lock is
in-process).
