import { Op } from 'sequelize';
import db from '../db/models/index.js';
import { ErrorHelper } from '../constants/errorCodes.js';
import { RoleManager } from '../constants/roles.js';
import config from '../config/config.js';
import EmailService from '../services/email.service.js';

class AdminController {
  /**
   * Отримання списку користувачів з пагінацією та фільтрами
   */
  static getAllUsers = async (req, res, next) => {
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'users', 'read')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для перегляду списку користувачів'
        );
      }

      // 2. Параметри запиту
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
      const { role, status, search } = req.query;

      // 3. Формування умов пошуку
      const whereConditions = {};
      if (role) whereConditions.role = role;
      if (status) whereConditions.status = status;
      if (search) {
        whereConditions[Op.or] = [
          { email: { [Op.iLike]: `%${search}%` } },
          { '$profile.firstName$': { [Op.iLike]: `%${search}%` } },
          { '$profile.lastName$': { [Op.iLike]: `%${search}%` } }
        ];
      }

      // 4. Запит до бази даних
      const { count, rows } = await db.User.findAndCountAll({
        where: whereConditions,
        attributes: { exclude: ['password'] },
        include: [
          {
            model: db.UserProfile,
            as: 'profile',
            attributes: ['firstName', 'lastName', 'avatar']
          }
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      // 5. Відповідь
      res.status(200).json({
        status: 'success',
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          itemsPerPage: limit
        },
        data: {
          users: rows
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання детальної інформації про користувача
   */
  static getUserDetails = async (req, res, next) => {
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'users', 'read')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для перегляду інформації про користувача'
        );
      }

      // 2. Пошук користувача
      const user = await db.User.findByPk(req.params.userId, {
        attributes: { exclude: ['password'] },
        include: [
          {
            model: db.UserProfile,
            as: 'profile',
            attributes: ['firstName', 'lastName', 'avatar', 'company', 'phone']
          },
          {
            model: db.Equipment,
            as: 'equipments',
            attributes: ['id', 'title', 'price', 'status', 'createdAt']
          }
        ]
      });

      if (!user) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Користувач не знайдений'
        );
      }

      // 3. Відповідь
      res.status(200).json({
        status: 'success',
        data: {
          user
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Оновлення ролі користувача
   */
  static updateUserRole = async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { role } = req.body;

      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'users', 'update')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для оновлення ролей користувачів'
        );
      }

      // 2. Валідація ролі
      if (!RoleManager.isValidRole(role)) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Невірно вказана роль користувача'
        );
      }

      // 3. Оновлення ролі
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

      // 4. Отримання оновленого користувача
      const updatedUser = await db.User.findByPk(userId, {
        attributes: { exclude: ['password'] }
      });

      // 5. Відповідь
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
   * Блокування/розблокування користувача
   */
  static toggleUserStatus = async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { status } = req.body;

      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'users', 'ban')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для зміни статусу користувача'
        );
      }

      // 2. Валідація статусу
      if (!['active', 'suspended', 'banned'].includes(status)) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Невірно вказаний статус користувача'
        );
      }

      // 3. Оновлення статусу
      const [updated] = await db.User.update(
        { status },
        { where: { id: userId } }
      );

      if (updated === 0) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Користувач не знайдений'
        );
      }

      // 4. Відправка сповіщення
      const user = await db.User.findByPk(userId);
      await new EmailService().sendAccountStatusChangeEmail(
        user.email,
        status
      );

      // 5. Відповідь
      res.status(200).json({
        status: 'success',
        message: `Статус користувача оновлено на ${status}`
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Верифікація продавця
   */
  static verifySeller = async (req, res, next) => {
    try {
      const { userId } = req.params;
      const { isVerified } = req.body;

      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'users', 'verify')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для верифікації продавців'
        );
      }

      // 2. Оновлення статусу верифікації
      const [updated] = await db.User.update(
        { isVerified },
        { 
          where: { 
            id: userId,
            role: 'seller'
          }
        }
      );

      if (updated === 0) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Продавець не знайдений'
        );
      }

      // 3. Оновлення ролі для верифікованих продавців
      if (isVerified) {
        await db.User.update(
          { role: 'verified_seller' },
          { where: { id: userId } }
        );
      }

      // 4. Відправка сповіщення
      const user = await db.User.findByPk(userId);
      await new EmailService().sendVerificationStatusEmail(
        user.email,
        isVerified
      );

      // 5. Відповідь
      res.status(200).json({
        status: 'success',
        message: `Статус верифікації продавця оновлено`
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання списку оголошень на модерацію
   */
  static getEquipmentForModeration = async (req, res, next) => {
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'equipment', 'approve')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для перегляду оголошень на модерацію'
        );
      }

      // 2. Параметри запиту
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      // 3. Запит до бази даних
      const { count, rows } = await db.Equipment.findAndCountAll({
        where: { status: 'pending_review' },
        include: [
          {
            model: db.User,
            as: 'seller',
            attributes: ['id', 'email', 'isVerified'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName']
              }
            ]
          },
          {
            model: db.Category,
            as: 'category',
            attributes: ['id', 'name']
          }
        ],
        limit,
        offset,
        order: [['createdAt', 'ASC']]
      });

      // 4. Відповідь
      res.status(200).json({
        status: 'success',
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          itemsPerPage: limit
        },
        data: {
          equipment: rows
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Модерація оголошення
   */
  static moderateEquipment = async (req, res, next) => {
    try {
      const { equipmentId } = req.params;
      const { action, reason } = req.body;

      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'equipment', 'approve')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для модерації оголошень'
        );
      }

      // 2. Валідація дії
      if (!['approve', 'reject'].includes(action)) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Невірно вказана дія модерації'
        );
      }

      // 3. Пошук оголошення
      const equipment = await db.Equipment.findByPk(equipmentId, {
        include: [
          {
            model: db.User,
            as: 'seller',
            attributes: ['id', 'email']
          }
        ]
      });

      if (!equipment) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Оголошення не знайдено'
        );
      }

      // 4. Оновлення статусу
      const newStatus = action === 'approve' ? 'active' : 'rejected';
      await equipment.update({ status: newStatus });

      // 5. Відправка сповіщення продавцю
      if (action === 'reject') {
        await new EmailService().sendEquipmentRejectionEmail(
          equipment.seller.email,
          equipment.id,
          reason
        );
      }

      // 6. Відповідь
      res.status(200).json({
        status: 'success',
        message: `Оголошення ${action === 'approve' ? 'схвалено' : 'відхилено'}`
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання статистики платформи
   */
  static getPlatformStats = async (req, res, next) => {
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'platform', 'configure')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для перегляду статистики'
        );
      }

      // 2. Отримання статистики
      const [users, equipment, reviews] = await Promise.all([
        db.User.count(),
        db.Equipment.count(),
        db.Review.count()
      ]);

      const activeSellers = await db.User.count({
        where: { role: ['seller', 'verified_seller'], status: 'active' }
      });

      const recentSignups = await db.User.findAll({
        attributes: ['id', 'email', 'createdAt', 'role'],
        include: [
          {
            model: db.UserProfile,
            as: 'profile',
            attributes: ['firstName', 'lastName']
          }
        ],
        order: [['createdAt', 'DESC']],
        limit: 5
      });

      // 3. Відповідь
      res.status(200).json({
        status: 'success',
        data: {
          stats: {
            totalUsers: users,
            totalEquipment: equipment,
            totalReviews: reviews,
            activeSellers
          },
          recentSignups
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

export default AdminController;