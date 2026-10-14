import Phaser from 'phaser';
import { GameScene } from './GameScene';

/**
 * Единый централизованный конфигурационный объект игры Cyber Courier
 * Выносит все важные настройки баланса, визуала и фаз из кода в единый источник истины.
 */
export const GAME_CONFIG = {
  display: {
    width: 960,
    height: 640,
    tileSize: 60,
    gridCols: 16,
    cameraOffsetY: 440,
    hopDuration: 105,
    maxLanesBehind: 6,
    lanesAhead: 16,
  },
  pizza: {
    initialTemperature: 100,
    heatDecayPerSec: 4.2,
    heatBoostOnForward: 0.8,
    checkpointInterval: 25, // Каждые 25 метров — новый клиент
    tipPerDelivery: 100,
  },
  traffic: {
    roadWrapBound: 140,
    platformWrapBound: 160,
    vehicleSafeDistanceBuffer: 50,
    platformSafeDistanceBuffer: 40,
  },
  phases: {
    phase2DeliveryThreshold: 1, // Порог доставленных заказов для активации Фазы 2 (Час пик)
    phase1: {
      vehicleSpeedMultiplier: 1.0,
      hyperloopChance: 0.76,
      hyperloopMinWait: 4.5,
      hyperloopMaxWait: 9.0,
    },
    phase2: {
      vehicleSpeedMultiplier: 1.10, // Мягкое ускорение +10%
      hyperloopChance: 0.82,
      hyperloopMinWait: 2.5,
      hyperloopMaxWait: 5.5,
    },
  },
} as const;

// Удобные именованные константы для прямой деструктуризации
export const {
  display: {
    width: GAME_WIDTH,
    height: GAME_HEIGHT,
    tileSize: TILE_SIZE,
    gridCols: GRID_COLS,
    cameraOffsetY: CAMERA_OFFSET_Y,
    hopDuration: HOP_DURATION,
    maxLanesBehind: MAX_LANES_BEHIND,
    lanesAhead: LANES_AHEAD,
  },
  pizza: {
    initialTemperature: INITIAL_TEMPERATURE,
    heatDecayPerSec: HEAT_DECAY_PER_SEC,
    heatBoostOnForward: HEAT_BOOST_ON_FORWARD,
    checkpointInterval: CHECKPOINT_INTERVAL,
    tipPerDelivery: TIP_PER_DELIVERY,
  },
  phases: {
    phase2DeliveryThreshold: PHASE_2_DELIVERY_THRESHOLD,
  },
} = GAME_CONFIG;

export function createGame(parent: string): Phaser.Game {
  const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent,
    width: GAME_CONFIG.display.width,
    height: GAME_CONFIG.display.height,
    backgroundColor: '#0f172a',
    scene: [GameScene],
    scale: {
      mode: Phaser.Scale.FIT,
      autoCenter: Phaser.Scale.CENTER_BOTH,
    },
  };

  return new Phaser.Game(config);
}
