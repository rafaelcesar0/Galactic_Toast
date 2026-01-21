import { useEffect, useRef, useState } from "react";
import type { PointerEvent as ReactPointerEvent } from "react";

import backgroundUrl from "../assets/img/space.jpg";
import toasterUrl from "../assets/img/torradeira.png";
import toastUrl from "../assets/img/toast_small.png";
import asteroidUrl from "../assets/img/Asteroid.png";
import shotSoundUrl from "../assets/sounds/tiro.wav";
import hitSoundUrl from "../assets/sounds/point.wav";
import gameOverSoundUrl from "../assets/sounds/game_over.wav";
import musicUrl from "../assets/sounds/background_music.mp3";

const WIDTH = 800;
const HEIGHT = 600;

const PLAYER_SPEED = 320;
const SHOT_SPEED = 640;
const BASE_ENEMY_SPEED = 180;
const MAX_ENEMY_SPEED = 420;

const BASE_SPAWN_MS = 1100;
const MIN_SPAWN_MS = 350;

const SHOT_COOLDOWN_MS = 250;
const INVULNERABLE_MS = 1000;

const MAX_SHOTS_BASE = 2;
const MAX_SHOTS_CAP = 6;

const LIVES_START = 3;

const clamp = (value: number, min: number, max: number) =>
  Math.min(Math.max(value, min), max);

const spawnInterval = (score: number) =>
  Math.max(MIN_SPAWN_MS, BASE_SPAWN_MS - Math.floor(score / 10) * 80);

const enemySpeed = (score: number) =>
  Math.min(MAX_ENEMY_SPEED, BASE_ENEMY_SPEED + Math.floor(score / 5) * 12);

const randomBetween = (min: number, max: number) =>
  Math.floor(Math.random() * (max - min + 1)) + min;

const rectsIntersect = (a: Rect, b: Rect) =>
  a.x < b.x + b.width &&
  a.x + a.width > b.x &&
  a.y < b.y + b.height &&
  a.y + a.height > b.y;

const loadImage = (url: string) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`Failed to load ${url}`));
    img.src = url;
  });

const createAudio = (url: string, volume: number, loop = false) => {
  const audio = new Audio(url);
  audio.preload = "auto";
  audio.volume = volume;
  audio.loop = loop;
  return audio;
};

type GameMode = "ready" | "playing" | "gameover";

type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

type Player = Rect & {
  speed: number;
  maxShots: number;
  lastShotMs: number;
  invulnerableUntil: number;
};

type Shot = Rect & {
  speed: number;
};

type Enemy = Rect & {
  speed: number;
};

type GameState = {
  score: number;
  lives: number;
  lastSpawnMs: number;
  nextShotUpgrade: number;
  player: Player;
  shots: Shot[];
  enemies: Enemy[];
};

type Controls = {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
  shoot: boolean;
};

type Assets = {
  background: HTMLImageElement;
  player: HTMLImageElement;
  shot: HTMLImageElement;
  enemy: HTMLImageElement;
  sounds: {
    shot: HTMLAudioElement;
    hit: HTMLAudioElement;
    gameOver: HTMLAudioElement;
    music: HTMLAudioElement;
  };
};

type Stats = {
  score: number;
  lives: number;
  ammo: number;
};

export function GalacticToast() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const assetsRef = useRef<Assets | null>(null);
  const modeRef = useRef<GameMode>("ready");
  const gameRef = useRef<GameState | null>(null);
  const controlsRef = useRef<Controls>({
    up: false,
    down: false,
    left: false,
    right: false,
    shoot: false,
  });
  const lastTimeRef = useRef(0);
  const rafRef = useRef<number | null>(null);
  const audioUnlockedRef = useRef(false);
  const statsRef = useRef<Stats>({
    score: 0,
    lives: LIVES_START,
    ammo: MAX_SHOTS_BASE,
  });

  const [assetsReady, setAssetsReady] = useState(false);
  const [loadingError, setLoadingError] = useState<string | null>(null);
  const [mode, setMode] = useState<GameMode>("ready");
  const [stats, setStats] = useState<Stats>(statsRef.current);
  const [lastScore, setLastScore] = useState(0);

  const setModeSafe = (next: GameMode) => {
    modeRef.current = next;
    setMode(next);
  };

  const syncStats = (state: GameState) => {
    const nextStats = {
      score: state.score,
      lives: state.lives,
      ammo: Math.max(state.player.maxShots - state.shots.length, 0),
    };

    const prev = statsRef.current;
    if (
      prev.score !== nextStats.score ||
      prev.lives !== nextStats.lives ||
      prev.ammo !== nextStats.ammo
    ) {
      statsRef.current = nextStats;
      setStats(nextStats);
    }
  };

  const resetGame = (nowMs: number) => {
    const assets = assetsRef.current;
    if (!assets) {
      return;
    }

    const playerWidth = assets.player.width;
    const playerHeight = assets.player.height;

    const player: Player = {
      x: 80 - playerWidth / 2,
      y: HEIGHT / 2 - playerHeight / 2,
      width: playerWidth,
      height: playerHeight,
      speed: PLAYER_SPEED,
      maxShots: MAX_SHOTS_BASE,
      lastShotMs: 0,
      invulnerableUntil: 0,
    };

    const state: GameState = {
      score: 0,
      lives: LIVES_START,
      lastSpawnMs: nowMs,
      nextShotUpgrade: 15,
      player,
      shots: [],
      enemies: [],
    };

    gameRef.current = state;
    controlsRef.current = {
      up: false,
      down: false,
      left: false,
      right: false,
      shoot: false,
    };
    statsRef.current = {
      score: 0,
      lives: LIVES_START,
      ammo: MAX_SHOTS_BASE,
    };
    setStats(statsRef.current);
    setLastScore(0);
  };

  const stopMusic = () => {
    const music = assetsRef.current?.sounds.music;
    if (!music) {
      return;
    }
    music.pause();
    music.currentTime = 0;
  };

  const playSfx = (type: "shot" | "hit" | "gameOver") => {
    if (!audioUnlockedRef.current) {
      return;
    }
    const audio = assetsRef.current?.sounds[type];
    if (!audio) {
      return;
    }
    const instance = audio.cloneNode(true) as HTMLAudioElement;
    instance.volume = audio.volume;
    instance.play().catch(() => undefined);
  };

  const startGame = () => {
    if (!assetsReady) {
      return;
    }
    const nowMs = performance.now();
    resetGame(nowMs);
    audioUnlockedRef.current = true;
    const music = assetsRef.current?.sounds.music;
    if (music) {
      music.currentTime = 0;
      music.play().catch(() => undefined);
    }
    setModeSafe("playing");
  };

  const exitGame = () => {
    stopMusic();
    setModeSafe("ready");
    const nowMs = performance.now();
    resetGame(nowMs);
  };

  useEffect(() => {
    let cancelled = false;
    const loadAssets = async () => {
      try {
        const [background, player, shot, enemy] = await Promise.all([
          loadImage(backgroundUrl),
          loadImage(toasterUrl),
          loadImage(toastUrl),
          loadImage(asteroidUrl),
        ]);

        if ("fonts" in document) {
          await document.fonts.load('16px "Space Grotesk"');
          await document.fonts.load('14px "JetBrains Mono"');
        }

        const sounds = {
          shot: createAudio(shotSoundUrl, 0.7),
          hit: createAudio(hitSoundUrl, 0.6),
          gameOver: createAudio(gameOverSoundUrl, 0.7),
          music: createAudio(musicUrl, 0.5, true),
        };

        if (!cancelled) {
          assetsRef.current = { background, player, shot, enemy, sounds };
          setAssetsReady(true);
          setLoadingError(null);
          resetGame(performance.now());
        }
      } catch (error) {
        if (!cancelled) {
          setLoadingError(
            error instanceof Error ? error.message : "Falha ao carregar assets."
          );
        }
      }
    };

    loadAssets();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!assetsReady) {
      return;
    }

    const handleKey = (event: KeyboardEvent, isDown: boolean) => {
      if (
        event.code === "Space" ||
        event.code.startsWith("Arrow") ||
        event.code === "KeyW" ||
        event.code === "KeyA" ||
        event.code === "KeyS" ||
        event.code === "KeyD"
      ) {
        event.preventDefault();
      }

      switch (event.code) {
        case "ArrowUp":
        case "KeyW":
          controlsRef.current.up = isDown;
          break;
        case "ArrowDown":
        case "KeyS":
          controlsRef.current.down = isDown;
          break;
        case "ArrowLeft":
        case "KeyA":
          controlsRef.current.left = isDown;
          break;
        case "ArrowRight":
        case "KeyD":
          controlsRef.current.right = isDown;
          break;
        case "Space":
          controlsRef.current.shoot = isDown;
          break;
        case "Enter":
          if (isDown && modeRef.current !== "playing") {
            startGame();
          }
          break;
        case "Escape":
          if (isDown) {
            exitGame();
          }
          break;
        default:
          break;
      }
    };

    const onKeyDown = (event: KeyboardEvent) => handleKey(event, true);
    const onKeyUp = (event: KeyboardEvent) => handleKey(event, false);

    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);

    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, [assetsReady]);

  useEffect(() => {
    if (!assetsReady) {
      return;
    }

    const canvas = canvasRef.current;
    const assets = assetsRef.current;
    if (!canvas || !assets) {
      return;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      return;
    }

    const updateGame = (state: GameState, dt: number, nowMs: number) => {
      const controls = controlsRef.current;

      const directionX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
      const directionY = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
      if (directionX !== 0 || directionY !== 0) {
        const length = Math.hypot(directionX, directionY) || 1;
        state.player.x += (directionX / length) * state.player.speed * dt;
        state.player.y += (directionY / length) * state.player.speed * dt;

        state.player.x = clamp(
          state.player.x,
          0,
          WIDTH - state.player.width
        );
        state.player.y = clamp(
          state.player.y,
          0,
          HEIGHT - state.player.height
        );
      }

      if (controls.shoot) {
        if (nowMs - state.player.lastShotMs >= SHOT_COOLDOWN_MS) {
          if (state.shots.length < state.player.maxShots) {
            state.player.lastShotMs = nowMs;
            const shotWidth = assets.shot.width;
            const shotHeight = assets.shot.height;
            state.shots.push({
              x: state.player.x + state.player.width,
              y: state.player.y + state.player.height / 2 - shotHeight / 2,
              width: shotWidth,
              height: shotHeight,
              speed: SHOT_SPEED,
            });
            playSfx("shot");
          }
        }
      }

      for (const shot of state.shots) {
        shot.x += shot.speed * dt;
      }
      state.shots = state.shots.filter(shot => shot.x < WIDTH + shot.width);

      if (nowMs - state.lastSpawnMs >= spawnInterval(state.score)) {
        const base = enemySpeed(state.score);
        const speed = randomBetween(Math.max(120, base - 30), base + 30);
        const enemyHeight = assets.enemy.height;
        const enemyWidth = assets.enemy.width;
        const spawnY = randomBetween(
          Math.floor(enemyHeight / 2),
          Math.floor(HEIGHT - enemyHeight / 2)
        );

        state.enemies.push({
          x: WIDTH + 10,
          y: spawnY - enemyHeight / 2,
          width: enemyWidth,
          height: enemyHeight,
          speed,
        });

        state.lastSpawnMs = nowMs;
      }

      for (const enemy of state.enemies) {
        enemy.x -= enemy.speed * dt;
      }

      const remainingEnemies: Enemy[] = [];
      for (const enemy of state.enemies) {
        if (enemy.x + enemy.width < 0) {
          state.lives -= 1;
        } else {
          remainingEnemies.push(enemy);
        }
      }
      state.enemies = remainingEnemies;

      let hits = 0;
      const survivors: Shot[] = [];
      const enemiesHit = new Set<number>();

      state.shots.forEach(shot => {
        let collided = false;
        for (let idx = 0; idx < state.enemies.length; idx += 1) {
          if (enemiesHit.has(idx)) {
            continue;
          }
          if (rectsIntersect(shot, state.enemies[idx])) {
            enemiesHit.add(idx);
            collided = true;
            hits += 1;
            break;
          }
        }
        if (!collided) {
          survivors.push(shot);
        }
      });

      if (enemiesHit.size > 0) {
        state.enemies = state.enemies.filter(
          (_, index) => !enemiesHit.has(index)
        );
      }
      state.shots = survivors;

      if (hits > 0) {
        playSfx("hit");
        state.score += hits;
        while (
          state.score >= state.nextShotUpgrade &&
          state.player.maxShots < MAX_SHOTS_CAP
        ) {
          state.player.maxShots += 1;
          state.nextShotUpgrade += 15;
        }
      }

      if (nowMs >= state.player.invulnerableUntil) {
        let collided = false;
        const survivorsAfterPlayer: Enemy[] = [];
        for (const enemy of state.enemies) {
          if (!collided && rectsIntersect(state.player, enemy)) {
            collided = true;
            state.lives -= 1;
            state.player.invulnerableUntil = nowMs + INVULNERABLE_MS;
          } else {
            survivorsAfterPlayer.push(enemy);
          }
        }
        if (collided) {
          state.enemies = survivorsAfterPlayer;
        }
      }

      if (state.lives <= 0) {
        stopMusic();
        playSfx("gameOver");
        setLastScore(state.score);
        setModeSafe("gameover");
      }

      syncStats(state);
    };

    const drawHud = (state: GameState) => {
      ctx.fillStyle = "#f8f1e7";
      ctx.font = '16px "JetBrains Mono", "Space Grotesk", sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`Mortes: ${state.score}`, 12, 12);
      ctx.fillText(`Vidas: ${state.lives}`, 12, 32);
      ctx.fillText(
        `Torradas: ${Math.max(state.player.maxShots - state.shots.length, 0)}`,
        12,
        52
      );
    };

    const drawGame = (state: GameState, nowMs: number) => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(assets.background, 0, 0, WIDTH, HEIGHT);

      drawHud(state);

      for (const enemy of state.enemies) {
        ctx.drawImage(assets.enemy, enemy.x, enemy.y, enemy.width, enemy.height);
      }

      for (const shot of state.shots) {
        ctx.drawImage(assets.shot, shot.x, shot.y, shot.width, shot.height);
      }

      if (
        nowMs >= state.player.invulnerableUntil ||
        Math.floor(nowMs / 120) % 2 !== 0
      ) {
        ctx.drawImage(
          assets.player,
          state.player.x,
          state.player.y,
          state.player.width,
          state.player.height
        );
      }
    };

    const loop = (timestamp: number) => {
      const state = gameRef.current;
      if (!state) {
        rafRef.current = requestAnimationFrame(loop);
        return;
      }

      const delta = Math.min((timestamp - lastTimeRef.current) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      if (modeRef.current === "playing") {
        updateGame(state, delta, timestamp);
      }
      drawGame(state, timestamp);

      rafRef.current = requestAnimationFrame(loop);
    };

    lastTimeRef.current = performance.now();
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [assetsReady]);

  const bindControl = (key: keyof Controls) => ({
    onPointerDown: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      controlsRef.current[key] = true;
    },
    onPointerUp: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      controlsRef.current[key] = false;
    },
    onPointerLeave: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      controlsRef.current[key] = false;
    },
    onPointerCancel: (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.preventDefault();
      controlsRef.current[key] = false;
    },
  });

  return (
    <div className="game-shell">
      <div className="game-stage">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          className="game-canvas"
        />
        {!assetsReady && !loadingError && (
          <div className="game-overlay">
            <div className="overlay-card">
              <h2>Carregando missao...</h2>
              <p>Preparando as torradas espaciais.</p>
            </div>
          </div>
        )}
        {loadingError && (
          <div className="game-overlay">
            <div className="overlay-card">
              <h2>Falha nos motores</h2>
              <p>{loadingError}</p>
            </div>
          </div>
        )}
        {assetsReady && !loadingError && mode !== "playing" && (
          <div className="game-overlay">
            <div className="overlay-card">
              <p className="overlay-tag">Operacao: Galactic Toast</p>
              <h2>{mode === "gameover" ? "Fim da jornada" : "Pronto para decolar?"}</h2>
              <p>
                {mode === "gameover"
                  ? `Mortes confirmadas: ${lastScore}.`
                  : "Desvie dos asteroides e libere mais torradas no arsenal."}
              </p>
              <div className="overlay-actions">
                <button className="primary" onClick={startGame}>
                  {mode === "gameover" ? "Jogar de novo" : "Iniciar missao"}
                </button>
                {mode === "gameover" && (
                  <button className="ghost" onClick={exitGame}>
                    Voltar ao menu
                  </button>
                )}
              </div>
              <div className="overlay-hint">Enter inicia / Esc encerra</div>
            </div>
          </div>
        )}
      </div>

      <div className="hud-strip" aria-live="polite">
        <div>
          <span>Mortes</span>
          <strong>{stats.score}</strong>
        </div>
        <div>
          <span>Vidas</span>
          <strong>{stats.lives}</strong>
        </div>
        <div>
          <span>Torradas</span>
          <strong>{stats.ammo}</strong>
        </div>
      </div>

      <div className="touch-controls" aria-hidden="true">
        <div className="pad">
          <button type="button" className="pad-button" {...bindControl("up")}>
            ^
          </button>
          <div className="pad-row">
            <button type="button" className="pad-button" {...bindControl("left")}>
              {"<"}
            </button>
            <button type="button" className="pad-button" {...bindControl("down")}>
              v
            </button>
            <button type="button" className="pad-button" {...bindControl("right")}>
              {">"}
            </button>
          </div>
        </div>
        <button type="button" className="fire-button" {...bindControl("shoot")}>
          Torrar
        </button>
      </div>
    </div>
  );
}

export default GalacticToast;
