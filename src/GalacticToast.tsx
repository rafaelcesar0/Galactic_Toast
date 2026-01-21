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

const COMBO_WINDOW_MS = 2400;

const POWERUP_DROP_BASE = 0.12;
const POWERUP_DROP_COMBO_BONUS = 0.03;
const POWERUP_SPEED = 140;
const POWERUP_SIZE = 30;

const BOOST_MULTIPLIER = 1.35;
const BOOST_DURATION_MS = 6000;

const BURST_COOLDOWN_MS = 140;
const BURST_DURATION_MS = 6000;
const BURST_BONUS_SHOTS = 2;
const BURST_SPREAD_SPEED = 140;
const BURST_SPREAD_OFFSET = 10;

const SLOW_DURATION_MS = 5200;
const SLOW_MULTIPLIER = 0.7;

const SHIELD_CAP = 2;

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
  shield: number;
};

type Shot = Rect & {
  velocityX: number;
  velocityY: number;
};

type EnemyKind = "drifter" | "zigzag" | "armored" | "splitter" | "shard";

type Enemy = Rect & {
  speed: number;
  kind: EnemyKind;
  hp: number;
  baseY: number;
  waveAmplitude: number;
  waveFrequency: number;
  wavePhase: number;
  sizeScale: number;
};

type PowerUpKind = "boost" | "burst" | "shield" | "slow";

type PowerUp = Rect & {
  speed: number;
  kind: PowerUpKind;
};

type GameState = {
  score: number;
  lives: number;
  lastSpawnMs: number;
  nextShotUpgrade: number;
  combo: number;
  comboExpiresAt: number;
  boostUntil: number;
  burstUntil: number;
  slowUntil: number;
  player: Player;
  shots: Shot[];
  enemies: Enemy[];
  powerUps: PowerUp[];
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
  combo: number;
  shield: number;
};

const POWERUP_STYLES: Record<
  PowerUpKind,
  { label: string; fill: string; stroke: string }
> = {
  boost: { label: "T", fill: "rgba(88, 211, 192, 0.9)", stroke: "#2fb7a3" },
  burst: { label: "R", fill: "rgba(244, 195, 122, 0.9)", stroke: "#d08a43" },
  shield: { label: "S", fill: "rgba(90, 160, 255, 0.9)", stroke: "#3f7ad8" },
  slow: { label: "L", fill: "rgba(226, 93, 111, 0.85)", stroke: "#b94a5b" },
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
    combo: 0,
    shield: 0,
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

  const syncStats = (state: GameState, nowMs: number) => {
    const bonusShots = nowMs < state.burstUntil ? BURST_BONUS_SHOTS : 0;
    const maxShots = state.player.maxShots + bonusShots;
    const nextStats = {
      score: state.score,
      lives: state.lives,
      ammo: Math.max(maxShots - state.shots.length, 0),
      combo: state.combo,
      shield: state.player.shield,
    };

    const prev = statsRef.current;
    if (
      prev.score !== nextStats.score ||
      prev.lives !== nextStats.lives ||
      prev.ammo !== nextStats.ammo ||
      prev.combo !== nextStats.combo ||
      prev.shield !== nextStats.shield
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
      shield: 0,
    };

    const state: GameState = {
      score: 0,
      lives: LIVES_START,
      lastSpawnMs: nowMs,
      nextShotUpgrade: 15,
      combo: 0,
      comboExpiresAt: 0,
      boostUntil: 0,
      burstUntil: 0,
      slowUntil: 0,
      player,
      shots: [],
      enemies: [],
      powerUps: [],
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
      combo: 0,
      shield: 0,
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

    const pickEnemyKind = (score: number): EnemyKind => {
      const roll = Math.random();
      if (score < 8) {
        return roll < 0.75 ? "drifter" : "zigzag";
      }
      if (score < 18) {
        if (roll < 0.5) {
          return "drifter";
        }
        if (roll < 0.75) {
          return "zigzag";
        }
        return "armored";
      }
      if (roll < 0.45) {
        return "drifter";
      }
      if (roll < 0.7) {
        return "zigzag";
      }
      if (roll < 0.88) {
        return "armored";
      }
      return "splitter";
    };

    const createEnemy = (score: number): Enemy => {
      const base = enemySpeed(score);
      const kind = pickEnemyKind(score);
      let speed = randomBetween(Math.max(120, base - 30), base + 30);
      let sizeScale = 1;
      let hp = 1;
      let waveAmplitude = 0;
      let waveFrequency = 0;
      let wavePhase = 0;

      switch (kind) {
        case "zigzag":
          sizeScale = 0.9;
          waveAmplitude = randomBetween(18, 34);
          waveFrequency = randomBetween(6, 10) / 1000;
          wavePhase = Math.random() * Math.PI * 2;
          break;
        case "armored":
          sizeScale = 1.15;
          hp = 2;
          speed *= 0.85;
          break;
        case "splitter":
          sizeScale = 1.05;
          break;
        default:
          break;
      }

      const enemyWidth = assets.enemy.width * sizeScale;
      const enemyHeight = assets.enemy.height * sizeScale;
      const spawnY = randomBetween(
        Math.floor(enemyHeight / 2),
        Math.floor(HEIGHT - enemyHeight / 2)
      );
      const baseY = spawnY - enemyHeight / 2;

      return {
        x: WIDTH + 10,
        y: baseY,
        width: enemyWidth,
        height: enemyHeight,
        speed,
        kind,
        hp,
        baseY,
        waveAmplitude,
        waveFrequency,
        wavePhase,
        sizeScale,
      };
    };

    const createShard = (source: Enemy, offsetY: number): Enemy => {
      const sizeScale = 0.65;
      const enemyWidth = assets.enemy.width * sizeScale;
      const enemyHeight = assets.enemy.height * sizeScale;
      const baseY = clamp(
        source.y + source.height / 2 - enemyHeight / 2 + offsetY,
        0,
        HEIGHT - enemyHeight
      );
      return {
        x: source.x + source.width * 0.3,
        y: baseY,
        width: enemyWidth,
        height: enemyHeight,
        speed: source.speed * 1.2,
        kind: "shard",
        hp: 1,
        baseY,
        waveAmplitude: 0,
        waveFrequency: 0,
        wavePhase: 0,
        sizeScale,
      };
    };

    const pickPowerUpKind = (): PowerUpKind => {
      const roll = Math.random();
      if (roll < 0.3) {
        return "boost";
      }
      if (roll < 0.55) {
        return "burst";
      }
      if (roll < 0.78) {
        return "slow";
      }
      return "shield";
    };

    const createPowerUp = (
      kind: PowerUpKind,
      x: number,
      y: number
    ): PowerUp => {
      const size = POWERUP_SIZE;
      return {
        x: clamp(x - size / 2, 0, WIDTH - size),
        y: clamp(y - size / 2, 0, HEIGHT - size),
        width: size,
        height: size,
        speed: randomBetween(POWERUP_SPEED - 20, POWERUP_SPEED + 30),
        kind,
      };
    };

    const updateGame = (state: GameState, dt: number, nowMs: number) => {
      const controls = controlsRef.current;
      const boostActive = nowMs < state.boostUntil;
      const burstActive = nowMs < state.burstUntil;
      const slowActive = nowMs < state.slowUntil;

      const directionX = (controls.right ? 1 : 0) - (controls.left ? 1 : 0);
      const directionY = (controls.down ? 1 : 0) - (controls.up ? 1 : 0);
      if (directionX !== 0 || directionY !== 0) {
        const length = Math.hypot(directionX, directionY) || 1;
        const playerSpeed =
          state.player.speed * (boostActive ? BOOST_MULTIPLIER : 1);
        state.player.x += (directionX / length) * playerSpeed * dt;
        state.player.y += (directionY / length) * playerSpeed * dt;

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
        const shotCooldown = burstActive
          ? BURST_COOLDOWN_MS
          : SHOT_COOLDOWN_MS;
        if (nowMs - state.player.lastShotMs >= shotCooldown) {
          const bonusShots = burstActive ? BURST_BONUS_SHOTS : 0;
          const maxShots = state.player.maxShots + bonusShots;
          if (state.shots.length < maxShots) {
            state.player.lastShotMs = nowMs;
            const shotWidth = assets.shot.width;
            const shotHeight = assets.shot.height;
            const baseY =
              state.player.y + state.player.height / 2 - shotHeight / 2;
            const patterns = burstActive
              ? [
                  { offset: 0, velocityY: 0 },
                  { offset: -BURST_SPREAD_OFFSET, velocityY: -BURST_SPREAD_SPEED },
                  { offset: BURST_SPREAD_OFFSET, velocityY: BURST_SPREAD_SPEED },
                ]
              : [{ offset: 0, velocityY: 0 }];
            let fired = false;
            for (const pattern of patterns) {
              if (state.shots.length >= maxShots) {
                break;
              }
              state.shots.push({
                x: state.player.x + state.player.width,
                y: baseY + pattern.offset,
                width: shotWidth,
                height: shotHeight,
                velocityX: SHOT_SPEED,
                velocityY: pattern.velocityY,
              });
              fired = true;
            }
            if (fired) {
              playSfx("shot");
            }
          }
        }
      }

      for (const shot of state.shots) {
        shot.x += shot.velocityX * dt;
        shot.y += shot.velocityY * dt;
      }
      state.shots = state.shots.filter(
        shot =>
          shot.x < WIDTH + shot.width &&
          shot.y > -shot.height &&
          shot.y < HEIGHT + shot.height
      );

      if (nowMs - state.lastSpawnMs >= spawnInterval(state.score)) {
        state.enemies.push(createEnemy(state.score));
        state.lastSpawnMs = nowMs;
      }

      const enemySpeedScale = slowActive ? SLOW_MULTIPLIER : 1;
      for (const enemy of state.enemies) {
        enemy.x -= enemy.speed * enemySpeedScale * dt;
        if (enemy.waveAmplitude > 0) {
          enemy.y =
            enemy.baseY +
            Math.sin(nowMs * enemy.waveFrequency + enemy.wavePhase) *
              enemy.waveAmplitude;
          enemy.y = clamp(enemy.y, 0, HEIGHT - enemy.height);
        }
      }

      const remainingEnemies: Enemy[] = [];
      let escaped = 0;
      for (const enemy of state.enemies) {
        if (enemy.x + enemy.width < 0) {
          escaped += 1;
        } else {
          remainingEnemies.push(enemy);
        }
      }
      if (escaped > 0) {
        state.lives -= escaped;
        state.combo = 0;
        state.comboExpiresAt = 0;
      }
      state.enemies = remainingEnemies;

      for (const powerUp of state.powerUps) {
        powerUp.x -= powerUp.speed * dt;
      }
      state.powerUps = state.powerUps.filter(
        powerUp => powerUp.x + powerUp.width > 0
      );

      let hitCount = 0;
      const survivors: Shot[] = [];
      const destroyedEnemies: Enemy[] = [];

      for (const shot of state.shots) {
        let collided = false;
        for (const enemy of state.enemies) {
          if (enemy.hp <= 0) {
            continue;
          }
          if (rectsIntersect(shot, enemy)) {
            enemy.hp -= 1;
            hitCount += 1;
            collided = true;
            if (enemy.hp <= 0) {
              destroyedEnemies.push(enemy);
            }
            break;
          }
        }
        if (!collided) {
          survivors.push(shot);
        }
      }

      state.shots = survivors;

      if (hitCount > 0) {
        playSfx("hit");
      }

      state.enemies = state.enemies.filter(enemy => enemy.hp > 0);

      if (destroyedEnemies.length > 0) {
        for (const enemy of destroyedEnemies) {
          state.score += 1;
          if (nowMs <= state.comboExpiresAt) {
            state.combo += 1;
          } else {
            state.combo = 1;
          }
          state.comboExpiresAt = nowMs + COMBO_WINDOW_MS;

          const comboTier = Math.min(3, Math.floor(state.combo / 4));
          const dropChance =
            POWERUP_DROP_BASE + comboTier * POWERUP_DROP_COMBO_BONUS;
          if (
            state.powerUps.length < 3 &&
            Math.random() < dropChance
          ) {
            const kind = pickPowerUpKind();
            state.powerUps.push(
              createPowerUp(
                kind,
                enemy.x + enemy.width / 2,
                enemy.y + enemy.height / 2
              )
            );
          }

          if (enemy.kind === "splitter") {
            state.enemies.push(createShard(enemy, -14));
            state.enemies.push(createShard(enemy, 14));
          }
        }
      }

      while (
        state.score >= state.nextShotUpgrade &&
        state.player.maxShots < MAX_SHOTS_CAP
      ) {
        state.player.maxShots += 1;
        state.nextShotUpgrade += 15;
      }

      if (nowMs >= state.player.invulnerableUntil) {
        let collided = false;
        const survivorsAfterPlayer: Enemy[] = [];
        for (const enemy of state.enemies) {
          if (!collided && rectsIntersect(state.player, enemy)) {
            collided = true;
            if (state.player.shield > 0) {
              state.player.shield -= 1;
            } else {
              state.lives -= 1;
            }
            state.player.invulnerableUntil = nowMs + INVULNERABLE_MS;
            state.combo = 0;
            state.comboExpiresAt = 0;
          } else {
            survivorsAfterPlayer.push(enemy);
          }
        }
        if (collided) {
          state.enemies = survivorsAfterPlayer;
        }
      }

      const remainingPowerUps: PowerUp[] = [];
      for (const powerUp of state.powerUps) {
        if (rectsIntersect(state.player, powerUp)) {
          switch (powerUp.kind) {
            case "boost":
              state.boostUntil =
                Math.max(state.boostUntil, nowMs) + BOOST_DURATION_MS;
              break;
            case "burst":
              state.burstUntil =
                Math.max(state.burstUntil, nowMs) + BURST_DURATION_MS;
              break;
            case "slow":
              state.slowUntil =
                Math.max(state.slowUntil, nowMs) + SLOW_DURATION_MS;
              break;
            case "shield":
              state.player.shield = Math.min(
                SHIELD_CAP,
                state.player.shield + 1
              );
              break;
            default:
              break;
          }
          playSfx("hit");
        } else {
          remainingPowerUps.push(powerUp);
        }
      }
      state.powerUps = remainingPowerUps;

      if (state.combo > 0 && nowMs > state.comboExpiresAt) {
        state.combo = 0;
      }

      if (state.lives <= 0) {
        stopMusic();
        playSfx("gameOver");
        setLastScore(state.score);
        setModeSafe("gameover");
      }

      syncStats(state, nowMs);
    };

    const drawHud = (state: GameState, nowMs: number) => {
      const boostActive = nowMs < state.boostUntil;
      const burstActive = nowMs < state.burstUntil;
      const slowActive = nowMs < state.slowUntil;
      const bonusShots = burstActive ? BURST_BONUS_SHOTS : 0;
      const maxShots = state.player.maxShots + bonusShots;

      ctx.save();
      ctx.fillStyle = "#f8f1e7";
      ctx.font = '16px "JetBrains Mono", "Space Grotesk", sans-serif';
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`Mortes: ${state.score}`, 12, 12);
      ctx.fillText(`Vidas: ${state.lives}`, 12, 32);
      ctx.fillText(
        `Torradas: ${Math.max(maxShots - state.shots.length, 0)}`,
        12,
        52
      );

      let line = 72;
      if (state.combo > 1) {
        ctx.fillText(`Combo: x${state.combo}`, 12, line);
        line += 20;
      }
      if (state.player.shield > 0) {
        ctx.fillText(`Escudo: ${state.player.shield}`, 12, line);
      }

      const effects: string[] = [];
      if (boostActive) {
        effects.push("Turbo");
      }
      if (burstActive) {
        effects.push("Rajada");
      }
      if (slowActive) {
        effects.push("Lento");
      }
      if (effects.length > 0) {
        ctx.textAlign = "right";
        ctx.fillStyle = "#f4c37a";
        ctx.fillText(`Efeitos: ${effects.join(" / ")}`, WIDTH - 12, 12);
      }
      ctx.restore();
    };

    const drawPowerUp = (powerUp: PowerUp) => {
      const style = POWERUP_STYLES[powerUp.kind];
      const centerX = powerUp.x + powerUp.width / 2;
      const centerY = powerUp.y + powerUp.height / 2;
      const radius = powerUp.width / 2;

      ctx.save();
      ctx.fillStyle = style.fill;
      ctx.strokeStyle = style.stroke;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(centerX, centerY, radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = "#0f1119";
      ctx.font = 'bold 14px "JetBrains Mono", "Space Grotesk", sans-serif';
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(style.label, centerX, centerY + 1);
      ctx.restore();
    };

    const drawEnemy = (enemy: Enemy) => {
      ctx.save();
      if (enemy.kind === "shard") {
        ctx.globalAlpha = 0.7;
      }
      ctx.drawImage(assets.enemy, enemy.x, enemy.y, enemy.width, enemy.height);
      if (enemy.kind === "armored") {
        ctx.strokeStyle = "rgba(244, 195, 122, 0.9)";
        ctx.lineWidth = 3;
        ctx.strokeRect(
          enemy.x + 2,
          enemy.y + 2,
          enemy.width - 4,
          enemy.height - 4
        );
      }
      if (enemy.kind === "zigzag") {
        ctx.strokeStyle = "rgba(88, 211, 192, 0.7)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          enemy.x + 6,
          enemy.y + 6,
          enemy.width - 12,
          enemy.height - 12
        );
      }
      if (enemy.kind === "splitter") {
        ctx.strokeStyle = "rgba(226, 93, 111, 0.8)";
        ctx.lineWidth = 2;
        ctx.strokeRect(
          enemy.x + 4,
          enemy.y + 4,
          enemy.width - 8,
          enemy.height - 8
        );
      }
      ctx.restore();
    };

    const drawGame = (state: GameState, nowMs: number) => {
      ctx.clearRect(0, 0, WIDTH, HEIGHT);
      ctx.drawImage(assets.background, 0, 0, WIDTH, HEIGHT);

      if (nowMs < state.slowUntil) {
        ctx.fillStyle = "rgba(88, 211, 192, 0.08)";
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }

      drawHud(state, nowMs);

      for (const enemy of state.enemies) {
        drawEnemy(enemy);
      }

      for (const shot of state.shots) {
        ctx.drawImage(assets.shot, shot.x, shot.y, shot.width, shot.height);
      }

      for (const powerUp of state.powerUps) {
        drawPowerUp(powerUp);
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
        if (state.player.shield > 0) {
          ctx.save();
          ctx.strokeStyle = "rgba(90, 160, 255, 0.7)";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.ellipse(
            state.player.x + state.player.width / 2,
            state.player.y + state.player.height / 2,
            state.player.width * 0.6,
            state.player.height * 0.7,
            0,
            0,
            Math.PI * 2
          );
          ctx.stroke();
          ctx.restore();
        }
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
                  : "Desvie dos asteroides, capture orbes e libere mais torradas no arsenal."}
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
        <div>
          <span>Combo</span>
          <strong>{stats.combo}</strong>
        </div>
        <div>
          <span>Escudo</span>
          <strong>{stats.shield}</strong>
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
