const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number.parseInt(process.env.PORT || process.argv[2] || '8080', 10);
const ROOT = __dirname;
const TICK_RATE_MS = 50;
const MAX_PLAYERS = 8;
const WS_MAGIC = '258EAFA5-E914-47DA-95CA-C5AB0DC85B11';
const COLORS = ['#7fd7d9', '#f0a37f', '#f3d6a0', '#9ed3b0', '#d96a52', '#8bb5ff', '#d9c0ff', '#ffd166'];
const MIME_TYPES = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
};

const serverState = {
  session: null,
};
const wsConnections = new Set();

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function approach(value, target, maxDelta) {
  if (value < target) {
    return Math.min(value + maxDelta, target);
  }
  return Math.max(value - maxDelta, target);
}

function normalizeAngle(angle) {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function randomId() {
  return crypto.randomBytes(8).toString('hex');
}

function sanitizeName(name) {
  const cleaned = String(name || '')
    .trim()
    .replace(/[<>]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 18);
  return cleaned || 'Captain';
}

function zeroPlayerInput(player) {
  const input = {
    throttle: 0,
    turn: 0,
    firePort: false,
    fireStarboard: false,
  };
  if (player && typeof player === 'object') {
    player.input = input;
  }
  return input;
}

function projectPoint(x, y, angle, distanceAmount) {
  return {
    x: x + Math.cos(angle) * distanceAmount,
    y: y + Math.sin(angle) * distanceAmount,
  };
}

function makeIsland(id, name, x, y, radius, dockAngle) {
  const dock = projectPoint(x, y, dockAngle, radius + 54);
  return {
    id,
    name,
    kind: 'reload',
    x,
    y,
    radius,
    dockAngle,
    dockX: dock.x,
    dockY: dock.y,
    harborRadius: 62,
  };
}

function createMap() {
  return {
    name: 'Twin Relay',
    width: 3400,
    height: 2200,
    islands: [
      makeIsland('west-relay', 'West Relay', 760, 700, 170, 0.28),
      makeIsland('east-relay', 'East Relay', 2640, 1500, 180, -2.72),
    ],
    hazards: [
      { type: 'rock', x: 1180, y: 620, radius: 50 },
      { type: 'reef', x: 1460, y: 930, radius: 58 },
      { type: 'rock', x: 1830, y: 580, radius: 44 },
      { type: 'reef', x: 2150, y: 860, radius: 52 },
      { type: 'rock', x: 1650, y: 1420, radius: 46 },
      { type: 'rock', x: 2280, y: 1320, radius: 42 },
      { type: 'reef', x: 1120, y: 1630, radius: 48 },
      { type: 'rock', x: 1880, y: 1760, radius: 56 },
    ],
    spawns: [
      { x: 300, y: 360, angle: 0.45 },
      { x: 300, y: 1840, angle: -0.35 },
      { x: 1700, y: 260, angle: Math.PI / 2 },
      { x: 3100, y: 360, angle: Math.PI },
      { x: 3100, y: 1840, angle: Math.PI },
      { x: 1700, y: 1940, angle: -Math.PI / 2 },
      { x: 560, y: 1100, angle: 0 },
      { x: 2840, y: 1100, angle: Math.PI },
    ],
  };
}

function createPlayer(name, color) {
  return {
    id: randomId(),
    token: randomId(),
    name: sanitizeName(name),
    color,
    x: 0,
    y: 0,
    angle: 0,
    speed: 0,
    radius: 28,
    hull: 100,
    maxHull: 100,
    ammo: 12,
    maxAmmo: 12,
    volleySize: 1,
    portCooldown: 0,
    starboardCooldown: 0,
    collisionLock: 0,
    alive: true,
    connected: false,
    kills: 0,
    input: zeroPlayerInput(),
    lastReloadAt: -10,
  };
}

function resetPlayerForMatch(player, spawn) {
  player.x = spawn.x;
  player.y = spawn.y;
  player.angle = spawn.angle;
  player.speed = 0;
  player.hull = player.maxHull;
  player.ammo = player.maxAmmo;
  player.portCooldown = 0;
  player.starboardCooldown = 0;
  player.collisionLock = 0;
  player.alive = true;
  player.kills = 0;
  zeroPlayerInput(player);
  player.lastReloadAt = -10;
}

function logEvent(session, text) {
  session.feed.unshift({
    id: randomId(),
    text,
    time: Date.now(),
  });
  session.feed = session.feed.slice(0, 10);
}

function publicSession(session) {
  if (!session) {
    return { exists: false };
  }
  return {
    exists: true,
    status: session.status,
    mapName: session.map.name,
    maxPlayers: session.maxPlayers,
    playerCount: session.players.length,
    hostPlayerId: session.hostPlayerId,
    winnerId: session.winnerId,
    players: session.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      alive: player.alive,
      connected: player.connected,
      kills: player.kills,
    })),
  };
}

function fullState(session, playerId) {
  return {
    exists: true,
    status: session.status,
    mapName: session.map.name,
    maxPlayers: session.maxPlayers,
    hostPlayerId: session.hostPlayerId,
    winnerId: session.winnerId,
    playerId,
    time: session.time,
    map: {
      width: session.map.width,
      height: session.map.height,
      islands: session.map.islands,
      hazards: session.map.hazards,
    },
    players: session.players.map((player) => ({
      id: player.id,
      name: player.name,
      color: player.color,
      x: player.x,
      y: player.y,
      angle: player.angle,
      radius: player.radius,
      speed: player.speed,
      hull: player.hull,
      maxHull: player.maxHull,
      ammo: player.ammo,
      maxAmmo: player.maxAmmo,
      volleySize: player.volleySize,
      portCooldown: player.portCooldown,
      starboardCooldown: player.starboardCooldown,
      alive: player.alive,
      connected: player.connected,
      kills: player.kills,
    })),
    projectiles: session.projectiles.map((projectile) => ({
      x: projectile.x,
      y: projectile.y,
      radius: projectile.radius,
      color: projectile.color,
    })),
    feed: session.feed,
  };
}

function createSession(hostName, maxPlayers) {
  const hostPlayer = createPlayer(hostName, COLORS[0]);
  const hostToken = randomId();
  const session = {
    id: randomId(),
    hostToken,
    hostPlayerId: hostPlayer.id,
    status: 'lobby',
    maxPlayers: clamp(maxPlayers, 2, MAX_PLAYERS),
    players: [hostPlayer],
    map: createMap(),
    projectiles: [],
    feed: [],
    time: 0,
    winnerId: null,
  };
  logEvent(session, hostPlayer.name + ' created a ' + session.maxPlayers + '-player lobby.');
  return { session, hostPlayer };
}

function encodeWsFrame(payload, opcode = 0x1) {
  const body = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload));
  let header;

  if (body.length < 126) {
    header = Buffer.alloc(2);
    header[1] = body.length;
  } else if (body.length < 65_536) {
    header = Buffer.alloc(4);
    header[1] = 126;
    header.writeUInt16BE(body.length, 2);
  } else {
    header = Buffer.alloc(10);
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(body.length), 2);
  }

  header[0] = 0x80 | opcode;
  return Buffer.concat([header, body]);
}

function sendWsJson(connection, payload) {
  if (!connection || connection.closed || connection.socket.destroyed || !connection.socket.writable) {
    return;
  }
  connection.socket.write(encodeWsFrame(Buffer.from(JSON.stringify(payload), 'utf8')));
}

function sendWsClose(connection, code = 1000, reason = '') {
  if (!connection || connection.closed || connection.socket.destroyed || !connection.socket.writable) {
    return;
  }
  const reasonBuffer = Buffer.from(String(reason).slice(0, 120), 'utf8');
  const payload = Buffer.alloc(2 + reasonBuffer.length);
  payload.writeUInt16BE(code, 0);
  reasonBuffer.copy(payload, 2);
  connection.socket.write(encodeWsFrame(payload, 0x8));
}

function hasActivePlayerSocket(playerId, excludingConnection) {
  for (const connection of wsConnections) {
    if (connection === excludingConnection || connection.closed) {
      continue;
    }
    if (connection.playerId === playerId) {
      return true;
    }
  }
  return false;
}

function sendSessionEnvelope(connection) {
  sendWsJson(connection, {
    type: 'session',
    session: publicSession(serverState.session),
  });
}

function broadcastSession() {
  for (const connection of wsConnections) {
    sendSessionEnvelope(connection);
  }
}

function sendSnapshotEnvelope(connection, session) {
  if (!connection.playerId || !session) {
    return;
  }
  const player = findPlayer(session, connection.playerId);
  if (!player) {
    sendSessionEnvelope(connection);
    return;
  }
  sendWsJson(connection, {
    type: 'snapshot',
    snapshot: fullState(session, player.id),
  });
}

function broadcastSnapshots(session) {
  if (!session) {
    return;
  }
  for (const connection of wsConnections) {
    if (connection.playerId) {
      sendSnapshotEnvelope(connection, session);
    }
  }
}

function cleanUpConnection(connection) {
  if (!connection || connection.cleanedUp) {
    return;
  }
  connection.cleanedUp = true;
  connection.closed = true;
  wsConnections.delete(connection);

  if (!connection.playerId) {
    return;
  }
  const session = serverState.session;
  const player = session ? findPlayer(session, connection.playerId) : null;
  if (player && !hasActivePlayerSocket(player.id, connection)) {
    player.connected = false;
    zeroPlayerInput(player);
    broadcastSession();
  }
}

function closeConnection(connection, code = 1000, reason = '') {
  if (!connection || connection.closed) {
    return;
  }
  try {
    sendWsClose(connection, code, reason);
  } catch (error) {
    // Ignore close-frame failures and fall through to socket teardown.
  }
  connection.closed = true;
  connection.socket.destroy();
  cleanUpConnection(connection);
}

function parseWsFrame(buffer) {
  if (buffer.length < 2) {
    return null;
  }

  const firstByte = buffer[0];
  const secondByte = buffer[1];
  const opcode = firstByte & 0x0f;
  const masked = (secondByte & 0x80) !== 0;
  let payloadLength = secondByte & 0x7f;
  let offset = 2;

  if (payloadLength === 126) {
    if (buffer.length < offset + 2) {
      return null;
    }
    payloadLength = buffer.readUInt16BE(offset);
    offset += 2;
  } else if (payloadLength === 127) {
    if (buffer.length < offset + 8) {
      return null;
    }
    const bigLength = buffer.readBigUInt64BE(offset);
    if (bigLength > BigInt(Number.MAX_SAFE_INTEGER)) {
      throw new Error('WebSocket frame is too large.');
    }
    payloadLength = Number(bigLength);
    offset += 8;
  }

  if (!masked) {
    throw new Error('Client frames must be masked.');
  }
  if (buffer.length < offset + 4 + payloadLength) {
    return null;
  }

  const mask = buffer.subarray(offset, offset + 4);
  offset += 4;
  const payload = Buffer.alloc(payloadLength);
  for (let index = 0; index < payloadLength; index += 1) {
    payload[index] = buffer[offset + index] ^ mask[index % 4];
  }

  return {
    opcode,
    payload,
    length: offset + payloadLength,
  };
}

function applySocketInput(connection, message) {
  const session = serverState.session;
  if (!session || session.status !== 'playing' || !connection.playerId) {
    return;
  }
  const player = findPlayer(session, connection.playerId);
  if (!player || !player.alive) {
    return;
  }
  player.input.throttle = clamp(Number(message.throttle) || 0, -1, 1);
  player.input.turn = clamp(Number(message.turn) || 0, -1, 1);
  if (message.firePort) {
    player.input.firePort = true;
  }
  if (message.fireStarboard) {
    player.input.fireStarboard = true;
  }
}

function handleSocketMessage(connection, rawPayload) {
  if (!connection.playerId) {
    return;
  }

  let message;
  try {
    message = JSON.parse(rawPayload.toString('utf8'));
  } catch (error) {
    closeConnection(connection, 1003, 'Invalid JSON payload.');
    return;
  }

  if (!message || typeof message !== 'object') {
    return;
  }
  if (message.type === 'input') {
    applySocketInput(connection, message);
  }
}

function handleSocketData(connection, chunk) {
  connection.buffer = Buffer.concat([connection.buffer, chunk]);

  while (connection.buffer.length) {
    let frame;
    try {
      frame = parseWsFrame(connection.buffer);
    } catch (error) {
      closeConnection(connection, 1002, error.message);
      return;
    }

    if (!frame) {
      return;
    }

    connection.buffer = connection.buffer.subarray(frame.length);

    if (frame.opcode === 0x8) {
      closeConnection(connection, 1000, 'Client closed the connection.');
      return;
    }
    if (frame.opcode === 0x9) {
      if (!connection.socket.destroyed) {
        connection.socket.write(encodeWsFrame(frame.payload, 0xA));
      }
      continue;
    }
    if (frame.opcode === 0xA) {
      continue;
    }
    if (frame.opcode === 0x1) {
      handleSocketMessage(connection, frame.payload);
      continue;
    }

    closeConnection(connection, 1003, 'Unsupported WebSocket opcode.');
    return;
  }
}

function findPlayer(session, playerId) {
  return session.players.find((player) => player.id === playerId) || null;
}

function authenticatePlayer(session, playerId, playerToken) {
  const player = findPlayer(session, playerId);
  if (!player || player.token !== playerToken) {
    return null;
  }
  return player;
}

function applyDamage(session, player, amount, attackerId, reason) {
  if (!player.alive) {
    return;
  }
  player.hull = Math.max(0, player.hull - amount);
  if (player.hull > 0) {
    return;
  }

  player.alive = false;
  player.speed = 0;
  let attacker = null;
  if (attackerId) {
    attacker = findPlayer(session, attackerId);
  }
  if (attacker && attacker.id !== player.id) {
    attacker.kills += 1;
    logEvent(session, player.name + ' was sunk by ' + attacker.name + '.');
  } else {
    logEvent(session, player.name + ' sank' + (reason ? ' after ' + reason : '.') + '.');
  }
}

function pushFromObstacle(session, player, obstacle, impactScale, lethalReef) {
  const dx = player.x - obstacle.x;
  const dy = player.y - obstacle.y;
  const distanceAway = Math.hypot(dx, dy) || 1;
  const minimumDistance = player.radius + obstacle.radius;
  if (distanceAway >= minimumDistance) {
    return;
  }

  const overlap = minimumDistance - distanceAway;
  const nx = dx / distanceAway;
  const ny = dy / distanceAway;
  player.x += nx * overlap;
  player.y += ny * overlap;

  const impact = Math.abs(player.speed);
  player.speed *= 0.16;
  if (player.collisionLock <= 0) {
    let damage = impact * impactScale;
    if (obstacle.type === 'reef' && lethalReef && impact > 165) {
      damage = player.maxHull * 2;
    }
    if (damage > 4) {
      applyDamage(session, player, damage, null, obstacle.type + ' collision');
    }
    player.collisionLock = 0.25;
  }
}

function resolvePlayerCollisions(session, player) {
  for (const island of session.map.islands) {
    pushFromObstacle(session, player, island, 0.14, false);
  }
  for (const hazard of session.map.hazards) {
    const impactScale = hazard.type === 'reef' ? 0.24 : 0.18;
    pushFromObstacle(session, player, hazard, impactScale, true);
  }
}

function handleReloadIslands(session, player) {
  for (const island of session.map.islands) {
    const distanceToDock = Math.hypot(player.x - island.dockX, player.y - island.dockY);
    if (distanceToDock > island.harborRadius + player.radius) {
      continue;
    }
    if (player.ammo < player.maxAmmo && session.time - player.lastReloadAt > 0.85) {
      player.ammo = player.maxAmmo;
      player.lastReloadAt = session.time;
      logEvent(session, player.name + ' reloaded at ' + island.name + '.');
    }
  }
}

function fireBroadside(session, player, side) {
  if (!player.alive || player.ammo <= 0) {
    return;
  }

  const cooldownKey = side === 'port' ? 'portCooldown' : 'starboardCooldown';
  if (player[cooldownKey] > 0) {
    return;
  }

  const sideAngle = player.angle + (side === 'port' ? -Math.PI / 2 : Math.PI / 2);
  const spawn = projectPoint(player.x, player.y, sideAngle, player.radius + 10);
  const speed = rand(450, 520);
  session.projectiles.push({
    ownerId: player.id,
    x: spawn.x,
    y: spawn.y,
    vx: Math.cos(sideAngle + rand(-0.025, 0.025)) * speed,
    vy: Math.sin(sideAngle + rand(-0.025, 0.025)) * speed,
    radius: 6,
    damage: 22,
    ttl: 2.7,
    color: player.color,
  });
  player.ammo -= 1;
  player[cooldownKey] = 0.9;
}

function updatePlayer(session, player, dt) {
  if (!player.alive) {
    return;
  }

  player.portCooldown = Math.max(0, player.portCooldown - dt);
  player.starboardCooldown = Math.max(0, player.starboardCooldown - dt);
  player.collisionLock = Math.max(0, player.collisionLock - dt);

  const throttleInput = clamp(player.input.throttle, -1, 1);
  const turnInput = clamp(player.input.turn, -1, 1);
  const maxSpeed = 248;
  const reverseSpeed = 86;
  const acceleration = 185;
  const targetSpeed = throttleInput >= 0 ? throttleInput * maxSpeed : throttleInput * reverseSpeed;

  player.speed = approach(player.speed, targetSpeed, acceleration * dt);
  player.speed *= 1 - 0.48 * dt;
  const steerScale = 0.3 + Math.min(1, Math.abs(player.speed) / maxSpeed);
  player.angle = normalizeAngle(player.angle + turnInput * 1.95 * steerScale * dt);

  player.x += Math.cos(player.angle) * player.speed * dt;
  player.y += Math.sin(player.angle) * player.speed * dt;
  player.x = clamp(player.x, player.radius, session.map.width - player.radius);
  player.y = clamp(player.y, player.radius, session.map.height - player.radius);

  resolvePlayerCollisions(session, player);
  handleReloadIslands(session, player);

  if (player.input.firePort) {
    fireBroadside(session, player, 'port');
    player.input.firePort = false;
  }
  if (player.input.fireStarboard) {
    fireBroadside(session, player, 'starboard');
    player.input.fireStarboard = false;
  }
}

function updateProjectiles(session, dt) {
  for (let index = session.projectiles.length - 1; index >= 0; index -= 1) {
    const projectile = session.projectiles[index];
    projectile.x += projectile.vx * dt;
    projectile.y += projectile.vy * dt;
    projectile.ttl -= dt;

    if (
      projectile.ttl <= 0 ||
      projectile.x < -50 ||
      projectile.y < -50 ||
      projectile.x > session.map.width + 50 ||
      projectile.y > session.map.height + 50
    ) {
      session.projectiles.splice(index, 1);
      continue;
    }

    let destroyed = false;
    for (const island of session.map.islands) {
      const distanceToIsland = Math.hypot(projectile.x - island.x, projectile.y - island.y);
      if (distanceToIsland <= projectile.radius + island.radius) {
        session.projectiles.splice(index, 1);
        destroyed = true;
        break;
      }
    }
    if (destroyed) {
      continue;
    }

    for (const hazard of session.map.hazards) {
      const distanceToHazard = Math.hypot(projectile.x - hazard.x, projectile.y - hazard.y);
      if (distanceToHazard <= projectile.radius + hazard.radius) {
        session.projectiles.splice(index, 1);
        destroyed = true;
        break;
      }
    }
    if (destroyed) {
      continue;
    }

    for (const player of session.players) {
      if (!player.alive || player.id === projectile.ownerId) {
        continue;
      }
      const hitDistance = Math.hypot(projectile.x - player.x, projectile.y - player.y);
      if (hitDistance <= projectile.radius + player.radius) {
        applyDamage(session, player, projectile.damage, projectile.ownerId, 'enemy fire');
        session.projectiles.splice(index, 1);
        destroyed = true;
        break;
      }
    }
    if (destroyed) {
      continue;
    }
  }
}

function checkWinner(session) {
  if (session.status !== 'playing') {
    return;
  }
  const alivePlayers = session.players.filter((player) => player.alive);
  if (session.players.length > 1 && alivePlayers.length <= 1) {
    session.status = 'finished';
    session.winnerId = alivePlayers[0] ? alivePlayers[0].id : null;
    if (alivePlayers[0]) {
      logEvent(session, alivePlayers[0].name + ' controls the sea.');
    } else {
      logEvent(session, 'No ship survived the engagement.');
    }
    broadcastSession();
  }
}

function startMatch(session) {
  session.status = 'playing';
  session.time = 0;
  session.winnerId = null;
  session.projectiles = [];
  session.feed = [];
  session.players.forEach((player, index) => {
    resetPlayerForMatch(player, session.map.spawns[index % session.map.spawns.length]);
  });
  logEvent(session, 'Match started with ' + session.players.length + ' captains.');
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 1_000_000) {
        reject(new Error('Request body too large.'));
        req.destroy();
      }
    });
    req.on('end', () => {
      if (!raw) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(raw));
      } catch (error) {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });
}

function json(res, statusCode, payload) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
  });
  res.end(JSON.stringify(payload));
}

function findStaticFile(urlPath) {
  const requestedPath = urlPath === '/' ? '/multiplayer.html' : urlPath;
  const normalized = path.normalize(requestedPath).replace(/^([.][.][/\\])+/, '');
  const fullPath = path.join(ROOT, normalized);
  if (!fullPath.startsWith(ROOT)) {
    return null;
  }
  return fullPath;
}

async function handleApi(req, res, pathname) {
  if (req.method === 'GET' && pathname === '/api/session') {
    json(res, 200, publicSession(serverState.session));
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/lobby/create') {
    const body = await readJsonBody(req);
    if (serverState.session) {
      json(res, 409, { error: 'A session already exists on this server.' });
      return true;
    }
    const maxPlayers = clamp(Number.parseInt(body.maxPlayers || '4', 10) || 4, 2, MAX_PLAYERS);
    const created = createSession(body.name, maxPlayers);
    serverState.session = created.session;
    broadcastSession();
    json(res, 201, {
      playerId: created.hostPlayer.id,
      playerToken: created.hostPlayer.token,
      hostToken: created.session.hostToken,
      session: publicSession(created.session),
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/lobby/join') {
    const body = await readJsonBody(req);
    const session = serverState.session;
    if (!session) {
      json(res, 404, { error: 'No active server session. Ask the host to create one first.' });
      return true;
    }
    if (session.status !== 'lobby') {
      json(res, 409, { error: 'The match is already running. Wait for the host to close it.' });
      return true;
    }
    if (session.players.length >= session.maxPlayers) {
      json(res, 409, { error: 'The lobby is already full.' });
      return true;
    }
    const player = createPlayer(body.name, COLORS[session.players.length % COLORS.length]);
    session.players.push(player);
    logEvent(session, player.name + ' joined the lobby.');
    broadcastSession();
    json(res, 201, {
      playerId: player.id,
      playerToken: player.token,
      session: publicSession(session),
    });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/lobby/leave') {
    const body = await readJsonBody(req);
    const session = serverState.session;
    if (!session) {
      json(res, 404, { error: 'No active session.' });
      return true;
    }
    const player = findPlayer(session, body.playerId);
    if (!player) {
      json(res, 404, { error: 'Player was not found in this session.' });
      return true;
    }
    if (player.id === session.hostPlayerId) {
      json(res, 403, { error: 'The host must close the session instead of leaving it.' });
      return true;
    }
    if (session.status === 'playing') {
      json(res, 409, { error: 'Players cannot leave while a match is in progress.' });
      return true;
    }
    session.players = session.players.filter((entry) => entry.id !== player.id);
    logEvent(session, player.name + ' left the lobby.');
    broadcastSession();
    json(res, 200, { session: publicSession(session) });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/lobby/start') {
    const body = await readJsonBody(req);
    const session = serverState.session;
    if (!session) {
      json(res, 404, { error: 'No active session.' });
      return true;
    }
    if (body.hostToken !== session.hostToken || body.playerId !== session.hostPlayerId) {
      json(res, 403, { error: 'Only the host can start the match.' });
      return true;
    }
    startMatch(session);
    broadcastSession();
    broadcastSnapshots(session);
    json(res, 200, { session: publicSession(session) });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/lobby/close') {
    const body = await readJsonBody(req);
    const session = serverState.session;
    if (!session) {
      json(res, 404, { error: 'No active session.' });
      return true;
    }
    if (body.hostToken !== session.hostToken || body.playerId !== session.hostPlayerId) {
      json(res, 403, { error: 'Only the host can close the match.' });
      return true;
    }
    serverState.session = null;
    broadcastSession();
    json(res, 200, { ok: true });
    return true;
  }

  if (req.method === 'POST' && pathname === '/api/sync') {
    const body = await readJsonBody(req);
    const session = serverState.session;
    if (!session) {
      json(res, 404, { exists: false, error: 'No active session.' });
      return true;
    }
    const player = findPlayer(session, body.playerId);
    if (!player) {
      json(res, 404, { exists: true, error: 'Player was not found in this session.' });
      return true;
    }
    if (session.status === 'playing' && player.alive) {
      player.input.throttle = clamp(Number(body.throttle) || 0, -1, 1);
      player.input.turn = clamp(Number(body.turn) || 0, -1, 1);
      if (body.firePort) {
        player.input.firePort = true;
      }
      if (body.fireStarboard) {
        player.input.fireStarboard = true;
      }
    }
    json(res, 200, fullState(session, player.id));
    return true;
  }

  return false;
}

function serveStatic(req, res, pathname) {
  const filePath = findStaticFile(pathname);
  if (!filePath) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Forbidden');
    return;
  }

  fs.readFile(filePath, (error, data) => {
    if (error) {
      if (error.code === 'ENOENT') {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end('Not found');
        return;
      }
      res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Server error');
      return;
    }
    const extension = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[extension] || 'application/octet-stream',
      'Cache-Control': extension === '.html' ? 'no-store' : 'public, max-age=60',
    });
    res.end(data);
  });
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    const handled = await handleApi(req, res, url.pathname);
    if (handled) {
      return;
    }
    serveStatic(req, res, url.pathname);
  } catch (error) {
    json(res, 500, { error: error.message || 'Unexpected server error.' });
  }
});

function rejectUpgrade(socket, statusCode, message) {
  const body = String(message || 'WebSocket upgrade failed.');
  socket.write(
    'HTTP/1.1 ' + statusCode + '\r\n' +
    'Connection: close\r\n' +
    'Content-Type: text/plain; charset=utf-8\r\n' +
    'Content-Length: ' + Buffer.byteLength(body, 'utf8') + '\r\n' +
    '\r\n' +
    body
  );
  socket.destroy();
}

server.on('upgrade', (req, socket, head) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname !== '/ws') {
      rejectUpgrade(socket, '404 Not Found', 'Not found');
      return;
    }

    const key = req.headers['sec-websocket-key'];
    if (!key || req.headers['sec-websocket-version'] !== '13') {
      rejectUpgrade(socket, '400 Bad Request', 'Unsupported WebSocket request.');
      return;
    }

    const wantsWatcher = url.searchParams.get('watch') === '1';
    let player = null;
    if (!wantsWatcher) {
      const session = serverState.session;
      const playerId = url.searchParams.get('playerId');
      const playerToken = url.searchParams.get('playerToken');
      if (!session || !playerId || !playerToken) {
        rejectUpgrade(socket, '401 Unauthorized', 'Player authentication is required.');
        return;
      }
      player = authenticatePlayer(session, playerId, playerToken);
      if (!player) {
        rejectUpgrade(socket, '401 Unauthorized', 'Player authentication failed.');
        return;
      }
    }

    const accept = crypto.createHash('sha1').update(String(key) + WS_MAGIC).digest('base64');
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
      'Upgrade: websocket\r\n' +
      'Connection: Upgrade\r\n' +
      'Sec-WebSocket-Accept: ' + accept + '\r\n' +
      '\r\n'
    );

    const connection = {
      socket,
      playerId: player ? player.id : '',
      buffer: Buffer.alloc(0),
      closed: false,
      cleanedUp: false,
    };
    wsConnections.add(connection);

    socket.on('data', (chunk) => handleSocketData(connection, chunk));
    socket.on('close', () => cleanUpConnection(connection));
    socket.on('end', () => cleanUpConnection(connection));
    socket.on('error', () => cleanUpConnection(connection));

    if (player) {
      for (const existing of wsConnections) {
        if (existing === connection || existing.playerId !== player.id) {
          continue;
        }
        closeConnection(existing, 1000, 'Replaced by a newer connection.');
      }
      player.connected = true;
      zeroPlayerInput(player);
      broadcastSession();
    }

    sendSessionEnvelope(connection);
    if (player && serverState.session && serverState.session.status !== 'lobby') {
      sendSnapshotEnvelope(connection, serverState.session);
    }

    if (head && head.length) {
      handleSocketData(connection, head);
    }
  } catch (error) {
    rejectUpgrade(socket, '500 Internal Server Error', error.message || 'Unexpected upgrade error.');
  }
});

setInterval(() => {
  const session = serverState.session;
  if (!session || session.status !== 'playing') {
    return;
  }

  const dt = TICK_RATE_MS / 1000;
  session.time += dt;
  session.players.forEach((player) => updatePlayer(session, player, dt));
  updateProjectiles(session, dt);
  checkWinner(session);
  broadcastSnapshots(session);
}, TICK_RATE_MS);

function printLanUrls(port) {
  const interfaces = os.networkInterfaces();
  const urls = [];
  for (const values of Object.values(interfaces)) {
    for (const entry of values || []) {
      if (entry.family === 'IPv4' && !entry.internal) {
        urls.push('http://' + entry.address + ':' + port);
      }
    }
  }
  if (!urls.length) {
    console.log('LAN URL: no external IPv4 address detected automatically.');
    return;
  }
  urls.forEach((url) => {
    console.log('LAN URL:', url);
  });
}

server.listen(PORT, HOST, () => {
  console.log('The Battles LAN server is running.');
  console.log('Local URL: http://localhost:' + PORT);
  printLanUrls(PORT);
  console.log('Share one of the LAN URLs above with devices on the same network.');
});
