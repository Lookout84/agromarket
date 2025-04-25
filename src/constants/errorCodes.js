/**
 * Система кодів помилок для API платформи
 * Кожна помилка має:
 * - код (для машинної обробки)
 * - HTTP статус
 * - повідомлення за замовчуванням
 * - тип (для логування)
 */

const ERROR_CODES = {
    // 4xx Помилки клієнта
    VALIDATION_ERROR: {
      code: 'VALIDATION_ERROR',
      status: 400,
      message: 'Помилка валідації даних',
      type: 'validation'
    },
    UNAUTHENTICATED: {
      code: 'UNAUTHENTICATED',
      status: 401,
      message: 'Необхідна автентифікація',
      type: 'authentication'
    },
    FORBIDDEN: {
      code: 'FORBIDDEN',
      status: 403,
      message: 'Доступ заборонено',
      type: 'authorization'
    },
    NOT_FOUND: {
      code: 'NOT_FOUND',
      status: 404,
      message: 'Ресурс не знайдено',
      type: 'client'
    },
    CONFLICT: {
      code: 'CONFLICT',
      status: 409,
      message: 'Конфлікт даних',
      type: 'data'
    },
    TOO_MANY_REQUESTS: {
      code: 'TOO_MANY_REQUESTS',
      status: 429,
      message: 'Забагато запитів',
      type: 'rate_limit'
    },
  
    // 5xx Помилки сервера
    INTERNAL_ERROR: {
      code: 'INTERNAL_ERROR',
      status: 500,
      message: 'Внутрішня помилка сервера',
      type: 'server'
    },
    SERVICE_UNAVAILABLE: {
      code: 'SERVICE_UNAVAILABLE',
      status: 503,
      message: 'Сервіс тимчасово недоступний',
      type: 'server'
    },
  
    // Кастомні бізнес-помилки
    EQUIPMENT_NOT_AVAILABLE: {
      code: 'EQUIPMENT_NOT_AVAILABLE',
      status: 400,
      message: 'Техніка недоступна для бронювання',
      type: 'business'
    },
    INSUFFICIENT_BALANCE: {
      code: 'INSUFFICIENT_BALANCE',
      status: 402,
      message: 'Недостатньо коштів на рахунку',
      type: 'payment'
    },
    USER_NOT_VERIFIED: {
      code: 'USER_NOT_VERIFIED',
      status: 403,
      message: 'Користувач не верифікований',
      type: 'authorization'
    },
    FILE_UPLOAD_LIMIT: {
      code: 'FILE_UPLOAD_LIMIT',
      status: 413,
      message: 'Перевищено ліміт завантаження файлу',
      type: 'validation'
    }
  };
  
  // Допоміжні функції для роботи з помилками
  const ErrorHelper = {
    /**
     * Створює об'єкт помилки для відправки клієнту
     * @param {string} errorCode - Код помилки з ERROR_CODES
     * @param {string} customMessage - Опціональне кастомне повідомлення
     * @param {object} details - Додаткові деталі помилки
     * @returns {object} Об'єкт помилки
     */
    createError: (errorCode, customMessage = null, details = {}) => {
      const error = ERROR_CODES[errorCode];
      if (!error) {
        return {
          code: 'UNKNOWN_ERROR',
          status: 500,
          message: 'Невідома помилка',
          type: 'server'
        };
      }
  
      return {
        code: error.code,
        status: error.status,
        message: customMessage || error.message,
        type: error.type,
        details,
        timestamp: new Date().toISOString()
      };
    },
  
    /**
     * Перевіряє, чи є код помилки валідним
     * @param {string} errorCode
     * @returns {boolean}
     */
    isValidErrorCode: (errorCode) => {
      return Object.keys(ERROR_CODES).includes(errorCode);
    },
  
    /**
     * Генерує помилку для використання в catch блоках
     * @param {string} errorCode
     * @param {string} customMessage
     * @param {object} details
     * @returns {Error}
     */
    generateError: (errorCode, customMessage = null, details = {}) => {
      const error = ErrorHelper.createError(errorCode, customMessage, details);
      const err = new Error(error.message);
      err.status = error.status;
      err.code = error.code;
      err.details = error.details;
      return err;
    }
  };
  
  // Експорт констант і допоміжних функцій
  export {
    ERROR_CODES,
    ErrorHelper
  };
  
  // Додаткові експорти для зручності
  export const ERROR_TYPES = {
    VALIDATION: 'validation',
    AUTH: 'authentication',
    AUTHZ: 'authorization',
    CLIENT: 'client',
    DATA: 'data',
    BUSINESS: 'business',
    PAYMENT: 'payment',
    SERVER: 'server',
    RATE_LIMIT: 'rate_limit'
  };