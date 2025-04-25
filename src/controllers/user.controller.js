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

class UserController {
  /**
   * Реєстрація нового користувача
   */
  static register = async (req, res, next) => {
    try {
      const { email, password, role = 'buyer', phone } = req.body;

      // 1. Перевірка, чи не існує вже користувача з таким email
      const existingUser = await db.User.findOne({ where: { email } });
      if (existingUser) {
        throw ErrorHelper.generateError(
          'CONFLICT',
          'Користувач з таким email вже існує'
        );
      }

      // 2. Створення нового користувача
      const newUser = await db.User.create({
        email,
        password,
        role,
        phone,
        isVerified: role === 'buyer' // Автоверифікація для покупців
      });

      // 3. Створення профілю користувача
      await db.UserProfile.create({
        userId: newUser.id,
        firstName: req.body.firstName,
        lastName: req.body.lastName
      });

      // 4. Верифікаційний токен для продавців
      if (role === 'seller') {
        const verifyToken = AuthMiddleware.generateEmailVerificationToken(newUser);
        await new EmailService().sendVerificationEmail(newUser.email, verifyToken);
      }

      // 5. Генерація JWT токена
      const token = await signToken(
        { id: newUser.id, role: newUser.role },
        config.auth.jwtSecret,
        { expiresIn: config.auth.jwtExpiresIn }
      );

      // 6. Відправка відповіді
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

      // 1. Перевірка наявності email та пароля
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
      const token = await signToken(
        { id: user.id, role: user.role },
        config.auth.jwtSecret,
        { expiresIn: config.auth.jwtExpiresIn }
      );

      // 6. Відправка відповіді
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
   * Отримання інформації про поточного користувача
   */
  static getMe = async (req, res, next) => {
    try {
      // 1. Отримання поточного користувача з бази даних (з актуальними даними)
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

      // 2. Відправка відповіді
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
   * Оновлення даних користувача
   */
  static updateMe = async (req, res, next) => {
    try {
      // 1. Отримання даних для оновлення
      const updateData = {
        email: req.body.email,
        phone: req.body.phone
      };

      // 2. Оновлення основної інформації
      const [updatedRows] = await db.User.update(updateData, {
        where: { id: req.user.id },
        returning: true,
        individualHooks: true
      });

      if (updatedRows === 0) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Користувач не знайдений'
        );
      }

      // 3. Оновлення профілю
      if (req.body.profile) {
        await db.UserProfile.update(req.body.profile, {
          where: { userId: req.user.id }
        });
      }

      // 4. Отримання оновленого користувача
      const updatedUser = await db.User.findByPk(req.user.id, {
        attributes: { exclude: ['password'] },
        include: ['profile']
      });

      // 5. Відправка відповіді
      res.status(200).json({
        status: 'success',
        data: {
          user: updatedUser
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Оновлення паролю
   */
  static updatePassword = async (req, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;

      // 1. Отримання користувача з паролем
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

      // 4. Генерація нового токена
      const token = await signToken(
        { id: user.id, role: user.role },
        config.auth.jwtSecret,
        { expiresIn: config.auth.jwtExpiresIn }
      );

      // 5. Відправка відповіді
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

      // 1. Пошук користувача по email
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

      // 3. Відправка email з токеном
      try {
        const resetUrl = `${req.protocol}://${req.get('host')}/api/v1/users/reset-password/${resetToken.token}`;
        await new EmailService().sendPasswordResetEmail(user.email, resetUrl);

        res.status(200).json({
          status: 'success',
          message: 'Token sent to email!'
        });
      } catch (err) {
        // Відкат змін при помилці відправки email
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

      // 1. Хешування токена для порівняння
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      // 2. Пошук користувача по токену
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

      // 4. Генерація нового токена
      const authToken = await signToken(
        { id: user.id, role: user.role },
        config.auth.jwtSecret,
        { expiresIn: config.auth.jwtExpiresIn }
      );

      // 5. Відправка відповіді
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
   * Верифікація email
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

      // 2. Оновлення статусу користувача
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

      // 3. Відправка відповіді
      res.status(200).json({
        status: 'success',
        message: 'Email успішно підтверджено'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Деактивація акаунта
   */
  static deactivateAccount = async (req, res, next) => {
    try {
      // 1. Оновлення статусу користувача
      const [updated] = await db.User.update(
        { status: 'inactive' },
        { where: { id: req.user.id } }
      );

      if (updated === 0) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Користувач не знайдений'
        );
      }

      // 2. Відправка відповіді
      res.status(204).json({
        status: 'success',
        data: null
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання списку користувачів (для адміністратора)
   */
  static getAllUsers = async (req, res, next) => {
    try {
      // 1. Перевірка прав адміністратора
      if (!RoleManager.hasPermission(req.user.role, 'users', 'read')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для перегляду списку користувачів'
        );
      }

      // 2. Параметри пагінації
      const page = req.query.page * 1 || 1;
      const limit = req.query.limit * 1 || 10;
      const offset = (page - 1) * limit;

      // 3. Запит до бази даних
      const { count, rows } = await db.User.findAndCountAll({
        attributes: { exclude: ['password'] },
        include: ['profile'],
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      // 4. Відправка відповіді
      res.status(200).json({
        status: 'success',
        results: count,
        data: {
          users: rows
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Оновлення ролі користувача (для адміністратора)
   */
  static updateUserRole = async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      // 1. Перевірка прав адміністратора
      if (!RoleManager.hasPermission(req.user.role, 'users', 'update')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для оновлення ролей користувачів'
        );
      }

      // 2. Оновлення ролі
      const [updated] = await db.User.update(
        { role },
        { where: { id: userId } }
      );

      if (updated === 0) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Користувач не знайдений'
        );
      }

      // 3. Отримання оновленого користувача
      const updatedUser = await db.User.findByPk(userId, {
        attributes: { exclude: ['password'] }
      });

      // 4. Відправка відповіді
      res.status(200).json({
        status: 'success',
        data: {
          user: updatedUser
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

export default UserController;