import { Sequelize } from 'sequelize';
import config from './config.js';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

// Шляхи для ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ініціалізація Sequelize з конфігурацією
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'postgres',
    logging: config.database.logging ? console.log : false,
    pool: {
      max: config.database.pool.max,
      min: config.database.pool.min,
      acquire: config.database.pool.acquire,
      idle: config.database.pool.idle,
    },
    dialectOptions: config.database.dialectOptions,
    define: {
      timestamps: true,          // Додає createdAt, updatedAt
      underscored: true,         // snake_case замість camelCase
      freezeTableName: true,     // Забороняє автоматичну множину імен таблиць
      paranoid: true,            // Додає deletedAt для soft delete
      hooks: {},                 // Глобальні хуки моделей
    },
  }
);

// Автоматичний імпорт усіх моделей з папки `models`
const models = {};
const modelsPath = path.join(__dirname, '../src/db/models');

fs.readdirSync(modelsPath)
  .filter(file => file !== 'index.js' && file.endsWith('.js'))
  .forEach(async (file) => {
    const modelModule = await import(path.join(modelsPath, file));
    const model = modelModule.default(sequelize, Sequelize);
    models[model.name] = model;
  });

// Встановлення асоціацій між моделями
Object.values(models).forEach(model => {
  if (model.associate) {
    model.associate(models);
  }
});

// Тестування підключення до БД
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('🔌 Підключено до PostgreSQL');
    
    if (config.database.sync) {
      await sequelize.sync({ alter: true }); // Альтернатива: { force: true } для перезапису
      console.log('🔄 Моделі синхронізовані з БД');
    }
  } catch (error) {
    console.error('❌ Помилка підключення до БД:', error.message);
    process.exit(1);
  }
};

// Утиліти для роботи з БД
const db = {
  sequelize,
  Sequelize,
  ...models,
  testConnection,
  transaction: sequelize.transaction.bind(sequelize),
  query: sequelize.query.bind(sequelize),
};

export default db;