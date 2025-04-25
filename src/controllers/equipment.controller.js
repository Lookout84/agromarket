import { Op } from 'sequelize';
import db from '../db/models/index.js';
import { ErrorHelper } from '../constants/errorCodes.js';
import { RoleManager } from '../constants/roles.js';
import { EQUIPMENT_STATUSES } from '../constants/equipmentStatus.js';
import config from '../config/config.js';
import EmailService from '../services/email.service.js';
import slugify from 'slugify';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import { promisify } from 'util';
import crypto from 'crypto';

// Промісифіковані версії функцій
const unlinkAsync = promisify(fs.unlink);

// Шляхи для збереження файлів
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

class EquipmentController {
  /**
   * Створення нового оголошення про техніку
   */
  static createEquipment = async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'equipment', 'create')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для створення оголошень'
        );
      }

      // 2. Перевірка верифікації для продавців
      if (req.user.role === 'seller' && !req.user.isVerified) {
        throw ErrorHelper.generateError(
          'USER_NOT_VERIFIED',
          'Для публікації оголошень необхідна верифікація акаунта'
        );
      }

      const { title, description, price, year, condition, categoryId, specifications } = req.body;

      // 3. Створення оголошення
      const newEquipment = await db.Equipment.create({
        title,
        slug: slugify(title, { lower: true, strict: true }),
        description,
        price,
        currency: 'UAH',
        year,
        condition,
        categoryId,
        sellerId: req.user.id,
        specifications,
        location: req.body.location,
        status: req.user.role === 'admin' ? 'active' : 'pending_review'
      }, { transaction });

      // 4. Обробка зображень
      if (req.files && req.files.length > 0) {
        const images = req.files.map((file, index) => ({
          equipmentId: newEquipment.id,
          imageUrl: file.path.replace('public', ''),
          isMain: index === 0
        }));

        await db.EquipmentImage.bulkCreate(images, { transaction });
      }

      // 5. Для адмінів - одразу активуємо, для інших - на модерацію
      if (newEquipment.status === 'pending_review') {
        await new EmailService().sendEquipmentModerationNotification(newEquipment.id);
      }

      await transaction.commit();

      // 6. Отримання повної інформації про створене оголошення
      const createdEquipment = await db.Equipment.findByPk(newEquipment.id, {
        include: [
          {
            model: db.EquipmentImage,
            as: 'images',
            attributes: ['id', 'imageUrl', 'isMain']
          },
          {
            model: db.Category,
            as: 'category',
            attributes: ['id', 'name']
          }
        ]
      });

      // 7. Відповідь
      res.status(201).json({
        status: 'success',
        data: {
          equipment: createdEquipment
        }
      });
    } catch (error) {
      await transaction.rollback();
      
      // Видалення завантажених файлів у разі помилки
      if (req.files && req.files.length > 0) {
        await Promise.all(req.files.map(file => 
          unlinkAsync(path.join(__dirname, '../../public', file.path))
        ));
      }

      next(error);
    }
  };

  /**
   * Отримання списку оголошень
   */
  static getAllEquipment = async (req, res, next) => {
    try {
      // 1. Параметри запиту
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
      const { 
        category, 
        minPrice, 
        maxPrice, 
        year, 
        condition, 
        sellerId,
        status = 'active',
        search 
      } = req.query;

      // 2. Формування умов пошуку
      const whereConditions = {};
      if (category) whereConditions.categoryId = category;
      if (minPrice) whereConditions.price = { [Op.gte]: minPrice };
      if (maxPrice) whereConditions.price = { ...whereConditions.price, [Op.lte]: maxPrice };
      if (year) whereConditions.year = year;
      if (condition) whereConditions.condition = condition;
      if (sellerId) whereConditions.sellerId = sellerId;
      if (status) whereConditions.status = status;

      // Додаткові умови для неадмінів
      if (!RoleManager.hasPermission(req.user?.role, 'equipment', 'manage')) {
        whereConditions.status = 'active';
      }

      // Пошук за текстом
      if (search) {
        whereConditions[Op.or] = [
          { title: { [Op.iLike]: `%${search}%` } },
          { description: { [Op.iLike]: `%${search}%` } }
        ];
      }

      // 3. Запит до бази даних
      const { count, rows } = await db.Equipment.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: db.User,
            as: 'seller',
            attributes: ['id', 'email'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'company', 'avatar']
              }
            ]
          },
          {
            model: db.EquipmentImage,
            as: 'images',
            attributes: ['imageUrl'],
            limit: 1
          },
          {
            model: db.Category,
            as: 'category',
            attributes: ['id', 'name', 'slug']
          }
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        distinct: true
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
   * Отримання деталей оголошення
   */
  static getEquipmentById = async (req, res, next) => {
    try {
      // 1. Пошук оголошення
      const equipment = await db.Equipment.findOne({
        where: {
          id: req.params.id,
          // Для неадмінів показуємо тільки активні
          ...(!RoleManager.hasPermission(req.user?.role, 'equipment', 'manage') && {
            status: 'active'
          })
        },
        include: [
          {
            model: db.User,
            as: 'seller',
            attributes: ['id', 'email', 'role', 'isVerified'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'company', 'avatar', 'phone']
              }
            ]
          },
          {
            model: db.EquipmentImage,
            as: 'images',
            attributes: ['id', 'imageUrl', 'isMain']
          },
          {
            model: db.Category,
            as: 'category',
            attributes: ['id', 'name', 'specifications']
          },
          {
            model: db.Review,
            as: 'reviews',
            attributes: ['id', 'rating', 'comment', 'createdAt'],
            include: [
              {
                model: db.User,
                as: 'reviewer',
                attributes: ['id'],
                include: [
                  {
                    model: db.UserProfile,
                    as: 'profile',
                    attributes: ['firstName', 'lastName', 'avatar']
                  }
                ]
              }
            ],
            limit: 5,
            order: [['createdAt', 'DESC']]
          }
        ]
      });

      if (!equipment) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Оголошення не знайдено або недоступне'
        );
      }

      // 2. Оновлення лічильника переглядів
      if (equipment.status === 'active') {
        await equipment.increment('views');
      }

      // 3. Відповідь
      res.status(200).json({
        status: 'success',
        data: {
          equipment
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Оновлення оголошення
   */
  static updateEquipment = async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      // 1. Пошук оголошення
      const equipment = await db.Equipment.findByPk(req.params.id, {
        include: [
          {
            model: db.EquipmentImage,
            as: 'images'
          }
        ],
        transaction
      });

      if (!equipment) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Оголошення не знайдено'
        );
      }

      // 2. Перевірка прав доступу
      const isOwner = equipment.sellerId === req.user.id;
      const isAdmin = RoleManager.hasPermission(req.user.role, 'equipment', 'manage');

      if (!isOwner && !isAdmin) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для оновлення цього оголошення'
        );
      }

      // 3. Оновлення основних даних
      const { title, description, price, year, condition, categoryId, specifications, status } = req.body;

      const updateData = {};
      if (title) {
        updateData.title = title;
        updateData.slug = slugify(title, { lower: true, strict: true });
      }
      if (description) updateData.description = description;
      if (price) updateData.price = price;
      if (year) updateData.year = year;
      if (condition) updateData.condition = condition;
      if (categoryId) updateData.categoryId = categoryId;
      if (specifications) updateData.specifications = specifications;

      // Адміни можуть змінювати статус
      if (status && isAdmin) {
        updateData.status = status;
      }

      await equipment.update(updateData, { transaction });

      // 4. Обробка зображень
      if (req.files && req.files.length > 0) {
        const newImages = req.files.map(file => ({
          equipmentId: equipment.id,
          imageUrl: file.path.replace('public', ''),
          isMain: false
        }));

        await db.EquipmentImage.bulkCreate(newImages, { transaction });
      }

      // 5. Видалення зображень
      if (req.body.imagesToDelete && req.body.imagesToDelete.length > 0) {
        const imagesToDelete = await db.EquipmentImage.findAll({
          where: {
            id: req.body.imagesToDelete,
            equipmentId: equipment.id
          },
          transaction
        });

        await db.EquipmentImage.destroy({
          where: {
            id: req.body.imagesToDelete,
            equipmentId: equipment.id
          },
          transaction
        });

        // Видалення файлів з сервера
        await Promise.all(
          imagesToDelete.map(image => 
            unlinkAsync(path.join(__dirname, '../../public', image.imageUrl))
          )
        );
      }

      // 6. Оновлення головного зображення
      if (req.body.mainImageId) {
        await db.EquipmentImage.update(
          { isMain: false },
          { where: { equipmentId: equipment.id }, transaction }
        );

        await db.EquipmentImage.update(
          { isMain: true },
          { where: { id: req.body.mainImageId, equipmentId: equipment.id }, transaction }
        );
      }

      await transaction.commit();

      // 7. Отримання оновленого оголошення
      const updatedEquipment = await db.Equipment.findByPk(equipment.id, {
        include: [
          {
            model: db.EquipmentImage,
            as: 'images',
            attributes: ['id', 'imageUrl', 'isMain']
          },
          {
            model: db.Category,
            as: 'category',
            attributes: ['id', 'name']
          }
        ]
      });

      // 8. Відповідь
      res.status(200).json({
        status: 'success',
        data: {
          equipment: updatedEquipment
        }
      });
    } catch (error) {
      await transaction.rollback();
      
      // Видалення завантажених файлів у разі помилки
      if (req.files && req.files.length > 0) {
        await Promise.all(req.files.map(file => 
          unlinkAsync(path.join(__dirname, '../../public', file.path))
        ));
      }

      next(error);
    }
  };

  /**
   * Видалення оголошення
   */
  static deleteEquipment = async (req, res, next) => {
    const transaction = await db.sequelize.transaction();
    try {
      // 1. Пошук оголошення
      const equipment = await db.Equipment.findByPk(req.params.id, {
        include: [
          {
            model: db.EquipmentImage,
            as: 'images'
          }
        ],
        transaction
      });

      if (!equipment) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Оголошення не знайдено'
        );
      }

      // 2. Перевірка прав доступу
      const isOwner = equipment.sellerId === req.user.id;
      const isAdmin = RoleManager.hasPermission(req.user.role, 'equipment', 'delete');

      if (!isOwner && !isAdmin) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для видалення цього оголошення'
        );
      }

      // 3. Видалення пов'язаних даних
      await db.EquipmentImage.destroy({
        where: { equipmentId: equipment.id },
        transaction
      });

      await db.Review.destroy({
        where: { equipmentId: equipment.id },
        transaction
      });

      // 4. Видалення оголошення
      await equipment.destroy({ transaction });

      await transaction.commit();

      // 5. Видалення зображень з сервера
      if (equipment.images && equipment.images.length > 0) {
        await Promise.all(
          equipment.images.map(image => 
            unlinkAsync(path.join(__dirname, '../../public', image.imageUrl))
          )
        );
      }

      // 6. Відповідь
      res.status(204).json({
        status: 'success',
        data: null
      });
    } catch (error) {
      await transaction.rollback();
      next(error);
    }
  };

  /**
   * Додавання оголошення до обраного
   */
  static addToFavorites = async (req, res, next) => {
    try {
      // 1. Перевірка наявності оголошення
      const equipment = await db.Equipment.findByPk(req.params.id);
      if (!equipment || equipment.status !== 'active') {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Оголошення не знайдено або недоступне'
        );
      }

      // 2. Перевірка, чи вже додано до обраного
      const existingFavorite = await db.EquipmentFavorite.findOne({
        where: {
          userId: req.user.id,
          equipmentId: equipment.id
        }
      });

      if (existingFavorite) {
        throw ErrorHelper.generateError(
          'CONFLICT',
          'Оголошення вже додано до обраного'
        );
      }

      // 3. Додавання до обраного
      await db.EquipmentFavorite.create({
        userId: req.user.id,
        equipmentId: equipment.id
      });

      // 4. Відповідь
      res.status(200).json({
        status: 'success',
        message: 'Оголошення додано до обраного'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Видалення оголошення з обраного
   */
  static removeFromFavorites = async (req, res, next) => {
    try {
      // 1. Видалення з обраного
      const deleted = await db.EquipmentFavorite.destroy({
        where: {
          userId: req.user.id,
          equipmentId: req.params.id
        }
      });

      if (deleted === 0) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Оголошення не знайдено в обраному'
        );
      }

      // 2. Відповідь
      res.status(204).json({
        status: 'success',
        data: null
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання списку обраних оголошень
   */
  static getFavoriteEquipment = async (req, res, next) => {
    try {
      // 1. Параметри запиту
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      // 2. Запит до бази даних
      const { count, rows } = await db.EquipmentFavorite.findAndCountAll({
        where: { userId: req.user.id },
        include: [
          {
            model: db.Equipment,
            as: 'equipment',
            where: { status: 'active' },
            include: [
              {
                model: db.User,
                as: 'seller',
                attributes: ['id', 'email'],
                include: [
                  {
                    model: db.UserProfile,
                    as: 'profile',
                    attributes: ['firstName', 'lastName', 'company']
                  }
                ]
              },
              {
                model: db.EquipmentImage,
                as: 'images',
                attributes: ['imageUrl'],
                limit: 1
              }
            ]
          }
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']]
      });

      // 3. Відповідь
      res.status(200).json({
        status: 'success',
        pagination: {
          totalItems: count,
          totalPages: Math.ceil(count / limit),
          currentPage: page,
          itemsPerPage: limit
        },
        data: {
          favorites: rows.map(row => row.equipment)
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання оголошень поточного користувача
   */
  static getMyEquipment = async (req, res, next) => {
    try {
      // 1. Параметри запиту
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
      const { status } = req.query;

      // 2. Формування умов пошуку
      const whereConditions = { sellerId: req.user.id };
      if (status) whereConditions.status = status;

      // 3. Запит до бази даних
      const { count, rows } = await db.Equipment.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: db.EquipmentImage,
            as: 'images',
            attributes: ['imageUrl'],
            limit: 1
          },
          {
            model: db.Category,
            as: 'category',
            attributes: ['id', 'name']
          }
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']]
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
   * Зміна статусу оголошення (наприклад, при продажу)
   */
  static changeEquipmentStatus = async (req, res, next) => {
    try {
      const { status } = req.body;

      // 1. Валідація статусу
      if (!Object.keys(EQUIPMENT_STATUSES).includes(status)) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Невірний статус оголошення'
        );
      }

      // 2. Пошук оголошення
      const equipment = await db.Equipment.findByPk(req.params.id);
      if (!equipment) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Оголошення не знайдено'
        );
      }

      // 3. Перевірка прав доступу
      const isOwner = equipment.sellerId === req.user.id;
      const isAdmin = RoleManager.hasPermission(req.user.role, 'equipment', 'manage');

      if (!isOwner && !isAdmin) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для зміни статусу цього оголошення'
        );
      }

      // 4. Оновлення статусу
      await equipment.update({ status });

      // 5. Відповідь
      res.status(200).json({
        status: 'success',
        data: {
          equipment
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

export default EquipmentController;