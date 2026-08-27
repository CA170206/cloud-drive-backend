const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");

const { pool } = require("../config/database");

const generateToken = (user) => {
  return jwt.sign(
    {
      userId: user.id,
      email: user.email,
    },
    process.env.JWT_SECRET,
    {
      expiresIn: "1d",
    }
  );
};

const register = async (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Name, email and password are required",
        },
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Password must be at least 6 characters",
        },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await pool.query(
      "SELECT id FROM users WHERE email = $1",
      [normalizedEmail]
    );

    if (existingUser.rows.length > 0) {
      return res.status(409).json({
        error: {
          code: "USER_EXISTS",
          message: "An account with this email already exists",
        },
      });
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name)
       VALUES ($1, $2, $3)
       RETURNING id, email, name, image_url, created_at`,
      [normalizedEmail, passwordHash, name.trim()]
    );

    const user = result.rows[0];
    const token = generateToken(user);

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(201).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Register error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to create account",
      },
    });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        error: {
          code: "VALIDATION_ERROR",
          message: "Email and password are required",
        },
      });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const result = await pool.query(
      `SELECT id, email, name, image_url, password_hash, created_at
       FROM users
       WHERE email = $1`,
      [normalizedEmail]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    const user = result.rows[0];

    const passwordMatches = await bcrypt.compare(
      password,
      user.password_hash
    );

    if (!passwordMatches) {
      return res.status(401).json({
        error: {
          code: "INVALID_CREDENTIALS",
          message: "Invalid email or password",
        },
      });
    }

    delete user.password_hash;

    const token = generateToken(user);

    res.cookie("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({
      success: true,
      user,
    });
  } catch (error) {
    console.error("Login error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to login",
      },
    });
  }
};

const getMe = async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT id, email, name, image_url, created_at
       FROM users
       WHERE id = $1`,
      [req.user.userId]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({
        error: {
          code: "USER_NOT_FOUND",
          message: "User not found",
        },
      });
    }

    return res.status(200).json({
      success: true,
      user: result.rows[0],
    });
  } catch (error) {
    console.error("Get user error:", error);

    return res.status(500).json({
      error: {
        code: "INTERNAL_ERROR",
        message: "Unable to fetch user",
      },
    });
  }
};

const logout = async (req, res) => {
  res.clearCookie("token", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });

  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

module.exports = {
  register,
  login,
  getMe,
  logout,
};