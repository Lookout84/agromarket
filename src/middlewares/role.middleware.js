import { ErrorHelper } from '../constants/errorCodes.js';
import { RoleManager } from '../constants/roles.js';

/**
 * Middleware для перевірки ролей та дозволів
 */
class RoleMiddleware {
  /**
   * Перевіряє, чи користувач має необхідну роль
   * @param {string|array} allowedRoles - Роль або масив дозволених ролей
   * @returns {function} Express middleware
   */
  static restrictTo = (allowedRoles) => {
    return (request, response, next) => {
      try {
        const userRole = request.user?.role;

        if (!userRole) {
          throw ErrorHelper.generateError(
            'UNAUTHENTICATED',
            'Користувач не автентифікований'
          );
        }

        const rolesArray = Array.isArray(allowedRoles) 
          ? allowedRoles 
          : [allowedRoles];

        if (!rolesArray.includes(userRole)) {
          throw ErrorHelper.generateError(
            'FORBIDDEN',
            'Недостатньо прав для виконання цієї дії'
          );
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Перевіряє, чи користувач має необхідні дозволи
   * @param {string} resource - Ресурс для перевірки (наприклад, 'equipment')
   * @param {string} permission - Дія для перевірки (наприклад, 'create')
   * @returns {function} Express middleware
   */
  static checkPermission = (resource, permission) => {
    return async (request, response, next) => {
      try {
        const userRole = request.user?.role;

        if (!userRole) {
          throw ErrorHelper.generateError(
            'UNAUTHENTICATED',
            'Користувач не автентифікований'
          );
        }

        if (!RoleManager.hasPermission(userRole, resource, permission)) {
          throw ErrorHelper.generateError(
            'FORBIDDEN',
            `Недостатньо прав для ${permission} ${resource}`
          );
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Перевіряє, чи користувач є власником ресурсу або має адмін права
   * @param {string} modelName - Назва моделі Sequelize
   * @param {string} foreignKey - Назва поля з ідентифікатором власника
   * @returns {function} Express middleware
   */
  static isOwnerOrAdmin = (modelName, foreignKey = 'userId') => {
    return async (request, response, next) => {
      try {
        const user = request.user;
        const resourceId = request.params.id;

        if (!user) {
          throw ErrorHelper.generateError(
            'UNAUTHENTICATED',
            'Користувач не автентифікований'
          );
        }

        // Адміни завжди мають доступ
        if (user.role === 'admin') {
          return next();
        }

        // Знаходимо ресурс у базі даних
        const model = request.db[modelName];
        if (!model) {
          throw ErrorHelper.generateError(
            'INTERNAL_ERROR',
            `Модель ${modelName} не знайдена`
          );
        }

        const resource = await model.findByPk(resourceId);
        if (!resource) {
          throw ErrorHelper.generateError(
            'NOT_FOUND',
            'Ресурс не знайдено'
          );
        }

        // Перевіряємо, чи користувач є власником
        if (resource[foreignKey] !== user.id) {
          throw ErrorHelper.generateError(
            'FORBIDDEN',
            'Ви не є власником цього ресурсу'
          );
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };

  /**
   * Перевіряє, чи користувач верифікований для певних дій
   * @param {string} requiredVerification - Тип верифікації ('email', 'phone', 'full')
   * @returns {function} Express middleware
   */
  static checkVerification = (requiredVerification = 'full') => {
    return async (request, response, next) => {
      try {
        const user = request.user;

        if (!user) {
          throw ErrorHelper.generateError(
            'UNAUTHENTICATED',
            'Користувач не автентифікований'
          );
        }

        let isVerified = false;

        switch (requiredVerification) {
          case 'email':
            isVerified = user.isEmailVerified;
            break;
          case 'phone':
            isVerified = user.isPhoneVerified;
            break;
          case 'full':
            default:
            isVerified = user.isVerified;
        }

        if (!isVerified) {
          throw ErrorHelper.generateError(
            'USER_NOT_VERIFIED',
            `Для цієї дії потрібна ${requiredVerification} верифікація`
          );
        }

        next();
      } catch (error) {
        next(error);
      }
    };
  };
}

export default RoleMiddleware;