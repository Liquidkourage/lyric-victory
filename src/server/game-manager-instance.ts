import type { GameManager } from "./game-manager";

let gameManager: GameManager | null = null;

export function setGameManager(manager: GameManager) {
  gameManager = manager;
}

export function getGameManager(): GameManager | null {
  return gameManager;
}
