import Phaser from 'phaser';
import { SoundEffects } from './SoundEffects';

// === КОНСТАНТЫ ИГРЫ ===
const TILE_SIZE = 60;
const GRID_COLS = 16;
const GAME_WIDTH = 960;
const GAME_HEIGHT = 640;
const CAMERA_OFFSET_Y = 440;
const HOP_DURATION = 105;
const MAX_LANES_BEHIND = 6;
const LANES_AHEAD = 16;

// Механика остывания пиццы
const INITIAL_TEMPERATURE = 100;
const HEAT_DECAY_PER_SEC = 4.2;
const HEAT_BOOST_ON_FORWARD = 0.8;
const CHECKPOINT_INTERVAL = 25; // Каждые 25 метров — новый клиент

type LaneType = 'sidewalk' | 'road' | 'energy_canal' | 'hyperloop' | 'delivery_point';

interface Vehicle {
  x: number;
  width: number;
  height: number;
  speed: number;
  direction: 1 | -1;
  color: number;
  underglowColor: number;
  type: 'drone_car' | 'cyber_coupe' | 'hauler';
  graphics: Phaser.GameObjects.Graphics;
}

interface HoverPlatform {
  x: number;
  width: number;
  height: number;
  speed: number;
  direction: 1 | -1;
  graphics: Phaser.GameObjects.Graphics;
}

interface HyperloopState {
  active: boolean;
  warningTimer: number;
  trainX: number;
  direction: 1 | -1;
  speed: number;
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
  vehicles: Vehicle[];
  platforms: HoverPlatform[];
  hyperloop?: HyperloopState;
  itemCol?: number;
  itemType?: 'coin' | 'hotpack';
  itemContainer?: Phaser.GameObjects.Container;
  delivered?: boolean;
  deliveryText?: Phaser.GameObjects.Text;
}

export class GameScene extends Phaser.Scene {
  private soundFx!: SoundEffects;

  // Игрок (Кибер-курьер)
  private playerContainer!: Phaser.GameObjects.Container;
  private playerBody!: Phaser.GameObjects.Graphics;
  private playerShadow!: Phaser.GameObjects.Graphics;
  private backpackGlow!: Phaser.GameObjects.Graphics;
  private playerCol = 7;
  private playerRow = 1;
  private isHopping = false;
  private isDead = false;
  private currentRidePlatform: HoverPlatform | null = null;
  private playerFacing: 'up' | 'down' | 'left' | 'right' = 'up';

  // Состояние смены и заказов
  private temperature = INITIAL_TEMPERATURE;
  private completedDeliveries = 0;
  private tipsEarned = 0;
  private maxDistance = 0;
  private highScore = 0;

  // Мир
  private lanes: Map<number, Lane> = new Map();
  private maxRowGenerated = 0;

  // HUD
  private hudContainer!: Phaser.GameObjects.Container;
  private distanceText!: Phaser.GameObjects.Text;
  private tipsText!: Phaser.GameObjects.Text;
  private deliveryCountText!: Phaser.GameObjects.Text;
  private tempNumberText!: Phaser.GameObjects.Text;
  private tempBarFill!: Phaser.GameObjects.Graphics;
  private highScoreText!: Phaser.GameObjects.Text;
  private muteBtnText!: Phaser.GameObjects.Text;
  private pauseBtnText!: Phaser.GameObjects.Text;
  private pauseContainer!: Phaser.GameObjects.Container;
  private pauseStatsText!: Phaser.GameObjects.Text;
  private gameOverContainer!: Phaser.GameObjects.Container;
  private isPaused = false;

  // Ввод
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<'up' | 'down' | 'left' | 'right', Phaser.Input.Keyboard.Key>;
  private spaceKey!: Phaser.Input.Keyboard.Key;
  private pauseKey!: Phaser.Input.Keyboard.Key;
  private escKey!: Phaser.Input.Keyboard.Key;
  private touchStartX = 0;
  private touchStartY = 0;

  constructor() {
    super('GameScene');
  }

  create(): void {
    this.soundFx = new SoundEffects();
    this.highScore = parseInt(localStorage.getItem('cyber_courier_best_dist') || '0', 10);
    this.tipsEarned = parseInt(localStorage.getItem('cyber_courier_tips') || '0', 10);

    // Сброс параметров сессии
    this.lanes.clear();
    this.maxRowGenerated = 0;
    this.maxDistance = 0;
    this.temperature = INITIAL_TEMPERATURE;
    this.completedDeliveries = 0;
    this.isDead = false;
    this.isHopping = false;
    this.isPaused = false;
    this.currentRidePlatform = null;
    this.playerCol = Math.floor(GRID_COLS / 2);
    this.playerRow = 1;
    this.playerFacing = 'up';

    // Создаем стартовые полосы кибер-города
    for (let r = -2; r <= LANES_AHEAD; r++) {
      this.generateLane(r);
    }

    // Создаем персонажа (Кибер-курьер с терморюкзаком)
    this.createCourier();

    // Камера
    this.cameras.main.setBackgroundColor('#090d16');
    this.updateCameraImmediate();

    // Создаем HUD
    this.createHUD();

    // Настройка управления
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
    this.pauseKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.P);
    this.escKey = this.input.keyboard.addKey(Phaser.Input.Keyboard.KeyCodes.ESC);

    this.setupPointerControls();
  }

  // =========================================================================
  // СОЗДАНИЕ КИБЕР-КУРЬЕРА
  // =========================================================================
  private createCourier(): void {
    const worldX = this.colToWorldX(this.playerCol);
    const worldY = this.rowToWorldY(this.playerRow);

    this.playerContainer = this.add.container(worldX, worldY);
    this.playerContainer.setDepth(100);

    // Неоновая тень
    this.playerShadow = this.add.graphics();
    this.playerShadow.fillStyle(0x06b6d4, 0.25);
    this.playerShadow.fillEllipse(0, 18, 38, 18);
    this.playerContainer.add(this.playerShadow);

    // Свечение терморюкзака
    this.backpackGlow = this.add.graphics();
    this.playerContainer.add(this.backpackGlow);

    // Тело курьера
    this.playerBody = this.add.graphics();
    this.redrawCourier('up');
    this.playerContainer.add(this.playerBody);
  }

  private redrawCourier(dir: 'up' | 'down' | 'left' | 'right'): void {
    this.playerBody.clear();
    this.backpackGlow.clear();

    // Неоновые ботинки
    this.playerBody.fillStyle(0x06b6d4, 1);
    this.playerBody.fillRect(-12, 10, 8, 8);
    this.playerBody.fillRect(4, 10, 8, 8);

    // Темные кибер-штаны
    this.playerBody.fillStyle(0x1e293b, 1);
    this.playerBody.fillRect(-12, 4, 8, 8);
    this.playerBody.fillRect(4, 4, 8, 8);

    // Яркая куртка курьера (электрический желтый / неоновый лайм)
    this.playerBody.fillStyle(0xfacc15, 1);
    this.playerBody.fillRoundedRect(-16, -18, 32, 24, 4);

    // Светоотражающие полосы на куртке
    this.playerBody.fillStyle(0x38bdf8, 1);
    this.playerBody.fillRect(-16, -8, 32, 3);

    // Голова и кибер-шлем
    this.playerBody.fillStyle(0x0f172a, 1);
    this.playerBody.fillRoundedRect(-10, -28, 20, 13, 3);

    // Неоновый визор шлема
    this.playerBody.fillStyle(0x06b6d4, 1);
    if (dir === 'up') {
      // Сзади визор не виден, виден затылок шлема
      this.playerBody.fillRect(-8, -26, 16, 3);
    } else if (dir === 'down') {
      this.playerBody.fillRect(-8, -23, 16, 5);
      // Блик визора
      this.playerBody.fillStyle(0xffffff, 0.8);
      this.playerBody.fillRect(-6, -23, 4, 2);
    } else if (dir === 'left') {
      this.playerBody.fillRect(-11, -24, 7, 5);
    } else if (dir === 'right') {
      this.playerBody.fillRect(4, -24, 7, 5);
    }

    // ТЕРМОРЮКЗАК С ПИЦЦЕЙ (на спине)
    if (dir === 'up') {
      // Вид со спины — терморюкзак виден полностью!
      this.playerBody.fillStyle(0xef4444, 1);
      this.playerBody.fillRoundedRect(-14, -16, 28, 22, 4);

      // Термо-дисплей на рюкзаке
      this.playerBody.fillStyle(0x000000, 0.8);
      this.playerBody.fillRect(-9, -12, 18, 12);

      // Иконка горячей пиццы
      this.playerBody.fillStyle(0xfacc15, 1);
      this.playerBody.fillTriangle(-5, -2, 5, -2, 0, -10);
      this.playerBody.fillStyle(0xef4444, 1);
      this.playerBody.fillCircle(0, -5, 1.5);

      // Свечение рюкзака
      this.backpackGlow.fillStyle(0xef4444, 0.25);
      this.backpackGlow.fillCircle(0, -6, 22);
    } else if (dir === 'left') {
      // Сбоку рюкзак виден справа
      this.playerBody.fillStyle(0xef4444, 1);
      this.playerBody.fillRoundedRect(8, -16, 11, 20, 3);
    } else if (dir === 'right') {
      // Сбоку рюкзак виден слева
      this.playerBody.fillStyle(0xef4444, 1);
      this.playerBody.fillRoundedRect(-19, -16, 11, 20, 3);
    } else {
      // Вид спереди — ремни терморюкзака на плечах
      this.playerBody.fillStyle(0xd97706, 1);
      this.playerBody.fillRect(-13, -16, 4, 18);
      this.playerBody.fillRect(9, -16, 4, 18);
    }
  }

  // =========================================================================
  // ПРОЦЕДУРНАЯ ГЕНЕРАЦИЯ ПОЛОС КИБЕР-ГОРОДА
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

    let type: LaneType = 'sidewalk';

    if (rowIndex <= 2) {
      type = 'sidewalk';
    } else if (rowIndex % CHECKPOINT_INTERVAL === 0) {
      type = 'delivery_point'; // ТОЧКА ДОСТАВКИ КЛИЕНТУ!
    } else {
      const seed = Math.sin(rowIndex * 41.234) * 83742.12;
      const rand = seed - Math.floor(seed);

      const prevLane = this.lanes.get(rowIndex - 1);
      const prevType = prevLane ? prevLane.type : 'sidewalk';

      if (prevType === 'road' && rand < 0.48) {
        type = 'road';
      } else if (prevType === 'energy_canal' && rand < 0.42) {
        type = 'energy_canal';
      } else if (rand < 0.38) {
        type = 'road';
      } else if (rand < 0.64) {
        type = 'energy_canal';
      } else if (rand < 0.76 && rowIndex > 5) {
        type = 'hyperloop';
      } else {
        type = 'sidewalk';
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
      platforms: [],
    };

    this.setupCyberLaneVisuals(lane);

    this.lanes.set(rowIndex, lane);
    if (rowIndex > this.maxRowGenerated) {
      this.maxRowGenerated = rowIndex;
    }

    return lane;
  }

  private setupCyberLaneVisuals(lane: Lane): void {
    const { bgGraphics, container, type, rowIndex } = lane;
    bgGraphics.clear();

    const speedScale = 1 + Math.min(this.maxDistance / 80, 0.9);

    if (type === 'delivery_point') {
      // ЗОНА ДОСТАВКИ КЛИЕНТА
      bgGraphics.fillStyle(0x0f172a, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Неоновая площадка передачи заказа
      bgGraphics.fillStyle(0x10b981, 0.25);
      bgGraphics.fillRect(0, -TILE_SIZE / 2 + 4, GAME_WIDTH, TILE_SIZE - 8);
      bgGraphics.lineStyle(2, 0x10b981, 0.9);
      bgGraphics.strokeRect(0, -TILE_SIZE / 2 + 4, GAME_WIDTH, TILE_SIZE - 8);

      // Светящаяся надпись и разметка
      for (let x = 30; x < GAME_WIDTH; x += 160) {
        bgGraphics.fillStyle(0x10b981, 1);
        bgGraphics.fillRoundedRect(x, -16, 120, 32, 6);
      }

      // Текст над зоной
      const clientText = this.add.text(GAME_WIDTH / 2, 0, '🎯 КЛИЕНТ: ТОЧКА ДОСТАВКИ 🍕', {
        fontFamily: 'system-ui, -apple-system, sans-serif',
        fontSize: '18px',
        color: '#ffffff',
        fontStyle: 'bold',
      }).setOrigin(0.5);
      container.add(clientText);
      lane.deliveryText = clientText;

    } else if (type === 'sidewalk') {
      // ТРОТУАР / КИБЕР-АЛЛЕЯ
      const isAlt = Math.abs(rowIndex) % 2 === 0;
      bgGraphics.fillStyle(isAlt ? 0x1e293b : 0x182030, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Неоновые линии стыков плитки
      bgGraphics.fillStyle(0x334155, 0.7);
      for (let x = 0; x < GAME_WIDTH; x += 60) {
        bgGraphics.fillRect(x, -TILE_SIZE / 2, 2, TILE_SIZE);
      }
      bgGraphics.fillStyle(0x06b6d4, 0.35);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, 2);

      // Препятствия: терминалы, вендинги, голо-столбы
      if (rowIndex > 1) {
        const count = Phaser.Math.Between(1, 3);
        const freeCols = [this.playerCol - 1, this.playerCol, this.playerCol + 1];

        for (let i = 0; i < count; i++) {
          const col = Phaser.Math.Between(0, GRID_COLS - 1);
          if (!freeCols.includes(col) && !lane.obstacles.has(col)) {
            lane.obstacles.add(col);
            const obsG = this.drawCyberObstacle(this.colToWorldX(col), 0);
            container.add(obsG);
          }
        }

        // Спавн бонусов: Термо-пак 🔥 или Крипто-чаевые 🪙
        const itemRoll = Math.random();
        if (itemRoll < 0.35) {
          const itemCol = Phaser.Math.Between(1, GRID_COLS - 2);
          if (!lane.obstacles.has(itemCol)) {
            lane.itemCol = itemCol;
            lane.itemType = itemRoll < 0.18 ? 'hotpack' : 'coin';
            lane.itemContainer = this.createPickupItem(
              this.colToWorldX(itemCol),
              0,
              lane.itemType
            );
            container.add(lane.itemContainer);
          }
        }
      }

    } else if (type === 'road') {
      // КИБЕР-МАГИСТРАЛЬ (Темный графитовый асфальт с белой разметкой)
      bgGraphics.fillStyle(0x111827, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Бордюры дороги (темный сланец)
      bgGraphics.fillStyle(0x030712, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, 3);
      bgGraphics.fillRect(0, TILE_SIZE / 2 - 3, GAME_WIDTH, 3);

      // Разметка дороги (пунктирные белые полосы)
      bgGraphics.fillStyle(0xf1f5f9, 0.85);
      for (let x = 15; x < GAME_WIDTH; x += 60) {
        bgGraphics.fillRect(x, -2, 30, 4);
      }

      // Беспилотники и кибер-машины
      const direction: 1 | -1 = rowIndex % 2 === 0 ? 1 : -1;
      const baseSpeed = Phaser.Math.Between(140, 260) * speedScale;
      const vehicleCount = Phaser.Math.Between(2, 3);
      const spacing = GAME_WIDTH / vehicleCount;

      for (let i = 0; i < vehicleCount; i++) {
        const startX = i * spacing + Phaser.Math.Between(-35, 35);
        const r = Math.random();
        let vType: 'drone_car' | 'cyber_coupe' | 'hauler' = 'cyber_coupe';
        let vWidth = 74;
        let vHeight = 34;
        let vColor = 0x06b6d4; // Неоновый циан
        let vGlow = 0x06b6d4;

        if (r < 0.3) {
          vType = 'drone_car';
          vWidth = 56;
          vHeight = 30;
          vColor = 0xec4899; // Розовый спорт-кар
          vGlow = 0xec4899;
        } else if (r > 0.72) {
          vType = 'hauler';
          vWidth = 125;
          vHeight = 38;
          vColor = 0x8b5cf6; // Фиолетовый грузовик
          vGlow = 0xa855f7;
        }

        const vGraphics = this.add.graphics();
        container.add(vGraphics);

        const v: Vehicle = {
          x: startX,
          width: vWidth,
          height: vHeight,
          speed: baseSpeed,
          direction,
          color: vColor,
          underglowColor: vGlow,
          type: vType,
          graphics: vGraphics,
        };

        this.drawVehicle(v);
        lane.vehicles.push(v);
      }

    } else if (type === 'energy_canal') {
      // ВОДНЫЙ / ЭНЕРГЕТИЧЕСКИЙ КАНАЛ (Яркая лазурно-бирюзовая вода, контрастирующая с черным асфальтом)
      bgGraphics.fillStyle(0x0284c7, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Глубокий слой воды
      bgGraphics.fillStyle(0x0369a1, 0.85);
      bgGraphics.fillRect(0, -TILE_SIZE / 2 + 5, GAME_WIDTH, TILE_SIZE - 10);

      // Светящиеся водные волны и рябь
      bgGraphics.fillStyle(0x38bdf8, 0.85);
      for (let x = 10; x < GAME_WIDTH; x += 55) {
        bgGraphics.fillRect(x + ((rowIndex * 17) % 35), -14, 28, 4);
        bgGraphics.fillRect(x + 20, 10, 24, 4);
      }
      bgGraphics.fillStyle(0x7dd3fc, 0.75);
      for (let x = 25; x < GAME_WIDTH; x += 75) {
        bgGraphics.fillRect(x + ((rowIndex * 29) % 40), -2, 20, 3);
      }

      // Неоновые светящиеся кромки берегов
      bgGraphics.fillStyle(0x06b6d4, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, 4);
      bgGraphics.fillRect(0, TILE_SIZE / 2 - 4, GAME_WIDTH, 4);

      // Контрастные предупреждающие полосы на кромке воды
      bgGraphics.fillStyle(0xf59e0b, 0.95);
      for (let x = 0; x < GAME_WIDTH; x += 35) {
        bgGraphics.fillRect(x, -TILE_SIZE / 2, 12, 4);
        bgGraphics.fillRect(x + 18, TILE_SIZE / 2 - 4, 12, 4);
      }

      // Платформы на магнитной подушке (hover-platforms)
      const direction: 1 | -1 = rowIndex % 2 === 0 ? 1 : -1;
      const baseSpeed = Phaser.Math.Between(100, 185) * speedScale;
      const count = Phaser.Math.Between(2, 3);
      const spacing = GAME_WIDTH / count;

      for (let i = 0; i < count; i++) {
        const startX = i * spacing + Phaser.Math.Between(-30, 30);
        const pWidth = Phaser.Math.RND.pick([100, 145, 190]);
        const pGraphics = this.add.graphics();
        container.add(pGraphics);

        const p: HoverPlatform = {
          x: startX,
          width: pWidth,
          height: 38,
          speed: baseSpeed,
          direction,
          graphics: pGraphics,
        };

        this.drawHoverPlatform(p);
        lane.platforms.push(p);
      }

    } else if (type === 'hyperloop') {
      // ГИПЕРЛУП / ТРАССА МОНОРЕЛЬСА
      bgGraphics.fillStyle(0x090d16, 1);
      bgGraphics.fillRect(0, -TILE_SIZE / 2, GAME_WIDTH, TILE_SIZE);

      // Магнитные направляющие рельсы
      bgGraphics.fillStyle(0x1e293b, 1);
      bgGraphics.fillRect(0, -18, GAME_WIDTH, 36);
      bgGraphics.fillStyle(0x06b6d4, 0.9);
      bgGraphics.fillRect(0, -12, GAME_WIDTH, 3);
      bgGraphics.fillRect(0, 9, GAME_WIDTH, 3);

      const signalGraphics = this.add.graphics();
      container.add(signalGraphics);
      this.drawHyperloopSignal(signalGraphics, false);

      const trainGraphics = this.add.graphics();
      container.add(trainGraphics);

      lane.hyperloop = {
        active: false,
        warningTimer: Phaser.Math.FloatBetween(4.0, 8.5),
        trainX: -900,
        direction: Math.random() < 0.5 ? 1 : -1,
        speed: 1250 * speedScale,
        totalLength: 720,
        graphics: trainGraphics,
        signalGraphics,
      };
    }
  }

  // Отрисовка кибер-препятствия (терминал / неоновый столб)
  private drawCyberObstacle(x: number, y: number): Phaser.GameObjects.Graphics {
    const g = this.add.graphics();

    // Неоновая тень
    g.fillStyle(0x000000, 0.4);
    g.fillEllipse(x, y + 15, 34, 16);

    // Кибер-терминал
    g.fillStyle(0x0f172a, 1);
    g.fillRoundedRect(x - 16, y - 22, 32, 36, 5);

    // Неоновый экран
    g.fillStyle(0x06b6d4, 1);
    g.fillRoundedRect(x - 12, y - 18, 24, 16, 3);

    // Бегущая строка / пиксели
    g.fillStyle(0xffffff, 0.9);
    g.fillRect(x - 8, y - 14, 16, 3);
    g.fillRect(x - 8, y - 8, 10, 3);

    // Светодиодный индикатор сверху
    g.fillStyle(0xef4444, 1);
    g.fillCircle(x + 10, y - 20, 2);

    return g;
  }

  // Отрисовка бонуса (термо-пак или монета)
  private createPickupItem(x: number, y: number, itemType: 'coin' | 'hotpack'): Phaser.GameObjects.Container {
    const c = this.add.container(x, y);

    const shadow = this.add.graphics();
    shadow.fillStyle(0x000000, 0.3);
    shadow.fillEllipse(0, 15, 20, 10);
    c.add(shadow);

    const item = this.add.graphics();

    if (itemType === 'hotpack') {
      // ТЕРМО-ПАК (подогрев пиццы)
      item.fillStyle(0xef4444, 1);
      item.fillRoundedRect(-12, -12, 24, 24, 5);
      // Символ пламени
      item.fillStyle(0xfacc15, 1);
      item.fillTriangle(-6, 6, 6, 6, 0, -8);
      item.fillStyle(0xffffff, 0.9);
      item.fillCircle(0, 2, 3);
    } else {
      // КРИПТО-ЧАЕВЫЕ
      item.fillStyle(0x06b6d4, 1);
      item.fillCircle(0, 0, 12);
      item.fillStyle(0x38bdf8, 1);
      item.fillCircle(0, 0, 9);
      item.fillStyle(0xffffff, 1);
      item.fillCircle(0, 0, 4);
    }

    c.add(item);

    // Анимация левитации
    this.tweens.add({
      targets: item,
      y: -7,
      duration: 550,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut',
    });

    return c;
  }

  // Отрисовка беспилотника / кибер-кара
  private drawVehicle(v: Vehicle): void {
    const g = v.graphics;
    g.clear();

    const halfW = v.width / 2;
    const halfH = v.height / 2;

    // Неоновая подсветка днища (Underglow!)
    g.fillStyle(v.underglowColor, 0.3);
    g.fillRoundedRect(v.x - halfW - 4, -halfH - 2, v.width + 8, v.height + 4, 8);

    // Корпус
    g.fillStyle(0x0f172a, 1);
    g.fillRoundedRect(v.x - halfW, -halfH, v.width, v.height, 6);

    g.fillStyle(v.color, 1);
    g.fillRoundedRect(v.x - halfW + 2, -halfH + 2, v.width - 4, v.height - 4, 5);

    // Кабина с тонированным стеклом
    g.fillStyle(0x020617, 0.9);
    g.fillRoundedRect(v.x - halfW + 16, -halfH + 6, v.width - 32, v.height - 12, 4);

    // Неоновые фары
    const frontX = v.direction === 1 ? v.x + halfW : v.x - halfW;
    g.fillStyle(0x38bdf8, 1);
    g.fillCircle(frontX, -halfH + 6, 3.5);
    g.fillCircle(frontX, halfH - 6, 3.5);

    // Конус света фар
    g.fillStyle(0x38bdf8, 0.14);
    g.fillTriangle(
      frontX, -halfH + 6,
      frontX, halfH - 6,
      frontX + v.direction * 85, halfH + 14
    );
    g.fillTriangle(
      frontX, -halfH + 6,
      frontX + v.direction * 85, -halfH - 14,
      frontX + v.direction * 85, halfH + 14
    );

    // Задние красные габариты
    const backX = v.direction === 1 ? v.x - halfW : v.x + halfW;
    g.fillStyle(0xef4444, 1);
    g.fillRect(backX - (v.direction === 1 ? 2 : -1), -halfH + 5, 2, v.height - 10);
  }

  // Отрисовка бревна на воде (стилизованное воксельное бревно с корой, кольцами спила и пеной)
  private drawHoverPlatform(p: HoverPlatform): void {
    const g = p.graphics;
    g.clear();

    const halfW = p.width / 2;
    const halfH = 18; // высота бревна 36px

    // 1. Тень в воде под бревном
    g.fillStyle(0x013a5e, 0.6);
    g.fillRoundedRect(p.x - halfW - 3, -halfH + 6, p.width + 6, halfH * 2, 10);

    // 2. Водная рябь / белая пена спереди и сзади бревна
    const frontX = p.direction === 1 ? p.x + halfW : p.x - halfW;
    const backX = p.direction === 1 ? p.x - halfW : p.x + halfW;
    g.fillStyle(0xe0f2fe, 0.65);
    g.fillEllipse(frontX + p.direction * 5, 0, 10, 24);
    g.fillStyle(0x38bdf8, 0.4);
    g.fillEllipse(backX - p.direction * 6, 0, 12, 20);

    // 3. Основная кора дерева (насыщенный теплый темно-коричневый цвет сосны/дуба)
    g.fillStyle(0x78350f, 1);
    g.fillRoundedRect(p.x - halfW, -halfH, p.width, halfH * 2, 8);

    // 4. Верхняя светлая часть древесины (спил / сердцевина бревна)
    g.fillStyle(0xb45309, 1);
    g.fillRoundedRect(p.x - halfW + 6, -halfH + 4, p.width - 12, halfH * 2 - 8, 5);

    // 5. Продольные волокна древесины (текстура досок/коры)
    g.fillStyle(0x92400e, 0.9);
    g.fillRect(p.x - halfW + 12, -6, p.width - 24, 3);
    g.fillRect(p.x - halfW + 16, 4, p.width - 32, 2.5);
    g.fillStyle(0xd97706, 0.7);
    g.fillRect(p.x - halfW + 14, -1, p.width - 28, 2);

    // 6. Спилы дерева на торцах (годовые кольца)
    [p.x - halfW + 10, p.x + halfW - 10].forEach((ringX) => {
      // Светлый наружный срез
      g.fillStyle(0xd97706, 1);
      g.fillCircle(ringX, 0, 9);
      // Среднее кольцо
      g.fillStyle(0x92400e, 1);
      g.fillCircle(ringX, 0, 6);
      // Внутреннее кольцо
      g.fillStyle(0x78350f, 1);
      g.fillCircle(ringX, 0, 3.5);
      // Сердцевина
      g.fillStyle(0x451a03, 1);
      g.fillCircle(ringX, 0, 1.5);
    });

    // 7. Кибер-крепежи (два неоновых хомута со светодиодом, объединяющие сеттинг)
    [-halfW * 0.45, halfW * 0.45].forEach((offset) => {
      g.fillStyle(0x0f172a, 0.95);
      g.fillRect(p.x + offset - 3, -halfH, 6, halfH * 2);
      g.fillStyle(0x06b6d4, 1);
      g.fillRect(p.x + offset - 1, -halfH + 2, 2, halfH * 2 - 4);
      g.fillStyle(0x38bdf8, 1);
      g.fillCircle(p.x + offset, -halfH + 5, 2);
    });
  }

  // Сигнализация гиперлупа
  private drawHyperloopSignal(g: Phaser.GameObjects.Graphics, isBlinking: boolean): void {
    g.clear();
    [35, GAME_WIDTH - 35].forEach((sx) => {
      g.fillStyle(0x0f172a, 1);
      g.fillRect(sx - 4, -26, 8, 52);

      const color = isBlinking ? 0xef4444 : 0x475569;
      g.fillStyle(color, 1);
      g.fillCircle(sx, -14, 7);

      if (isBlinking) {
        g.fillStyle(0xef4444, 0.35);
        g.fillCircle(sx, -14, 16);
      }
    });
  }

  // Отрисовка поезда гиперлупа
  private drawHyperloopTrain(t: HyperloopState): void {
    const g = t.graphics;
    g.clear();

    const carLen = 170;
    const carHeight = 44;
    const gap = 10;
    const cars = 4;

    for (let c = 0; c < cars; c++) {
      const offset = c * (carLen + gap);
      const cx = t.direction === 1 ? t.trainX - offset : t.trainX + offset;

      // Тень и свечение
      g.fillStyle(0x06b6d4, 0.35);
      g.fillRoundedRect(cx - carLen / 2 - 3, -carHeight / 2 - 2, carLen + 6, carHeight + 4, 8);

      // Обтекаемый корпус
      g.fillStyle(0xf8fafc, 1);
      g.fillRoundedRect(cx - carLen / 2, -carHeight / 2, carLen, carHeight, 6);

      // Неоновая полоса
      g.fillStyle(0x06b6d4, 1);
      g.fillRect(cx - carLen / 2, -2, carLen, 6);

      // Локомотив
      if (c === 0) {
        const noseX = t.direction === 1 ? cx + carLen / 2 : cx - carLen / 2;
        g.fillStyle(0x0284c7, 1);
        g.fillTriangle(
          noseX, -carHeight / 2,
          noseX, carHeight / 2,
          noseX + t.direction * 36, 0
        );

        // Мощный фронтальный лазер
        g.fillStyle(0x38bdf8, 0.4);
        g.fillTriangle(
          noseX, -10,
          noseX, 10,
          noseX + t.direction * 280, 0
        );
      }
    }
  }

  // =========================================================================
  // ИНТЕРФЕЙС КИБЕР-КУРЬЕРА (HUD)
  // =========================================================================
  private createHUD(): void {
    this.hudContainer = this.add.container(0, 0);
    this.hudContainer.setScrollFactor(0);
    this.hudContainer.setDepth(1000);

    // 1. ПАНЕЛЬ ДИСТАНЦИИ (слева)
    const distBg = this.add.graphics();
    distBg.fillStyle(0x0f172a, 0.85);
    distBg.fillRoundedRect(20, 16, 140, 68, 12);
    distBg.lineStyle(2, 0x1e293b, 1);
    distBg.strokeRoundedRect(20, 16, 140, 68, 12);
    this.hudContainer.add(distBg);

    this.hudContainer.add(
      this.add.text(32, 24, 'ДИСТАНЦИЯ', {
        fontFamily: 'system-ui, sans-serif',
        fontSize: '11px',
        color: '#94a3b8',
        fontStyle: 'bold',
      })
    );

    this.distanceText = this.add.text(32, 40, '0 м', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '28px',
      color: '#ffffff',
      fontStyle: 'bold',
    });
    this.hudContainer.add(this.distanceText);

    // 2. ИНДИКАТОР ТЕМПЕРАТУРЫ ПИЦЦЫ (по центру сверху) — ГЛАВНАЯ МЕХАНИКА
    const tempPanelW = 340;
    const tempPanelX = GAME_WIDTH / 2 - tempPanelW / 2;

    const tempBg = this.add.graphics();
    tempBg.fillStyle(0x0f172a, 0.9);
    tempBg.fillRoundedRect(tempPanelX, 16, tempPanelW, 68, 12);
    tempBg.lineStyle(2, 0xef4444, 0.8);
    tempBg.strokeRoundedRect(tempPanelX, 16, tempPanelW, 68, 12);
    this.hudContainer.add(tempBg);

    const tempTitle = this.add.text(GAME_WIDTH / 2, 26, '🍕 ТЕМПЕРАТУРА ЗАКАЗА', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#fbbf24',
      fontStyle: 'bold',
    }).setOrigin(0.5, 0);
    this.hudContainer.add(tempTitle);

    // Шкала термометра
    const barW = 220;
    const barH = 14;
    const barX = GAME_WIDTH / 2 - barW / 2 - 35;
    const barY = 52;

    const barBg = this.add.graphics();
    barBg.fillStyle(0x1e293b, 1);
    barBg.fillRoundedRect(barX, barY, barW, barH, 7);
    this.hudContainer.add(barBg);

    this.tempBarFill = this.add.graphics();
    this.hudContainer.add(this.tempBarFill);

    this.tempNumberText = this.add.text(barX + barW + 14, barY - 4, '100°C', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#ef4444',
      fontStyle: 'bold',
    });
    this.hudContainer.add(this.tempNumberText);

    // 3. ЧАЕВЫЕ И СЧЕТЧИК ДОСТАВОК (справа)
    const statsBg = this.add.graphics();
    statsBg.fillStyle(0x0f172a, 0.85);
    statsBg.fillRoundedRect(GAME_WIDTH - 305, 16, 170, 68, 12);
    statsBg.lineStyle(2, 0x1e293b, 1);
    statsBg.strokeRoundedRect(GAME_WIDTH - 305, 16, 170, 68, 12);
    this.hudContainer.add(statsBg);

    this.deliveryCountText = this.add.text(GAME_WIDTH - 293, 24, '🎯 Доставлено: 0', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '12px',
      color: '#10b981',
      fontStyle: 'bold',
    });
    this.hudContainer.add(this.deliveryCountText);

    this.tipsText = this.add.text(GAME_WIDTH - 293, 42, `💵 $${this.tipsEarned}`, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '24px',
      color: '#facc15',
      fontStyle: 'bold',
    });
    this.hudContainer.add(this.tipsText);

    // Кнопка паузы
    const pauseBg = this.add.graphics();
    pauseBg.fillStyle(0x0f172a, 0.85);
    pauseBg.fillRoundedRect(GAME_WIDTH - 125, 16, 50, 68, 12);
    pauseBg.lineStyle(2, 0x1e293b, 1);
    pauseBg.strokeRoundedRect(GAME_WIDTH - 125, 16, 50, 68, 12);
    this.hudContainer.add(pauseBg);

    this.pauseBtnText = this.add.text(GAME_WIDTH - 100, 50, '⏸', {
      fontSize: '22px',
    }).setOrigin(0.5);
    this.pauseBtnText.setInteractive({ useHandCursor: true });
    this.pauseBtnText.on('pointerdown', () => this.togglePause());
    this.hudContainer.add(this.pauseBtnText);

    // Кнопка звука
    const muteBg = this.add.graphics();
    muteBg.fillStyle(0x0f172a, 0.85);
    muteBg.fillRoundedRect(GAME_WIDTH - 65, 16, 50, 68, 12);
    muteBg.lineStyle(2, 0x1e293b, 1);
    muteBg.strokeRoundedRect(GAME_WIDTH - 65, 16, 50, 68, 12);
    this.hudContainer.add(muteBg);

    this.muteBtnText = this.add.text(GAME_WIDTH - 40, 50, this.soundFx.getMuted() ? '🔇' : '🔊', {
      fontSize: '22px',
    }).setOrigin(0.5);
    this.muteBtnText.setInteractive({ useHandCursor: true });
    this.muteBtnText.on('pointerdown', () => {
      const m = this.soundFx.toggleMute();
      this.muteBtnText.setText(m ? '🔇' : '🔊');
    });
    this.hudContainer.add(this.muteBtnText);

    // Модальное окно паузы
    this.createPauseModal();

    // Модальное окно Game Over
    this.createGameOverModal();

    // Экранный D-Pad для удобства
    this.createDPad();
  }

  private updateTemperatureBar(): void {
    this.tempBarFill.clear();

    const barW = 220;
    const barH = 14;
    const barX = GAME_WIDTH / 2 - barW / 2 - 35;
    const barY = 52;

    const ratio = Phaser.Math.Clamp(this.temperature / INITIAL_TEMPERATURE, 0, 1);
    const fillWidth = barW * ratio;

    let color = 0x22c55e; // Зеленый (> 60°C)
    if (this.temperature < 35) {
      color = 0xef4444; // Красный остывающий (< 35°C)
    } else if (this.temperature < 65) {
      color = 0xf59e0b; // Желто-оранжевый
    }

    this.tempBarFill.fillStyle(color, 1);
    this.tempBarFill.fillRoundedRect(barX, barY, Math.max(fillWidth, 6), barH, 7);

    this.tempNumberText.setText(`${Math.round(this.temperature)}°C`);
    this.tempNumberText.setColor(this.temperature < 35 ? '#ef4444' : '#ffffff');
  }

  // Виртуальный D-Pad
  private createDPad(): void {
    const dpad = this.add.container(GAME_WIDTH - 110, GAME_HEIGHT - 110);
    dpad.setScrollFactor(0);
    dpad.setDepth(1100);

    const size = 44;
    const btns: { dir: 'up' | 'down' | 'left' | 'right'; x: number; y: number; label: string }[] = [
      { dir: 'up', x: 0, y: -size, label: '▲' },
      { dir: 'down', x: 0, y: size, label: '▼' },
      { dir: 'left', x: -size, y: 0, label: '◀' },
      { dir: 'right', x: size, y: 0, label: '▶' },
    ];

    btns.forEach(({ dir, x, y, label }) => {
      const g = this.add.graphics();
      g.fillStyle(0x0f172a, 0.7);
      g.fillRoundedRect(x - 20, y - 20, 40, 40, 8);
      g.lineStyle(2, 0x06b6d4, 0.8);
      g.strokeRoundedRect(x - 20, y - 20, 40, 40, 8);
      dpad.add(g);

      const t = this.add.text(x, y, label, {
        fontSize: '18px',
        color: '#38bdf8',
      }).setOrigin(0.5);
      dpad.add(t);

      const zone = this.add.zone(x, y, 42, 42).setInteractive({ useHandCursor: true });
      zone.on('pointerdown', () => {
        if (!this.isDead && !this.isPaused) this.tryMove(dir);
      });
      dpad.add(zone);
    });

    this.hudContainer.add(dpad);
  }

  // Модальное окно паузы
  private createPauseModal(): void {
    this.pauseContainer = this.add.container(0, 0);
    this.pauseContainer.setScrollFactor(0);
    this.pauseContainer.setDepth(2500);
    this.pauseContainer.setVisible(false);

    const overlay = this.add.graphics();
    overlay.fillStyle(0x030712, 0.75);
    overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.pauseContainer.add(overlay);

    // Блокируем сквозные клики
    const blockerZone = this.add.zone(GAME_WIDTH / 2, GAME_HEIGHT / 2, GAME_WIDTH, GAME_HEIGHT);
    blockerZone.setInteractive();
    this.pauseContainer.add(blockerZone);

    const modalX = GAME_WIDTH / 2;
    const modalY = GAME_HEIGHT / 2;
    const modalW = 460;
    const modalH = 320;

    const card = this.add.graphics();
    card.fillStyle(0x0f172a, 0.98);
    card.fillRoundedRect(modalX - modalW / 2, modalY - modalH / 2, modalW, modalH, 16);
    card.lineStyle(3, 0x06b6d4, 0.9);
    card.strokeRoundedRect(modalX - modalW / 2, modalY - modalH / 2, modalW, modalH, 16);
    this.pauseContainer.add(card);

    const title = this.add.text(modalX, modalY - 110, '⏸️ ПАУЗА', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '32px',
      color: '#38bdf8',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.pauseContainer.add(title);

    const subtitle = this.add.text(modalX, modalY - 65, 'СМЕНА КУРЬЕРА ПРИОСТАНОВЛЕНА', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      color: '#94a3b8',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.pauseContainer.add(subtitle);

    this.pauseStatsText = this.add.text(modalX, modalY - 10, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '17px',
      color: '#e2e8f0',
      align: 'center',
      lineSpacing: 6,
    }).setOrigin(0.5);
    this.pauseContainer.add(this.pauseStatsText);

    // Кнопка продолжить
    const btnW = 240;
    const btnH = 50;
    const btnY = modalY + 70;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x0284c7, 1);
    btnBg.fillRoundedRect(modalX - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
    btnBg.lineStyle(2, 0x38bdf8, 1);
    btnBg.strokeRoundedRect(modalX - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
    this.pauseContainer.add(btnBg);

    const btnText = this.add.text(modalX, btnY, 'ПРОДОЛЖИТЬ ▶', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.pauseContainer.add(btnText);

    const hint = this.add.text(modalX, modalY + 118, 'или нажми P / ESC', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '13px',
      color: '#64748b',
    }).setOrigin(0.5);
    this.pauseContainer.add(hint);

    const btnZone = this.add.zone(modalX, btnY, btnW, btnH).setInteractive({ useHandCursor: true });
    btnZone.on('pointerdown', () => this.togglePause());
    this.pauseContainer.add(btnZone);
  }

  private togglePause(): void {
    if (this.isDead) return;

    this.isPaused = !this.isPaused;
    this.soundFx.playPause(this.isPaused);

    if (this.isPaused) {
      this.tweens.pauseAll();
      this.pauseBtnText.setText('▶');
      const tempIcon = this.temperature < 35 ? '❄️' : '🔥';
      this.pauseStatsText.setText(
        `Дистанция: ${this.maxDistance} м  |  Рекорд: ${this.highScore} м\n` +
        `${tempIcon} Температура заказа: ${Math.round(this.temperature)}°C\n` +
        `🎯 Доставлено: ${this.completedDeliveries}  |  💵 Чаевые: $${this.tipsEarned}`
      );
      this.pauseContainer.setVisible(true);
    } else {
      this.pauseContainer.setVisible(false);
      this.pauseBtnText.setText('⏸');
      this.tweens.resumeAll();
    }
  }

  // Окно Game Over (Смена завершена)
  private createGameOverModal(): void {
    this.gameOverContainer = this.add.container(0, 0);
    this.gameOverContainer.setScrollFactor(0);
    this.gameOverContainer.setDepth(2000);
    this.gameOverContainer.setVisible(false);

    const overlay = this.add.graphics();
    overlay.fillStyle(0x030712, 0.85);
    overlay.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
    this.gameOverContainer.add(overlay);

    const modalX = GAME_WIDTH / 2;
    const modalY = GAME_HEIGHT / 2;
    const modalW = 500;
    const modalH = 360;

    const card = this.add.graphics();
    card.fillStyle(0x0f172a, 0.98);
    card.fillRoundedRect(modalX - modalW / 2, modalY - modalH / 2, modalW, modalH, 16);
    card.lineStyle(3, 0xef4444, 0.9);
    card.strokeRoundedRect(modalX - modalW / 2, modalY - modalH / 2, modalW, modalH, 16);
    this.gameOverContainer.add(card);

    const title = this.add.text(modalX, modalY - 125, 'ДОСТАВКА ПРЕРВАНА', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '30px',
      color: '#ef4444',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.gameOverContainer.add(title);

    const reason = this.add.text(modalX, modalY - 75, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '17px',
      color: '#cbd5e1',
      align: 'center',
    }).setOrigin(0.5);
    reason.setName('reasonText');
    this.gameOverContainer.add(reason);

    const stats = this.add.text(modalX, modalY - 10, '', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '20px',
      color: '#ffffff',
      fontStyle: 'bold',
      align: 'center',
    }).setOrigin(0.5);
    stats.setName('statsText');
    this.gameOverContainer.add(stats);

    // Кнопка нового заказа
    const btnW = 260;
    const btnH = 54;
    const btnY = modalY + 85;

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x0284c7, 1);
    btnBg.fillRoundedRect(modalX - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
    btnBg.lineStyle(2, 0x38bdf8, 1);
    btnBg.strokeRoundedRect(modalX - btnW / 2, btnY - btnH / 2, btnW, btnH, 12);
    this.gameOverContainer.add(btnBg);

    const btnText = this.add.text(modalX, btnY, 'ВЗЯТЬ НОВЫЙ ЗАКАЗ', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#ffffff',
      fontStyle: 'bold',
    }).setOrigin(0.5);
    this.gameOverContainer.add(btnText);

    const hint = this.add.text(modalX, modalY + 135, 'или нажми ПРОБЕЛ / W', {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '14px',
      color: '#64748b',
    }).setOrigin(0.5);
    this.gameOverContainer.add(hint);

    const btnZone = this.add.zone(modalX, btnY, btnW, btnH).setInteractive({ useHandCursor: true });
    btnZone.on('pointerdown', () => this.restartGame());
    this.gameOverContainer.add(btnZone);
  }

  // =========================================================================
  // ТАЧ / СВАЙПЫ (ТАП — ПРЫЖОК, СВАЙПЫ — ПОВОРОТ И ШАГ)
  // =========================================================================
  private setupPointerControls(): void {
    this.input.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
      if (this.isDead || this.isPaused) return;
      this.touchStartX = pointer.x;
      this.touchStartY = pointer.y;
    });

    this.input.on('pointerup', (pointer: Phaser.Input.Pointer) => {
      if (this.isDead || this.isPaused) return;

      const dx = pointer.x - this.touchStartX;
      const dy = pointer.y - this.touchStartY;
      const dist = Math.hypot(dx, dy);

      // СВАЙПЫ: меняют направление взгляда и совершают шаг
      if (dist > 25) {
        if (Math.abs(dx) > Math.abs(dy)) {
          if (dx > 0) this.tryMove('right');
          else this.tryMove('left');
        } else {
          if (dy < 0) this.tryMove('up');
          else this.tryMove('down');
        }
      } else {
        // ТАП: прыжок в текущем направлении взгляда курьера!
        this.tryMove(this.playerFacing);
      }
    });
  }

  // =========================================================================
  // ДВИЖЕНИЕ КУРЬЕРА (ПЛАВНАЯ ФИЗИКА БРЁВЕН И СЕТКИ)
  // =========================================================================
  private tryMove(dir: 'up' | 'down' | 'left' | 'right'): void {
    if (this.isHopping || this.isDead || this.isPaused) return;

    let targetCol = this.playerCol;
    let targetRow = this.playerRow;

    if (dir === 'up') targetRow += 1;
    else if (dir === 'down') targetRow -= 1;
    else if (dir === 'left') targetCol -= 1;
    else if (dir === 'right') targetCol += 1;

    if (targetRow < 0) {
      this.soundFx.playBonk();
      return;
    }

    this.playerFacing = dir;
    this.redrawCourier(dir);

    const targetLane = this.lanes.get(targetRow);
    const currentLane = this.lanes.get(this.playerRow);

    // Препятствия на целевой полосе (терминалы/столбы)
    if (targetLane && targetLane.obstacles.has(targetCol)) {
      this.soundFx.playBonk();
      this.bounceBlockedMove(dir);
      return;
    }

    // Расчет целевой координаты X:
    // Если игрок на бревне — прыжки происходят относительно текущего положения бревна!
    let destX: number;
    if (currentLane && currentLane.type === 'energy_canal' && this.currentRidePlatform) {
      if (dir === 'left') {
        destX = this.playerContainer.x - TILE_SIZE;
      } else if (dir === 'right') {
        destX = this.playerContainer.x + TILE_SIZE;
      } else {
        // Прыжок вперед / назад с бревна
        if (targetLane && targetLane.type === 'energy_canal') {
          // На следующее бревно: сохраняем текущий X без резких боковых рывков!
          destX = this.playerContainer.x;
        } else {
          // На тротуар или дорогу: плавно выравниваемся по ближайшей ячейке сетки
          const nearestCol = Phaser.Math.Clamp(
            Math.round((this.playerContainer.x - TILE_SIZE / 2) / TILE_SIZE),
            0,
            GRID_COLS - 1
          );
          destX = this.colToWorldX(nearestCol);
          targetCol = nearestCol;
        }
      }
    } else {
      // Обычное перемещение по ячейкам сетки
      if (targetCol < 0 || targetCol >= GRID_COLS) {
        this.soundFx.playBonk();
        return;
      }
      destX = this.colToWorldX(targetCol);
    }

    // Ограничиваем X в пределах экрана
    destX = Phaser.Math.Clamp(destX, TILE_SIZE / 2, GAME_WIDTH - TILE_SIZE / 2);
    targetCol = Phaser.Math.Clamp(
      Math.round((destX - TILE_SIZE / 2) / TILE_SIZE),
      0,
      GRID_COLS - 1
    );

    this.isHopping = true;
    this.currentRidePlatform = null;
    this.playerCol = targetCol;
    this.playerRow = targetRow;

    if (dir === 'up') {
      // Продвижение вперед подогревает пиццу за счет движения!
      this.temperature = Math.min(this.temperature + HEAT_BOOST_ON_FORWARD, 100);

      if (this.playerRow > this.maxDistance) {
        this.maxDistance = this.playerRow;
        this.distanceText.setText(`${this.maxDistance} м`);

        while (this.maxRowGenerated < this.playerRow + LANES_AHEAD) {
          this.generateLane(this.maxRowGenerated + 1);
        }
        this.cleanupOldLanes();
      }
    }

    const destY = this.rowToWorldY(targetRow);
    this.soundFx.playHop();

    // Анимация рывка
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

    this.tweens.add({
      targets: this.playerBody,
      y: -16,
      scaleX: 0.85,
      scaleY: 1.2,
      duration: HOP_DURATION / 2,
      yoyo: true,
      onComplete: () => {
        this.playerBody.y = 0;
        this.playerBody.scaleX = 1;
        this.playerBody.scaleY = 1;
      },
    });

    this.spawnNeonSparks(this.playerContainer.x, this.playerContainer.y + 12);
  }

  private bounceBlockedMove(dir: 'up' | 'down' | 'left' | 'right'): void {
    let bx = 0;
    let by = 0;
    if (dir === 'up') by = -10;
    else if (dir === 'down') by = 10;
    else if (dir === 'left') bx = -10;
    else if (dir === 'right') bx = 10;

    this.tweens.add({
      targets: this.playerContainer,
      x: this.playerContainer.x + bx,
      y: this.playerContainer.y + by,
      duration: 55,
      yoyo: true,
      ease: 'Quad.easeInOut',
    });
  }

  // Приземление
  private onLand(): void {
    if (this.isDead) return;

    const lane = this.lanes.get(this.playerRow);
    if (!lane) return;

    // 1. ДОСТИЖЕНИЕ ТОЧКИ ДОСТАВКИ (КЛИЕНТ) — фиксируется ровно 1 раз на точку!
    if (lane.type === 'delivery_point' && !lane.delivered) {
      lane.delivered = true;
      this.handleDeliveryCompleted(lane);
    }

    // 2. Сбор бонуса (Термо-пак или Крипто-чаевые)
    if (lane.itemCol !== undefined && lane.itemCol === this.playerCol && lane.itemContainer) {
      if (lane.itemType === 'hotpack') {
        this.temperature = Math.min(this.temperature + 20, 100);
        this.soundFx.playHeatBoost();
        this.showFloatNotice('🔥 +20°C ПИЦЦА ГОРЯЧАЯ!');
      } else {
        this.tipsEarned += 10;
        localStorage.setItem('cyber_courier_tips', String(this.tipsEarned));
        this.tipsText.setText(`💵 $${this.tipsEarned}`);
        this.soundFx.playCoin();
        this.showFloatNotice('💵 +$10 ЧАЕВЫЕ');
      }

      const item = lane.itemContainer;
      lane.itemContainer = undefined;
      lane.itemCol = undefined;
      this.tweens.add({
        targets: item,
        y: item.y - 30,
        alpha: 0,
        scale: 1.4,
        duration: 300,
        onComplete: () => item.destroy(),
      });
    }

    // 3. Проверка падения в энергоканал
    if (lane.type === 'energy_canal') {
      const p = this.findPlatformUnderPlayer(lane);
      if (p) {
        this.currentRidePlatform = p;
      } else {
        this.handleEnergyFall();
      }
    }
  }

  // Доставка заказа клиенту (однократно за контрольную точку)
  private handleDeliveryCompleted(lane: Lane): void {
    this.completedDeliveries += 1;
    this.tipsEarned += 100;
    this.temperature = 100; // Новый горячий заказ!
    localStorage.setItem('cyber_courier_tips', String(this.tipsEarned));

    this.deliveryCountText.setText(`🎯 Доставлено: ${this.completedDeliveries}`);
    this.tipsText.setText(`💵 $${this.tipsEarned}`);
    this.soundFx.playDeliverySuccess();

    this.showFloatNotice('🎉 ЗАКАЗ ДОСТАВЛЕН! +$100 🍕 НОВЫЙ ЗАКАЗ ВЫДАН!');
    this.cameras.main.flash(350, 16, 185, 129);

    if (lane.deliveryText) {
      lane.deliveryText.setText('✅ ЗАКАЗ ДОСТАВЛЕН! [ВЫПОЛНЕНО]');
      lane.deliveryText.setColor('#38bdf8');
    }
  }

  private showFloatNotice(text: string): void {
    const notice = this.add.text(this.playerContainer.x, this.playerContainer.y - 35, text, {
      fontFamily: 'system-ui, sans-serif',
      fontSize: '18px',
      color: '#facc15',
      fontStyle: 'bold',
      backgroundColor: '#0f172a',
      padding: { x: 8, y: 4 },
    }).setOrigin(0.5).setDepth(300);

    this.tweens.add({
      targets: notice,
      y: notice.y - 45,
      alpha: 0,
      duration: 1100,
      onComplete: () => notice.destroy(),
    });
  }

  private findPlatformUnderPlayer(lane: Lane, checkX?: number): HoverPlatform | null {
    const px = checkX !== undefined ? checkX : this.playerContainer.x;
    for (const p of lane.platforms) {
      // Честный хитбокс бревна: половина ширины + комфортный допуск 22px
      const halfW = p.width / 2 + 22;
      if (px >= p.x - halfW && px <= p.x + halfW) {
        return p;
      }
    }
    return null;
  }

  // =========================================================================
  // UPDATE LOOP
  // =========================================================================
  update(_time: number, delta: number): void {
    const dt = delta / 1000;

    if (this.isDead) {
      if (Phaser.Input.Keyboard.JustDown(this.spaceKey) || Phaser.Input.Keyboard.JustDown(this.wasd.up)) {
        this.restartGame();
      }
      return;
    }

    // Горячие клавиши паузы (P или ESC)
    if (Phaser.Input.Keyboard.JustDown(this.pauseKey) || Phaser.Input.Keyboard.JustDown(this.escKey)) {
      this.togglePause();
      return;
    }

    if (this.isPaused) {
      return;
    }

    // Клавиатура
    this.handleKeyboard();

    // 1. ОСТЫВАНИЕ ПИЦЦЫ (ДЕКЛАЙН ЗАКАЗА)
    this.temperature -= HEAT_DECAY_PER_SEC * dt;
    this.updateTemperatureBar();

    if (this.temperature <= 0) {
      this.handlePizzaFreeze();
      return;
    }

    // Обновление полос
    this.updateLanes(dt);

    // Движение на бревне (дрейф по воде)
    if (this.currentRidePlatform && !this.isHopping) {
      const p = this.currentRidePlatform;
      const lane = this.lanes.get(this.playerRow);

      if (lane && lane.type === 'energy_canal') {
        // Проверка уплытия за экран
        if (this.playerContainer.x < 15 || this.playerContainer.x > GAME_WIDTH - 15) {
          this.handleEnergyFall('🌊 Унесло течением реки за край экрана!');
          return;
        }

        // Дрейф вместе с бревном
        this.playerContainer.x += p.speed * p.direction * dt;
        this.playerCol = Phaser.Math.Clamp(
          Math.round((this.playerContainer.x - TILE_SIZE / 2) / TILE_SIZE),
          0,
          GRID_COLS - 1
        );

        // Проверка, что игрок всё ещё на бревне
        if (!this.findPlatformUnderPlayer(lane, this.playerContainer.x)) {
          this.handleEnergyFall();
          return;
        }
      } else {
        this.currentRidePlatform = null;
      }
    }

    // Коллизии с транспортом
    this.checkCollisions();

    // Камера
    this.updateCameraFollow(dt);
  }

  private handleKeyboard(): void {
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

  private updateLanes(dt: number): void {
    const minRow = this.playerRow - MAX_LANES_BEHIND;
    const maxRow = this.playerRow + LANES_AHEAD;

    for (let r = minRow; r <= maxRow; r++) {
      const lane = this.lanes.get(r);
      if (!lane) continue;

      // Машины
      if (lane.type === 'road') {
        for (const v of lane.vehicles) {
          v.x += v.speed * v.direction * dt;
          if (v.direction === 1 && v.x - v.width / 2 > GAME_WIDTH + 80) {
            v.x = -80 - v.width / 2;
          } else if (v.direction === -1 && v.x + v.width / 2 < -80) {
            v.x = GAME_WIDTH + 80 + v.width / 2;
          }
          this.drawVehicle(v);
        }
      }

      // Платформы
      if (lane.type === 'energy_canal') {
        for (const p of lane.platforms) {
          p.x += p.speed * p.direction * dt;
          if (p.direction === 1 && p.x - p.width / 2 > GAME_WIDTH + 100) {
            p.x = -100 - p.width / 2;
          } else if (p.direction === -1 && p.x + p.width / 2 < -100) {
            p.x = GAME_WIDTH + 100 + p.width / 2;
          }
          this.drawHoverPlatform(p);
        }
      }

      // Гиперлуп
      if (lane.type === 'hyperloop' && lane.hyperloop) {
        const t = lane.hyperloop;
        t.warningTimer -= dt;

        if (t.warningTimer <= 1.4 && t.warningTimer > 0) {
          const isBlinking = Math.floor(t.warningTimer * 8) % 2 === 0;
          this.drawHyperloopSignal(t.signalGraphics, isBlinking);

          if (Math.abs(t.warningTimer % 0.4) < dt) {
            this.soundFx.playRailWarning();
          }
        } else if (t.warningTimer <= 0 && !t.active) {
          t.active = true;
          t.trainX = t.direction === 1 ? -t.totalLength : GAME_WIDTH + t.totalLength;
          this.soundFx.playRailPass();
          this.cameras.main.shake(450, 0.007);
        }

        if (t.active) {
          t.trainX += t.speed * t.direction * dt;
          this.drawHyperloopTrain(t);

          const isOff = t.direction === 1
            ? t.trainX - t.totalLength > GAME_WIDTH + 100
            : t.trainX + t.totalLength < -100;

          if (isOff) {
            t.active = false;
            t.graphics.clear();
            t.warningTimer = Phaser.Math.FloatBetween(4.5, 9.0);
            this.drawHyperloopSignal(t.signalGraphics, false);
          }
        }
      }
    }
  }

  private checkCollisions(): void {
    const px = this.playerContainer.x;
    const py = this.playerContainer.y;
    const playerRadius = 13;

    // Проверяем текущую и соседние полосы с учетом физической высоты курьера
    for (let r = this.playerRow - 1; r <= this.playerRow + 1; r++) {
      const lane = this.lanes.get(r);
      if (!lane) continue;

      // Если курьер физически не находится на этой полосе по высоте — урон не наносится
      const laneYDist = Math.abs(py - lane.worldY);
      if (laneYDist > 18) continue;

      if (lane.type === 'road') {
        for (const v of lane.vehicles) {
          const vHalfW = v.width / 2 - 4;
          if (Math.abs(px - v.x) < playerRadius + vHalfW) {
            this.handleCrash('🚗 Сбит беспилотным кибер-каром!');
            return;
          }
        }
      }

      if (lane.type === 'hyperloop' && lane.hyperloop && lane.hyperloop.active) {
        const t = lane.hyperloop;
        const tLeft = Math.min(t.trainX, t.trainX - t.direction * t.totalLength);
        const tRight = Math.max(t.trainX, t.trainX - t.direction * t.totalLength);

        if (px >= tLeft - 8 && px <= tRight + 8) {
          this.handleCrash('⚡ Сбит сверхскоростным поездом гиперлупа!');
          return;
        }
      }
    }
  }

  // =========================================================================
  // ПОРАЖЕНИЯ (DEATH HANDLERS)
  // =========================================================================
  private handleCrash(reason: string): void {
    if (this.isDead) return;
    this.soundFx.playCrash();
    this.cameras.main.shake(250, 0.02);

    this.tweens.add({
      targets: this.playerBody,
      scaleX: 1.5,
      scaleY: 0.2,
      y: 10,
      duration: 70,
    });

    this.spawnNeonSparks(this.playerContainer.x, this.playerContainer.y);
    this.handleDeath(reason);
  }

  private handleEnergyFall(customReason?: string): void {
    if (this.isDead) return;
    this.soundFx.playZap();

    this.tweens.add({
      targets: this.playerBody,
      scale: 0.1,
      alpha: 0,
      y: 20,
      duration: 300,
    });

    this.spawnNeonSparks(this.playerContainer.x, this.playerContainer.y);
    this.handleDeath(customReason || '⚡ Упал в бездну энергоканала!');
  }

  private handlePizzaFreeze(): void {
    if (this.isDead) return;
    this.soundFx.playFreezeWarning();

    // Заказ полностью остыл!
    this.tweens.add({
      targets: this.playerBody,
      tint: 0x38bdf8,
      duration: 300,
    });

    this.handleDeath('🥶 ПИЦЦА ОСТЫЛА ДО 0°C!\nКлиент отменил заказ из-за задержки!');
  }

  private handleDeath(reason: string): void {
    if (this.isPaused) {
      this.isPaused = false;
      this.pauseContainer.setVisible(false);
      this.pauseBtnText.setText('⏸');
      this.tweens.resumeAll();
    }
    this.isDead = true;
    this.soundFx.playGameOver();

    const isNewBest = this.maxDistance > this.highScore;
    if (isNewBest) {
      this.highScore = this.maxDistance;
      localStorage.setItem('cyber_courier_best_dist', String(this.highScore));
    }

    this.time.delayedCall(600, () => {
      this.showGameOverModal(reason, isNewBest);
    });
  }

  private showGameOverModal(reason: string, isNewBest: boolean): void {
    const reasonText = this.gameOverContainer.getByName('reasonText') as Phaser.GameObjects.Text;
    const statsText = this.gameOverContainer.getByName('statsText') as Phaser.GameObjects.Text;

    if (reasonText) reasonText.setText(reason);
    if (statsText) {
      const best = isNewBest ? `🏆 НОВЫЙ РЕКОРД ДИСТАНЦИИ: ${this.maxDistance} м! 🌟` : `Дистанция: ${this.maxDistance} м  |  Рекорд: ${this.highScore} м`;
      statsText.setText(`${best}\n🎯 Доставлено заказов: ${this.completedDeliveries}\n💵 Всего чаевых: $${this.tipsEarned}`);
    }

    this.gameOverContainer.setVisible(true);
    this.gameOverContainer.setAlpha(0);
    this.tweens.add({
      targets: this.gameOverContainer,
      alpha: 1,
      duration: 250,
    });
  }

  private restartGame(): void {
    if (this.isPaused) {
      this.tweens.resumeAll();
    }
    this.scene.restart();
  }

  // Партиклы кибер-искр
  private spawnNeonSparks(x: number, y: number): void {
    for (let i = 0; i < 6; i++) {
      const color = Phaser.Math.RND.pick([0x06b6d4, 0xec4899, 0xfacc15]);
      const p = this.add.circle(x, y, Phaser.Math.Between(3, 5), color, 0.9);
      p.setDepth(150);
      const angle = Phaser.Math.FloatBetween(0, Math.PI * 2);
      const spd = Phaser.Math.Between(40, 110);

      this.tweens.add({
        targets: p,
        x: x + Math.cos(angle) * spd,
        y: y + Math.sin(angle) * spd,
        alpha: 0,
        scale: 0.2,
        duration: 350,
        onComplete: () => p.destroy(),
      });
    }
  }

  // Камера
  private updateCameraImmediate(): void {
    this.cameras.main.scrollY = this.playerContainer.y - CAMERA_OFFSET_Y;
  }

  private updateCameraFollow(dt: number): void {
    const targetY = this.playerContainer.y - CAMERA_OFFSET_Y;
    this.cameras.main.scrollY = Phaser.Math.Linear(
      this.cameras.main.scrollY,
      targetY,
      Math.min(dt * 7.5, 1)
    );
  }

  private cleanupOldLanes(): void {
    const minKeep = this.playerRow - MAX_LANES_BEHIND - 2;
    for (const [row, lane] of this.lanes.entries()) {
      if (row < minKeep) {
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
