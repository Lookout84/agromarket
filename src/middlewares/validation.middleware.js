import { validationResult, body, param, query } from 'express-validator';
import { ErrorHelper } from '../constants/errorCodes.js';
import { EQUIPMENT_STATUSES } from '../constants/equipmentStatus.js';
import { USER_ROLES } from '../constants/roles.js';

/**
 * Middleware для валідації вхідних даних
 */
class ValidationMiddleware {
  /**
   * Обробник результатів валідації
   */
  static validate = (validations) => {
    return async (request, response, next) => {
      // Виконуємо всі валідації
      await Promise.all(validations.map(validation => validation.run(request)));

      // Отримуємо результати валідації
      const errors = validationResult(request);
      if (errors.isEmpty()) {
        return next();
      }

      // Форматуємо помилки валідації
      const formattedErrors = errors.array().map(error => ({
        field: error.path,
        value: error.value,
        message: error.msg,
        location: error.location
      }));

      // Відправляємо відповідь з помилками
      return response.status(400).json({
        error: ErrorHelper.createError(
          'VALIDATION_ERROR',
          'Помилка валідації даних',
          { errors: formattedErrors }
        )
      });
    };
  };

  /**
   * Валідація ID параметрів (UUID)
   */
  static validateIdParam = (paramName) => {
    return param(paramName)
      .isUUID(4)
      .withMessage(`Параметр ${paramName} має бути валідним UUID`)
      .trim()
      .escape();
  };

  /**
   * Валідація параметрів пагінації
   */
  static pagination = [
    query('page')
      .optional()
      .isInt({ min: 1 })
      .withMessage('Номер сторінки має бути цілим числом більше 0')
      .toInt(),
    query('limit')
      .optional()
      .isInt({ min: 1, max: 100 })
      .withMessage('Ліміт має бути цілим числом від 1 до 100')
      .toInt()
  ];

  /**
   * Валідація даних для реєстрації користувача
   */
  static registerUser = [
    body('email')
      .isEmail()
      .withMessage('Введіть коректну email адресу')
      .normalizeEmail(),
    body('password')
      .isLength({ min: 8, max: 100 })
      .withMessage('Пароль має містити від 8 до 100 символів')
      .matches(/[a-z]/)
      .withMessage('Пароль має містити принаймні одну малу літеру')
      .matches(/[A-Z]/)
      .withMessage('Пароль має містити принаймні одну велику літеру')
      .matches(/\d/)
      .withMessage('Пароль має містити принаймні одну цифру'),
    body('role')
      .optional()
      .isIn(Object.values(USER_ROLES))
      .withMessage(`Роль має бути однією з: ${Object.values(USER_ROLES).join(', ')}`)
  ];

  /**
   * Валідація даних для створення/оновлення техніки
   */
  static equipment = [
    body('title')
      .isLength({ min: 5, max: 120 })
      .withMessage('Назва повинна містити від 5 до 120 символів')
      .trim()
      .escape(),
    body('description')
      .isLength({ min: 30, max: 5000 })
      .withMessage('Опис повинен містити від 30 до 5000 символів')
      .trim()
      .escape(),
    body('price')
      .isFloat({ min: 0 })
      .withMessage('Ціна має бути додатнім числом')
      .toFloat(),
    body('year')
      .optional()
      .isInt({ min: 1900, max: new Date().getFullYear() + 1 })
      .withMessage(`Рік має бути між 1900 та ${new Date().getFullYear() + 1}`)
      .toInt(),
    body('status')
      .optional()
      .isIn(Object.keys(EQUIPMENT_STATUSES))
      .withMessage(`Невірний статус техніки`),
    body('specifications')
      .optional()
      .isObject()
      .withMessage('Специфікації мають бути об\'єктом'),
    body('location')
      .isObject()
      .withMessage('Локація має бути об\'єктом')
      .custom(location => {
        if (!location.city || !location.region) {
          throw new Error('Локація має містити місто та область');
        }
        return true;
      })
  ];

  /**
   * Валідація даних для фільтрації техніки
   */
  static equipmentFilters = [
    query('minPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Мінімальна ціна має бути додатнім числом')
      .toFloat(),
    query('maxPrice')
      .optional()
      .isFloat({ min: 0 })
      .withMessage('Максимальна ціна має бути додатнім числом')
      .toFloat(),
    query('minYear')
      .optional()
      .isInt({ min: 1900 })
      .withMessage('Мінімальний рік має бути більше 1900')
      .toInt(),
    query('maxYear')
      .optional()
      .isInt({ min: 1900 })
      .withMessage('Максимальний рік має бути більше 1900')
      .toInt(),
    query('condition')
      .optional()
      .isIn(['new', 'used', 'repair'])
      .withMessage('Стан має бути одним з: new, used, repair'),
    query('categoryId')
      .optional()
      .isUUID(4)
      .withMessage('ID категорії має бути валідним UUID')
  ];

  /**
   * Валідація даних для відгуків
   */
  static review = [
    body('rating')
      .isInt({ min: 1, max: 5 })
      .withMessage('Рейтинг має бути цілим числом від 1 до 5')
      .toInt(),
    body('comment')
      .isLength({ min: 10, max: 2000 })
      .withMessage('Коментар має містити від 10 до 2000 символів')
      .trim()
      .escape(),
    body('photos')
      .optional()
      .isArray({ max: 5 })
      .withMessage('Можна додати не більше 5 фото'),
    body('photos.*')
      .isURL()
      .withMessage('Фото має бути валідним URL')
  ];

  /**
   * Валідація даних для повідомлень чату
   */
  static message = [
    body('content')
      .isLength({ min: 1, max: 2000 })
      .withMessage('Повідомлення має містити від 1 до 2000 символів')
      .trim()
      .escape(),
    body('attachments')
      .optional()
      .isArray({ max: 5 })
      .withMessage('Можна додати не більше 5 вкладень'),
    body('attachments.*')
      .isURL()
      .withMessage('Вкладення має бути валідним URL')
  ];
}

export default ValidationMiddleware;