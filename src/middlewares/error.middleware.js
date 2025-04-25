import { ErrorHelper, ERROR_CODES } from '../constants/errorCodes.js';
import winston from 'winston';
import { inspect } from 'util';

// Налаштування логера Winston
const logger = winston.createLogger({
  level: 'error',
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.json()
  ),
  transports: [
    new winston.transports.File({ filename: 'logs/error.log' }),
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    })
  ]
});

/**
 * Middleware для обробки помилок
 */
class ErrorMiddleware {
  /**
   * Головний обробник помилок
   */
  static handler = (error, request, response, next) => {
    try {
      // Логування повної інформації про помилку
      this.logError(error, request);

      // Обробка помилок валідації
      if (error.code === 'VALIDATION_ERROR') {
        return this.handleValidationError(error, response);
      }

      // Обробка JWT помилок
      if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
        return this.handleJwtError(error, response);
      }

      // Обробка помилок бази даних
      if (error.name && error.name.includes('Sequelize')) {
        return this.handleDatabaseError(error, response);
      }

      // Обробка стандартних HTTP помилок
      if (error.status && error.status >= 400 && error.status < 500) {
        return this.handleClientError(error, response);
      }

      // Обробка всіх інших помилок як серверних
      this.handleServerError(error, response);
    } catch (handlerError) {
      // Резервний обробник, якщо щось пішло не так в самому middleware
      logger.error('Critical error in error handler:', handlerError);
      response.status(500).json({
        error: ErrorHelper.createError(
          'INTERNAL_ERROR',
          'Критична помилка сервера'
        )
      });
    }
  };

  /**
   * Логування помилки з додатковим контекстом
   */
  static logError = (error, request) => {
    const logData = {
      timestamp: new Date().toISOString(),
      error: {
        name: error.name,
        message: error.message,
        code: error.code,
        stack: error.stack
      },
      request: {
        method: request.method,
        url: request.originalUrl,
        params: request.params,
        query: request.query,
        body: request.body,
        ip: request.ip,
        user: request.user ? {
          id: request.user.id,
          role: request.user.role
        } : null
      }
    };

    logger.error('Error occurred:', inspect(logData, { depth: 5 }));
  };

  /**
   * Обробка помилок валідації
   */
  static handleValidationError = (error, response) => {
    response.status(error.status || 400).json({
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
        timestamp: new Date().toISOString()
      }
    });
  };

  /**
   * Обробка JWT помилок
   */
  static handleJwtError = (error, response) => {
    const errorCode = error.name === 'TokenExpiredError' 
      ? 'TOKEN_EXPIRED' 
      : 'INVALID_TOKEN';

    response.status(401).json({
      error: ErrorHelper.createError(
        errorCode,
        error.name === 'TokenExpiredError' 
          ? 'Термін дії токену закінчився' 
          : 'Невірний токен автентифікації'
      )
    });
  };

  /**
   * Обробка помилок бази даних
   */
  static handleDatabaseError = (error, response) => {
    let statusCode = 500;
    let errorCode = 'DATABASE_ERROR';
    let message = 'Помилка бази даних';

    // Специфічні помилки Sequelize
    if (error.name === 'SequelizeUniqueConstraintError') {
      statusCode = 409;
      errorCode = 'CONFLICT';
      message = 'Конфлікт унікальних значень';
    } else if (error.name === 'SequelizeValidationError') {
      statusCode = 400;
      errorCode = 'VALIDATION_ERROR';
      message = 'Помилка валідації даних';
    } else if (error.name === 'SequelizeForeignKeyConstraintError') {
      statusCode = 400;
      errorCode = 'RELATED_RESOURCE_ERROR';
      message = 'Пов\'язаний ресурс не знайдений';
    }

    response.status(statusCode).json({
      error: ErrorHelper.createError(
        errorCode,
        message,
        { details: error.errors ? error.errors.map(e => e.message) : [error.message] }
      )
    });
  };

  /**
   * Обробка клієнтських помилок (4xx)
   */
  static handleClientError = (error, response) => {
    response.status(error.status).json({
      error: ErrorHelper.createError(
        error.code || 'CLIENT_ERROR',
        error.message || 'Невірний запит',
        error.details
      )
    });
  };

  /**
   * Обробка серверних помилок (5xx)
   */
  static handleServerError = (error, response) => {
    // Приховуємо деталі помилки в production
    const showDetails = process.env.NODE_ENV !== 'production';
    
    response.status(500).json({
      error: ErrorHelper.createError(
        'INTERNAL_ERROR',
        'Внутрішня помилка сервера',
        showDetails ? {
          originalError: {
            message: error.message,
            stack: error.stack
          }
        } : null
      )
    });
  };

  /**
   * Middleware для обробки неіснуючих маршрутів
   */
  static notFoundHandler = (request, response, next) => {
    response.status(404).json({
      error: ErrorHelper.createError(
        'NOT_FOUND',
        `Маршрут ${request.method} ${request.originalUrl} не знайдено`
      )
    });
  };
}

export default ErrorMiddleware;