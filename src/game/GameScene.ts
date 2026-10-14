import Phaser from 'phaser';
import { SoundEffects } from './SoundEffects';

// === КОНСТАНТЫ ИГРЫ ===
const TILE_SIZE = 60;
const GRID_COLS = 16;
const GAME_WIDTH = 960;
const GAME_HEIGHT = 640;
const CAMERA_OFFSET_Y = 440;
const HOP_DURATION = 110;
const EAGLE_IDLE_TIMEOUT = 8.0;
const MAX_LANES_BEHIND = 6;
const LANES_AHEAD = 16;

type LaneType = 'grass' | 'road' | 'river' | 'rail';

interface Vehicle {
  x: number;
  width: number;
  height: number;
  speed: number;
  direction: 1 | -1;
  color: number;
  type: 'sports' | 'sedan' | 'truck';
  graphics: Phaser.GameObjects.Graphics;
}

interface Log {
  x: number;
  width: number;
  height: number;
  speed: number;
  direction: 1 | -1;
  graphics: Phaser.GameObjects.Graphics;
}

interface TrainState {
  active: boolean;
  warningTimer: number;
  trainX: number;
  direction: 1 | -1;
  speed: number;
  carsCount: number;
  totalLength: number;
  graphics: Phaser.GameObjects.Graphics;
  signalGraphics: Phaser.GameObjects.Graphics;
}

interface Lane {
  rowIndex: number;
  worldY: number;
  type: LaneType;
  container: Phaser.GameObjects.Container;
  bgGraphics: Phaser.GameObjects.Graphics;
  obstacles: Set<number>;
  obstacleGraphics?: Phaser.GameObjects.Graphics[];
  vehicles: Vehicle[];
  logs: Log[];
  train?: TrainState;
  coinCol?: number;
  coinContainer?: Phaser.GameObjects.Container;
}

export class GameScene extends Phaser.Scene {
  private soundFx!: SoundEffects;

  // Игрок
  private playerContainer!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Graphics;
  private playerShadow!: Phaser.GameObjects.Graphics;
  private playerCol = 7;
  private playerRow = 1;
  private isHopping = false;
  private isDead = false;
  private currentRideLog: Log | null = null;
  private playerFacing: 'up' | 'down' | 'left' | 'right' = 'up';

  // Линии мира
  private lanes: Map<number, Lane> = new Map();
  private maxRowGenerated = 0;
  private score = 0;
  private highScore = 0;
  private coins = 0;
  private timeSinceForwardMove = 0;

  // Орёл
  private eagleContainer!: Phaser.GameObjects.Container;
  private eagleShadow!: Phaser.GameObjects.Graphics;
  private eagleActive = false;

  // HUD & UI (фиксированные на экране)
  private hudContainer!: Phaser.GameObjects.Container;
  private scoreText!: Phaser.GameObjects.Text;
  private coinText!: Phaser.GameObjects.Text;
  private highScoreText!: Phaser.GameObjects.Text;
  private muteBtnText!: Phaser.GameObjects.Text;
  private gameOverContainer!: Phaser.GameObjects.Container;

  // Ввод
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private touchStartX = 0;
  private touchStartY = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.soundFx = new SoundEffects();
    this.highScore = parseInt(localStorage.getItem('crossy_road_high_score') || '0', 10);
    this.coins = parseInt(localStorage.getItem('crossy_road_coins') || '0', 10);

    // Сброс состояния
    this.lanes.clear();
    this.maxRowGenerated = 0;
    this.score = 0;
    this.timeSinceForwardMove = 0;
    this.isDead = false;
    this.isHopping = false;
    this.eagleActive = false;
    this.currentRideLog = null;
    this.playerCol = Math.floor(GRID_COLS / 2);
    this.playerRow = 1;
    this.playerFacing = 'up';

    // Создаем начальные полосы
    for (let r = -2; r <= LANES_AHEAD; r++) {
      this.generateLane(r);
    }

    // Создаем игрока (цыплёнок в воксельном стиле)
    this.createPlayer();

    // Создаем орла
    this.createEagle();

    // Настраиваем камеру
    this.cameras.main.setBackgroundColor('#0f172a');
    this.updateCameraImmediate();

    // Создаем интерфейс HUD
    this.createHUD();

    // Ввод с клавиатуры
    if (!this.input.keyboard) {
      throw new Error('Keyboard input is unavailable.');
    }
    this.cursors = this.input.keyboard.createCursorKeys();
    this.wasd = this.input.keyboard.addKeys({
      up: Phaser.Input.Keyboard.KeyCodes.W,
      down: Phaser.Input.Keyboard.KeyCodes.S,
      left: Phaser.Input.Keyboard.KeyCodes.A,
      right: Phaser.Input.Keyboard.KeyCodes.D,
    }) as Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
    this.spaceKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.SPACE);

    // Обработка тачей / свайпов / кликов
    this.setupTouchAndPointerControls();
  }

  // =========================================================================
  // СОЗДАНИЕ ПЕРСОНАЖА (ВОКСЕЛЬНЫЙ ЦЫПЛЕНОК)
  // =========================================================================
  private createPlayer(): void {
    const worldX = this.colToWorldX(this.playerCol);
    const worldY = this.rowToWorldY(this.playerRow);

    this.playerContainer = this.add.container(worldX, worldY);
    this.playerContainer.setDepth(100);

    // Тень под персонажем
    this.playerShadow = this.add.graphics();
    this.playerShadow.fillStyle(0x000000, 0.28);
    this.playerShadow.fillEllipse(0, 18, 38, 20);
    this.playerContainer.add(this.playerShadow);

    // Тело цыпленка
    this.playerBody = this.add.graphics();
    this.redrawPlayerBody('up');
    this.playerContainer.add(this.playerBody);
  }

  private redrawPlayerBody(dir: 'up' | 'down' | 'left' | 'right'): void {
    this.playerBody.clear();

    // Ножки
    this.playerBody.fillStyle(0xf59e0b, 1);
    this.playerBody.fillRect(-12, 10, 7, 7);
    this.playerBody.fillRect(5, 10, 7, 7);

    // Основное кубическое тело (белое)
    this.playerBody.fillStyle(0xffffff, 1);
    this.playerBody.fillRoundedRect(-18, -20, 36, 34, 6);

    // Нижняя тень тела для объема
    this.playerBody.fillStyle(0xe2e8f0, 1);
    this.playerBody.fillRect(-18, 6, 36, 8);

    // Крылышки по бокам
    this.playerBody.fillStyle(0xf1f5f9, 1);
    this.playerBody.fillRoundedRect(-22, -12, 5, 18, 2);
    this.playerBody.fillRoundedRect(17, -12, 5, 18, 2);

    // Гребешок на макушке (красный)
    this.playerBody.fillStyle(0xef4444, 1);
    this.playerBody.fillRoundedRect(-5, -27, 10, 9, 3);

    // Клювик и глазки в зависимости от направления взгляда
    if (dir === 'up') {
      // Вид со спины: красный гребешок, белый хвост
      this.playerBody.fillStyle(0xf8fafc, 1);
      this.playerBody.fillRect(-6, 2, 12, 8);
    } else if (dir === 'down') {
      // Клюв (оранжевый)
      this.playerBody.fillStyle(0xf97316, 1);
      this.playerBody.fillTriangle(-6, -2, 6, -2, 0, 8);

      // Глазки (черные с белым бликом)
      this.playerBody.fillStyle(0x0f172a, 1);
      this.playerBody.fillRect(-11, -12, 5, 6);
      this.playerBody.fillRect(6, -12, 5, 6);
      this.playerBody.fillStyle(0xffffff, 1);
      this.playerBody.fillRect(-10, -11, 2, 2);
      this.playerBody.fillRect(7, -11, 2, 2);
    } else if (dir === 'left') {
      // Клюв влево
      this.playerBody.fillStyle(0xf97316, 1);
      this.playerBody.fillTriangle(-18, -8, -18, 2, -26, -3);

      // Глазик слева
      this.playerBody.fillStyle(0x0f172a, 1);
      this.playerBody.fillRect(-12, -12, 5, 6);
      this.playerBody.fillStyle(0xffffff, 1);
      this.playerBody.fillRect(-11, -11, 2, 2);
    } else if (dir === 'right') {
      // Клюв вправо
      this.playerBody.fillStyle(0xf97316, 1);
      this.playerBody.fillTriangle(18, -8, 18, 2, 26, -3);

      // Глазик справа
      this.playerBody.fillStyle(0x0f172a, 1);
      this.playerBody.fillRect(7, -12, 5, 6);
      this.playerBody.fillStyle(0xffffff, 1);
      this.playerBody.fillRect(8, -11, 2, 2);
    }
  }

  // =========================================================================
  // СОЗДАНИЕ ОРЛА (ТАЙМЕР БЕЗДЕЙСТВИЯ)
  // =========================================================================
  private createEagle(): void {
    this.eagleContainer = this.add.container(-500, -500);
    this.eagleContainer.setDepth(200);
    this.eagleContainer.setVisible(false);

    // Тень орла на земле
    this.eagleShadow = this.add.graphics();
    this.eagleShadow.fillStyle(0x000000, 0.4);
    this.eagleShadow.fillEllipse(0, 0, 90, 40);
    this.eagleContainer.add(this.eagleShadow);

    // Тело и крылья орла
    const g = this.add.graphics();
    // Размах крыльев
    g.fillStyle(0x451a03, 1);
    g.fillTriangle(-70, -20, 70, -20, 0, 25);
    // Голова
    g.fillStyle(0xf8fafc, 1);
    g.fillCircle(0, 24, 12);
    // Клюв
    g.fillStyle(0xf59e0b, 1);
    g.fillTriangle(-5, 32, 5, 32, 0, 42);
    // Глазки
    g.fillStyle(0x000000, 1);
    g.fillCircle(-4, 25, 2.5);
    g.fillCircle(4, 25, 2.5);

    this.eagleContainer.add(g);
  }

  // =========================================================================
  // ГЕНЕРАЦИЯ ПОЛОС (ПРОЦЕДУРНЫЙ МИР)
  // =========================================================================
  private generateLane(rowIndex: number): Lane {
    if (this.lanes.has(rowIndex)) {
      return this.lanes.get(rowIndex)!;
    }

    const worldY = this.rowToWorldY(rowIndex);
    const container = this.add.container(0, worldY);
    container.setDepth(10);

    const bgGraphics = this.add.graphics();
    container.add(bgGraphics);

    let type: LaneType = 'grass';
    if (rowIndex <= 2) {
      type = 'grass'; // Первые полосы всегда безопасная трава
    } else {
      // Распределение вероятностей типов полос
      const seed = Math.sin(rowIndex * 12.9898) * 43758.5453;
      const rand = seed - Math.floor(seed);

      // Проверяем тип предыдущей полосы для естественных паттернов
      const prevLane = this.lanes.get(rowIndex - 1);
      const prevType = prevLane ? prevLane.type : 'grass';

      if (prevType === 'road' && rand < 0.45) {
        type = 'road'; // 2-3 дороги подряд
      } else if (prevType === 'river' && rand < 0.4) {
        type = 'river'; // 2 реки подряд
      } else if (rand < 0.38) {
        type = 'road';
      } else if (rand < 0.65) {
        type = 'river';
      } else if (rand < 0.78 && rowIndex > 6) {
        type = 'rail';
      } else {
        type = 'grass';
      }
    }

    const lane: Lane = {
      rowIndex,
      worldY,
      type,
      container,
      bgGraphics,
      obstacles: new Set<number>(),
      vehicles: [],
      logs: [],
    };

    // Отрисовка фона и наполнение полосы
    this.setupLaneVisuals(lane);

    this.lanes.set(rowIndex, lane);
    if (rowIndex > this.maxRowGenerated) {
      this.maxRowGenerated = rowIndex;
    }

    return lane;
  }

  private setupLaneVisuals(lane: Lane): void {
    const { bgGraphics, container, type, rowIndex } = lane;
    bgGraphics.clear();

    const speedScale = 1 + Math.min(this.score / 60, 0.85);

    if (type === 'grass') {
      // Травяная полоса
      const isAlt = Math.abs(rowIndex) % 2 === 0;
      bgGraphics.fillStyle(isAlt ? 0x22c55e : 0x16a34a, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Текстура травинок
      bgGraphics.fillStyle(0x4ade80, 0.6);
      for (let x = 20; x < GAME_WIDTH; x += 60) {
        bgGraphics.fillRect(x + ((rowIndex * 17) % 30), -TILE_SIZE / 2 + 8, 4, 10);
      }

      // Добавляем деревья/камни как препятствия
      if (rowIndex > 1) {
        lane.obstacleGraphics = [];
        const treeCount = Phaser.Math.Between(1, 3);
        const freeCols = [this.playerCol, this.playerCol - 1, this.playerCol + 1];

        for (let i = 0; i < treeCount; i++) {
          const col = Phaser.Math.Between(0, GRID_COLS - 1);
          // Не ставим дерево прямо перед стартом
          if (!freeCols.includes(col) && !lane.obstacles.has(col)) {
            lane.obstacles.add(col);
            const obsG = this.drawTreeOrRock(this.colToWorldX(col), 0);
            container.add(obsG);
            lane.obstacleGraphics.push(obsG);
          }
        }

        // Шанс появления бонусной монетки
        if (Math.random() < 0.25) {
          const coinCol = Phaser.Math.Between(1, GRID_COLS - 2);
          if (!lane.obstacles.has(coinCol)) {
            lane.coinCol = coinCol;
            lane.coinContainer = this.createCoin(this.colToWorldX(coinCol), 0);
            container.add(lane.coinContainer);
          }
        }
      }
    } else if (type === 'road') {
      // Асфальтовая дорога
      bgGraphics.fillStyle(0x1e293b, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Бордюры дороги
      bgGraphics.fillStyle(0x0f172a, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, 3);
      bgGraphics.fillRect(0, TILE_SIZE / 2 - 3, GAME_WIDTH, 3);

      // Разметка дороги (пунктирные белые линии)
      bgGraphics.fillStyle(0xf8fafc, 0.85);
      for (let x = 10; x < GAME_WIDTH; x += 55) {
        bgGraphics.fillRect(x, -2, 28, 4);
      }

      // Генерация машин для этой дороги
      const direction: 1 | -1 = rowIndex % 2 === 0 ? 1 : -1;
      const baseSpeed = Phaser.Math.Between(130, 240) * speedScale;
      const vehicleCount = Phaser.Math.Between(2, 3);
      const spacing = GAME_WIDTH / vehicleCount;

      for (let i = 0; i < vehicleCount; i++) {
        const startX = i * spacing + Phaser.Math.Between(-40, 40);
        const randType = Math.random();
        let vType: 'sports' | 'sedan' | 'truck' = 'sedan';
        let vWidth = 72;
        let vHeight = 34;
        let vColor = 0xeab308; // Желтый седан

        if (randType < 0.3) {
          vType = 'sports';
          vWidth = 58;
          vHeight = 32;
          vColor = 0xef4444; // Красный спорткар
        } else if (randType > 0.75) {
          vType = 'truck';
          vWidth = 115;
          vHeight = 36;
          vColor = 0xf97316; // Оранжевый грузовик
        }

        const vGraphics = this.add.graphics();
        container.add(vGraphics);

        const vehicle: Vehicle = {
          x: startX,
          width: vWidth,
          height: vHeight,
          speed: baseSpeed,
          direction,
          color: vColor,
          type: vType,
          graphics: vGraphics,
        };

        this.drawVehicle(vehicle);
        lane.vehicles.push(vehicle);
      }
    } else if (type === 'river') {
      // Река с бревнами
      bgGraphics.fillStyle(0x0284c7, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Волны и рябь воды
      bgGraphics.fillStyle(0x38bdf8, 0.65);
      for (let x = 15; x < GAME_WIDTH; x += 70) {
        bgGraphics.fillRect(x + ((rowIndex * 23) % 40), -12, 32, 3);
        bgGraphics.fillRect(x + 25, 10, 24, 3);
      }

      // Генерация бревен
      const direction: 1 | -1 = rowIndex % 2 === 0 ? 1 : -1;
      const baseSpeed = Phaser.Math.Between(95, 175) * speedScale;
      const logCount = Phaser.Math.Between(2, 3);
      const spacing = GAME_WIDTH / logCount;

      for (let i = 0; i < logCount; i++) {
        const startX = i * spacing + Phaser.Math.Between(-30, 30);
        const logWidth = Phaser.Math.RND.pick([100, 140, 180]);
        const logGraphics = this.add.graphics();
        container.add(logGraphics);

        const log: Log = {
          x: startX,
          width: logWidth,
          height: 38,
          speed: baseSpeed,
          direction,
          graphics: logGraphics,
        };

        this.drawLog(log);
        lane.logs.push(log);
      }
    } else if (type === 'rail') {
      // Железная дорога
      bgGraphics.fillStyle(0x334155, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Шпалы (деревянные)
      bgGraphics.fillStyle(0x78350f, 1);
      for (let x = 6; x < GAME_WIDTH; x += 22) {
        bgGraphics.fillRect(x, -TILE_SIZE / 2 + 5, 11, TILE_SIZE - 10);
      }

      // Рельсы (блестящие стальные полосы)
      bgGraphics.fillStyle(0x94a3b8, 1);
      bgGraphics.fillRect(0, -14, GAME_WIDTH, 4);
      bgGraphics.fillRect(0, 10, GAME_WIDTH, 4);
      bgGraphics.fillStyle(0xf1f5f9, 0.8);
      bgGraphics.fillRect(0, -14, GAME_WIDTH, 1.5);
      bgGraphics.fillRect(0, 10, GAME_WIDTH, 1.5);

      // Светофор на краю дороги
      const signalGraphics = this.add.graphics();
      container.add(signalGraphics);
      this.drawRailSignal(signalGraphics, false);

      const trainGraphics = this.add.graphics();
      container.add(trainGraphics);

      lane.train = {
        active: false,
        warningTimer: Phaser.Math.FloatBetween(4.0, 9.0),
        trainX: -900,
        direction: Math.random() < 0.5 ? 1 : -1,
        speed: 1150 * speedScale,
        carsCount: 4,
        totalLength: 680,
        graphics: trainGraphics,
        signalGraphics,
      };
    }
  }

  // Отрисовка дерева или камня
  private drawTreeOrRock(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();

    // Тень под объектом
    g.fillStyle(0x000000, 0.22);
    g.fillEllipse(x, y + 16, 36, 18);

    if (Math.random() < 0.7) {
      // Дерево (ствол + крона)
      g.fillStyle(0x78350f, 1);
      g.fillRect(x - 5, y, 10, 16);

      // Нижняя теневая часть листвы
      g.fillStyle(0x15803d, 1);
      g.fillRoundedRect(x - 19, y - 24, 38, 28, 6);

      // Верхняя светлая часть листвы
      g.fillStyle(0x22c55e, 1);
      g.fillRoundedRect(x - 16, y - 28, 32, 22, 6);
    } else {
      // Камень
      g.fillStyle(0x475569, 1);
      g.fillRoundedRect(x - 17, y - 10, 34, 26, 7);
      g.fillStyle(0x64748b, 1);
      g.fillRoundedRect(x - 14, y - 12, 28, 16, 5);
      g.fillStyle(0x94a3b8, 1);
      g.fillCircle(x - 4, y - 6, 4);
    }

    return g;
  }

  // Отрисовка монетки
  private createCoin(x: number, y: number): Phaser.GameObjects.Container {
    const coinContainer = this.add.container(x, y);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.25);
    shadow.fillEllipse(0, 16, 20, 10);
    coinContainer.add(shadow);

    const coin = this.add.graphics();
    coin.fillStyle(0xf59e0b, 1);
    coin.fillCircle(0, 0, 12);
    coin.fillStyle(0xfacc15, 1);
    coin.fillCircle(0, 0, 10);
    coin.fillStyle(0x78350f, 0.9);
    coin.fillCircle(0, 0, 4);
    coinContainer.add(coin);

    // Анимация парения монетки
    this.tweens.add({
      targets: coin,
      y: -6,
      duration: 650,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return coinContainer;
  }

  // Отрисовка машины
  private drawVehicle(v: Vehicle): void {
    const g = v.graphics;
    g.clear();

    const halfW = v.width / 2;
    const halfH = v.height / 2;

    // Тень под машиной
    g.fillStyle(0x000000, 0.35);
    g.fillRoundedRect(v.x - halfW - 2, -halfH + 3, v.width + 4, v.height + 2, 6);

    // Колеса (4 черных прямоугольника)
    g.fillStyle(0x0f172a, 1);
    g.fillRect(v.x - halfW + 6, -halfH - 2, 12, 4);
    g.fillRect(v.x + halfW - 18, -halfH - 2, 12, 4);
    g.fillRect(v.x - halfW + 6, halfH - 2, 12, 4);
    g.fillRect(v.x + halfW - 18, halfH - 2, 12, 4);

    // Кузов машины
    g.fillStyle(v.color, 1);
    g.fillRoundedRect(v.x - halfW, -halfH, v.width, v.height, 6);

    // Окна и крыша в зависимости от типа
    if (v.type === 'sports') {
      // Спортивный кузов: зауженный салон
      g.fillStyle(0x0f172a, 0.85);
      g.fillRoundedRect(v.x - halfW + 14, -halfH + 5, v.width - 24, v.height - 10, 4);
      g.fillStyle(0x93c5fd, 0.8);
      g.fillRect(v.x - halfW + 16, -halfH + 7, 7, v.height - 14);
      g.fillRect(v.x + halfW - 22, -halfH + 7, 7, v.height - 14);
    } else if (v.type === 'truck') {
      // Кабина и прицеп
      const cabWidth = 32;
      const cabX = v.direction === 1 ? v.x + halfW - cabWidth : v.x - halfW;
      const trailerX = v.direction === 1 ? v.x - halfW : v.x - halfW + cabWidth;

      // Прицеп
      g.fillStyle(0xe2e8f0, 1);
      g.fillRoundedRect(trailerX, -halfH + 2, v.width - cabWidth, v.height - 4, 3);
      g.fillStyle(0x94a3b8, 0.5);
      g.fillRect(trailerX + 6, -halfH + 6, v.width - cabWidth - 12, v.height - 12);

      // Лобовое стекло кабины
      g.fillStyle(0x38bdf8, 0.9);
      g.fillRect(cabX + (v.direction === 1 ? cabWidth - 10 : 3), -halfH + 5, 7, v.height - 10);
    } else {
      // Седан
      g.fillStyle(0x1e293b, 1);
      g.fillRoundedRect(v.x - 18, -halfH + 4, 36, v.height - 8, 4);
      g.fillStyle(0xbae6fd, 0.85);
      g.fillRect(v.x - 14, -halfH + 6, 8, v.height - 12);
      g.fillRect(v.x + 6, -halfH + 6, 8, v.height - 12);
    }

    // Фары и световой луч
    const frontX = v.direction === 1 ? v.x + halfW : v.x - halfW;
    const beamDir = v.direction;

    // Желтые фонари
    g.fillStyle(0xfef08a, 1);
    g.fillCircle(frontX, -halfH + 6, 3.5);
    g.fillCircle(frontX, halfH - 6, 3.5);

    // Световой луч фар на дороге
    g.fillStyle(0xfef9c3, 0.12);
    g.fillTriangle(
      frontX, -halfH + 6,
      frontX, halfH - 6,
      frontX + beamDir * 75, halfH + 12
    );
    g.fillTriangle(
      frontX, -halfH + 6,
      frontX + beamDir * 75, -halfH - 12,
      frontX + beamDir * 75, halfH + 12
    );

    // Задние красные габариты
    const backX = v.direction === 1 ? v.x - halfW : v.x + halfW;
    g.fillStyle(0xef4444, 0.9);
    g.fillRect(backX - (v.direction === 1 ? 2 : -1), -halfH + 5, 2, 4);
    g.fillRect(backX - (v.direction === 1 ? 2 : -1), halfH - 9, 2, 4);
  }

  // Отрисовка бревна
  private drawLog(log: Log): void {
    const g = log.graphics;
    g.clear();

    const halfW = log.width / 2;
    const halfH = log.height / 2;

    // Тень под бревном в воде
    g.fillStyle(0x0369a1, 0.5);
    g.fillRoundedRect(log.x - halfW - 2, -halfH + 4, log.width + 4, log.height, 8);

    // Кора бревна
    g.fillStyle(0x78350f, 1);
    g.fillRoundedRect(log.x - halfW, -halfH, log.width, log.height, 8);

    // Верхняя светлая часть древесины
    g.fillStyle(0x92400e, 1);
    g.fillRoundedRect(log.x - halfW + 6, -halfH + 4, log.width - 12, log.height - 8, 5);

    // Годовые кольца на торцах
    g.fillStyle(0xb45309, 1);
    g.fillCircle(log.x - halfW + 10, 0, 7);
    g.fillCircle(log.x + halfW - 10, 0, 7);
    g.fillStyle(0x451a03, 1);
    g.fillCircle(log.x - halfW + 10, 0, 3);
    g.fillCircle(log.x + halfW - 10, 0, 3);
  }

  // Светофор ж/д переезда
  private drawRailSignal(g: Phaser.GameObjects.Graphics, isBlinking: boolean): void {
    g.clear();

    // Стойка светофора слева и справа
    [30, GAME_WIDTH - 30].forEach((sx) => {
      g.fillStyle(0x475569, 1);
      g.fillRect(sx - 3, -25, 6, 50);

      // Крест предупреждения
      g.fillStyle(0xf8fafc, 1);
      g.fillRect(sx - 14, -20, 28, 5);
      g.fillRect(sx - 2, -26, 4, 18);

      // Лампочки сигнала (красная/выключенная)
      const redColor = isBlinking ? 0xef4444 : 0x7f1d1d;
      g.fillStyle(0x0f172a, 1);
      g.fillCircle(sx - 7, -12, 6);
      g.fillCircle(sx + 7, -12, 6);

      g.fillStyle(redColor, 1);
      g.fillCircle(sx - 7, -12, 4);
      g.fillCircle(sx + 7, -12, 4);

      if (isBlinking) {
        g.fillStyle(0xfca5a5, 0.4);
        g.fillCircle(sx - 7, -12, 11);
        g.fillCircle(sx + 7, -12, 11);
      }
    });
  }

  // Отрисовка скоростного поезда
  private drawTrain(t: TrainState): void {
    const g = t.graphics;
    g.clear();

    const carLen = 150;
    const carHeight = 44;
    const gap = 12;

    for (let c = 0; c < t.carsCount; c++) {
      const carOffset = c * (carLen + gap);
      const cx = t.direction === 1
        ? t.trainX - carOffset
        : t.trainX + carOffset;

      // Тень под вагоном
      g.fillStyle(0x000000, 0.4);
      g.fillRoundedRect(cx - carLen / 2, -carHeight / 2 + 5, carLen, carHeight, 6);

      // Корпус вагона (серебристый)
      g.fillStyle(0xe2e8f0, 1);
      g.fillRoundedRect(cx - carLen / 2, -carHeight / 2, carLen, carHeight, 6);

      // Скоростная красная полоса
      g.fillStyle(0xdc2626, 1);
      g.fillRect(cx - carLen / 2, -2, carLen, 8);

      // Окна вагона (светящиеся)
      g.fillStyle(0xfef08a, 0.95);
      for (let w = -carLen / 2 + 16; w < carLen / 2 - 16; w += 24) {
        g.fillRect(cx + w, -carHeight / 2 + 6, 14, 10);
      }

      // Нос локомотива (на первом вагоне)
      if (c === 0) {
        const noseX = t.direction === 1 ? cx + carLen / 2 : cx - carLen / 2;
        g.fillStyle(0xb91c1c, 1);
        g.fillTriangle(
          noseX, -carHeight / 2,
          noseX, carHeight / 2,
          noseX + t.direction * 32, 0
        );

        // Мощный прожектор
        g.fillStyle(0xffffff, 1);
        g.fillCircle(noseX + t.direction * 18, 0, 6);
        g.fillStyle(0xfef08a, 0.25);
        g.fillTriangle(
          noseX + t.direction * 18, -10,
          noseX + t.direction * 18, 10,
          noseX + t.direction * 240, 0
        );
      }
    }
  }

  // =========================================================================
  // СОЗДАНИЕ ИНТЕРФЕЙСА (HUD)
  // =========================================================================
  private createHUD(): void {
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setScrollFactor(0);
    this.hudContainer.setDepth(1000);

    // Панель счета (верхний левый угол)
    const scoreBg = this.add.graphics();
    scoreBg.fillStyle(0x0f172a, 0.7);
    scoreBg.fillRoundedRect(20, 18, 160, 68, 12);
    scoreBg.lineStyle(2, 0x334155, 0.8);
    scoreBg.strokeRoundedRect(20, 18, 160, 68, 12);
    this.hudContainer.add(scoreBg);

    const scoreTitle = this.add.text(32, 26, 'SCORE', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      color: '#94a3b8',
      fontStyle: 'bold',
    });
    this.hudContainer.add(scoreTitle);

    this.scoreText = this.add.text(32, 42, '0', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '32px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.hudContainer.add(this.scoreText);

    // Монетки
    const coinBg = this.add.graphics();
    coinBg.fillStyle(0x0f172a, 0.7);
    coinBg.fillRoundedRect(190, 18, 110, 68, 12);
    coinBg.lineStyle(2, 0x334155, 0.8);
    coinBg.strokeRoundedRect(190, 18, 110, 68, 12);
    this.hudContainer.add(coinBg);

    const coinTitle = this.add.text(202, 26, 'COINS', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '12px',
      color: '#fbbf24',
      fontStyle: 'bold',
    });
    this.hudContainer.add(coinTitle);

    this.coinText = this.add.text(202, 42, `🪙 ${this.coins}`, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '24px',
      color: '#facc15',
      fontStyle: 'bold',
    });
    this.hudContainer.add(this.coinText);

    // Рекорд (верхний правый угол)
    const recordBg = this.add.graphics();
    recordBg.fillStyle(0x0f172a, 0.7);
    recordBg.fillRoundedRect(GAME_WIDTH - 210, 18, 130, 44, 10);
    recordBg.lineStyle(2, 0x334155, 0.8);
    recordBg.strokeRoundedRect(GAME_WIDTH - 210, 18, 130, 44, 10);
    this.hudContainer.add(recordBg);

    this.highScoreText = this.add.text(GAME_WIDTH - 200, 28, `🏆 BEST: ${this.highScore}`, {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '15px',
      color: '#38bdf8',
      fontStyle: 'bold',
    });
    this.hudContainer.add(this.highScoreText);

    // Кнопка звука (Mute / Unmute)
    const muteBg = this.add.graphics();
    muteBg.fillStyle(0x0f172a, 0.7);
    muteBg.fillRoundedRect(GAME_WIDTH - 70, 18, 50, 44, 10);
    muteBg.lineStyle(2, 0x334155, 0.8);
    muteBg.strokeRoundedRect(GAME_WIDTH - 70, 18, 50, 44, 10);
    this.hudContainer.add(muteBg);

    this.muteBtnText = this.add
      .text(GAME_WIDTH - 45, 40, this.soundFx.getMuted() ? '🔇' : '🔊', {
        fontSize: '22px',
      })
      .setOrigin(0.5);
    this.muteBtnText.setInteractive({ useHandCursor: true });
    this.muteBtnText.on('pointerdown', () => {
      const isMuted = this.soundFx.toggleMute();
      this.muteBtnText.setText(isMuted ? '🔇' : '🔊');
    });
    this.hudContainer.add(this.muteBtnText);

    // Экран Game Over (скрыт по умолчанию)
    this.createGameOverModal();

    // Виртуальный D-Pad для удобства игры мышью/тачем
    this.createVirtualDPad();
  }

  // Виртуальный D-Pad внизу экрана
  private createVirtualDPad(): void {
    const dpadContainer = this.add.container(GAME_WIDTH - 120, GAME_HEIGHT - 120);
    dpadContainer.setScrollFactor(0);
    dpadContainer.setDepth(1100);

    const btnSize = 44;
    const btns: { dir: 'up' | 'down' | 'left' | 'right'; x: number; y: number; label: string }[] = [
      { dir: 'up', x: 0, y: -btnSize, label: '▲' },
      { dir: 'down', x: 0, y: btnSize, label: '▼' },
      { dir: 'left', x: -btnSize, y: 0, label: '◀' },
      { dir: 'right', x: btnSize, y: 0, label: '▶' },
    ];

    btns.forEach(({ dir, x, y, label }) => {
      const g = this.add.graphics();
      g.fillStyle(0x1e293b, 0.65);
      g.fillRoundedRect(x - 20, y - 20, 40, 40, 8);
      g.lineStyle(2, 0x475569, 0.8);
      g.strokeRoundedRect(x - 20, y - 20, 40, 40, 8);
      dpadContainer.add(g);

      const txt = this.add.text(x, y, label, {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '18px',
        color: '#f8fafc',
      }).setOrigin(0.5);
      dpadContainer.add(txt);

      const hitZone = this.add.zone(x, y, 42, 42).setInteractive({ useHandCursor: true });
      hitZone.on('pointerdown', () => {
        if (!this.isDead) this.tryMove(dir);
      });
      dpadContainer.add(hitZone);
    });

    this.hudContainer.add(dpadContainer);
  }

  // Окно Game Over
  private createGameOverModal(): void {
    this.gameOverContainer = this.add.container(0, 0);
    this.gameOverContainer.setScrollFactor(0);
    this.gameOverContainer.setDepth(2000);
    this.gameOverContainer.setVisible(false);

    // Затемнение фона
    const overlay = this.add.graphics();
    overlay.fillStyle(0x090d16, 0.78);
    overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.gameOverContainer.add(overlay);

    // Модальная карточка
    const modalX = GAME_WIDTH / 2;
    const modalY = GAME_HEIGHT / 2;
    const modalW = 460;
    const modalH = 340;

    const card = this.add.graphics();
    card.fillStyle(0x111827, 0.96);
    card.fillRoundedRect(modalX - modalW / 2, modalY - modalH / 2, modalW, modalH, 18);
    card.lineStyle(3, 0xef4444, 0.9);
    card.strokeRoundedRect(modalX - modalW / 2, modalY - modalH / 2, modalW, modalH, 18);
    this.gameOverContainer.add(card);

    // Заголовок GAME OVER
    const title = this.add.text(modalX, modalY - 115, 'ИГРА ОКОНЧЕНА', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '32px',
      color: '#ef4444',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.gameOverContainer.add(title);

    // Причина поражения
    const reasonText = this.add.text(modalX, modalY - 70, '', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '18px',
      color: '#cbd5e1',
    }).setOrigin(0.5);
    reasonText.setName('reasonText');
    this.gameOverContainer.add(reasonText);

    // Итоговый счет и рекорд
    const statsText = this.add.text(modalX, modalY - 15, '', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '22px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5);
    statsText.setName('statsText');
    this.gameOverContainer.add(statsText);

    // Кнопка перезапуска
    const btnW = 240;
    const btnH = 54;
    const btnY = modalY + 80;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x22c55e, 1);
    btnBg.fillRoundedRect(modalX - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
    btnBg.lineStyle(2, 0x4ade80, 1);
    btnBg.strokeRoundedRect(modalX - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
    this.gameOverContainer.add(btnBg);

    const btnText = this.add.text(modalX, btnY, 'ИГРАТЬ СНОВА', {
      fontFamily: 'system-ui, -apple-system, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.gameOverContainer.add(btnText);

    const hint = this.add.text(modalX, modalY + 130, 'или нажми ПРОБЕЛ / W', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#94a3b8',
    }).setOrigin(0.5);
    this.gameOverContainer.add(hint);

    // Интерактивная зона для кнопки
    const btnZone = this.add.zone(modalX, btnY, btnW, btnH).setInteractive({ useHandCursor: true });
    btnZone.on('pointerdown', () => this.restartGame());
    this.gameOverContainer.add(btnZone);
  }

  // =========================================================================
  // ОБРАБОТКА ТАЧЕЙ И СВАЙПОВ
  // =========================================================================
  private setupTouchAndPointerControls(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      this.touchStartX = pointer.x;
      this.touchStartY = pointer.y;
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.isDead) return;

      const dx = pointer.x - this.touchStartX;
      const dy = pointer.y - this.touchStartY;
      const dist = Math.hypot(dx, dy);

      // Если свайп
      if (dist > 30) {
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) this.tryMove('right');
          else this.tryMove('left');
        } else {
          if (dy < 0) this.tryMove('up');
          else this.tryMove('down');
        }
      } else {
        // Одиночный клик по экрану: идем в направлении клика относительно цыпленка
        const screenPlayerY = this.playerContainer.y - this.cameras.main.scrollY;
        const screenPlayerX = this.playerContainer.x;

        const diffX = pointer.x - screenPlayerX;
        const diffY = pointer.y - screenPlayerY;

        if (Math.abs(diffX) > Math.abs(diffY)) {
          if (diffX > 0) this.tryMove('right');
          else this.tryMove('left');
        } else {
          if (diffY < 0) this.tryMove('up');
          else this.tryMove('down');
        }
      }
    });
  }

  // =========================================================================
  // ПЕРЕМЕЩЕНИЕ И ПРЫЖКИ (HOPPING)
  // =========================================================================
  private tryMove(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (this.isHopping || this.isDead) return;

    let targetCol = this.playerCol;
    let targetRow = this.playerRow;

    if (dir === 'up') targetRow += 1;
    else if (dir === 'down') targetRow -= 1;
    else if (dir === 'left') targetCol -= 1;
    else if (dir === 'right') targetCol += 1;

    // Проверка границ поля
    if (targetCol < 0 || targetCol >= GRID_COLS) {
      this.soundFx.playBonk();
      return;
    }
    if (targetRow < 0) {
      this.soundFx.playBonk();
      return;
    }

    // Поворот спрайта цыпленка
    this.playerFacing = dir;
    this.redrawPlayerBody(dir);

    // Проверка препятствий (деревья/камни)
    const targetLane = this.lanes.get(targetRow);
    if (targetLane && targetLane.obstacles.has(targetCol)) {
      // Игрок бьется о препятствие
      this.soundFx.playBonk();
      this.bounceBlockedMove(dir);
      return;
    }

    // Успешный прыжок
    this.isHopping = true;
    this.currentRideLog = null;
    this.playerCol = targetCol;
    this.playerRow = targetRow;

    if (dir === 'up') {
      this.timeSinceForwardMove = 0;
      if (this.playerRow > this.score) {
        this.score = this.playerRow;
        this.scoreText.setText(`${this.score}`);
        // Анимация подпрыгивания цифры счета
        this.tweens.add({
          targets: this.scoreText,
          scale: 1.25,
          duration: 90,
          yoyo: true,
        });

        // Генерируем новые полосы впереди
        while (this.maxRowGenerated < this.playerRow + LANES_AHEAD) {
          this.generateLane(this.maxRowGenerated + 1);
        }
        // Очищаем старые полосы сзади
        this.cleanupOldLanes();
      }
    }

    const destX = this.colToWorldX(targetCol);
    const destY = this.rowToWorldY(targetRow);

    this.soundFx.playHop();

    // Анимация дуги прыжка со сжатием и растяжением (squash & stretch)
    this.tweens.add({
      targets: this.playerContainer,
      x: destX,
      y: destY,
      duration: HOP_DURATION,
      ease: 'Power1',
      onComplete: () => {
        this.isHopping = false;
        this.onLand();
      },
    });

    // Дуга высоты прыжка
    this.tweens.add({
      targets: this.playerBody,
      y: -18,
      scaleX: 0.85,
      scaleY: 1.25,
      duration: HOP_DURATION / 2,
      yoyo: true,
      ease: 'Sine.easeOut',
      onComplete: () => {
        this.playerBody.y = 0;
        this.playerBody.scaleX = 1;
        this.playerBody.scaleY = 1;
      },
    });

    // Пыль при прыжке
    this.spawnDust(this.playerContainer.x, this.playerContainer.y + 12);
  }

  // Анимация удара о препятствие (отскок)
  private bounceBlockedMove(dir: 'up' | 'down' | 'left' | 'right'): void {
    let bumpX = 0;
    let bumpY = 0;
    if (dir === 'up') bumpY = -12;
    else if (dir === 'down') bumpY = 12;
    else if (dir === 'left') bumpX = -12;
    else if (dir === 'right') bumpX = 12;

    this.tweens.add({
      targets: this.playerContainer,
      x: this.playerContainer.x + bumpX,
      y: this.playerContainer.y + bumpY,
      duration: 60,
      yoyo: true,
      ease: 'Quad.easeInOut',
    });
  }

  // Приземление после прыжка
  private onLand(): void {
    if (this.isDead) return;

    const lane = this.lanes.get(this.playerRow);
    if (!lane) return;

    // Проверка сбора монетки
    if (lane.coinCol !== undefined && lane.coinCol === this.playerCol && lane.coinContainer) {
      this.coins += 5;
      localStorage.setItem('crossy_road_coins', String(this.coins));
      this.coinText.setText(`🪙 ${this.coins}`);
      this.soundFx.playCoin();

      // Анимация исчезновения монетки
      const c = lane.coinContainer;
      lane.coinContainer = undefined;
      lane.coinCol = undefined;
      this.tweens.add({
        targets: c,
        y: c.y - 30,
        alpha: 0,
        scale: 1.5,
        duration: 350,
        onComplete: () => c.destroy(),
      });
    }

    // Проверка падения в реку
    if (lane.type === 'river') {
      const log = this.findLogUnderPlayer(lane);
      if (log) {
        this.currentRideLog = log;
      } else {
        // Утонул в реке!
        this.handleDrown();
      }
    }
  }

  // Поиск бревна под цыпленком
  private findLogUnderPlayer(lane: Lane): Log | null {
    const px = this.playerContainer.x;
    for (const log of lane.logs) {
      const halfW = log.width / 2 + 14;
      if (px >= log.x - halfW && px <= log.x + halfW) {
        return log;
      }
    }
    return null;
  }

  // =========================================================================
  // ОСНОВНОЙ ЦИКЛ ОБНОВЛЕНИЯ (UPDATE)
  // =========================================================================
  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    // Перезапуск по Пробелу / W при смерти
    if (this.isDead) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.wasd.up)) {
        this.restartGame();
      }
      return;
    }

    // Чтение клавиатуры
    this.handleKeyboardInput();

    // Обновление полос (движение машин, бревен, поездов)
    this.updateLanes(dt);

    // Если плывем на бревне, двигаемся вместе с ним
    if (this.currentRideLog && !this.isHopping) {
      this.playerContainer.x += this.currentRideLog.speed * this.currentRideLog.direction * dt;
      this.playerCol = Math.round((this.playerContainer.x - TILE_SIZE / 2) / TILE_SIZE);

      // Проверка уплытия за экран
      if (this.playerContainer.x < 15 || this.playerContainer.x > GAME_WIDTH - 15) {
        this.handleDeath('🌊 Унесло бурным течением реки!');
        return;
      }

      // Проверка, не соскользнули ли мы с бревна
      const currentLane = this.lanes.get(this.playerRow);
      if (currentLane && !this.findLogUnderPlayer(currentLane)) {
        this.handleDrown();
        return;
      }
    }

    // Проверка столкновений с машинами и поездами
    this.checkCollisions();

    // Камера плавно следует за игроком
    this.updateCameraFollow(dt);

    // Таймер орла (борьба с кемперством)
    this.timeSinceForwardMove += dt;
    if (this.timeSinceForwardMove > EAGLE_IDLE_TIMEOUT && !this.eagleActive) {
      this.triggerEagleAttack();
    }
  }

  private handleKeyboardInput(): void {
    if (this.isHopping) return;

    if (Phaser.Input.Keyboard.JustDown(this.cursors.up) || Phaser.Input.Keyboard.JustDown(this.wasd.up)) {
      this.tryMove('up');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.down) || Phaser.Input.Keyboard.JustDown(this.wasd.down)) {
      this.tryMove('down');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.left) || Phaser.Input.Keyboard.JustDown(this.wasd.left)) {
      this.tryMove('left');
    } else if (Phaser.Input.Keyboard.JustDown(this.cursors.right) || Phaser.Input.Keyboard.JustDown(this.wasd.right)) {
      this.tryMove('right');
    }
  }

  // Обновление объектов на полосах
  private updateLanes(dt: number): void {
    const minVisibleRow = this.playerRow - MAX_LANES_BEHIND;
    const maxVisibleRow = this.playerRow + LANES_AHEAD;

    for (let r = minVisibleRow; r <= maxVisibleRow; r++) {
      const lane = this.lanes.get(r);
      if (!lane) continue;

      // Движение машин
      if (lane.type === 'road') {
        for (const v of lane.vehicles) {
          v.x += v.speed * v.direction * dt;

          // Зацикливание машин по краям экрана
          if (v.direction === 1 && v.x - v.width / 2 > GAME_WIDTH + 80) {
            v.x = -80 - v.width / 2;
          } else if (v.direction === -1 && v.x + v.width / 2 < -80) {
            v.x = GAME_WIDTH + 80 + v.width / 2;
          }

          this.drawVehicle(v);
        }
      }

      // Движение бревен
      if (lane.type === 'river') {
        for (const log of lane.logs) {
          log.x += log.speed * log.direction * dt;

          // Зацикливание бревен
          if (log.direction === 1 && log.x - log.width / 2 > GAME_WIDTH + 100) {
            log.x = -100 - log.width / 2;
          } else if (log.direction === -1 && log.x + log.width / 2 < -100) {
            log.x = GAME_WIDTH + 100 + log.width / 2;
          }

          this.drawLog(log);
        }
      }

      // Состояние железной дороги и поезда
      if (lane.type === 'rail' && lane.train) {
        const t = lane.train;
        t.warningTimer -= dt;

        if (t.warningTimer <= 1.4 && t.warningTimer > 0) {
          // Мигание светофора и предупреждающий звонок
          const isBlinking = Math.floor(t.warningTimer * 8) % 2 === 0;
          this.drawRailSignal(t.signalGraphics, isBlinking);

          if (Math.abs(t.warningTimer % 0.4) < dt) {
            this.soundFx.playTrainWarning();
          }
        } else if (t.warningTimer <= 0 && !t.active) {
          // Запуск поезда!
          t.active = true;
          t.trainX = t.direction === 1 ? -t.totalLength : GAME_WIDTH + t.totalLength;
          this.soundFx.playTrainPass();
          this.cameras.main.shake(500, 0.006);
        }

        if (t.active) {
          t.trainX += t.speed * t.direction * dt;
          this.drawTrain(t);

          // Поезд проехал
          const isOffscreen = t.direction === 1
            ? t.trainX - t.totalLength > GAME_WIDTH + 100
            : t.trainX + t.totalLength < -100;

          if (isOffscreen) {
            t.active = false;
            t.graphics.clear();
            t.warningTimer = Phaser.Math.FloatBetween(5.0, 10.0);
            this.drawRailSignal(t.signalGraphics, false);
          }
        }
      }
    }
  }

  // Проверка столкновений игрока с опасностями
  private checkCollisions(): void {
    const lane = this.lanes.get(this.playerRow);
    if (!lane) return;

    const px = this.playerContainer.x;
    const playerHalfW = 14;

    // Столкновение с машиной
    if (lane.type === 'road') {
      for (const v of lane.vehicles) {
        const vHalfW = v.width / 2 - 4;
        if (Math.abs(px - v.x) < playerHalfW + vHalfW) {
          this.handleSquish();
          return;
        }
      }
    }

    // Столкновение со скоростным поездом
    if (lane.type === 'rail' && lane.train && lane.train.active) {
      const t = lane.train;
      const trainLeft = Math.min(t.trainX, t.trainX - t.direction * t.totalLength);
      const trainRight = Math.max(t.trainX, t.trainX - t.direction * t.totalLength);

      if (px >= trainLeft - 10 && px <= trainRight + 10) {
        this.handleSquish('🚆 Сбит скоростным экспрессом!');
        return;
      }
    }
  }

  // =========================================================================
  // СМЕРТИ И ПОРАЖЕНИЯ
  // =========================================================================
  private handleSquish(customReason?: string): void {
    if (this.isDead) return;
    this.soundFx.playSquish();
    this.cameras.main.shake(250, 0.018);

    // Анимация сплющивания цыпленка (SPLAT)
    this.tweens.add({
      targets: this.playerBody,
      scaleX: 1.6,
      scaleY: 0.15,
      y: 12,
      duration: 70,
    });

    this.spawnFeathers(this.playerContainer.x, this.playerContainer.y);
    this.handleDeath(customReason || '🚗 Сбит мчащейся машиной!');
  }

  private handleDrown(): void {
    if (this.isDead) return;
    this.soundFx.playSplash();

    // Анимация погружения под воду
    this.tweens.add({
      targets: this.playerBody,
      scale: 0.2,
      alpha: 0,
      y: 15,
      duration: 320,
      ease: 'Quad.easeIn',
    });

    this.spawnSplash(this.playerContainer.x, this.playerContainer.y);
    this.handleDeath('🌊 Утонул в глубокой реке!');
  }

  private triggerEagleAttack(): void {
    if (this.isDead || this.eagleActive) return;
    this.eagleActive = true;
    this.soundFx.playEagle();

    this.eagleContainer.setPosition(this.playerContainer.x, this.playerContainer.y - 450);
    this.eagleContainer.setVisible(true);

    // Налет орла
    this.tweens.add({
      targets: this.eagleContainer,
      x: this.playerContainer.x,
      y: this.playerContainer.y,
      duration: 480,
      ease: 'Quad.easeIn',
      onComplete: () => {
        // Орел хватает цыпленка и уносит в небо
        this.playerContainer.setVisible(false);
        this.tweens.add({
          targets: this.eagleContainer,
          x: this.playerContainer.x + 120,
          y: this.playerContainer.y - 700,
          duration: 650,
          ease: 'Quad.easeOut',
          onComplete: () => {
            this.handleDeath('🦅 Схвачен голодным орлом за промедление!');
          },
        });
      },
    });
  }

  private handleDeath(reason: string): void {
    this.isDead = true;
    this.soundFx.playGameOver();

    // Обновление рекорда
    const isNewBest = this.score > this.highScore;
    if (isNewBest) {
      this.highScore = this.score;
      localStorage.setItem('crossy_road_high_score', String(this.highScore));
      this.highScoreText.setText(`🏆 BEST: ${this.highScore}`);
    }

    // Показываем окно Game Over через 0.6 секунды
    this.time.delayedCall(600, () => {
      this.showGameOverModal(reason, isNewBest);
    });
  }

  private showGameOverModal(reason: string, isNewBest: boolean): void {
    const reasonText = this.gameOverContainer.getByName('reasonText') as Phaser.GameObjects.Text;
    const statsText = this.gameOverContainer.getByName('statsText') as Phaser.GameObjects.Text;

    if (reasonText) reasonText.setText(reason);
    if (statsText) {
      const bestLabel = isNewBest ? `🏆 НОВЫЙ РЕКОРД: ${this.score}! 🌟` : `Счет: ${this.score}  |  Рекорд: ${this.highScore}`;
      statsText.setText(`${bestLabel}\nВсего монет: 🪙 ${this.coins}`);
    }

    this.gameOverContainer.setVisible(true);
    this.gameOverContainer.setAlpha(0);
    this.tweens.add({
      targets: this.gameOverContainer,
      alpha: 1,
      duration: 250,
    });
  }

  // =========================================================================
  // ПЕРЕЗАПУСК ИГРЫ
  // =========================================================================
  private restartGame(): void {
    this.scene.restart();
  }

  // =========================================================================
  // ПАРТИКЛЫ И СПЕЦЭФФЕКТЫ
  // =========================================================================
  private spawnDust(x: number, y: number): void {
    for (let i = 0; i < 4; i++) {
      const p = this.add.circle(x + Phaser.Math.Between(-8, 8), y, 4, 0xf1f5f9, 0.7);
      p.setDepth(95);
      this.tweens.add({
        targets: p,
        scale: 0.1,
        alpha: 0,
        y: y + Phaser.Math.Between(-6, 6),
        x: p.x + Phaser.Math.Between(-10, 10),
        duration: 220,
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnFeathers(x: number, y: number): void {
    for (let i = 0; i < 10; i++) {
      const color = Phaser.Math.RND.pick([0xffffff, 0xef4444, 0xf59e0b]);
      const p = this.add.circle(x, y, Phaser.Math.Between(3, 5), color, 0.9);
      p.setDepth(150);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const speed = Phaser.Math.Between(40, 140);

      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * speed,
        y: y + Math.sin(angle) * speed,
        alpha: 0,
        scale: 0.2,
        duration: 450,
        onComplete: () => p.destroy(),
      });
    }
  }

  private spawnSplash(x: number, y: number): void {
    for (let i = 0; i < 8; i++) {
      const p = this.add.circle(x, y, Phaser.Math.Between(4, 7), 0x38bdf8, 0.85);
      p.setDepth(150);
      this.tweens.add({
        targets: p,
        x: x + Phaser.Math.Between(-30, 30),
        y: y - Phaser.Math.Between(15, 35),
        alpha: 0,
        duration: 380,
        onComplete: () => p.destroy(),
      });
    }
  }

  // =========================================================================
  // КАМЕРА И КООРДИНАТЫ
  // =========================================================================
  private updateCameraImmediate(): void {
    const targetY = this.playerContainer.y - CAMERA_OFFSET_Y;
    this.cameras.main.scrollY = targetY;
  }

  private updateCameraFollow(dt: number): void {
    const targetY = this.playerContainer.y - CAMERA_OFFSET_Y;
    // Плавное интерполированное следование камеры за персонажем
    this.cameras.main.scrollY = Phaser.Math.Linear(
      this.cameras.main.scrollY,
      targetY,
      Math.min(dt * 7.5, 1)
    );
  }

  private cleanupOldLanes(): void {
    const minKeepRow = this.playerRow - MAX_LANES_BEHIND - 2;
    for (const [row, lane] of this.lanes.entries()) {
      if (row < minKeepRow) {
        lane.container.destroy();
        this.lanes.delete(row);
      }
    }
  }

  private colToWorldX(col: number): number {
    return col * TILE_SIZE + TILE_SIZE / 2;
  }

  private rowToWorldY(row: number): number {
    return GAME_HEIGHT - (row + 0.5) * TILE_SIZE;
  }
}
