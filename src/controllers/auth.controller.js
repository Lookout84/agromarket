import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import { promisify } from 'util';
import db from '../db/models/index.js';
import AuthMiddleware from '../middlewares/auth.middleware.js';
import { ErrorHelper } from '../constants/errorCodes.js';
import config from '../config/config.js';
import EmailService from '../services/email.service.js';
import { RoleManager } from '../constants/roles.js';

// Промісифіковані версії JWT функцій
const verifyToken = promisify(jwt.verify);
const signToken = promisify(jwt.sign);

class AuthController {
  /**
   * Генерація JWT токена
   * @param {object} user - Об'єкт користувача
   * @returns {string} JWT токен
   */
  static _signToken = (user) => {
    return signToken(
      { id: user.id, role: user.role },
      config.auth.jwtSecret,
      { expiresIn: config.auth.jwtExpiresIn }
    );
  };

  /**
   * Реєстрація нового користувача
   */
  static register = async (req, res, next) => {
    try {
      const { email, password, role = 'buyer', phone } = req.body;

      // 1. Валідація ролі
      if (!RoleManager.isValidRole(role)) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Невірно вказана роль користувача'
        );
      }

      // 2. Перевірка наявності користувача
      const existingUser = await db.User.findOne({ where: { email } });
      if (existingUser) {
        throw ErrorHelper.generateError(
          'CONFLICT',
          'Користувач з таким email вже існує'
        );
      }

      // 3. Створення користувача
      const newUser = await db.User.create({
        email,
        password,
        role,
        phone,
        isVerified: role === 'buyer' // Автоверифікація для покупців
      });

      // 4. Створення профілю
      await db.UserProfile.create({
        userId: newUser.id,
        firstName: req.body.firstName,
        lastName: req.body.lastName
      });

      // 5. Відправка листа верифікації для продавців
      if (role === 'seller') {
        const verifyToken = AuthMiddleware.generateEmailVerificationToken(newUser);
        await new EmailService().sendVerificationEmail(newUser.email, verifyToken);
      }

      // 6. Генерація токена
      const token = await this._signToken(newUser);

      // 7. Відповідь
      res.status(201).json({
        status: 'success',
        token,
        data: {
          user: {
            id: newUser.id,
            email: newUser.email,
            role: newUser.role,
            isVerified: newUser.isVerified
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Вхід користувача
   */
  static login = async (req, res, next) => {
    try {
      const { email, password } = req.body;

      // 1. Перевірка наявності даних
      if (!email || !password) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Будь ласка, вкажіть email та пароль'
        );
      }

      // 2. Пошук користувача
      const user = await db.User.scope('withPassword').findOne({
        where: { email },
        include: ['profile']
      });

      // 3. Перевірка пароля
      if (!user || !(await user.comparePassword(password))) {
        throw ErrorHelper.generateError(
          'UNAUTHENTICATED',
          'Невірний email або пароль'
        );
      }

      // 4. Перевірка активності акаунта
      if (user.status !== 'active') {
        throw ErrorHelper.generateError(
          'ACCOUNT_INACTIVE',
          'Ваш акаунт не активний. Зв\'яжіться з підтримкою'
        );
      }

      // 5. Генерація токена
      const token = await this._signToken(user);

      // 6. Відповідь
      res.status(200).json({
        status: 'success',
        token,
        data: {
          user: {
            id: user.id,
            email: user.email,
            firstName: user.profile?.firstName,
            lastName: user.profile?.lastName,
            role: user.role,
            isVerified: user.isVerified
          }
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання поточного користувача
   */
  static getMe = async (req, res, next) => {
    try {
      const currentUser = await db.User.findByPk(req.user.id, {
        attributes: { exclude: ['password'] },
        include: [
          {
            model: db.UserProfile,
            as: 'profile',
            attributes: ['firstName', 'lastName', 'avatar', 'company']
          }
        ]
      });

      if (!currentUser) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Користувач не знайдений'
        );
      }

      res.status(200).json({
        status: 'success',
        data: {
          user: currentUser
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Вихід користувача (завершення сесії)
   */
  static logout = (req, res) => {
    res.cookie('jwt', 'loggedout', {
      expires: new Date(Date.now() + 10 * 1000),
      httpOnly: true
    });
    res.status(200).json({ status: 'success' });
  };

  /**
   * Оновлення паролю
   */
  static updatePassword = async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // 1. Отримання користувача
      const user = await db.User.scope('withPassword').findByPk(req.user.id);

      if (!user) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Користувач не знайдений'
        );
      }

      // 2. Перевірка поточного пароля
      if (!(await user.comparePassword(currentPassword))) {
        throw ErrorHelper.generateError(
          'UNAUTHENTICATED',
          'Ваш поточний пароль невірний'
        );
      }

      // 3. Оновлення пароля
      user.password = newPassword;
      user.passwordChangedAt = new Date();
      await user.save();

      // 4. Новий токен
      const token = await this._signToken(user);

      // 5. Відповідь
      res.status(200).json({
        status: 'success',
        token,
        message: 'Пароль успішно оновлено'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Запит на скидання пароля
   */
  static forgotPassword = async (req, res, next) => {
    try {
      const { email } = req.body;

      // 1. Пошук користувача
      const user = await db.User.findOne({ where: { email } });

      if (!user) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Користувач з таким email не знайдений'
        );
      }

      // 2. Генерація токена скидання
      const resetToken = AuthMiddleware.generatePasswordResetToken(user);
      user.passwordResetToken = resetToken.hashedToken;
      user.passwordResetExpires = resetToken.expiresAt;
      await user.save({ validate: false });

      // 3. Відправка email
      try {
        const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/auth/reset-password/${resetToken.token}`;
        await new EmailService().sendPasswordResetEmail(user.email, resetUrl);

        res.status(200).json({
          status: 'success',
          message: 'Token sent to email!'
        });
      } catch (err) {
        // Відкат змін при помилці
        user.passwordResetToken = undefined;
        user.passwordResetExpires = undefined;
        await user.save({ validate: false });

        throw ErrorHelper.generateError(
          'EMAIL_SEND_ERROR',
          'Сталася помилка при відправці email. Спробуйте ще раз пізніше'
        );
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Скидання пароля
   */
  static resetPassword = async (req, res, next) => {
    try {
      const { token } = req.params;
      const { password } = req.body;

      // 1. Хешування токена
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      // 2. Пошук користувача
      const user = await db.User.findOne({
        where: {
          passwordResetToken: hashedToken,
          passwordResetExpires: { [db.Sequelize.Op.gt]: Date.now() }
        }
      });

      if (!user) {
        throw ErrorHelper.generateError(
          'INVALID_TOKEN',
          'Токен недійсний або закінчився'
        );
      }

      // 3. Оновлення пароля
      user.password = password;
      user.passwordResetToken = null;
      user.passwordResetExpires = null;
      user.passwordChangedAt = new Date();
      await user.save();

      // 4. Новий токен
      const authToken = await this._signToken(user);

      // 5. Відповідь
      res.status(200).json({
        status: 'success',
        token: authToken,
        message: 'Пароль успішно оновлено'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Підтвердження email
   */
  static verifyEmail = async (req, res, next) => {
    try {
      const { token } = req.params;

      // 1. Верифікація токена
      const decoded = await verifyToken(token, config.auth.jwtSecret);

      if (decoded.purpose !== 'email_verification') {
        throw ErrorHelper.generateError(
          'INVALID_TOKEN',
          'Невірний токен верифікації'
        );
      }

      // 2. Оновлення статусу
      const [updated] = await db.User.update(
        { isVerified: true },
        { where: { id: decoded.id, isVerified: false } }
      );

      if (updated === 0) {
        throw ErrorHelper.generateError(
          'CONFLICT',
          'Користувач вже верифікований або не існує'
        );
      }

      // 3. Відповідь
      res.status(200).json({
        status: 'success',
        message: 'Email успішно підтверджено'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Оновлення токена (refresh token)
   */
  static refreshToken = async (req, res, next) => {
    try {
      // 1. Перевірка наявності токена
      let token;
      if (
        req.headers.authorization &&
        req.headers.authorization.startsWith('Bearer')
      ) {
        token = req.headers.authorization.split(' ')[1];
      }

      if (!token) {
        throw ErrorHelper.generateError(
          'UNAUTHENTICATED',
          'Будь ласка, увійдіть для отримання доступу'
        );
      }

      // 2. Верифікація токена
      const decoded = await verifyToken(token, config.auth.jwtSecret);

      // 3. Пошук користувача
      const currentUser = await db.User.findByPk(decoded.id);
      if (!currentUser) {
        throw ErrorHelper.generateError(
          'UNAUTHENTICATED',
          'Користувач, якому належить цей токен, більше не існує'
        );
      }

      // 4. Генерація нового токена
      const newToken = await this._signToken(currentUser);

      // 5. Відповідь
      res.status(200).json({
        status: 'success',
        token: newToken
      });
    } catch (error) {
      next(error);
    }
  };
}

export default AuthController;