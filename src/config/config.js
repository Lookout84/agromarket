import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

// Розрахунок шляхів для ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Завантаження змінних оточення
dotenv.config({ path: path.join(__dirname, '../.env') });

const config = {
  // Основні налаштування сервера
  server: {
    port: process.env.PORT || 5000,
    env: process.env.NODE_ENV || 'development',
    apiVersion: process.env.API_VERSION || 'v1',
    baseUrl: process.env.BASE_URL || `http://localhost:${process.env.PORT || 5000}`,
  },

  // Налаштування бази даних
  database: {
    dialect: 'postgres',
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    username: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    database: process.env.DB_NAME || 'agro_trade_db',
    logging: process.env.DB_LOGGING === 'true',
    sync: process.env.DB_SYNC === 'true', // Увага: тільки для розробки!
    pool: {
      max: parseInt(process.env.DB_POOL_MAX) || 5,
      min: parseInt(process.env.DB_POOL_MIN) || 0,
      acquire: parseInt(process.env.DB_POOL_ACQUIRE) || 30000,
      idle: parseInt(process.env.DB_POOL_IDLE) || 10000,
    },
    dialectOptions: {
      ssl: process.env.DB_SSL === 'true' ? {
        require: true,
        rejectUnauthorized: false
      } : false,
    },
  },

  // Налаштування автентифікації
  auth: {
    jwtSecret: process.env.JWT_SECRET || 'agro_trade_secret_key',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '30d',
    refreshTokenExpiresIn: process.env.REFRESH_TOKEN_EXPIRES_IN || '90d',
    saltRounds: parseInt(process.env.SALT_ROUNDS) || 12,
  },

  // Налаштування файлового сховища
  storage: {
    provider: process.env.STORAGE_PROVIDER || 'local', // 'local', 'cloudinary', 's3'
    localPath: path.join(__dirname, '../uploads'),
    maxFileSize: 1024 * 1024 * 5, // 5MB
    allowedFileTypes: ['image/jpeg', 'image/png', 'image/webp'],
    
    // Cloudinary налаштування
    cloudinary: {
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      apiSecret: process.env.CLOUDINARY_API_SECRET,
      folder: process.env.CLOUDINARY_FOLDER || 'agro_trade',
    },

    // AWS S3 налаштування
    s3: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
      region: process.env.AWS_REGION,
      bucketName: process.env.AWS_BUCKET_NAME,
    },
  },

  // Налаштування кешування
  cache: {
    enabled: process.env.CACHE_ENABLED === 'true',
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
    ttl: parseInt(process.env.CACHE_TTL) || 3600, // 1 година
  },

  // Налаштування пошти
  email: {
    provider: process.env.EMAIL_PROVIDER || 'nodemailer', // 'nodemailer', 'sendgrid', 'ses'
    from: process.env.EMAIL_FROM || 'no-reply@agro-trade.com',
    nodemailer: {
      host: process.env.SMTP_HOST,
      port: process.env.SMTP_PORT || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    },
    sendgrid: {
      apiKey: process.env.SENDGRID_API_KEY,
    },
  },

  // Налаштування SMS
  sms: {
    provider: process.env.SMS_PROVIDER || 'twilio', // 'twilio', 'nexmo'
    twilio: {
      accountSid: process.env.TWILIO_ACCOUNT_SID,
      authToken: process.env.TWILIO_AUTH_TOKEN,
      fromNumber: process.env.TWILIO_FROM_NUMBER,
    },
  },

  // Налаштування документації API
  docs: {
    enabled: process.env.API_DOCS_ENABLED === 'true',
    route: process.env.API_DOCS_ROUTE || '/api-docs',
  },

  // Налаштування безпеки
  security: {
    corsWhitelist: process.env.CORS_WHITELIST 
      ? process.env.CORS_WHITELIST.split(',') 
      : ['http://localhost:3000'],
    rateLimit: {
      windowMs: 15 * 60 * 1000, // 15 хвилин
      max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
    },
  },

  // Налаштування WebSocket
  ws: {
    enabled: process.env.WS_ENABLED === 'true',
    pingInterval: 25000,
    pingTimeout: 5000,
  },
};

// Перевірка обов'язкових змінних оточення
const requiredEnvVars = [
  'DB_NAME', 'DB_USER', 'DB_PASSWORD',
  'JWT_SECRET', 'CLOUDINARY_CLOUD_NAME', 'CLOUDINARY_API_KEY', 'CLOUDINARY_API_SECRET'
];

if (config.server.env === 'production') {
  requiredEnvVars.forEach(envVar => {
    if (!process.env[envVar]) {
      throw new Error(`Помилка: Не вказано обов'язкову змінну оточення ${envVar}`);
    }
  });
}

export default config;