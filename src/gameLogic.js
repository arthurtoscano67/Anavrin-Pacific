export const DIRECTIONS = Object.freeze({
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
});

export const OPPOSITE_DIRECTION = Object.freeze({
  up: "down",
  down: "up",
  left: "right",
  right: "left",
});

function sameCell(a, b) {
  return a.x === b.x && a.y === b.y;
}

function hasCell(cells, candidate) {
  return cells.some((cell) => sameCell(cell, candidate));
}

export function spawnFood(rng, gridSize, snake) {
  const freeCells = [];

  for (let y = 0; y < gridSize; y += 1) {
    for (let x = 0; x < gridSize; x += 1) {
      const cell = { x, y };
      if (!hasCell(snake, cell)) {
        freeCells.push(cell);
      }
    }
  }

  if (freeCells.length === 0) {
    return null;
  }

  const index = Math.floor(rng() * freeCells.length);
  return freeCells[Math.min(index, freeCells.length - 1)];
}

export function createInitialState(options = {}) {
  const { gridSize = 20, rng = Math.random } = options;
  const center = Math.floor(gridSize / 2);
  const snake = [
    { x: center, y: center },
    { x: center - 1, y: center },
    { x: center - 2, y: center },
  ];
  const food = spawnFood(rng, gridSize, snake);

  return {
    gridSize,
    snake,
    direction: "right",
    pendingDirection: "right",
    food,
    score: 0,
    status: food ? "running" : "game-over",
  };
}

export function setDirection(state, direction) {
  if (!DIRECTIONS[direction]) {
    return state;
  }

  const activeDirection = state.pendingDirection || state.direction;
  if (OPPOSITE_DIRECTION[activeDirection] === direction) {
    return state;
  }

  return {
    ...state,
    pendingDirection: direction,
  };
}

function moveHead(head, direction) {
  const vector = DIRECTIONS[direction];
  return {
    x: head.x + vector.x,
    y: head.y + vector.y,
  };
}

function isOutOfBounds(cell, gridSize) {
  return cell.x < 0 || cell.x >= gridSize || cell.y < 0 || cell.y >= gridSize;
}

function hasSelfCollision(snake) {
  const [head, ...body] = snake;
  return hasCell(body, head);
}

export function stepState(state, rng = Math.random) {
  if (state.status !== "running") {
    return state;
  }

  const nextDirection = state.pendingDirection || state.direction;
  const nextHead = moveHead(state.snake[0], nextDirection);

  if (isOutOfBounds(nextHead, state.gridSize)) {
    return {
      ...state,
      direction: nextDirection,
      pendingDirection: nextDirection,
      status: "game-over",
    };
  }

  const isEating = state.food && sameCell(nextHead, state.food);
  const nextSnake = [nextHead, ...state.snake];

  if (!isEating) {
    nextSnake.pop();
  }

  if (hasSelfCollision(nextSnake)) {
    return {
      ...state,
      snake: nextSnake,
      direction: nextDirection,
      pendingDirection: nextDirection,
      status: "game-over",
    };
  }

  if (!isEating) {
    return {
      ...state,
      snake: nextSnake,
      direction: nextDirection,
      pendingDirection: nextDirection,
    };
  }

  const nextFood = spawnFood(rng, state.gridSize, nextSnake);
  return {
    ...state,
    snake: nextSnake,
    direction: nextDirection,
    pendingDirection: nextDirection,
    food: nextFood,
    score: state.score + 1,
    status: nextFood ? "running" : "game-over",
  };
}
