import 'dotenv/config';
import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ====== EXPRESS APP SETUP ======
const app = express();  // Define app FIRST!
app.use(cors());
app.use(express.json());

// ====== STATIC FILE SERVING ======
// Serve assets folder
app.use('/assets', express.static(join(__dirname, 'assets')));

// Serve HTML files from root
app.use(express.static(__dirname));

// ====== DATABASE CONNECTION ======
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ====== PORT CONFIGURATION ====== //
const PORT = process.env.PORT || 4000;

// ====== MONGOOSE CONNECTION ======
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/fitquest', {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
.then(() => console.log('✅ Connected to MongoDB'))
.catch(err => console.error('❌ MongoDB connection error:', err));

// ====== SERVE FRONTEND IN PRODUCTION ======
// At the END of your file, before app.listen:
if (process.env.NODE_ENV === 'production') {
  // Serve static files from the frontend build directory
  app.use(express.static(join(__dirname, 'frontend', 'dist')));
  
  // Handle SPA routing - return index.html for all routes
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'frontend', 'dist', 'index.html'));
  });
} else {
  // In development, serve the HTML files from root
  app.use(express.static(__dirname));
} //

// ====== GAME SCHEMAS ======  //
const questSchema = new mongoose.Schema({
  title: String,
  description: String,
  type: { type: String, enum: ['workout', 'hydration', 'boss'] },
  requirement: Number, // reps, cups, or boss HP
  reward: { xp: Number, gold: Number },
  completed: { type: Boolean, default: false }
});

const battleSchema = new mongoose.Schema({
  enemyName: String,
  enemyHP: Number,
  enemyMaxHP: Number,
  enemyDamage: Number,  // Add this
  enemyDescription: String, // Add this
  userHP: Number,
  userMaxHP: Number,
  completed: { type: Boolean, default: false },
  victory: { type: Boolean, default: false },
  fled: { type: Boolean, default: false },
  date: { type: Date, default: Date.now }
});

// ====== USER SCHEMA ======
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  heroName: String,
  stats: { 
    strength: { type: Number, default: 5 }, 
    stamina: { type: Number, default: 5 }, 
    agility: { type: Number, default: 5 },
    health: { type: Number, default: 100 }
  },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  gold: { type: Number, default: 100 },
  waterIntake: [{ 
    date: { type: String, default: () => new Date().toISOString().split('T')[0] }, 
    cups: Number 
  }],
  workouts: [{ 
    name: String, 
    reps: Number, 
    weight: Number, 
    xp: Number,
    date: { type: Date, default: Date.now }
  }],
  activeQuests: [questSchema],        // ← Now questSchema is defined!
  completedQuests: [questSchema],     // ← Now questSchema is defined!
  battles: [battleSchema],            // ← Now battleSchema is defined!
  inventory: [{ item: String, quantity: Number }]
});

const User = mongoose.model("User", userSchema);

// Secret key for signing tokens (keep private!)
const JWT_SECRET = process.env.JWT_SECRET;

// ====== GAME DATA ======
const QUESTS = [
  {
    title: "First Steps",
    description: "Complete 10 squats to strengthen your legs",
    type: "workout",
    requirement: 10,
    reward: { xp: 50, gold: 25 }
  },
  {
    title: "Hydration Hero", 
    description: "Drink 4 cups of water today",
    type: "hydration",
    requirement: 4,
    reward: { xp: 30, gold: 15 }
  },
  {
    title: "Push-up Power",
    description: "Complete 15 push-ups for upper body strength",
    type: "workout", 
    requirement: 15,
    reward: { xp: 75, gold: 35 }
  }
];

// ====== ENEMY DATA ======
const ENEMIES = [
  { 
    name: "The Lazy Dragon", 
    hp: 50, 
    damage: 8,
    reward: { xp: 100, gold: 50 },
    description: "A sleepy dragon that hates exercise!"
  },
  { 
    name: "Procrastination Golem", 
    hp: 80, 
    damage: 12,
    reward: { xp: 150, gold: 75 },
    description: "A creature made of excuses and delays"
  },
  { 
    name: "Motivation Slayer", 
    hp: 120, 
    damage: 15,
    reward: { xp: 200, gold: 100 },
    description: "Drains your will to workout"
  },
  { 
    name: "Couch Potato Titan", 
    hp: 150, 
    damage: 18,
    reward: { xp: 250, gold: 125 },
    description: "A titan made of laziness and snacks"
  }
];

// ====== MIDDLEWARE ======
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: "No token provided" });

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};

// ====== REGISTER ======
app.post("/register", async (req, res) => {
  try {
    const { email, password, heroName } = req.body;
    const hashed = await bcrypt.hash(password, 10);

    const user = new User({
      email,
      password: hashed,
      heroName,
      stats: { strength: 5, stamina: 5, agility: 5, health: 100 },
      level: 1,
      xp: 0,
      gold: 100,
    });

    await user.save();
    res.json({ success: true, message: "User registered" });
  } catch (err) {
    if (err.code === 11000) {
      res.status(400).json({ success: false, message: "Email already exists" });
    } else {
      res.status(500).json({ success: false, message: "Server error" });
    }
  }
});

// ====== LOGIN ======
app.post("/login", async (req, res) => {
  const { email, password } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    return res.status(400).json({ success: false, message: "User not found" });
  }

  const valid = await bcrypt.compare(password, user.password);
  if (!valid) {
    return res.status(400).json({ success: false, message: "Incorrect password" });
  }

  // Generate JWT token
  const token = jwt.sign({ email: user.email, userId: user._id }, JWT_SECRET, { expiresIn: "2h" });

  res.json({
    success: true,
    message: "Login successful",
    token,
    heroName: user.heroName,
    stats: user.stats,
    level: user.level,
    gold: user.gold,
  });
});

// ====== PROTECTED ENDPOINTS ======

// Get user profile
app.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Don't send password back
    const userData = { ...user._doc };
    delete userData.password;
    
    res.json(userData);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Log water intake
app.post("/log-water", authenticateToken, async (req, res) => {
  try {
    const { cups } = req.body;
    const today = new Date().toISOString().split('T')[0];
    
    const user = await User.findOne({ email: req.user.email });
    
    // Find today's water entry or create new one
    const todayEntry = user.waterIntake.find(entry => entry.date === today);
    
    if (todayEntry) {
      todayEntry.cups += cups;
    } else {
      user.waterIntake.push({ date: today, cups });
    }
    
    // Add small XP bonus for hydration
    user.xp += Math.round(cups * 2);
    
    await user.save();
    res.json({ success: true, message: "Water logged successfully" });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

function calculateWorkoutXP(name, reps, weight, sets = 1) {
  const baseXP = Math.floor((reps * weight * sets) / 10) + 10;
  
  // Bonus XP for certain exercises
  let bonus = 0;
  if (name.toLowerCase().includes('squat')) bonus = 5;
  if (name.toLowerCase().includes('push')) bonus = 8;
  if (name.toLowerCase().includes('plank')) bonus = 3;
  
  return baseXP + bonus;
}

// Update the log-workout endpoint to use the calculation
app.post("/log-workout", authenticateToken, async (req, res) => {
  try {
    const { name, reps, weight, sets = 1 } = req.body;
    const user = await User.findOne({ email: req.user.email });
    
    // Calculate XP based on exercise
    const xp = calculateWorkoutXP(name, reps, weight, sets);
    
    user.workouts.push({
      name,
      reps: reps * sets, // Total reps
      weight,
      xp,
      date: new Date()
    });
    
    // Add XP and potentially level up
    user.xp += xp;
    
    // Simple level up system (100 XP per level)
    const newLevel = Math.floor(user.xp / 100) + 1;
    let leveledUp = false;
    
    if (newLevel > user.level) {
      user.level = newLevel;
      leveledUp = true;
      
      // Increase stats on level up based on workout type
      if (name.toLowerCase().includes('squat') || name.toLowerCase().includes('push')) {
        user.stats.strength += 2;
      } else if (name.toLowerCase().includes('plank') || name.toLowerCase().includes('crunch')) {
        user.stats.stamina += 2;
      } else {
        user.stats.agility += 2;
      }
    }
    
    await user.save();
    res.json({ 
      success: true, 
      message: "Workout logged successfully",
      leveledUp: leveledUp,
      newLevel: leveledUp ? newLevel : null,
      xpEarned: xp
    });
  } catch (err) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// Get today's water intake
app.get("/today-water", authenticateToken, async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const user = await User.findOne({ email: req.user.email });
    
    const todayEntry = user.waterIntake.find(entry => entry.date === today);
    const cups = todayEntry ? todayEntry.cups : 0;
    
    res.json({ cups, goal: 8 }); // 8 cups goal
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// ====== GAME ENDPOINTS ======

// Get active quests
app.get("/quests", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    // Assign new quests if none active
    if (user.activeQuests.length === 0) {
      user.activeQuests = QUESTS.map(quest => ({...quest}));
      await user.save();
    }
    
    res.json(user.activeQuests);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Check quest progress
app.get("/quests/progress", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    const today = new Date().toISOString().split('T')[0];
    
    const progress = user.activeQuests.map(quest => {
      let completed = 0;
      
      if (quest.type === 'workout') {
        completed = user.workouts.reduce((total, workout) => 
          total + (workout.name.toLowerCase().includes('squat') ? workout.reps : 0), 0);
      } else if (quest.type === 'hydration') {
        const todayWater = user.waterIntake.find(entry => entry.date === today);
        completed = todayWater ? todayWater.cups : 0;
      }
      
      return {
        ...quest._doc,
        completed,
        progress: Math.min(completed / quest.requirement, 1)
      };
    });
    
    res.json(progress);
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Start enemy battle
app.post("/battle/start", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: "User not found" 
      });
    }
    
    // Don't start battle if health is too low
    if (user.stats.health <= 10) {
      return res.status(400).json({ 
        success: false, 
        message: "Your health is too low! Buy health potions first." 
      });
    }
    
    // Determine enemy based on level, with bounds checking
    const randomIndex = Math.floor(Math.random() * ENEMIES.length);
    const enemy = ENEMIES[randomIndex];
    
    const battle = {
      enemyName: enemy.name,
      enemyHP: enemy.hp,
      enemyMaxHP: enemy.hp,
      enemyDamage: enemy.damage,  // Add this
      enemyDescription: enemy.description, // Add this
      userHP: user.stats.health,
      userMaxHP: user.stats.health,
      completed: false,
      victory: false,
      fled: false
    };
    
    user.battles.push(battle);
    await user.save();
    
    res.json({ 
      success: true,
      battle, 
      userStats: user.stats,
      message: `A wild ${enemy.name} appears! ${enemy.description}`
    });
  } catch (err) {
    console.error("Battle start error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Server error starting battle",
      error: err.message 
    });
  }
});

// Attack enemy with workout
app.post("/battle/attack", authenticateToken, async (req, res) => {
  try {
    const { name, reps, weight } = req.body; // Changed from workoutName to name
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }
    
    // Get the most recent battle that's not completed
    const activeBattle = user.battles
      .filter(battle => !battle.completed)
      .pop();
    
    if (!activeBattle) {
      return res.status(400).json({ 
        success: false, 
        message: "No active battle found" 
      });
    }
    
    // Calculate damage based on workout and stats
    const baseDamage = Math.floor((reps * (weight || 1)) / 10) + user.stats.strength;
    activeBattle.enemyHP -= baseDamage;
    
    // Enemy counter attack
    const enemyDamage = activeBattle.enemyDamage || 10; // Default if not set
    user.stats.health -= enemyDamage;
    activeBattle.userHP = user.stats.health;
    
    // Ensure health doesn't go below 0
    if (user.stats.health < 0) user.stats.health = 0;
    if (activeBattle.enemyHP < 0) activeBattle.enemyHP = 0;
    
    // Check if battle ended
    let battleResult = null;
    
    if (activeBattle.enemyHP <= 0) {
      activeBattle.completed = true;
      activeBattle.victory = true;
      
      // Find enemy reward
      const enemy = ENEMIES.find(e => e.name === activeBattle.enemyName) || ENEMIES[0];
      const reward = enemy.reward || { xp: 50, gold: 25 };
      
      user.xp += reward.xp;
      user.gold += reward.gold;
      
      // Check level up
      const newLevel = Math.floor(user.xp / 100) + 1;
      if (newLevel > user.level) {
        user.level = newLevel;
        user.stats.strength += 2;
        user.stats.stamina += 2;
        user.stats.agility += 1;
        user.stats.health += 20; // Bonus health on level up
      }
      
      battleResult = {
        victory: true,
        reward: reward,
        message: `You defeated ${activeBattle.enemyName}! +${reward.xp} XP, +${reward.gold} Gold`
      };
      
    } else if (activeBattle.userHP <= 0) {
      activeBattle.completed = true;
      activeBattle.victory = false;
      battleResult = {
        victory: false,
        message: "You were defeated! Your health has been reduced. Buy health potions to recover."
      };
    }
    
    await user.save();
    
    res.json({
      success: true,
      damageDealt: baseDamage,
      damageTaken: enemyDamage,
      battle: activeBattle,
      userHealth: user.stats.health,
      battleResult: battleResult,
      message: activeBattle.completed ? 
        (battleResult ? battleResult.message : "Battle ended") :
        `You dealt ${baseDamage} damage! ${activeBattle.enemyName} hit you for ${enemyDamage} damage!`
    });
    
  } catch (err) {
    console.error("Battle attack error:", err);
    res.status(500).json({ 
      success: false, 
      message: "Server error in battle attack",
      error: err.message 
    });
  }
});

// Buy health potion
app.post("/shop/buy-health", authenticateToken, async (req, res) => {
  try {
    const { amount } = req.body;
    const user = await User.findOne({ email: req.user.email });
    const cost = amount * 10; // 10 gold per health point
    
    if (user.gold < cost) {
      return res.status(400).json({ 
        success: false, 
        message: `Not enough gold! Need ${cost} gold.` 
      });
    }
    
    user.gold -= cost;
    user.stats.health += amount;
    
    await user.save();
    
    res.json({
      success: true,
      healthGained: amount,
      goldSpent: cost,
      newHealth: user.stats.health,
      newGold: user.gold,
      message: `Restored ${amount} health for ${cost} gold!`
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Flee from battle
app.post("/battle/flee", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    const activeBattle = user.battles[user.battles.length - 1];
    
    if (!activeBattle || activeBattle.completed) {
      return res.status(400).json({ message: "No active battle" });
    }
    
    activeBattle.completed = true;
    activeBattle.fled = true;
    
    // Small health penalty for fleeing
    user.stats.health -= 5;
    
    await user.save();
    
    res.json({
      success: true,
      healthLost: 5,
      newHealth: user.stats.health,
      message: "You fled from battle! Lost 5 health from the escape."
    });
  } catch (err) {
    res.status(500).json({ message: "Server error" });
  }
});

// Get user's recent activities
app.get("/recent-activities", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Combine workouts and battles into recent activities
    const recentActivities = [];
    
    // Get last 5 workouts
    const recentWorkouts = user.workouts
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(workout => ({
        type: "workout",
        title: workout.name,
        details: `${workout.reps} reps${workout.weight ? ` @ ${workout.weight}kg` : ''}`,
        xp: workout.xp,
        date: workout.date,
        icon: "🏋️"
      }));
    
    // Get last 5 battles
    const recentBattles = user.battles
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 5)
      .map(battle => ({
        type: "battle",
        title: battle.enemyName || "Enemy",
        details: battle.victory ? "Victory!" : battle.fled ? "Fled" : "Defeated",
        xp: battle.victory ? 50 : 10, // Example XP
        date: battle.date,
        icon: "⚔️",
        result: battle.victory ? "victory" : "defeat"
      }));
    
    // Get last 5 water logs
    const recentWaterLogs = user.waterIntake
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 3)
      .map(water => ({
        type: "water",
        title: "Water Intake",
        details: `${water.cups} cups`,
        xp: Math.round(water.cups * 2),
        date: water.date,
        icon: "💧"
      }));
    
    // Combine all activities and sort by date
    const allActivities = [...recentWorkouts, ...recentBattles, ...recentWaterLogs]
      .sort((a, b) => new Date(b.date) - new Date(a.date))
      .slice(0, 10); // Get 10 most recent
    
    res.json({ activities: allActivities });
  } catch (err) {
    console.error("Error getting activities:", err);
    res.status(500).json({ message: "Server error" });
  }
});

// Get level progress
app.get("/level-progress", authenticateToken, async (req, res) => {
  try {
    const user = await User.findOne({ email: req.user.email });
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    const currentXP = user.xp;
    const currentLevel = user.level;
    const xpForNextLevel = currentLevel * 100; // Simple formula: level * 100 XP needed
    const xpForCurrentLevel = (currentLevel - 1) * 100;
    const xpProgress = currentXP - xpForCurrentLevel;
    const progressPercent = (xpProgress / 100) * 100;
    
    res.json({
      level: currentLevel,
      xp: currentXP,
      xpForNextLevel: xpForNextLevel,
      xpProgress: xpProgress,
      progressPercent: Math.min(progressPercent, 100),
      nextLevel: currentLevel + 1
    });
  } catch (err) {
    console.error("Error getting level progress:", err);
    res.status(500).json({ message: "Server error" });
  }
});

app.listen(4000, () =>
  console.log("✅ FitQuest backend with auth running at http://localhost:4000")
);