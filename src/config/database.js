import { Sequelize } from 'sequelize';
import config from './config.js';
import winston from 'winston';

// Налаштування логування
const logger = winston.createLogger({
  level: 'info',
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      )
    }),
    new winston.transports.File({ 
      filename: 'logs/database.log',
      format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
      )
    })
  ]
});

// Опції підключення
const sequelizeOptions = {
  host: config.database.host,
  port: config.database.port,
  dialect: config.database.dialect,
  logging: (msg) => logger.debug(msg),
  pool: {
    max: config.database.pool.max,
    min: config.database.pool.min,
    acquire: config.database.pool.acquire,
    idle: config.database.pool.idle
  },
  dialectOptions: config.database.dialectOptions,
  define: {
    timestamps: true,
    underscored: true,
    freezeTableName: true,
    paranoid: true, // Додає deletedAt для soft delete
    charset: 'utf8',
    collate: 'utf8_general_ci'
  },
  hooks: {
    beforeConnect: async (config) => {
      logger.info(`Підключення до бази даних ${config.database}...`);
    },
    afterConnect: async (connection) => {
      logger.info('Успішне підключення до бази даних');
    }
  }
};

// Ініціалізація Sequelize
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  sequelizeOptions
);

// Функція для тестування підключення
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    logger.info('З\'єднання з базою даних встановлено успішно');
    
    if (config.database.sync) {
      await sequelize.sync({ alter: true });
      logger.warn('Синхронізація моделей з базою даних (alter)');
    }
    
    return true;
  } catch (error) {
    logger.error('Помилка підключення до бази даних:', error);
    process.exit(1); // Завершення процесу при помилці підключення
  }
};

// Операції з транзакціями
const runTransaction = async (callback) => {
  const transaction = await sequelize.transaction();
  try {
    const result = await callback(transaction);
    await transaction.commit();
    return result;
  } catch (error) {
    await transaction.rollback();
    logger.error('Транзакція відкочена:', error);
    throw error;
  }
};

// Допоміжні функції для роботи з моделями
const paginate = async (model, options = {}, page = 1, limit = 10) => {
  const offset = (page - 1) * limit;
  const result = await model.findAndCountAll({
    ...options,
    limit,
    offset,
    distinct: true // Для коректного підрахунку при включенні
  });
  
  return {
    data: result.rows,
    pagination: {
      totalItems: result.count,
      totalPages: Math.ceil(result.count / limit),
      currentPage: page,
      itemsPerPage: limit
    }
  };
};

// Експорт функцій та інстансу Sequelize
export { 
  sequelize, 
  testConnection, 
  runTransaction, 
  paginate,
  Sequelize 
};

// Тестування підключення при ініціалізації
if (process.env.NODE_ENV !== 'test') {
  testConnection();
}