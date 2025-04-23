import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Sequelize } from 'sequelize';
import config from '../../config/config.js';

// Отримання шляхів для ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Ініціалізація бази даних
const sequelize = new Sequelize(
  config.database.database,
  config.database.username,
  config.database.password,
  {
    host: config.database.host,
    port: config.database.port,
    dialect: 'postgres',
    logging: config.database.logging ? console.log : false,
    pool: config.database.pool,
    dialectOptions: config.database.dialectOptions,
    define: {
      timestamps: true,
      underscored: true,
      freezeTableName: true,
    },
  }
);

const db = {
  sequelize,
  Sequelize,
};

// Автоматичний імпорт всіх моделей
const modelsPath = path.join(__dirname);
const modelFiles = fs.readdirSync(modelsPath)
  .filter(file => file !== 'index.js' && file.endsWith('.js'));

for (const file of modelFiles) {
  const modelModule = await import(path.join(modelsPath, file));
  const model = modelModule.default(sequelize, Sequelize);
  db[model.name] = model;
}

// Встановлення асоціацій між моделями
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

// Тестування підключення до БД
const testConnection = async () => {
  try {
    await sequelize.authenticate();
    console.log('🟢 Підключення до бази даних встановлено успішно');

    if (config.database.sync) {
      await sequelize.sync({ alter: true });
      console.log('🔄 Моделі синхронізовані з базою даних');
    }
  } catch (error) {
    console.error('🔴 Помилка підключення до бази даних:', error.message);
    process.exit(1);
  }
};

// Виконати тест підключення при ініціалізації
if (process.env.NODE_ENV !== 'test') {
  await testConnection();
}

export default db;