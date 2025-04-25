import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import { ErrorHelper } from '../constants/errorCodes.js';
import config from '../config/config.js';
import db from '../db/models/index.js';

// Перетворюємо jwt.verify на Promise-based функцію
const verifyToken = promisify(jwt.verify);

/**
 * Middleware для аутентифікації та авторизації
 */
class AuthMiddleware {
  /**
   * Перевіряє JWT токен з заголовка Authorization
   */
  static authenticate = async (request, response, next) => {
    try {
      // 1. Отримуємо токен з заголовків
      let token;
      if (
        request.headers.authorization &&
        request.headers.authorization.startsWith('Bearer')
      ) {
        token = request.headers.authorization.split(' ')[1];
      } else if (request.cookies?.jwt) {
        token = request.cookies.jwt;
      }

      if (!token) {
        throw ErrorHelper.generateError(
          'UNAUTHENTICATED',
          'Будь ласка, увійдіть для отримання доступу'
        );
      }

      // 2. Валідуємо токен
      const decoded = await verifyToken(token, config.auth.jwtSecret);

      // 3. Перевіряємо, чи користувач існує
      const currentUser = await db.User.findByPk(decoded.id, {
        attributes: {
          include: ['passwordChangedAt'] // Додаємо для перевірки зміни пароля
        }
      });

      if (!currentUser) {
        throw ErrorHelper.generateError(
          'UNAUTHENTICATED',
          'Користувач, якому належить цей токен, більше не існує'
        );
      }

      // 4. Перевіряємо, чи не змінювався пароль після видачі токена
      if (currentUser.passwordChangedAt) {
        const changedTimestamp = parseInt(
          currentUser.passwordChangedAt.getTime() / 1000,
          10
        );

        if (decoded.iat < changedTimestamp) {
          throw ErrorHelper.generateError(
            'UNAUTHENTICATED',
            'Користувач змінив пароль. Будь ласка, увійдіть знову'
          );
        }
      }

      // 5. Додаємо користувача до об'єкта запиту
      request.user = currentUser;
      next();
    } catch (error) {
      // Спеціальна обробка для JWT помилок
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return next(
          ErrorHelper.generateError(
            'INVALID_TOKEN',
            error.name === 'TokenExpiredError' 
              ? 'Ваш токен закінчився. Будь ласка, увійдіть знову' 
              : 'Невірний токен. Будь ласка, увійдіть знову'
          )
        );
      }
      next(error);
    }
  };

  /**
   * Додаткова перевірка верифікації email
   */
  static checkEmailVerification = (request, response, next) => {
    if (!request.user.isEmailVerified) {
      return next(
        ErrorHelper.generateError(
          'EMAIL_NOT_VERIFIED',
          'Будь ласка, підтвердіть вашу email адресу'
        )
      );
    }
    next();
  };

  /**
   * Обмежує доступ тільки для активних користувачів
   */
  static restrictToActiveUsers = (request, response, next) => {
    if (request.user.status !== 'active') {
      return next(
        ErrorHelper.generateError(
          'ACCOUNT_INACTIVE',
          'Ваш акаунт не активний. Зв\'яжіться з підтримкою'
        )
      );
    }
    next();
  };

  /**
   * Генерує токен для підтвердження email
   */
  static generateEmailVerificationToken = (user) => {
    return jwt.sign(
      { id: user.id, purpose: 'email_verification' },
      config.auth.jwtSecret,
      { expiresIn: config.auth.emailTokenExpiresIn }
    );
  };

  /**
   * Генерує токен для скидання пароля
   */
  static generatePasswordResetToken = (user) => {
    const resetToken = crypto.randomBytes(32).toString('hex');

    const hashedToken = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    const expiresAt = Date.now() + config.auth.passwordResetTokenExpiresIn * 60 * 1000;

    return {
      token: resetToken,
      hashedToken,
      expiresAt
    };
  };

  /**
   * Верифікує токен для скидання пароля
   */
  static verifyPasswordResetToken = async (user, token) => {
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    return (
      user.passwordResetToken === hashedToken &&
      user.passwordResetExpires > Date.now()
    );
  };

  /**
   * Middleware для API ключів (для зовнішніх сервісів)
   */
  static apiKeyAuth = (request, response, next) => {
    const apiKey = request.headers['x-api-key'] || request.query.apiKey;

    if (!apiKey) {
      return next(
        ErrorHelper.generateError(
          'MISSING_API_KEY',
          'Необхідно вказати API ключ'
        )
      );
    }

    if (apiKey !== config.api.key) {
      return next(
        ErrorHelper.generateError(
          'INVALID_API_KEY',
          'Невірний API ключ'
        )
      );
    }

    next();
  };
}

export default AuthMiddleware;