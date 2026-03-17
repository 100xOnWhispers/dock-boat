(function () {
  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  const stage = document.getElementById("stage");
  const minimap = document.getElementById("minimap");
  const minimapCtx = minimap.getContext("2d");

  const objectiveText = document.getElementById("objectiveText");
  const captainCard = document.getElementById("captainCard");
  const statusPanel = document.getElementById("statusPanel");
  const weaponPanel = document.getElementById("weaponPanel");
  const logPanel = document.getElementById("logPanel");
  const menuOverlay = document.getElementById("menuOverlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayCopy = document.getElementById("overlayCopy");

  const TAU = Math.PI * 2;
  const view = { width: 1280, height: 720, dpr: 1 };
  const keys = new Set();

  const captainNames = [
    "Captain Mara Flint",
    "Captain Rowan Vale",
    "Captain Elsie North",
    "Captain Orin Pike",
    "Captain Sable Rook",
    "Captain Dorian Reef",
  ];

  const TEST_LAYOUTS = [
    {
      name: "Needle Run",
      player: { x: 420, y: 820, angle: 0 },
      target: { x: 1160, y: 420, angle: Math.PI / 2 },
      islands: [
        { name: "Tidewatch Home", kind: "home", x: 240, y: 970, radius: 118, dockAngle: -0.2 },
        { name: "Powder Cay", kind: "upgrade", x: 1360, y: 920, radius: 110, dockAngle: -2.55 },
      ],
      hazards: [
        ["rock", 720, 720, 44],
        ["reef", 900, 560, 56],
        ["rock", 1050, 690, 40],
      ],
      buoys: [
        ["port", 540, 720],
        ["starboard", 600, 800],
        ["port", 770, 590],
        ["starboard", 830, 690],
        ["port", 980, 460],
        ["starboard", 1040, 560],
      ],
    },
    {
      name: "Split Channel",
      player: { x: 340, y: 560, angle: 0.05 },
      target: { x: 1400, y: 520, angle: Math.PI / 2 },
      islands: [
        { name: "Anchor Home", kind: "home", x: 220, y: 320, radius: 112, dockAngle: 0.72 },
        { name: "Volley Shoal", kind: "upgrade", x: 980, y: 980, radius: 122, dockAngle: -1.45 },
      ],
      hazards: [
        ["rock", 650, 450, 48],
        ["reef", 860, 620, 54],
        ["rock", 1060, 420, 42],
        ["reef", 1210, 720, 44],
      ],
      buoys: [
        ["port", 460, 610],
        ["starboard", 520, 700],
        ["port", 700, 720],
        ["starboard", 770, 820],
        ["port", 990, 770],
        ["starboard", 1060, 870],
      ],
    },
    {
      name: "Broken Arc",
      player: { x: 430, y: 980, angle: -0.15 },
      target: { x: 1360, y: 300, angle: Math.PI / 2 },
      islands: [
        { name: "Beacon Home", kind: "home", x: 240, y: 1050, radius: 118, dockAngle: -0.08 },
        { name: "Powder Crown", kind: "upgrade", x: 1490, y: 860, radius: 116, dockAngle: 3.02 },
      ],
      hazards: [
        ["rock", 700, 900, 44],
        ["reef", 880, 740, 50],
        ["rock", 1080, 540, 42],
        ["reef", 1260, 430, 46],
      ],
      buoys: [
        ["port", 560, 930],
        ["starboard", 640, 1010],
        ["port", 790, 760],
        ["starboard", 860, 840],
        ["port", 1080, 480],
        ["starboard", 1140, 570],
      ],
    },
  ];

  const game = {
    phase: "menu",
    world: {
      width: 4600,
      height: 3200,
    },
    camera: {
      x: 0,
      y: 0,
      shakeX: 0,
      shakeY: 0,
      shakePower: 0,
    },
    time: 0,
    damageFlash: 0,
    messages: [],
    stats: {
      sunk: 0,
      crates: 0,
      docks: 0,
    },
    layoutIndex: -1,
    layoutName: "",
    player: null,
    enemies: [],
    islands: [],
    hazards: [],
    buoys: [],
    crates: [],
    projectiles: [],
    particles: [],
    captainName: captainNames[Math.floor(Math.random() * captainNames.length)],
    totalEnemies: 0,
  };

  function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
  }

  function rand(min, max) {
    return min + Math.random() * (max - min);
  }

  function randInt(min, max) {
    return Math.floor(rand(min, max + 1));
  }

  function distance(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy);
  }

  function normalizeAngle(angle) {
    while (angle > Math.PI) angle -= TAU;
    while (angle < -Math.PI) angle += TAU;
    return angle;
  }

  function approach(value, target, maxDelta) {
    if (value < target) {
      return Math.min(value + maxDelta, target);
    }
    return Math.max(value - maxDelta, target);
  }

  function rotateTowards(current, target, maxDelta) {
    const delta = normalizeAngle(target - current);
    const nextDelta = clamp(delta, -maxDelta, maxDelta);
    return normalizeAngle(current + nextDelta);
  }

  function worldToScreen(x, y) {
    return {
      x: x - game.camera.x + game.camera.shakeX,
      y: y - game.camera.y + game.camera.shakeY,
    };
  }

  function screenVisible(x, y, radius) {
    return (
      x + radius >= game.camera.x &&
      x - radius <= game.camera.x + view.width &&
      y + radius >= game.camera.y &&
      y - radius <= game.camera.y + view.height
    );
  }

  function projectPoint(x, y, angle, distanceAmount) {
    return {
      x: x + Math.cos(angle) * distanceAmount,
      y: y + Math.sin(angle) * distanceAmount,
    };
  }

  function addMessage(text, color) {
    game.messages.unshift({
      text,
      color: color || "#d5c3a6",
      timer: 6,
    });
    game.messages = game.messages.slice(0, 6);
  }

  function createShip(config) {
    return {
      id: config.id,
      name: config.name,
      team: config.team,
      x: config.x,
      y: config.y,
      angle: config.angle || 0,
      speed: 0,
      radius: config.radius || 28,
      hull: config.hull,
      maxHull: config.hull,
      maxSpeed: config.maxSpeed,
      acceleration: config.acceleration,
      turnRate: config.turnRate,
      broadsideReload: config.broadsideReload,
      volleySize: config.volleySize || 1,
      maxAmmo: config.maxAmmo || 0,
      ammo: config.ammo !== undefined ? config.ammo : config.maxAmmo || 0,
      portCooldown: 0.2,
      starboardCooldown: 0.8,
      gunCooldown: 0,
      collisionLock: 0,
      drift: rand(0, TAU),
      repairKits: config.repairKits || 0,
      hasGun: Boolean(config.hasGun),
      gunAmmo: config.gunAmmo || 0,
      systems: {
        engine: 100,
        port: 100,
        starboard: 100,
        gun: config.hasGun ? 100 : 0,
      },
      isPlayer: Boolean(config.isPlayer),
      color: config.color,
      trailColor: config.trailColor,
      ai: config.ai || null,
      dockedUntil: 0,
      upgradeUnlocked: Boolean(config.upgradeUnlocked),
    };
  }

  function makeIsland(name, x, y, radius, dockAngle, kind) {
    const dock = projectPoint(x, y, dockAngle, radius + 52);
    return {
      name,
      x,
      y,
      radius,
      dockAngle,
      dockX: dock.x,
      dockY: dock.y,
      harborRadius: 58,
      kind: kind || "neutral",
      claimed: false,
      lastTriggerAt: -10,
      pulse: rand(0, TAU),
    };
  }

  function makeHazard(type, x, y, radius) {
    return {
      type,
      x,
      y,
      radius,
    };
  }

  function makeCrate(type, x, y, payload) {
    return {
      type,
      x,
      y,
      radius: 15,
      bob: rand(0, TAU),
      payload: payload || null,
    };
  }

  function makeBuoy(kind, x, y) {
    return {
      kind,
      x,
      y,
      bob: rand(0, TAU),
    };
  }

  function resetWorld(showIntroMessages) {
    game.world.width = 1800;
    game.world.height = 1200;
    game.time = 0;
    game.damageFlash = 0;
    game.messages = [];
    game.stats = {
      sunk: 0,
      crates: 0,
      docks: 0,
    };
    game.projectiles = [];
    game.particles = [];
    game.crates = [];
    game.hazards = [];
    game.buoys = [];
    game.enemies = [];
    game.islands = [];

    let layoutIndex = randInt(0, TEST_LAYOUTS.length - 1);
    if (TEST_LAYOUTS.length > 1 && layoutIndex === game.layoutIndex) {
      layoutIndex = (layoutIndex + 1 + randInt(0, TEST_LAYOUTS.length - 2)) % TEST_LAYOUTS.length;
    }
    game.layoutIndex = layoutIndex;
    const layout = TEST_LAYOUTS[layoutIndex];
    game.layoutName = layout.name;

    game.player = createShip({
      id: "player",
      name: game.captainName,
      team: "player",
      x: layout.player.x,
      y: layout.player.y,
      angle: layout.player.angle,
      hull: 180,
      maxSpeed: 205,
      acceleration: 160,
      turnRate: 1.8,
      broadsideReload: 1.2,
      volleySize: 1,
      maxAmmo: 12,
      ammo: 12,
      repairKits: 0,
      hasGun: false,
      gunAmmo: 0,
      isPlayer: true,
      color: "#f4edd4",
      trailColor: "rgba(244, 237, 212, 0.28)",
    });

    const targetShip = createShip({
      id: "enemy-target",
      name: "Training Hulk",
      team: "enemy",
      x: layout.target.x,
      y: layout.target.y,
      angle: layout.target.angle,
      hull: 120,
      maxSpeed: 0,
      acceleration: 0,
      turnRate: 0,
      broadsideReload: 99,
      volleySize: 1,
      maxAmmo: 0,
      ammo: 0,
      repairKits: 0,
      hasGun: false,
      gunAmmo: 0,
      color: "#c95c3b",
      trailColor: "rgba(201, 92, 59, 0.2)",
      ai: {
        mode: "stationary",
      },
    });
    game.enemies.push(targetShip);

    game.islands = layout.islands.map(function (island) {
      return makeIsland(island.name, island.x, island.y, island.radius, island.dockAngle, island.kind);
    });

    game.hazards = layout.hazards.map(function (hazard) {
      return makeHazard(hazard[0], hazard[1], hazard[2], hazard[3]);
    });

    game.buoys = layout.buoys.map(function (buoy) {
      return makeBuoy(buoy[0], buoy[1], buoy[2]);
    });

    game.totalEnemies = game.enemies.length;
    game.camera.x = clamp(game.player.x - view.width / 2, 0, game.world.width - view.width);
    game.camera.y = clamp(game.player.y - view.height / 2, 0, game.world.height - view.height);
    game.camera.shakeX = 0;
    game.camera.shakeY = 0;
    game.camera.shakePower = 0;

    if (showIntroMessages) {
      const homeIsland = game.islands.find(function (island) {
        return island.kind === "home";
      });
      const upgradeIsland = game.islands.find(function (island) {
        return island.kind === "upgrade";
      });
      addMessage(game.layoutName + " selected. Red and green buoys mark the safest lane.", "#c6e4ed");
      addMessage(
        "Touch " +
          homeIsland.name +
          " to reload. Touch " +
          upgradeIsland.name +
          " to unlock triple-shot broadsides.",
        "#f3d6a0"
      );
    }
  }

  function addHazardRing(island, type, count, minDistance, maxDistance) {
    for (let i = 0; i < count; i += 1) {
      const angle = (TAU / count) * i + rand(-0.35, 0.35);
      const distanceFromIsland = rand(minDistance, maxDistance);
      const radius = type === "reef" ? rand(26, 54) : rand(24, 45);
      const x = island.x + Math.cos(angle) * distanceFromIsland;
      const y = island.y + Math.sin(angle) * distanceFromIsland;
      game.hazards.push(makeHazard(type, x, y, radius));
    }
  }

  function setOverlay(title, copy) {
    overlayTitle.textContent = title;
    overlayCopy.textContent = copy;
    menuOverlay.classList.remove("hidden");
  }

  function hideOverlay() {
    menuOverlay.classList.add("hidden");
  }

  function startGame() {
    keys.clear();
    resetWorld(true);
    game.phase = "playing";
    hideOverlay();
    updateUI();
  }

  function endGame(victory) {
    game.phase = victory ? "victory" : "defeat";
    if (victory) {
      setOverlay(
        "Target Destroyed",
        "The training target has sunk. Reset the scene and run the drill again."
      );
      addMessage("Target destroyed. Press Enter to restart the drill.", "#a9d7b7");
    } else {
      setOverlay(
        "Drill Failed",
        "Your ship sank during the test. Restart the scene and try the approach again."
      );
      addMessage("Your ship has sunk. Press Enter to restart the drill.", "#f1a488");
    }
    updateUI();
  }

  function formatPercent(value) {
    return Math.round(clamp(value, 0, 100)) + "%";
  }

  function anySystemsDamaged(ship) {
    return Object.values(ship.systems).some((value) => value > 0 && value < 100);
  }

  function spendRepairKit() {
    const ship = game.player;
    if (ship.repairKits <= 0) {
      addMessage("No repair kits left. Find salvage or reach a harbor.", "#f1a488");
      return;
    }
    if (ship.hull >= ship.maxHull && !anySystemsDamaged(ship)) {
      addMessage("Ship is already in fighting shape.", "#c6e4ed");
      return;
    }

    ship.repairKits -= 1;
    ship.hull = clamp(ship.hull + 34, 0, ship.maxHull);
    ship.systems.engine = clamp(ship.systems.engine + 40, 0, 100);
    ship.systems.port = clamp(ship.systems.port + 45, 0, 100);
    ship.systems.starboard = clamp(ship.systems.starboard + 45, 0, 100);
    if (ship.hasGun) {
      ship.systems.gun = clamp(ship.systems.gun + 55, 0, 100);
    }
    addMessage("Repair crews patch the hull and re-rig the guns.", "#9ed3b0");
  }

  function dockAtHarbor() {
    const ship = game.player;
    const harbor = findNearbyHarbor(ship);
    if (!harbor) {
      addMessage("No harbor within docking range.", "#c6e4ed");
      return;
    }
    if (Math.abs(ship.speed) > 55) {
      addMessage("Reduce speed before docking.", "#f3d6a0");
      return;
    }

    ship.hull = ship.maxHull;
    ship.systems.engine = 100;
    ship.systems.port = 100;
    ship.systems.starboard = 100;
    if (ship.hasGun) {
      ship.systems.gun = 100;
      ship.gunAmmo = Math.max(ship.gunAmmo, 90);
    }
    ship.repairKits = clamp(ship.repairKits + 1, 0, 4);
    ship.dockedUntil = game.time + 0.8;
    ship.speed = 0;
    game.stats.docks += 1;
    addMessage("Docked at " + harbor.name + ". Hull repaired and stores restocked.", "#f3d6a0");
  }

  function findNearbyHarbor(ship) {
    for (let i = 0; i < game.islands.length; i += 1) {
      const island = game.islands[i];
      const dx = ship.x - island.dockX;
      const dy = ship.y - island.dockY;
      if (Math.hypot(dx, dy) <= island.harborRadius + ship.radius) {
        return island;
      }
    }
    return null;
  }

  function handleIslandInteractions() {
    const ship = game.player;
    for (let i = 0; i < game.islands.length; i += 1) {
      const island = game.islands[i];
      const distanceToDock = Math.hypot(ship.x - island.dockX, ship.y - island.dockY);
      if (distanceToDock > island.harborRadius + ship.radius) {
        continue;
      }

      if (island.kind === "home" && ship.ammo < ship.maxAmmo && game.time - island.lastTriggerAt > 0.75) {
        ship.ammo = ship.maxAmmo;
        island.lastTriggerAt = game.time;
        game.stats.docks += 1;
        addMessage(island.name + " reloaded your powder stores.", "#7fd7d9");
      }

      if (island.kind === "upgrade" && !island.claimed) {
        island.claimed = true;
        island.lastTriggerAt = game.time;
        ship.volleySize = 3;
        ship.upgradeUnlocked = true;
        addMessage(island.name + " upgraded your broadsides to three-shot volleys.", "#f3d6a0");
      }
    }
  }

  function fireBroadside(ship, side) {
    const systemKey = side === "port" ? "port" : "starboard";
    const cooldownKey = side === "port" ? "portCooldown" : "starboardCooldown";
    const sideAngle = ship.angle + (side === "port" ? -Math.PI / 2 : Math.PI / 2);

    if (ship[cooldownKey] > 0) {
      return false;
    }
    if (ship.systems[systemKey] <= 0) {
      if (ship.isPlayer) {
        addMessage((side === "port" ? "Port" : "Starboard") + " cannons are disabled.", "#f1a488");
      }
      return false;
    }

    if (ship.maxAmmo > 0 && ship.ammo <= 0) {
      if (ship.isPlayer) {
        addMessage("Out of ammunition. Return to your home island to reload.", "#f1a488");
      }
      return false;
    }

    const shotCount = ship.maxAmmo > 0 ? Math.min(ship.volleySize, ship.ammo) : ship.volleySize;
    const shotOffsets =
      shotCount === 1 ? [0] : shotCount === 2 ? [-0.5, 0.5] : [-1, 0, 1];

    for (let i = 0; i < shotOffsets.length; i += 1) {
      const offset = shotOffsets[i];
      const spawn = projectPoint(ship.x, ship.y, sideAngle, ship.radius + 10);
      const forwardShift = offset * 12;
      const muzzleX = spawn.x + Math.cos(ship.angle) * forwardShift;
      const muzzleY = spawn.y + Math.sin(ship.angle) * forwardShift;
      const angle = sideAngle + offset * 0.1 + rand(-0.03, 0.03);
      const speed = rand(420, 500);
      game.projectiles.push({
        team: ship.team,
        ownerId: ship.id,
        kind: "cannon",
        x: muzzleX,
        y: muzzleY,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        radius: 6,
        damage: rand(16, 22),
        ttl: 2.6,
        color: ship.isPlayer ? "#ead7b3" : "#efb38f",
      });
    }

    if (ship.maxAmmo > 0) {
      ship.ammo = Math.max(0, ship.ammo - shotCount);
    }

    const damagePenalty = clamp((100 - ship.systems[systemKey]) / 150, 0, 0.55);
    ship[cooldownKey] = ship.broadsideReload + damagePenalty;
    spawnParticles(ship.x, ship.y, 10, "rgba(248, 233, 206, 0.32)", 22, 70);
    return true;
  }

  function fireGun(ship) {
    if (!ship.hasGun || ship.gunAmmo <= 0 || ship.gunCooldown > 0 || ship.systems.gun <= 0) {
      return false;
    }

    const spawn = projectPoint(ship.x, ship.y, ship.angle, ship.radius + 6);
    const speed = 640;
    const spread = rand(-0.06, 0.06);
    game.projectiles.push({
      team: ship.team,
      ownerId: ship.id,
      kind: "gun",
      x: spawn.x,
      y: spawn.y,
      vx: Math.cos(ship.angle + spread) * speed,
      vy: Math.sin(ship.angle + spread) * speed,
      radius: 4,
      damage: rand(6, 10),
      ttl: 1.1,
      color: "#7fd7d9",
    });

    ship.gunCooldown = 0.12 + clamp((100 - ship.systems.gun) / 300, 0, 0.18);
    ship.gunAmmo -= 1;
    return true;
  }

  function spawnParticles(x, y, count, color, speedMin, speedMax) {
    for (let i = 0; i < count; i += 1) {
      const angle = rand(-Math.PI, Math.PI);
      const speed = rand(speedMin, speedMax);
      game.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        ttl: rand(0.3, 0.9),
        size: rand(2, 6),
        color,
      });
    }
  }

  function applyDamage(ship, amount, attacker) {
    if (game.time < ship.dockedUntil) {
      return;
    }

    ship.hull -= amount;
    if (ship.isPlayer) {
      game.damageFlash = Math.max(game.damageFlash, 0.42);
      game.camera.shakePower = Math.max(game.camera.shakePower, Math.min(18, amount * 0.42));
    }
    if (Math.random() < 0.58) {
      const systems = ["engine", "port", "starboard"];
      if (ship.hasGun) {
        systems.push("gun");
      }
      const key = systems[randInt(0, systems.length - 1)];
      const previous = ship.systems[key];
      ship.systems[key] = clamp(ship.systems[key] - amount * rand(0.7, 1.15), 0, 100);
      if (previous > 0 && ship.systems[key] === 0) {
        const systemLabel = key === "gun" ? "rare gun" : key + " system";
        if (ship.isPlayer) {
          addMessage("Your " + systemLabel + " is disabled.", "#f1a488");
        } else {
          addMessage(ship.name + "'s " + systemLabel + " is gone.", "#f3d6a0");
        }
      }
    }

    spawnParticles(ship.x, ship.y, 7, ship.isPlayer ? "rgba(244, 237, 212, 0.22)" : "rgba(201, 92, 59, 0.26)", 12, 95);
    if (ship.hull <= 0) {
      sinkShip(ship, attacker);
    }
  }

  function sinkShip(ship, attacker) {
    spawnParticles(ship.x, ship.y, 28, "rgba(245, 214, 160, 0.45)", 30, 160);
    if (ship.isPlayer) {
      ship.hull = 0;
      endGame(false);
      return;
    }

    const enemyIndex = game.enemies.findIndex((enemy) => enemy.id === ship.id);
    if (enemyIndex !== -1) {
      game.enemies.splice(enemyIndex, 1);
    }

    game.stats.sunk += 1;
    addMessage(ship.name + " has sunk.", "#9ed3b0");
    if (!ship.ai || ship.ai.mode !== "stationary") {
      dropLoot(ship);
    }

    if (attacker && attacker.isPlayer && game.enemies.length === 0) {
      endGame(true);
    }
  }

  function dropLoot(ship) {
    const guaranteed = game.player.hasGun ? "repair" : "gun";
    const bonusPool = ["kit", "repair", "powder"];
    const firstDrop = makeCrate(guaranteed, ship.x + rand(-24, 24), ship.y + rand(-24, 24));
    const secondDrop = makeCrate(
      bonusPool[randInt(0, bonusPool.length - 1)],
      ship.x + rand(-34, 34),
      ship.y + rand(-34, 34)
    );
    game.crates.push(firstDrop, secondDrop);
  }

  function collectCrate(crate) {
    const ship = game.player;
    game.stats.crates += 1;

    if (crate.type === "repair") {
      ship.hull = clamp(ship.hull + 30, 0, ship.maxHull);
      ship.systems.engine = clamp(ship.systems.engine + 18, 0, 100);
      ship.systems.port = clamp(ship.systems.port + 18, 0, 100);
      ship.systems.starboard = clamp(ship.systems.starboard + 18, 0, 100);
      if (ship.hasGun) {
        ship.systems.gun = clamp(ship.systems.gun + 18, 0, 100);
      }
      addMessage("Salvage crate recovered. Hull crews patch the ship.", "#9ed3b0");
      return;
    }

    if (crate.type === "kit") {
      ship.repairKits = clamp(ship.repairKits + 1, 0, 4);
      addMessage("Repair kit secured. Emergency stock increased.", "#c6e4ed");
      return;
    }

    if (crate.type === "powder") {
      ship.broadsideReload = Math.max(1.05, ship.broadsideReload - 0.12);
      addMessage("Black powder cache loaded. Your broadsides are faster.", "#f3d6a0");
      return;
    }

    if (crate.type === "gun") {
      ship.hasGun = true;
      ship.gunAmmo += 120;
      ship.systems.gun = Math.max(ship.systems.gun, 85);
      addMessage("Rare deck gun mounted. Hold Space to shred nearby ships.", "#7fd7d9");
    }
  }

  function controlShip(ship, throttleInput, turnInput, dt) {
    ship.portCooldown = Math.max(0, ship.portCooldown - dt);
    ship.starboardCooldown = Math.max(0, ship.starboardCooldown - dt);
    ship.gunCooldown = Math.max(0, ship.gunCooldown - dt);
    ship.collisionLock = Math.max(0, ship.collisionLock - dt);

    const engineFactor = ship.systems.engine > 0 ? 1 : 0.42;
    const effectiveMaxSpeed = ship.maxSpeed * engineFactor;
    const reverseSpeed = ship.maxSpeed * 0.32 * engineFactor;
    const targetSpeed =
      throttleInput >= 0 ? throttleInput * effectiveMaxSpeed : throttleInput * reverseSpeed;
    const acceleration = ship.acceleration * (ship.systems.engine > 0 ? 1 : 0.56);

    ship.speed = approach(ship.speed, targetSpeed, acceleration * dt);
    ship.speed *= 1 - 0.58 * dt;

    const steerScale = 0.28 + Math.min(1, Math.abs(ship.speed) / (ship.maxSpeed || 1));
    ship.angle = normalizeAngle(ship.angle + turnInput * ship.turnRate * steerScale * dt);

    ship.x += Math.cos(ship.angle) * ship.speed * dt;
    ship.y += Math.sin(ship.angle) * ship.speed * dt;
    ship.x = clamp(ship.x, ship.radius, game.world.width - ship.radius);
    ship.y = clamp(ship.y, ship.radius, game.world.height - ship.radius);

    if (Math.abs(ship.speed) > 45 && Math.random() < 0.55) {
      const stern = projectPoint(ship.x, ship.y, ship.angle + Math.PI, ship.radius - 8);
      game.particles.push({
        x: stern.x + rand(-8, 8),
        y: stern.y + rand(-8, 8),
        vx: -Math.cos(ship.angle) * rand(20, 70),
        vy: -Math.sin(ship.angle) * rand(20, 70),
        ttl: rand(0.25, 0.6),
        size: rand(3, 7),
        color: ship.trailColor,
      });
    }
  }

  function updatePlayer(dt) {
    const throttle =
      (keys.has("KeyW") || keys.has("ArrowUp") ? 1 : 0) -
      (keys.has("KeyS") || keys.has("ArrowDown") ? 1 : 0);
    const turn =
      (keys.has("KeyD") || keys.has("ArrowRight") ? 1 : 0) -
      (keys.has("KeyA") || keys.has("ArrowLeft") ? 1 : 0);

    controlShip(game.player, throttle, turn, dt);

    if (keys.has("Space")) {
      fireGun(game.player);
    }

    resolveWorldCollisions(game.player);
    handleIslandInteractions();
    collectNearbyCrates();
  }

  function steerAroundThreats(ship, desiredAngle) {
    let influenceX = Math.cos(desiredAngle);
    let influenceY = Math.sin(desiredAngle);

    for (let i = 0; i < game.hazards.length; i += 1) {
      const hazard = game.hazards[i];
      const dx = ship.x - hazard.x;
      const dy = ship.y - hazard.y;
      const range = hazard.radius + 180;
      const distanceAway = Math.hypot(dx, dy);
      if (distanceAway < range && distanceAway > 1) {
        const weight = (range - distanceAway) / range;
        influenceX += (dx / distanceAway) * weight * 1.8;
        influenceY += (dy / distanceAway) * weight * 1.8;
      }
    }

    for (let i = 0; i < game.islands.length; i += 1) {
      const island = game.islands[i];
      const dx = ship.x - island.x;
      const dy = ship.y - island.y;
      const range = island.radius + 220;
      const distanceAway = Math.hypot(dx, dy);
      if (distanceAway < range && distanceAway > 1) {
        const weight = (range - distanceAway) / range;
        influenceX += (dx / distanceAway) * weight * 2.2;
        influenceY += (dy / distanceAway) * weight * 2.2;
      }
    }

    return Math.atan2(influenceY, influenceX);
  }

  function updateEnemies(dt) {
    for (let i = game.enemies.length - 1; i >= 0; i -= 1) {
      const enemy = game.enemies[i];
      enemy.portCooldown = Math.max(0, enemy.portCooldown - dt);
      enemy.starboardCooldown = Math.max(0, enemy.starboardCooldown - dt);
      enemy.gunCooldown = Math.max(0, enemy.gunCooldown - dt);

      if (enemy.ai && enemy.ai.mode === "stationary") {
        enemy.speed = 0;
        continue;
      }

      const player = game.player;
      const dx = player.x - enemy.x;
      const dy = player.y - enemy.y;
      const distanceToPlayer = Math.hypot(dx, dy);
      const angleToPlayer = Math.atan2(dy, dx);

      if (distanceToPlayer > 920 || enemy.hull < 26) {
        const roamDistance = Math.hypot(enemy.x - enemy.ai.roamTarget.x, enemy.y - enemy.ai.roamTarget.y);
        if (roamDistance < 120) {
          enemy.ai.roamTarget = {
            x: clamp(enemy.x + rand(-620, 620), 120, game.world.width - 120),
            y: clamp(enemy.y + rand(-620, 620), 120, game.world.height - 120),
          };
        }
      }

      let desiredAngle = angleToPlayer;
      let throttle = 0.78;

      if (distanceToPlayer > 920) {
        desiredAngle = Math.atan2(enemy.ai.roamTarget.y - enemy.y, enemy.ai.roamTarget.x - enemy.x);
        throttle = 0.62;
      } else {
        const portAttack = normalizeAngle(angleToPlayer + Math.PI / 2);
        const starboardAttack = normalizeAngle(angleToPlayer - Math.PI / 2);
        const portDelta = Math.abs(normalizeAngle(portAttack - enemy.angle));
        const starboardDelta = Math.abs(normalizeAngle(starboardAttack - enemy.angle));
        desiredAngle = portDelta < starboardDelta ? portAttack : starboardAttack;
        throttle = distanceToPlayer < 260 ? 0.22 : 0.86;
      }

      desiredAngle = steerAroundThreats(enemy, desiredAngle);
      const angleDelta = normalizeAngle(desiredAngle - enemy.angle);
      const turn = clamp(angleDelta * 1.8, -1, 1);

      controlShip(enemy, throttle, turn, dt);
      resolveWorldCollisions(enemy);

      if (distanceToPlayer < 620) {
        const relative = normalizeAngle(angleToPlayer - enemy.angle);
        if (relative < -0.45 && relative > -2.4) {
          fireBroadside(enemy, "port");
        } else if (relative > 0.45 && relative < 2.4) {
          fireBroadside(enemy, "starboard");
        }

        if (distanceToPlayer < 220 && enemy.hasGun) {
          fireGun(enemy);
        }
      }
    }
  }

  function pushFromObstacle(ship, obstacle, impactScale, lethalOnFastReef) {
    const dx = ship.x - obstacle.x;
    const dy = ship.y - obstacle.y;
    const distanceAway = Math.hypot(dx, dy) || 1;
    const minimumDistance = ship.radius + obstacle.radius;

    if (distanceAway >= minimumDistance) {
      return;
    }

    const overlap = minimumDistance - distanceAway;
    const nx = dx / distanceAway;
    const ny = dy / distanceAway;
    ship.x += nx * overlap;
    ship.y += ny * overlap;

    const impact = Math.abs(ship.speed);
    ship.speed *= 0.12;
    if (ship.collisionLock <= 0) {
      let damage = impact * impactScale;
      if (obstacle.type === "reef" && lethalOnFastReef && impact > 150) {
        damage = ship.maxHull * 3;
      }
      if (damage > 4) {
        if (ship.isPlayer && obstacle.type === "reef") {
          addMessage("Reef strike. Pull clear before the hull tears open.", "#f1a488");
        } else if (ship.isPlayer && obstacle.type === "rock") {
          addMessage("Rock collision. Hull damage sustained.", "#f1a488");
        }
        applyDamage(ship, damage, null);
      }
      ship.collisionLock = 0.25;
    }
  }

  function resolveWorldCollisions(ship) {
    for (let i = 0; i < game.islands.length; i += 1) {
      pushFromObstacle(ship, game.islands[i], 0.14, false);
    }
    for (let i = 0; i < game.hazards.length; i += 1) {
      const hazard = game.hazards[i];
      const impactScale = hazard.type === "reef" ? 0.24 : 0.18;
      pushFromObstacle(ship, hazard, impactScale, true);
    }
  }

  function collectNearbyCrates() {
    for (let i = game.crates.length - 1; i >= 0; i -= 1) {
      const crate = game.crates[i];
      if (distance(game.player, crate) <= game.player.radius + crate.radius + 6) {
        collectCrate(crate);
        game.crates.splice(i, 1);
      }
    }
  }

  function updateProjectiles(dt) {
    for (let i = game.projectiles.length - 1; i >= 0; i -= 1) {
      const projectile = game.projectiles[i];
      projectile.x += projectile.vx * dt;
      projectile.y += projectile.vy * dt;
      projectile.ttl -= dt;

      if (
        projectile.ttl <= 0 ||
        projectile.x < -40 ||
        projectile.y < -40 ||
        projectile.x > game.world.width + 40 ||
        projectile.y > game.world.height + 40
      ) {
        game.projectiles.splice(i, 1);
        continue;
      }

      const potentialTargets = projectile.team === "player" ? game.enemies : [game.player];
      let hit = false;
      for (let targetIndex = 0; targetIndex < potentialTargets.length; targetIndex += 1) {
        const ship = potentialTargets[targetIndex];
        if (distance(projectile, ship) <= projectile.radius + ship.radius) {
          const attacker = projectile.team === "player" ? game.player : null;
          applyDamage(ship, projectile.damage, attacker);
          spawnParticles(projectile.x, projectile.y, 6, "rgba(248, 233, 206, 0.28)", 8, 55);
          game.projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }

      if (hit) {
        continue;
      }

      for (let islandIndex = 0; islandIndex < game.islands.length; islandIndex += 1) {
        if (distance(projectile, game.islands[islandIndex]) <= projectile.radius + game.islands[islandIndex].radius) {
          game.projectiles.splice(i, 1);
          hit = true;
          break;
        }
      }

      if (hit) {
        continue;
      }

      for (let hazardIndex = 0; hazardIndex < game.hazards.length; hazardIndex += 1) {
        if (distance(projectile, game.hazards[hazardIndex]) <= projectile.radius + game.hazards[hazardIndex].radius) {
          game.projectiles.splice(i, 1);
          break;
        }
      }
    }
  }

  function updateParticles(dt) {
    for (let i = game.particles.length - 1; i >= 0; i -= 1) {
      const particle = game.particles[i];
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.ttl -= dt;
      particle.vx *= 1 - 0.8 * dt;
      particle.vy *= 1 - 0.8 * dt;
      if (particle.ttl <= 0) {
        game.particles.splice(i, 1);
      }
    }
  }

  function updateMessages(dt) {
    for (let i = game.messages.length - 1; i >= 0; i -= 1) {
      game.messages[i].timer -= dt;
      if (game.messages[i].timer <= 0) {
        game.messages.splice(i, 1);
      }
    }
  }

  function updateCamera(dt) {
    const targetX = clamp(game.player.x - view.width / 2, 0, game.world.width - view.width);
    const targetY = clamp(game.player.y - view.height / 2, 0, game.world.height - view.height);
    game.camera.x = approach(game.camera.x, targetX, 640 * dt);
    game.camera.y = approach(game.camera.y, targetY, 640 * dt);
    game.camera.shakePower = Math.max(0, game.camera.shakePower - 24 * dt);
    if (game.camera.shakePower > 0.1) {
      game.camera.shakeX = rand(-game.camera.shakePower, game.camera.shakePower);
      game.camera.shakeY = rand(-game.camera.shakePower, game.camera.shakePower);
    } else {
      game.camera.shakeX = 0;
      game.camera.shakeY = 0;
    }
  }

  function updateUI() {
    const player = game.player;
    const target = game.enemies[0] || null;
    const homeIsland = game.islands.find(function (island) {
      return island.kind === "home";
    });
    const upgradeIsland = game.islands.find(function (island) {
      return island.kind === "upgrade";
    });
    const systems = player
      ? [
          { label: "Engine", key: "engine" },
          { label: "Port", key: "port" },
          { label: "Starboard", key: "starboard" },
        ]
      : [];

    if (player) {
      const targetRange = target ? Math.round(distance(player, target)) + "m" : "Cleared";
      let mission = "Press Enter to load a random gunnery test scene.";
      if (game.phase === "playing") {
        mission =
          "Objective: sink the stationary target. Reload at " +
          homeIsland.name +
          " and visit " +
          upgradeIsland.name +
          " for a triple-shot upgrade.";
        if (player.ammo === 0) {
          mission = "Out of ammo. Return to " + homeIsland.name + " to reload before re-engaging.";
        }
      } else if (game.phase === "victory") {
        mission = "Target sunk. Press Enter to load another random drill.";
      } else if (game.phase === "defeat") {
        mission = "Your ship sank. Press Enter to load another random drill.";
      }
      objectiveText.textContent = mission;

      captainCard.innerHTML =
        "<h3>Captain</h3>" +
        '<div class="stat-grid">' +
        '<div class="stat-card"><strong>' +
        player.name +
        "</strong><span>Helm control test</span></div>" +
        '<div class="stat-card"><strong>' +
        game.layoutName +
        "</strong><span>Active drill layout</span></div>" +
        '<div class="stat-card"><strong>' +
        (target ? "Active" : "Destroyed") +
        "</strong><span>Target status</span></div>" +
        '<div class="stat-card"><strong>' +
        game.stats.docks +
        "</strong><span>Home reloads</span></div>" +
        "</div>" +
        '<p class="subtle">' +
        (target
          ? player.upgradeUnlocked
            ? "Triple-shot is online. Manage your ammo and finish the target."
            : "Reload at home when empty, or touch the upgrade island for a heavier volley."
          : "Objective complete. Press Enter to roll a new drill layout.") +
        "</p>";

      statusPanel.innerHTML =
        "<h3>Hull And Systems</h3>" +
        '<div class="meter"><label>Hull integrity</label><div class="bar"><span style="width:' +
        (player.hull / player.maxHull) * 100 +
        '%"></span></div></div>' +
        systems
          .map(function (system) {
            const value = player.systems[system.key];
            const tone = value <= 0 ? "bad" : value >= 70 ? "good" : "";
            const label = system.key === "gun" && !player.hasGun ? "Rare gun" : system.label;
            const detail =
              system.key === "gun" && !player.hasGun ? "Not equipped" : formatPercent(value);
            return (
              '<div class="system-line ' +
              tone +
              '"><span>' +
              label +
              "</span><strong>" +
              detail +
              "</strong></div>"
            );
          })
          .join("");

      weaponPanel.innerHTML =
        "<h3>Loadout</h3>" +
        '<div class="weapon-row"><span>Port broadside</span><strong>' +
        (player.systems.port <= 0
          ? "Disabled"
          : player.portCooldown <= 0
          ? "Ready"
          : player.portCooldown.toFixed(1) + "s") +
        "</strong></div>" +
        '<div class="weapon-row"><span>Starboard broadside</span><strong>' +
        (player.systems.starboard <= 0
          ? "Disabled"
          : player.starboardCooldown <= 0
          ? "Ready"
          : player.starboardCooldown.toFixed(1) + "s") +
        "</strong></div>" +
        '<div class="weapon-row"><span>Ammunition</span><strong>' +
        player.ammo +
        " / " +
        player.maxAmmo +
        "</strong></div>" +
        '<div class="weapon-row"><span>Volley size</span><strong>' +
        player.volleySize +
        (player.volleySize === 1 ? " shot" : " shots") +
        "</strong></div>" +
        '<div class="weapon-row"><span>Reload island</span><strong>' +
        homeIsland.name +
        "</strong></div>" +
        '<div class="weapon-row"><span>Target range</span><strong>' +
        targetRange +
        "</strong></div>";
    }

    logPanel.innerHTML =
      "<h3>Captain's Log</h3>" +
      (game.messages.length
        ? game.messages
            .map(function (message) {
              return '<div class="log-entry" style="color:' + message.color + '">' + message.text + "</div>";
            })
            .join("")
        : '<p class="subtle">No reports yet.</p>');
  }

  function resizeCanvases() {
    const rect = stage.getBoundingClientRect();
    view.width = Math.max(320, Math.floor(rect.width));
    view.height = Math.max(240, Math.floor(rect.height));
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = Math.floor(view.width * view.dpr);
    canvas.height = Math.floor(view.height * view.dpr);
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);

    const minimapRect = minimap.getBoundingClientRect();
    minimap.width = Math.floor(minimapRect.width * view.dpr);
    minimap.height = Math.floor((minimapRect.width * 2) / 3 * view.dpr);
    minimapCtx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
  }

  function drawOcean() {
    const gradient = ctx.createLinearGradient(0, 0, view.width, view.height);
    gradient.addColorStop(0, "#0c3648");
    gradient.addColorStop(0.55, "#0e465a");
    gradient.addColorStop(1, "#0a2635");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, view.width, view.height);

    ctx.save();
    ctx.translate(-game.camera.x + game.camera.shakeX, -game.camera.y + game.camera.shakeY);
    const startX = Math.floor(game.camera.x / 150) * 150;
    const endX = game.camera.x + view.width + 150;
    const startY = Math.floor(game.camera.y / 150) * 150;
    const endY = game.camera.y + view.height + 150;

    ctx.strokeStyle = "rgba(146, 224, 221, 0.12)";
    ctx.lineWidth = 1.2;
    for (let x = startX; x < endX; x += 150) {
      for (let y = startY; y < endY; y += 150) {
        const wave = Math.sin((x + y) * 0.01 + game.time * 1.3) * 10;
        ctx.beginPath();
        ctx.moveTo(x - 16, y + wave);
        ctx.quadraticCurveTo(x, y + 11 + wave, x + 20, y + wave);
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  function drawIslands() {
    for (let i = 0; i < game.islands.length; i += 1) {
      const island = game.islands[i];
      if (!screenVisible(island.x, island.y, island.radius + 120)) {
        continue;
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
      sandGradient.addColorStop(0, "#d8bb7d");
      sandGradient.addColorStop(0.65, "#b48a52");
      sandGradient.addColorStop(1, "#77512b");

      ctx.fillStyle = sandGradient;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, island.radius, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "rgba(35, 71, 43, 0.82)";
      for (let grove = 0; grove < 5; grove += 1) {
        const angle = island.dockAngle + Math.PI * 0.45 + grove * 0.9;
        const treeX = screen.x + Math.cos(angle) * island.radius * 0.35;
        const treeY = screen.y + Math.sin(angle) * island.radius * 0.32;
        ctx.beginPath();
        ctx.arc(treeX, treeY, island.radius * 0.18, 0, TAU);
        ctx.fill();
      }

      ctx.strokeStyle = "rgba(245, 234, 211, 0.2)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y);
      ctx.lineTo(dock.x, dock.y);
      ctx.stroke();

      const dockColor =
        island.kind === "home"
          ? "#7fd7d9"
          : island.kind === "upgrade"
          ? island.claimed
            ? "#7b7669"
            : "#f3d6a0"
          : "#6f4b2c";

      ctx.save();
      ctx.translate(dock.x, dock.y);
      ctx.rotate(island.dockAngle);
      ctx.fillStyle = dockColor;
      ctx.fillRect(-12, -32, 24, 64);
      ctx.restore();

      ctx.strokeStyle =
        island.kind === "home"
          ? "rgba(127, 215, 217, 0.45)"
          : island.kind === "upgrade" && !island.claimed
          ? "rgba(243, 214, 160, 0.45)"
          : "rgba(245, 234, 211, 0.12)";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(dock.x, dock.y, island.harborRadius + Math.sin(game.time * 2 + island.pulse) * 3, 0, TAU);
      ctx.stroke();

      ctx.fillStyle = "rgba(245, 234, 211, 0.85)";
      ctx.font = '15px Georgia, "Times New Roman", serif';
      ctx.fillText(island.name, screen.x - island.radius * 0.55, screen.y - island.radius - 12);

      if (island.kind !== "neutral") {
        ctx.fillStyle = island.kind === "home" ? "#7fd7d9" : island.claimed ? "#b1a894" : "#f3d6a0";
        ctx.font = '12px "Trebuchet MS", sans-serif';
        ctx.fillText(
          island.kind === "home" ? "Reload" : island.claimed ? "Upgrade claimed" : "Triple-shot upgrade",
          screen.x - island.radius * 0.55,
          screen.y - island.radius + 6
        );
      }
    }
  }

  function drawHazards() {
    for (let i = 0; i < game.hazards.length; i += 1) {
      const hazard = game.hazards[i];
      if (!screenVisible(hazard.x, hazard.y, hazard.radius + 40)) {
        continue;
      }

      const screen = worldToScreen(hazard.x, hazard.y);
      if (hazard.type === "reef") {
        ctx.fillStyle = "rgba(188, 87, 63, 0.82)";
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hazard.radius, 0, TAU);
        ctx.fill();
        ctx.strokeStyle = "rgba(255, 200, 183, 0.26)";
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hazard.radius + 6 + Math.sin(game.time * 2 + hazard.x) * 3, 0, TAU);
        ctx.stroke();
      } else {
        ctx.fillStyle = "#5f6a74";
        ctx.beginPath();
        ctx.arc(screen.x, screen.y, hazard.radius, 0, TAU);
        ctx.fill();
        ctx.fillStyle = "#7f8a91";
        ctx.beginPath();
        ctx.arc(screen.x - hazard.radius * 0.18, screen.y - hazard.radius * 0.22, hazard.radius * 0.4, 0, TAU);
        ctx.fill();
      }
    }
  }

  function drawBuoys() {
    for (let i = 0; i < game.buoys.length; i += 1) {
      const buoy = game.buoys[i];
      if (!screenVisible(buoy.x, buoy.y, 24)) {
        continue;
      }

      const screen = worldToScreen(buoy.x, buoy.y + Math.sin(game.time * 2 + buoy.bob) * 3);
      const color = buoy.kind === "port" ? "#d96a52" : "#7ccf96";

      ctx.strokeStyle = "rgba(245, 234, 211, 0.4)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(screen.x, screen.y - 18);
      ctx.lineTo(screen.x, screen.y + 6);
      ctx.stroke();

      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y + 8, 8, 0, TAU);
      ctx.fill();

      ctx.fillStyle = "rgba(245, 234, 211, 0.8)";
      ctx.beginPath();
      ctx.arc(screen.x - 2, screen.y + 5, 3, 0, TAU);
      ctx.fill();
    }
  }

  function drawCrates() {
    for (let i = 0; i < game.crates.length; i += 1) {
      const crate = game.crates[i];
      if (!screenVisible(crate.x, crate.y, 40)) {
        continue;
      }

      const screen = worldToScreen(crate.x, crate.y + Math.sin(game.time * 2 + crate.bob) * 4);
      const colors = {
        repair: "#9ed3b0",
        kit: "#c6e4ed",
        powder: "#f3d6a0",
        gun: "#7fd7d9",
      };
      ctx.fillStyle = colors[crate.type] || "#d5c3a6";
      ctx.fillRect(screen.x - 9, screen.y - 9, 18, 18);
      ctx.strokeStyle = "rgba(8, 23, 35, 0.65)";
      ctx.lineWidth = 2;
      ctx.strokeRect(screen.x - 9, screen.y - 9, 18, 18);
    }
  }

  function drawProjectiles() {
    for (let i = 0; i < game.projectiles.length; i += 1) {
      const projectile = game.projectiles[i];
      if (!screenVisible(projectile.x, projectile.y, projectile.radius + 8)) {
        continue;
      }
      const screen = worldToScreen(projectile.x, projectile.y);
      ctx.fillStyle = projectile.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, projectile.radius, 0, TAU);
      ctx.fill();
    }
  }

  function drawShip(ship) {
    if (!screenVisible(ship.x, ship.y, ship.radius + 80)) {
      return;
    }

    const screen = worldToScreen(ship.x, ship.y);
    ctx.save();
    ctx.translate(screen.x, screen.y);
    ctx.rotate(ship.angle);

    ctx.fillStyle = ship.color;
    ctx.beginPath();
    ctx.moveTo(ship.radius + 6, 0);
    ctx.lineTo(ship.radius * 0.25, ship.radius * 0.68);
    ctx.lineTo(-ship.radius * 0.96, ship.radius * 0.58);
    ctx.lineTo(-ship.radius * 1.15, 0);
    ctx.lineTo(-ship.radius * 0.96, -ship.radius * 0.58);
    ctx.lineTo(ship.radius * 0.25, -ship.radius * 0.68);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = ship.isPlayer ? "#2f6172" : "#482621";
    ctx.fillRect(-ship.radius * 0.3, -ship.radius * 0.26, ship.radius * 0.92, ship.radius * 0.52);

    ctx.fillStyle = "rgba(245, 234, 211, 0.78)";
    ctx.beginPath();
    ctx.moveTo(-ship.radius * 0.2, 0);
    ctx.lineTo(ship.radius * 0.15, ship.radius * 0.18);
    ctx.lineTo(ship.radius * 0.52, 0);
    ctx.lineTo(ship.radius * 0.15, -ship.radius * 0.18);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    const hullRatio = clamp(ship.hull / ship.maxHull, 0, 1);
    ctx.fillStyle = "rgba(8, 23, 35, 0.8)";
    ctx.fillRect(screen.x - 28, screen.y - ship.radius - 20, 56, 6);
    ctx.fillStyle = ship.isPlayer ? "#7fd7d9" : "#f0a37f";
    ctx.fillRect(screen.x - 28, screen.y - ship.radius - 20, 56 * hullRatio, 6);

    ctx.fillStyle = "rgba(245, 234, 211, 0.9)";
    ctx.font = '13px Georgia, "Times New Roman", serif';
    ctx.fillText(ship.name, screen.x - 28, screen.y - ship.radius - 28);
  }

  function drawParticles() {
    for (let i = 0; i < game.particles.length; i += 1) {
      const particle = game.particles[i];
      if (!screenVisible(particle.x, particle.y, particle.size + 8)) {
        continue;
      }
      const screen = worldToScreen(particle.x, particle.y);
      ctx.globalAlpha = clamp(particle.ttl, 0, 1);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(screen.x, screen.y, particle.size, 0, TAU);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  function drawCompassAndHints() {
    const target = game.enemies[0] || null;
    ctx.save();
    ctx.translate(92, 92);
    ctx.fillStyle = "rgba(8, 23, 35, 0.62)";
    ctx.beginPath();
    ctx.arc(0, 0, 54, 0, TAU);
    ctx.fill();
    ctx.strokeStyle = "rgba(212, 181, 122, 0.28)";
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.rotate(game.player.angle);
    ctx.strokeStyle = "#f5ead3";
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
    ctx.fillStyle = "#f5ead3";
    ctx.fill();
    ctx.restore();

    if (target) {
      const angleToTarget = Math.atan2(target.y - game.player.y, target.x - game.player.x);
      const relative = normalizeAngle(angleToTarget - game.player.angle);
      const markerRadius = 36;
      ctx.fillStyle = "#f0a37f";
      ctx.beginPath();
      ctx.arc(92 + Math.cos(relative) * markerRadius, 92 + Math.sin(relative) * markerRadius, 5, 0, TAU);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(245, 234, 211, 0.86)";
    ctx.font = '14px "Trebuchet MS", sans-serif';
    ctx.fillText(
      target
        ? "Ammo: " + game.player.ammo + "/" + game.player.maxAmmo + "   Range: " + Math.round(distance(game.player, target)) + "m"
        : "Target cleared",
      18,
      162
    );
  }

  function drawMinimap() {
    const width = minimap.width / view.dpr;
    const height = minimap.height / view.dpr;
    minimapCtx.clearRect(0, 0, width, height);

    const gradient = minimapCtx.createLinearGradient(0, 0, width, height);
    gradient.addColorStop(0, "#0e3b4f");
    gradient.addColorStop(1, "#082434");
    minimapCtx.fillStyle = gradient;
    minimapCtx.fillRect(0, 0, width, height);

    const scaleX = width / game.world.width;
    const scaleY = height / game.world.height;

    game.islands.forEach(function (island) {
      minimapCtx.fillStyle =
        island.kind === "home"
          ? "#7fd7d9"
          : island.kind === "upgrade"
          ? island.claimed
            ? "#b1a894"
            : "#f3d6a0"
          : "#b48a52";
      minimapCtx.beginPath();
      minimapCtx.arc(island.x * scaleX, island.y * scaleY, Math.max(4, island.radius * scaleX), 0, TAU);
      minimapCtx.fill();
    });

    game.hazards.forEach(function (hazard) {
      minimapCtx.fillStyle = hazard.type === "reef" ? "#c95c3b" : "#7f8a91";
      minimapCtx.beginPath();
      minimapCtx.arc(hazard.x * scaleX, hazard.y * scaleY, Math.max(2, hazard.radius * scaleX), 0, TAU);
      minimapCtx.fill();
    });

    game.crates.forEach(function (crate) {
      minimapCtx.fillStyle = crate.type === "gun" ? "#7fd7d9" : "#d5c3a6";
      minimapCtx.fillRect(crate.x * scaleX - 2, crate.y * scaleY - 2, 4, 4);
    });

    game.buoys.forEach(function (buoy) {
      minimapCtx.fillStyle = buoy.kind === "port" ? "#d96a52" : "#7ccf96";
      minimapCtx.fillRect(buoy.x * scaleX - 2, buoy.y * scaleY - 2, 4, 4);
    });

    game.enemies.forEach(function (enemy) {
      minimapCtx.fillStyle = "#f0a37f";
      minimapCtx.beginPath();
      minimapCtx.arc(enemy.x * scaleX, enemy.y * scaleY, 3, 0, TAU);
      minimapCtx.fill();
    });

    minimapCtx.fillStyle = "#7fd7d9";
    minimapCtx.beginPath();
    minimapCtx.arc(game.player.x * scaleX, game.player.y * scaleY, 4, 0, TAU);
    minimapCtx.fill();

    minimapCtx.strokeStyle = "rgba(245, 234, 211, 0.44)";
    minimapCtx.strokeRect(game.camera.x * scaleX, game.camera.y * scaleY, view.width * scaleX, view.height * scaleY);
  }

  function render() {
    drawOcean();
    drawIslands();
    drawHazards();
    drawBuoys();
    drawCrates();
    drawProjectiles();
    drawParticles();
    game.enemies.forEach(drawShip);
    drawShip(game.player);
    drawCompassAndHints();
    drawMinimap();
    if (game.damageFlash > 0) {
      ctx.fillStyle = "rgba(217, 106, 82, " + (game.damageFlash * 0.2) + ")";
      ctx.fillRect(0, 0, view.width, view.height);
    }
  }

  function update(dt) {
    game.damageFlash = Math.max(0, game.damageFlash - dt * 1.9);
    if (game.phase === "playing") {
      game.time += dt;
      updatePlayer(dt);
      updateEnemies(dt);
      updateProjectiles(dt);
      updateParticles(dt);
      updateMessages(dt);
      updateCamera(dt);
      updateUI();
      if (game.enemies.length === 0 && game.phase === "playing") {
        endGame(true);
      }
    } else {
      updateMessages(dt);
    }

    render();
  }

  function handleKeyDown(event) {
    if (
      [
        "Space",
        "KeyW",
        "KeyA",
        "KeyS",
        "KeyD",
        "ArrowUp",
        "ArrowDown",
        "ArrowLeft",
        "ArrowRight",
        "KeyQ",
        "KeyE",
        "Enter",
      ].includes(event.code)
    ) {
      event.preventDefault();
    }

    if (event.code === "Enter" && game.phase !== "playing") {
      startGame();
      return;
    }

    keys.add(event.code);
    if (game.phase !== "playing") {
      return;
    }

    if (event.repeat && event.code !== "Space") {
      return;
    }

    if (event.code === "KeyQ") {
      fireBroadside(game.player, "port");
    } else if (event.code === "KeyE") {
      fireBroadside(game.player, "starboard");
    }
  }

  function handleKeyUp(event) {
    keys.delete(event.code);
  }

  let lastFrame = performance.now();
  function frame(timestamp) {
    const dt = Math.min(0.033, (timestamp - lastFrame) / 1000);
    lastFrame = timestamp;
    update(dt);
    requestAnimationFrame(frame);
  }

  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  window.addEventListener("resize", resizeCanvases);

  resetWorld(false);
  game.phase = "menu";
  resizeCanvases();
  updateUI();
  requestAnimationFrame(frame);
})();
