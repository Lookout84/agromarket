import bcrypt from 'bcryptjs';
import { DataTypes } from 'sequelize';
import jwt from 'jsonwebtoken';
import config from '../../config/config.js';

export default (sequelize) => {
  const User = sequelize.define('User', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    email: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        isEmail: {
          msg: 'Некоректний формат email',
        },
        notEmpty: {
          msg: 'Email обов\'язковий',
        },
      },
      set(value) {
        this.setDataValue('email', value.toLowerCase());
      },
    },
    phone: {
      type: DataTypes.STRING(20),
      validate: {
        is: {
          args: /^\+?[0-9]{10,15}$/,
          msg: 'Некоректний формат телефону',
        },
      },
    },
    password: {
      type: DataTypes.STRING,
      allowNull: false,
      validate: {
        len: {
          args: [8, 100],
          msg: 'Пароль має містити від 8 до 100 символів',
        },
      },
    },
    role: {
      type: DataTypes.ENUM('buyer', 'seller', 'admin'),
      defaultValue: 'buyer',
      allowNull: false,
    },
    isVerified: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    lastLogin: {
      type: DataTypes.DATE,
    },
    passwordChangedAt: {
      type: DataTypes.DATE,
    },
    passwordResetToken: {
      type: DataTypes.STRING,
    },
    passwordResetExpires: {
      type: DataTypes.DATE,
    },
  }, {
    timestamps: true,
    underscored: true,
    paranoid: true,
    defaultScope: {
      attributes: { exclude: ['password', 'passwordResetToken', 'passwordResetExpires'] },
    },
    scopes: {
      withPassword: {
        attributes: { include: ['password'] },
      },
    },
  });

  // Профіль користувача (1:1)
  User.associate = (models) => {
    User.hasOne(models.UserProfile, {
      foreignKey: 'userId',
      as: 'profile',
      onDelete: 'CASCADE',
    });

    User.hasMany(models.Equipment, {
      foreignKey: 'sellerId',
      as: 'equipments',
    });

    User.hasMany(models.Message, {
      foreignKey: 'senderId',
      as: 'messages',
    });

    User.hasMany(models.Review, {
      foreignKey: 'reviewerId',
      as: 'reviews',
    });
  };

  // Хуки моделі
  User.beforeSave(async (user) => {
    if (user.changed('password')) {
      user.password = await bcrypt.hash(user.password, config.auth.saltRounds);
      user.passwordChangedAt = new Date();
    }
  });

  // Методи екземпляра
  User.prototype.comparePassword = async function(candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
  };

  User.prototype.createPasswordResetToken = function() {
    const resetToken = crypto.randomBytes(32).toString('hex');
    this.passwordResetToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
    this.passwordResetExpires = Date.now() + 10 * 60 * 1000; // 10 хвилин

    return resetToken;
  };

  User.prototype.generateAuthToken = function() {
    return jwt.sign(
      { id: this.id, role: this.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );
  };

  User.prototype.changedPasswordAfter = function(JWTTimestamp) {
    if (this.passwordChangedAt) {
      const changedTimestamp = parseInt(
        this.passwordChangedAt.getTime() / 1000,
        10
      );
      return JWTTimestamp < changedTimestamp;
    }
    return false;
  };

  // Статичні методи
  User.findByCredentials = async (email, password) => {
    const user = await User.scope('withPassword').findOne({ where: { email } });
    if (!user || !(await user.comparePassword(password))) {
      throw new Error('Неправильний email або пароль');
    }
    return user;
  };

  return User;
};