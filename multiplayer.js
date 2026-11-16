(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  const stage = document.getElementById('stage');
  const minimap = document.getElementById('minimap');
  const minimapCtx = minimap.getContext('2d');

  const objectiveText = document.getElementById('objectiveText');
  const sessionPanel = document.getElementById('sessionPanel');
  const statusPanel = document.getElementById('statusPanel');
  const weaponPanel = document.getElementById('weaponPanel');
  const logPanel = document.getElementById('logPanel');
  const menuOverlay = document.getElementById('menuOverlay');
  const overlayTitle = document.getElementById('overlayTitle');
  const overlayCopy = document.getElementById('overlayCopy');
  const menuContent = document.getElementById('menuContent');

  const TAU = Math.PI * 2;
  const VIEW = { width: 1280, height: 720, dpr: 1 };
  const STORAGE_KEYS = {
    playerId: 'thebattles.lan.playerId',
    playerToken: 'thebattles.lan.playerToken',
    playerName: 'thebattles.lan.playerName',
    hostToken: 'thebattles.lan.hostToken',
  };

  const keys = new Set();
  const app = {
    session: null,
    snapshot: null,
    playerId: localStorage.getItem(STORAGE_KEYS.playerId) || '',
    playerToken: localStorage.getItem(STORAGE_KEYS.playerToken) || '',
    playerName: localStorage.getItem(STORAGE_KEYS.playerName) || 'Captain',
    hostToken: localStorage.getItem(STORAGE_KEYS.hostToken) || '',
    menuMode: 'create',
    lastError: '',
    socket: null,
    socketMode: 'none',
    reconnectTimer: 0,
    reconnectDelay: 800,
    networkBusy: false,
    lastSessionPollAt: 0,
    firePortQueued: false,
    fireStarboardQueued: false,
    camera: {
      x: 0,
      y: 0,
    },
  };

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
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function saveIdentity() {
    if (app.playerId) {
      localStorage.setItem(STORAGE_KEYS.playerId, app.playerId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.playerId);
    }
    if (app.playerToken) {
      localStorage.setItem(STORAGE_KEYS.playerToken, app.playerToken);
    } else {
      localStorage.removeItem(STORAGE_KEYS.playerToken);
    }
    if (app.playerName) {
      localStorage.setItem(STORAGE_KEYS.playerName, app.playerName);
    }
    if (app.hostToken) {
      localStorage.setItem(STORAGE_KEYS.hostToken, app.hostToken);
    } else {
      localStorage.removeItem(STORAGE_KEYS.hostToken);
    }
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function clearIdentity() {
    app.playerId = '';
    app.playerToken = '';
    app.hostToken = '';
    saveIdentity();
  }

  async function apiRequest(path, options) {
    const response = await fetch(path, {
      headers: {
        'Content-Type': 'application/json',
      },
      cache: 'no-store',
      ...options,
    });

    const data = await response.json().catch(function () {
      return {};
    });

    if (!response.ok) {
      throw new Error(data.error || 'Request failed.');
    }
    return data;
  }

  function getPublicSessionPlayers() {
    return app.session && app.session.players ? app.session.players : [];
  }

  function getAssignedPlayer() {
    if (app.snapshot && app.snapshot.players) {
      return app.snapshot.players.find(function (player) {
        return player.id === app.playerId;
      }) || null;
    }
    const sessionPlayer = getPublicSessionPlayers().find(function (player) {
      return player.id === app.playerId;
    });
    return sessionPlayer || null;
  }

  function getCurrentPlayer() {
    if (!app.snapshot || !app.snapshot.players) {
      return null;
    }
    return app.snapshot.players.find(function (player) {
      return player.id === app.playerId;
    }) || null;
  }

  function getDisplayTarget() {
    if (!app.snapshot || !app.snapshot.players) {
      return null;
    }
    const self = getCurrentPlayer();
    const aliveOthers = app.snapshot.players.filter(function (player) {
      return player.id !== app.playerId && player.alive;
    });
    if (aliveOthers.length) {
      if (!self) {
        return aliveOthers[0];
      }
      aliveOthers.sort(function (left, right) {
        return distance(left, self) - distance(right, self);
      });
      return aliveOthers[0];
    }
    if (app.snapshot.winnerId) {
      return app.snapshot.players.find(function (player) {
        return player.id === app.snapshot.winnerId;
      }) || null;
    }
    return null;
  }

  function getSessionStatusText() {
    if (!app.session || !app.session.exists) {
      return 'No active LAN session.';
    }
    if (app.session.status === 'lobby') {
      return 'Lobby open: ' + app.session.playerCount + ' / ' + app.session.maxPlayers + ' captains.';
    }
    if (app.session.status === 'playing') {
      return 'Match live on ' + app.session.mapName + '.';
    }
    return 'Match finished on ' + app.session.mapName + '.';
  }

  function setOverlayVisible(visible) {
    if (visible) {
      menuOverlay.classList.remove('hidden');
    } else {
      menuOverlay.classList.add('hidden');
    }
  }

  function applySession(session) {
    app.session = session;
    app.lastError = '';

    if (!session.exists) {
      app.snapshot = null;
      clearIdentity();
    } else if (app.playerId) {
      const stillPresent = session.players.some(function (player) {
        return player.id === app.playerId;
      });
      if (!stillPresent) {
        app.snapshot = null;
        clearIdentity();
      }
    }

    renderMenu();
    updateHud();
    ensureSocket();
  }

  function deriveSessionFromSnapshot(snapshot) {
    return {
      exists: true,
      status: snapshot.status,
      mapName: snapshot.mapName,
      maxPlayers: snapshot.maxPlayers,
      playerCount: snapshot.players.length,
      hostPlayerId: snapshot.hostPlayerId,
      winnerId: snapshot.winnerId,
      players: snapshot.players.map(function (player) {
        return {
          id: player.id,
          name: player.name,
          color: player.color,
          alive: player.alive,
          connected: player.connected,
          kills: player.kills,
        };
      }),
    };
  }

  function applySnapshot(snapshot) {
    app.snapshot = snapshot;
    app.session = deriveSessionFromSnapshot(snapshot);
    app.lastError = '';
    renderMenu();
    updateHud();
    ensureSocket();
  }

  function desiredSocketMode() {
    if (
      app.playerId &&
      app.playerToken &&
      app.session &&
      app.session.exists &&
      app.session.players.some(function (player) {
        return player.id === app.playerId;
      })
    ) {
      return 'player';
    }
    return 'watch';
  }

  function socketUrlForMode(mode) {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = new URL(protocol + '//' + window.location.host + '/ws');
    if (mode === 'player') {
      url.searchParams.set('playerId', app.playerId);
      url.searchParams.set('playerToken', app.playerToken);
    } else {
      url.searchParams.set('watch', '1');
    }
    return url.toString();
  }

  function hasOpenSocket(mode) {
    return Boolean(
      app.socket &&
      app.socket.readyState === WebSocket.OPEN &&
      (!mode || app.socketMode === mode)
    );
  }

  function clearReconnectTimer() {
    if (app.reconnectTimer) {
      window.clearTimeout(app.reconnectTimer);
      app.reconnectTimer = 0;
    }
  }

  function disconnectSocket() {
    clearReconnectTimer();
    if (!app.socket) {
      app.socketMode = 'none';
      return;
    }
    const socket = app.socket;
    app.socket = null;
    app.socketMode = 'none';
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.onerror = null;
    try {
      socket.close();
    } catch (error) {
      // Ignore close failures during reconnect mode switches.
    }
  }

  function scheduleReconnect() {
    clearReconnectTimer();
    app.reconnectTimer = window.setTimeout(function () {
      refreshSession()
        .catch(function () {
          return null;
        })
        .finally(function () {
          connectSocket();
        });
    }, app.reconnectDelay);
    app.reconnectDelay = Math.min(3200, Math.round(app.reconnectDelay * 1.35));
  }

  function handleSocketEnvelope(payload) {
    if (!payload || typeof payload !== 'object') {
      return;
    }

    if (payload.type === 'session' && payload.session) {
      applySession(payload.session);
      return;
    }

    if (payload.type === 'snapshot' && payload.snapshot) {
      applySnapshot(payload.snapshot);
    }
  }

  function connectSocket() {
    const mode = desiredSocketMode();
    if (
      app.socket &&
      (app.socket.readyState === WebSocket.OPEN || app.socket.readyState === WebSocket.CONNECTING) &&
      app.socketMode === mode
    ) {
      return;
    }

    disconnectSocket();

    const socket = new WebSocket(socketUrlForMode(mode));
    app.socket = socket;
    app.socketMode = mode;

    socket.onopen = function () {
      if (app.socket !== socket) {
        return;
      }
      app.reconnectDelay = 800;
      app.lastError = '';
      renderMenu();
      updateHud();
    };

    socket.onmessage = function (event) {
      if (app.socket !== socket) {
        return;
      }
      try {
        handleSocketEnvelope(JSON.parse(event.data));
      } catch (error) {
        app.lastError = 'Received an invalid server message.';
      }
    };

    socket.onclose = function () {
      if (app.socket !== socket) {
        return;
      }
      app.socket = null;
      app.socketMode = 'none';
      scheduleReconnect();
      renderMenu();
      updateHud();
    };

    socket.onerror = function () {
      if (app.socket !== socket) {
        return;
      }
      app.lastError = 'Lost connection to the LAN server. Reconnecting...';
    };
  }

  function ensureSocket() {
    const mode = desiredSocketMode();
    if (app.socket && app.socketMode === mode) {
      return;
    }
    connectSocket();
  }

  async function refreshSession() {
    try {
      const session = await apiRequest('/api/session', { method: 'GET' });
      applySession(session);
    } catch (error) {
      app.lastError = error.message;
      renderMenu();
      updateHud();
      throw error;
    }
  }

  async function createLobby() {
    const nameInput = document.getElementById('hostNameInput');
    const maxPlayersInput = document.getElementById('maxPlayersInput');
    app.playerName = (nameInput && nameInput.value.trim()) || app.playerName || 'Captain';
    const maxPlayers = maxPlayersInput ? Number(maxPlayersInput.value) : 4;

    try {
      const data = await apiRequest('/api/lobby/create', {
        method: 'POST',
        body: JSON.stringify({
          name: app.playerName,
          maxPlayers,
        }),
      });
      app.playerId = data.playerId;
      app.playerToken = data.playerToken;
      app.hostToken = data.hostToken;
      saveIdentity();
      applySession(data.session);
    } catch (error) {
      app.lastError = error.message;
      renderMenu();
    }
  }

  async function joinLobby() {
    const nameInput = document.getElementById('joinNameInput');
    app.playerName = (nameInput && nameInput.value.trim()) || app.playerName || 'Captain';

    try {
      const data = await apiRequest('/api/lobby/join', {
        method: 'POST',
        body: JSON.stringify({
          name: app.playerName,
        }),
      });
      app.playerId = data.playerId;
      app.playerToken = data.playerToken;
      app.hostToken = '';
      saveIdentity();
      applySession(data.session);
    } catch (error) {
      app.lastError = error.message;
      renderMenu();
    }
  }

  async function startMatch() {
    try {
      await apiRequest('/api/lobby/start', {
        method: 'POST',
        body: JSON.stringify({
          playerId: app.playerId,
          hostToken: app.hostToken,
        }),
      });
      await refreshSession();
    } catch (error) {
      app.lastError = error.message;
      renderMenu();
    }
  }

  async function closeMatch() {
    try {
      await apiRequest('/api/lobby/close', {
        method: 'POST',
        body: JSON.stringify({
          playerId: app.playerId,
          hostToken: app.hostToken,
        }),
      });
      app.snapshot = null;
      clearIdentity();
      await refreshSession();
    } catch (error) {
      app.lastError = error.message;
      renderMenu();
    }
  }

  async function leaveLobby() {
    try {
      await apiRequest('/api/lobby/leave', {
        method: 'POST',
        body: JSON.stringify({
          playerId: app.playerId,
        }),
      });
      app.snapshot = null;
      clearIdentity();
      await refreshSession();
    } catch (error) {
      app.lastError = error.message;
      renderMenu();
    }
  }

  function attachMenuHandlers() {
    const createTab = document.getElementById('createModeButton');
    const joinTab = document.getElementById('joinModeButton');
    const createButton = document.getElementById('createLobbyButton');
    const joinButton = document.getElementById('joinLobbyButton');
    const startButton = document.getElementById('startMatchButton');
    const closeButton = document.getElementById('closeMatchButton');
    const leaveButton = document.getElementById('leaveLobbyButton');

    if (createTab) {
      createTab.onclick = function () {
        app.menuMode = 'create';
        renderMenu();
      };
    }
    if (joinTab) {
      joinTab.onclick = function () {
        app.menuMode = 'join';
        renderMenu();
      };
    }
    if (createButton) {
      createButton.onclick = createLobby;
    }
    if (joinButton) {
      joinButton.onclick = joinLobby;
    }
    if (startButton) {
      startButton.onclick = startMatch;
    }
    if (closeButton) {
      closeButton.onclick = closeMatch;
    }
    if (leaveButton) {
      leaveButton.onclick = leaveLobby;
    }
  }

  function renderMenu() {
    const hasSession = app.session && app.session.exists;
    const joined = Boolean(app.playerId && hasSession && getPublicSessionPlayers().some(function (player) {
      return player.id === app.playerId;
    }));
    const isHost = joined && hasSession && app.playerId === app.session.hostPlayerId && app.hostToken;

    overlayTitle.textContent = hasSession ? (app.session.status === 'playing' ? 'Match Live' : 'LAN Lobby') : 'LAN Match';
    overlayCopy.textContent = hasSession
      ? getSessionStatusText()
      : 'Run `node server.js` on one device, then let everyone else open that device\'s IP address in a browser.';

    if (hasSession && app.session.status === 'playing' && joined && app.snapshot && app.snapshot.players) {
      setOverlayVisible(false);
      return;
    }

    setOverlayVisible(true);

    const playerListHtml = hasSession
      ? '<div class="menu-section"><h3>Captains</h3><div class="lobby-list">' +
        getPublicSessionPlayers()
          .map(function (player) {
            var playerStatus = player.alive === false ? 'Sunk' : player.connected === false ? 'Away' : 'Ready';
            return (
              '<div class="lobby-row">' +
              '<span class="swatch" style="background:' + player.color + '"></span>' +
              '<span>' + escapeHtml(player.name) + '</span>' +
              '<strong>' + playerStatus + '</strong>' +
              '</div>'
            );
          })
          .join('') +
        '</div></div>'
      : '';

    const errorHtml = app.lastError ? '<p class="error-text">' + app.lastError + '</p>' : '';

    if (!hasSession) {
      const createSection =
        '<div class="menu-section">' +
        '<div class="form-grid">' +
        '<label class="form-field"><span>Captain name</span><input id="hostNameInput" value="' + escapeHtml(app.playerName) + '" maxlength="18" /></label>' +
        '<label class="form-field"><span>Max players</span>' +
        '<select id="maxPlayersInput">' +
        [2, 3, 4, 5, 6, 7, 8]
          .map(function (count) {
            return '<option value="' + count + '"' + (count === 4 ? ' selected' : '') + '>' + count + '</option>';
          })
          .join('') +
        '</select></label>' +
        '</div>' +
        '<div class="button-row"><button id="createLobbyButton" class="action-button">Create lobby</button></div>' +
        '<p class="subtle">Other devices on the same LAN will join from the same URL after the lobby exists.</p>' +
        errorHtml +
        '</div>';

      const joinSection =
        '<div class="menu-section">' +
        '<p class="subtle">No lobby exists yet. Ask the host to run <code>node server.js</code>, then create a lobby from this page.</p>' +
        errorHtml +
        '</div>';

      menuContent.innerHTML =
        '<div class="menu-tabs">' +
        '<button id="createModeButton" class="menu-tab' + (app.menuMode === 'create' ? ' active' : '') + '">Create Lobby</button>' +
        '<button id="joinModeButton" class="menu-tab' + (app.menuMode === 'join' ? ' active' : '') + '">Join Lobby</button>' +
        '</div>' +
        (app.menuMode === 'join' ? joinSection : createSection);
      attachMenuHandlers();
      return;
    }

    if (!joined) {
      const joinSection =
        app.session.status === 'lobby'
          ? '<div class="menu-section">' +
            '<div class="form-grid">' +
            '<label class="form-field"><span>Captain name</span><input id="joinNameInput" value="' + escapeHtml(app.playerName) + '" maxlength="18" /></label>' +
            '</div>' +
            '<div class="button-row"><button id="joinLobbyButton" class="action-button">Join lobby</button></div>' +
            '</div>'
          : '<div class="menu-section"><p class="subtle">A match is already in progress. Wait for the host to close it before joining.</p></div>';

      menuContent.innerHTML =
        '<div class="menu-tabs">' +
        '<button id="createModeButton" class="menu-tab' + (app.menuMode === 'create' ? ' active' : '') + '">Create Lobby</button>' +
        '<button id="joinModeButton" class="menu-tab' + (app.menuMode === 'join' ? ' active' : '') + '">Join Lobby</button>' +
        '</div>' +
        (app.menuMode === 'create'
          ? '<div class="menu-section"><p class="subtle">A lobby already exists. Ask the host to close it if you need a new one.</p></div>'
          : joinSection) +
        playerListHtml +
        errorHtml;
      attachMenuHandlers();
      return;
    }

    if (app.session.status === 'lobby') {
      menuContent.innerHTML =
        '<div class="menu-section"><h3>Lobby Ready</h3>' +
        '<p class="subtle">Share this page\'s LAN URL. The host starts the match when everyone is in.</p>' +
        '</div>' +
        playerListHtml +
        '<div class="button-row">' +
        (isHost
          ? '<button id="startMatchButton" class="action-button">Start match</button><button id="closeMatchButton" class="ghost-button">Close session</button>'
          : '<button id="leaveLobbyButton" class="ghost-button">Leave lobby</button>') +
        '</div>' +
        errorHtml;
      attachMenuHandlers();
      return;
    }

    const winner = hasSession && app.session.winnerId
      ? getPublicSessionPlayers().find(function (player) {
          return player.id === app.session.winnerId;
        })
      : null;

    menuContent.innerHTML =
      '<div class="menu-section"><h3>' + (winner ? escapeHtml(winner.name) + ' won the match.' : 'Match finished.') + '</h3>' +
      '<p class="subtle">' + (isHost ? 'Close the session to create a new LAN lobby.' : 'Waiting for the host to close or recreate the session.') + '</p></div>' +
      playerListHtml +
      (isHost
        ? '<div class="button-row"><button id="closeMatchButton" class="action-button">Close session</button></div>'
        : '<div class="button-row"><button id="leaveLobbyButton" class="ghost-button">Leave session</button></div>') +
      errorHtml;
    attachMenuHandlers();
  }

  function updateHud() {
    const assignedPlayer = getAssignedPlayer();
    const self = getCurrentPlayer();
    const hasSession = app.session && app.session.exists;
    const players = app.snapshot && app.snapshot.players ? app.snapshot.players : getPublicSessionPlayers();
    const alivePlayers = players.filter(function (player) {
      return player.alive !== false;
    });

    objectiveText.textContent = hasSession
      ? hasSession && app.session.status === 'playing'
        ? self
          ? self.alive
            ? 'Sink the other ships and use either reload island when your ammo is low.'
            : 'Your ship is down. Spectating until the host closes the session.'
          : assignedPlayer
            ? 'Joining the engagement. Waiting for live ship telemetry...'
            : 'Match live. Waiting for a ship assignment.'
        : getSessionStatusText()
      : 'Create or join a LAN lobby. Other devices on the same network can connect to this server URL.';

    sessionPanel.innerHTML =
      '<h3>Session</h3>' +
      '<div class="stat-grid">' +
      '<div class="stat-card"><strong>' + (hasSession ? app.session.mapName : 'No match') + '</strong><span>Map</span></div>' +
      '<div class="stat-card"><strong>' + (hasSession ? app.session.playerCount + ' / ' + app.session.maxPlayers : '0 / 0') + '</strong><span>Captains</span></div>' +
      '<div class="stat-card"><strong>' + (hasSession ? app.session.status : 'idle') + '</strong><span>Status</span></div>' +
      '<div class="stat-card"><strong>' + alivePlayers.length + '</strong><span>Ships afloat</span></div>' +
      '</div>' +
      '<p class="subtle">' + (hasSession ? 'Host creates the lobby, then other devices join from the same LAN URL.' : 'No active server session yet.') + '</p>';

    statusPanel.innerHTML =
      '<h3>Your Ship</h3>' +
      (self
        ? '<div class="meter"><label>Hull</label><div class="bar"><span style="width:' + ((self.hull / self.maxHull) * 100) + '%"></span></div></div>' +
          '<div class="system-line good"><span>Status</span><strong>' + (self.alive ? 'Afloat' : 'Sunk') + '</strong></div>' +
          '<div class="system-line"><span>Speed</span><strong>' + Math.round(Math.abs(self.speed)) + '</strong></div>' +
          '<div class="system-line"><span>Kills</span><strong>' + self.kills + '</strong></div>'
        : assignedPlayer
          ? '<div class="system-line good"><span>Status</span><strong>Assigned</strong></div><p class="subtle">Waiting for live ship telemetry from the match.</p>'
          : '<p class="subtle">Join a lobby to get a ship assignment.</p>');

    weaponPanel.innerHTML =
      '<h3>Armament</h3>' +
      (self
        ? '<div class="weapon-row"><span>Port broadside</span><strong>' + (self.portCooldown <= 0 ? 'Ready' : self.portCooldown.toFixed(1) + 's') + '</strong></div>' +
          '<div class="weapon-row"><span>Starboard broadside</span><strong>' + (self.starboardCooldown <= 0 ? 'Ready' : self.starboardCooldown.toFixed(1) + 's') + '</strong></div>' +
          '<div class="weapon-row"><span>Ammunition</span><strong>' + self.ammo + ' / ' + self.maxAmmo + '</strong></div>' +
          '<div class="weapon-row"><span>Volley size</span><strong>' + self.volleySize + ' shot</strong></div>'
        : assignedPlayer
          ? '<p class="subtle">Waiting for live weapon telemetry from the match.</p>'
          : '<p class="subtle">No ship joined yet.</p>');

    const feed = app.snapshot && app.snapshot.feed ? app.snapshot.feed : [];
    logPanel.innerHTML =
      '<h3>Captain\'s Log</h3>' +
      (feed.length
        ? feed
            .map(function (entry) {
              return '<div class="log-entry">' + entry.text + '</div>';
            })
            .join('')
        : '<p class="subtle">No reports yet.</p>');
  }

  function resizeCanvases() {
    const rect = stage.getBoundingClientRect();
    VIEW.width = Math.max(320, Math.floor(rect.width));
    VIEW.height = Math.max(240, Math.floor(rect.height));
    VIEW.dpr = Math.min(window.devicePixelRatio || 1, 2);

    canvas.width = Math.floor(VIEW.width * VIEW.dpr);
    canvas.height = Math.floor(VIEW.height * VIEW.dpr);
    ctx.setTransform(VIEW.dpr, 0, 0, VIEW.dpr, 0, 0);

    const minimapRect = minimap.getBoundingClientRect();
    minimap.width = Math.floor(minimapRect.width * VIEW.dpr);
    minimap.height = Math.floor((minimapRect.width * 2) / 3 * VIEW.dpr);
    minimapCtx.setTransform(VIEW.dpr, 0, 0, VIEW.dpr, 0, 0);
  }

  function getCameraTarget() {
    if (!app.snapshot || !app.snapshot.map) {
      return { x: 0, y: 0, width: 1, height: 1 };
    }
    const self = getCurrentPlayer();
    if (self && self.alive) {
      return self;
    }
    const winner = app.snapshot.winnerId
      ? app.snapshot.players.find(function (player) {
          return player.id === app.snapshot.winnerId;
        })
      : null;
    return winner || { x: app.snapshot.map.width / 2, y: app.snapshot.map.height / 2 };
  }

  function worldToScreen(x, y) {
    return {
      x: x - app.camera.x,
      y: y - app.camera.y,
    };
  }

  function screenVisible(x, y, radius) {
    return (
      x + radius >= app.camera.x &&
      x - radius <= app.camera.x + VIEW.width &&
      y + radius >= app.camera.y &&
      y - radius <= app.camera.y + VIEW.height
    );
  }

  function drawOcean() {
    const gradient = ctx.createLinearGradient(0, 0, VIEW.width, VIEW.height);
    gradient.addColorStop(0, '#0c3648');
    gradient.addColorStop(0.55, '#0e465a');
    gradient.addColorStop(1, '#0a2635');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, VIEW.width, VIEW.height);

    if (!app.snapshot || !app.snapshot.map) {
      return;
    }

    ctx.save();
    ctx.translate(-app.camera.x, -app.camera.y);
    const startX = Math.floor(app.camera.x / 150) * 150;
    const endX = app.camera.x + VIEW.width + 150;
    const startY = Math.floor(app.camera.y / 150) * 150;
    const endY = app.camera.y + VIEW.height + 150;

    ctx.strokeStyle = 'rgba(146, 224, 221, 0.12)';
    ctx.lineWidth = 1.2;
    for (let x = startX; x < endX; x += 150) {
      for (let y = startY; y < endY; y += 150) {
        const wave = Math.sin((x + y) * 0.01 + performance.now() * 0.0011) * 10;
        ctx.beginPath();
        ctx.moveTo(x - 16, y + wave);
        ctx.quadraticCurveTo(x, y + 11 + wave, x + 20, y + wave);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawIslands() {
    if (!app.snapshot || !app.snapshot.map) {
      return;
    }

    app.snapshot.map.islands.forEach(function (island) {
      if (!screenVisible(island.x, island.y, island.radius + 120)) {
        return;
      }
      const screen = worldToScreen(island.x, island.y);
      const dock = worldToScreen(island.dockX, island.dockY);
      const sandGradient = ctx.createRadialGradient(
        screen.x - island.radius * 0.2,
        screen.y - island.radius * 0.25,
        island.radius * 0.2,
        screen.x,
        screen.y,
        island.radius
      );
      sandGradient.addColorStop(0, '#d8bb7d');
      sandGradient.addColorStop(0.65, '#b48a52');
      sandGradient.addColorStop(1, '#77512b');

      ctx.fillStyle = sandGradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, island.radius, 0, TAU);
      ctx.fill();

      ctx.fillStyle = 'rgba(35, 71, 43, 0.82)';
      for (let grove = 0; grove < 5; grove += 1) {
        const angle = island.dockAngle + Math.PI * 0.45 + grove * 0.9;
        const treeX = screen.x + Math.cos(angle) * island.radius * 0.35;
        const treeY = screen.y + Math.sin(angle) * island.radius * 0.32;
        ctx.beginPath();
        ctx.arc(treeX, treeY, island.radius * 0.18, 0, TAU);
        ctx.fill();
      }

      ctx.strokeStyle = 'rgba(127, 215, 217, 0.42)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(dock.x, dock.y, island.harborRadius + Math.sin(performance.now() * 0.004 + island.x) * 3, 0, TAU);
      ctx.stroke();

      ctx.save();
      ctx.translate(dock.x, dock.y);
      ctx.rotate(island.dockAngle);
      ctx.fillStyle = '#7fd7d9';
      ctx.fillRect(-12, -32, 24, 64);
      ctx.restore();

      ctx.fillStyle = 'rgba(245, 234, 211, 0.88)';
      ctx.font = '15px Georgia, "Times New Roman", serif';
      ctx.fillText(island.name, screen.x - island.radius * 0.55, screen.y - island.radius - 14);
      ctx.fillStyle = '#7fd7d9';
      ctx.font = '12px "Trebuchet MS", sans-serif';
      ctx.fillText('Community reload', screen.x - island.radius * 0.55, screen.y - island.radius + 4);
    });
  }

  function drawHazards() {
    if (!app.snapshot || !app.snapshot.map) {
      return;
    }

    app.snapshot.map.hazards.forEach(function (hazard) {
      if (!screenVisible(hazard.x, hazard.y, hazard.radius + 30)) {
        return;
      }
      const screen = worldToScreen(hazard.x, hazard.y);
      if (hazard.type === 'reef') {
        ctx.fillStyle = 'rgba(188, 87, 63, 0.82)';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hazard.radius, 0, TAU);
        ctx.fill();
      } else {
        ctx.fillStyle = '#5f6a74';
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hazard.radius, 0, TAU);
        ctx.fill();
      }
    });
  }

  function drawProjectiles() {
    if (!app.snapshot) {
      return;
    }

    app.snapshot.projectiles.forEach(function (projectile) {
      if (!screenVisible(projectile.x, projectile.y, projectile.radius + 10)) {
        return;
      }
      const screen = worldToScreen(projectile.x, projectile.y);
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, projectile.radius, 0, TAU);
      ctx.fill();
    });
  }

  function drawShip(player) {
    const radius = player.radius || 28;
    if (!screenVisible(player.x, player.y, radius + 80)) {
      return;
    }

    const screen = worldToScreen(player.x, player.y);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(player.angle);
    ctx.globalAlpha = player.alive ? 1 : 0.35;

    ctx.fillStyle = player.color;
    ctx.beginPath();
    ctx.moveTo(radius + 6, 0);
    ctx.lineTo(radius * 0.25, radius * 0.68);
    ctx.lineTo(-radius * 0.96, radius * 0.58);
    ctx.lineTo(-radius * 1.15, 0);
    ctx.lineTo(-radius * 0.96, -radius * 0.58);
    ctx.lineTo(radius * 0.25, -radius * 0.68);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#163340';
    ctx.fillRect(-radius * 0.3, -radius * 0.26, radius * 0.92, radius * 0.52);
    ctx.restore();
    ctx.globalAlpha = 1;

    ctx.fillStyle = 'rgba(8, 23, 35, 0.8)';
    ctx.fillRect(screen.x - 28, screen.y - radius - 20, 56, 6);
    ctx.fillStyle = player.color;
    ctx.fillRect(screen.x - 28, screen.y - radius - 20, 56 * clamp(player.hull / player.maxHull, 0, 1), 6);

    ctx.fillStyle = 'rgba(245, 234, 211, 0.92)';
    ctx.font = '13px Georgia, "Times New Roman", serif';
    ctx.fillText(player.name, screen.x - 28, screen.y - radius - 28);
  }

  function drawMinimap() {
    const width = minimap.width / VIEW.dpr;
    const height = minimap.height / VIEW.dpr;
    minimapCtx.clearRect(0, 0, width, height);

    const gradient = minimapCtx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, '#0e3b4f');
    gradient.addColorStop(1, '#082434');
    minimapCtx.fillStyle = gradient;
    minimapCtx.fillRect(0, 0, width, height);

    if (!app.snapshot || !app.snapshot.map) {
      return;
    }

    const scaleX = width / app.snapshot.map.width;
    const scaleY = height / app.snapshot.map.height;

    app.snapshot.map.islands.forEach(function (island) {
      minimapCtx.fillStyle = '#7fd7d9';
      minimapCtx.beginPath();
      minimapCtx.arc(island.x * scaleX, island.y * scaleY, Math.max(4, island.radius * scaleX), 0, TAU);
      minimapCtx.fill();
    });

    app.snapshot.map.hazards.forEach(function (hazard) {
      minimapCtx.fillStyle = hazard.type === 'reef' ? '#c95c3b' : '#7f8a91';
      minimapCtx.beginPath();
      minimapCtx.arc(hazard.x * scaleX, hazard.y * scaleY, Math.max(2, hazard.radius * scaleX), 0, TAU);
      minimapCtx.fill();
    });

    app.snapshot.players.forEach(function (player) {
      minimapCtx.fillStyle = player.id === app.playerId ? '#f5ead3' : player.color;
      minimapCtx.beginPath();
      minimapCtx.arc(player.x * scaleX, player.y * scaleY, 4, 0, TAU);
      minimapCtx.fill();
    });

    minimapCtx.strokeStyle = 'rgba(245, 234, 211, 0.44)';
    minimapCtx.strokeRect(app.camera.x * scaleX, app.camera.y * scaleY, VIEW.width * scaleX, VIEW.height * scaleY);
  }

  function drawCompassAndHints() {
    const self = getCurrentPlayer();
    const target = getDisplayTarget();
    if (!self) {
      return;
    }

    ctx.save();
    ctx.translate(92, 92);
    ctx.fillStyle = 'rgba(8, 23, 35, 0.62)';
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = 'rgba(212, 181, 122, 0.28)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.rotate(self.angle);
    ctx.strokeStyle = '#f5ead3';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-10, 0);
    ctx.lineTo(22, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(22, 0);
    ctx.lineTo(11, -8);
    ctx.lineTo(11, 8);
    ctx.closePath();
    ctx.fillStyle = '#f5ead3';
    ctx.fill();
    ctx.restore();

    if (target) {
      const angleToTarget = Math.atan2(target.y - self.y, target.x - self.x);
      const relative = normalizeAngle(angleToTarget - self.angle);
      const markerRadius = 36;
      ctx.fillStyle = '#f0a37f';
      ctx.beginPath();
      ctx.arc(92 + Math.cos(relative) * markerRadius, 92 + Math.sin(relative) * markerRadius, 5, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = 'rgba(245, 234, 211, 0.86)';
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText(
      target ? 'Ammo: ' + self.ammo + '/' + self.maxAmmo + '   Range: ' + Math.round(distance(self, target)) + 'm' : 'Waiting for a target',
      18,
      162
    );
  }

  function render() {
    drawOcean();
    drawIslands();
    drawHazards();
    drawProjectiles();

    if (app.snapshot && app.snapshot.players) {
      app.snapshot.players.forEach(drawShip);
    }

    drawCompassAndHints();
    drawMinimap();
  }

  function sendInputStep() {
    if (
      !hasOpenSocket('player') ||
      !app.session ||
      !app.session.exists ||
      app.session.status !== 'playing'
    ) {
      return;
    }

    const firePort = app.firePortQueued;
    const fireStarboard = app.fireStarboardQueued;
    app.firePortQueued = false;
    app.fireStarboardQueued = false;

    try {
      app.socket.send(
        JSON.stringify({
          type: 'input',
          throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
          turn: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
          firePort,
          fireStarboard,
        })
      );
    } catch (error) {
      app.lastError = 'Lost connection to the LAN server. Reconnecting...';
    }
  }

  async function pollStep() {
    if (app.networkBusy) {
      return;
    }

    const now = Date.now();
    const hasPlayerSocket = hasOpenSocket('player');
    const hasWatcherSocket = hasOpenSocket('watch');
    const shouldRefreshSession = now - app.lastSessionPollAt > 1100;

    if (!app.session || !app.session.exists) {
      if (!hasWatcherSocket && shouldRefreshSession) {
        app.networkBusy = true;
        app.lastSessionPollAt = now;
        try {
          await refreshSession();
        } catch (error) {
          // Leave the current UI state in place; reconnect and next poll will retry.
        } finally {
          app.networkBusy = false;
        }
      }
      return;
    }

    if (app.session.status !== 'playing' || !app.playerId) {
      if (!hasWatcherSocket && shouldRefreshSession) {
        app.networkBusy = true;
        app.lastSessionPollAt = now;
        try {
          await refreshSession();
        } catch (error) {
          // Ignore transient HTTP refresh failures here.
        } finally {
          app.networkBusy = false;
        }
      }
      return;
    }

    if (hasPlayerSocket) {
      return;
    }

    app.networkBusy = true;
    const firePort = app.firePortQueued;
    const fireStarboard = app.fireStarboardQueued;
    app.firePortQueued = false;
    app.fireStarboardQueued = false;

    try {
      const snapshot = await apiRequest('/api/sync', {
        method: 'POST',
        body: JSON.stringify({
          playerId: app.playerId,
          throttle: (keys.has('KeyW') || keys.has('ArrowUp') ? 1 : 0) - (keys.has('KeyS') || keys.has('ArrowDown') ? 1 : 0),
          turn: (keys.has('KeyD') || keys.has('ArrowRight') ? 1 : 0) - (keys.has('KeyA') || keys.has('ArrowLeft') ? 1 : 0),
          firePort,
          fireStarboard,
        }),
      });
      applySnapshot(snapshot);
    } catch (error) {
      app.lastError = error.message;
      if (shouldRefreshSession) {
        app.lastSessionPollAt = now;
        try {
          await refreshSession();
        } catch (refreshError) {
          // Ignore follow-up refresh failures; retry on the next loop.
        }
      }
    } finally {
      app.networkBusy = false;
    }
  }

  function tickCamera(dt) {
    if (!app.snapshot || !app.snapshot.map) {
      app.camera.x = 0;
      app.camera.y = 0;
      return;
    }
    const target = getCameraTarget();
    const targetX = clamp(target.x - VIEW.width / 2, 0, app.snapshot.map.width - VIEW.width);
    const targetY = clamp(target.y - VIEW.height / 2, 0, app.snapshot.map.height - VIEW.height);
    app.camera.x = approach(app.camera.x, targetX, 720 * dt);
    app.camera.y = approach(app.camera.y, targetY, 720 * dt);
  }

  function handleKeyDown(event) {
    if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyQ', 'KeyE'].includes(event.code)) {
      event.preventDefault();
    }

    keys.add(event.code);
    if (event.repeat) {
      return;
    }
    if (event.code === 'KeyQ') {
      app.firePortQueued = true;
    }
    if (event.code === 'KeyE') {
      app.fireStarboardQueued = true;
    }
  }

  function handleKeyUp(event) {
    keys.delete(event.code);
  }

  let lastFrame = performance.now();
  function frame(timestamp) {
    const dt = Math.min(0.033, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    tickCamera(dt);
    render();
    requestAnimationFrame(frame);
  }

  resizeCanvases();
  renderMenu();
  updateHud();
  refreshSession()
    .catch(function () {
      return null;
    })
    .finally(function () {
      ensureSocket();
    });
  setInterval(sendInputStep, 50);
  setInterval(pollStep, 90);

  window.addEventListener('keydown', handleKeyDown);
  window.addEventListener('keyup', handleKeyUp);
  window.addEventListener('resize', resizeCanvases);

  requestAnimationFrame(frame);
})();
