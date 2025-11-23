import express from "express";
import cors from "cors";
import mongoose from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const app = express();
app.use(cors());
app.use(express.json());

// ====== DATABASE CONNECTION ======
mongoose.connect("mongodb://localhost:27017/fitquest", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

// ====== USER SCHEMA ======
const userSchema = new mongoose.Schema({
  email: { type: String, unique: true },
  password: String,
  heroName: String,
  stats: { 
    strength: { type: Number, default: 5 }, 
    stamina: { type: Number, default: 5 }, 
    agility: { type: Number, default: 5 } 
  },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
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
});

const User = mongoose.model("User", userSchema);

// Secret key for signing tokens (keep private!)
const JWT_SECRET = "supersecret_fitquest_key";

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
      stats: { strength: 5, stamina: 5, agility: 5 },
      level: 1,
      xp: 0,
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

// Log workout
app.post("/log-workout", authenticateToken, async (req, res) => {
  try {
    const { name, reps, weight, xp } = req.body;
    
    const user = await User.findOne({ email: req.user.email });
    
    user.workouts.push({
      name,
      reps,
      weight,
      xp,
      date: new Date()
    });
    
    // Add XP and potentially level up
    user.xp += xp;
    
    // Simple level up system (1000 XP per level)
    const newLevel = Math.floor(user.xp / 1000) + 1;
    if (newLevel > user.level) {
      user.level = newLevel;
      // Increase stats on level up
      user.stats.strength += 1;
      user.stats.stamina += 1;
      user.stats.agility += 1;
    }
    
    await user.save();
    res.json({ 
      success: true, 
      message: "Workout logged successfully",
      leveledUp: newLevel > user.level,
      newLevel: newLevel > user.level ? newLevel : null
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

app.listen(4000, () =>
  console.log("✅ FitQuest backend with auth running at http://localhost:4000")
);