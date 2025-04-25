import { Op } from 'sequelize';
import db from '../db/models/index.js';
import { ErrorHelper } from '../constants/errorCodes.js';
import config from '../config/config.js';

class SearchController {
  /**
   * Повнотекстовий пошук техніки
   */
  static fullTextSearch = async (req, res, next) => {
    try {
      const { query } = req.query;

      if (!query || query.trim().length < 3) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Пошуковий запит повинен містити принаймні 3 символи'
        );
      }

      // 1. Параметри пагінації
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      // 2. Пошук за назвою та описом
      const { count, rows } = await db.Equipment.findAndCountAll({
        where: {
          status: 'active',
          [Op.or]: [
            { title: { [Op.iLike]: `%${query}%` } },
            { description: { [Op.iLike]: `%${query}%` } }
          ]
        },
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
            model: db.Category,
            as: 'category',
            attributes: ['id', 'name', 'slug']
          },
          {
            model: db.EquipmentImage,
            as: 'images',
            attributes: ['imageUrl'],
            limit: 1
          }
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        distinct: true
      });

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
   * Розширений пошук з фільтрами
   */
  static advancedSearch = async (req, res, next) => {
    try {
      // 1. Параметри пагінації
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      // 2. Параметри фільтрації
      const {
        categoryId,
        minPrice,
        maxPrice,
        minYear,
        maxYear,
        condition,
        location,
        query
      } = req.query;

      // 3. Формування умов пошуку
      const whereConditions = {
        status: 'active'
      };

      if (categoryId) whereConditions.categoryId = categoryId;
      if (minPrice || maxPrice) {
        whereConditions.price = {};
        if (minPrice) whereConditions.price[Op.gte] = minPrice;
        if (maxPrice) whereConditions.price[Op.lte] = maxPrice;
      }
      if (minYear || maxYear) {
        whereConditions.year = {};
        if (minYear) whereConditions.year[Op.gte] = minYear;
        if (maxYear) whereConditions.year[Op.lte] = maxYear;
      }
      if (condition) whereConditions.condition = condition;
      if (location) whereConditions.location = { [Op.iLike]: `%${location}%` };
      if (query) {
        whereConditions[Op.or] = [
          { title: { [Op.iLike]: `%${query}%` } },
          { description: { [Op.iLike]: `%${query}%` } }
        ];
      }

      // 4. Параметри сортування
      let order = [['createdAt', 'DESC']];
      if (req.query.sortBy) {
        const validSortFields = ['price', 'year', 'createdAt', 'views'];
        const sortField = validSortFields.includes(req.query.sortBy) 
          ? req.query.sortBy 
          : 'createdAt';
        const sortOrder = req.query.sortOrder === 'ASC' ? 'ASC' : 'DESC';
        order = [[sortField, sortOrder]];
      }

      // 5. Запит до бази даних
      const { count, rows } = await db.Equipment.findAndCountAll({
        where: whereConditions,
        include: [
          {
            model: db.User,
            as: 'seller',
            attributes: ['id', 'email', 'isVerified'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'company']
              }
            ]
          },
          {
            model: db.Category,
            as: 'category',
            attributes: ['id', 'name', 'slug']
          },
          {
            model: db.EquipmentImage,
            as: 'images',
            attributes: ['imageUrl'],
            limit: 1
          }
        ],
        limit,
        offset,
        order,
        distinct: true
      });

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
   * Пошук техніки за геолокацією
   */
  static searchByLocation = async (req, res, next) => {
    try {
      const { lat, lng, radius = 50 } = req.query; // radius в кілометрах

      if (!lat || !lng) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Необхідно вказати координати (lat, lng)'
        );
      }

      // 1. Параметри пагінації
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;

      // 2. Формування геозапиту (спрощена версія)
      const { count, rows } = await db.Equipment.findAndCountAll({
        where: {
          status: 'active',
          location: {
            [Op.ne]: null // Містить дані про локацію
          }
        },
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
        ],
        limit,
        offset,
        order: [['createdAt', 'DESC']],
        distinct: true
      });

      // 3. Фільтрація по радіусу (в реальному додатку використовуйте PostGIS або інші гео-інструменти)
      const filteredEquipment = rows.filter(item => {
        if (!item.seller?.profile?.location?.coordinates) return false;
        // Спрощений розрахунок відстані (для прикладу)
        return true;
      });

      res.status(200).json({
        status: 'success',
        pagination: {
          totalItems: filteredEquipment.length,
          totalPages: Math.ceil(filteredEquipment.length / limit),
          currentPage: page,
          itemsPerPage: limit
        },
        data: {
          equipment: filteredEquipment.slice(offset, offset + limit)
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Пошук популярних категорій
   */
  static getPopularCategories = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 5;

      const popularCategories = await db.Category.findAll({
        attributes: [
          'id',
          'name',
          'slug',
          [
            db.Sequelize.literal('(SELECT COUNT(*) FROM "Equipment" WHERE "Equipment"."categoryId" = "Category"."id" AND "Equipment"."status" = \'active\')'),
            'equipmentCount'
          ]
        ],
        order: [
          [db.Sequelize.literal('equipmentCount'), 'DESC'],
          ['name', 'ASC']
        ],
        limit,
        where: {
          isActive: true
        }
      });

      res.status(200).json({
        status: 'success',
        data: {
          categories: popularCategories
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Пошук рекомендованої техніки
   */
  static getRecommendedEquipment = async (req, res, next) => {
    try {
      const limit = parseInt(req.query.limit, 10) || 5;
      const userId = req.user?.id;

      let whereConditions = {
        status: 'active',
        isFeatured: true
      };

      // Якщо користувач автентифікований, можна враховувати його перегляди
      if (userId) {
        // Тут можна додати логіку рекомендацій на основі історії переглядів
      }

      const recommendedEquipment = await db.Equipment.findAll({
        where: whereConditions,
        include: [
          {
            model: db.User,
            as: 'seller',
            attributes: ['id', 'email', 'isVerified'],
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
        ],
        order: [
          ['isFeatured', 'DESC'],
          ['views', 'DESC']
        ],
        limit
      });

      res.status(200).json({
        status: 'success',
        data: {
          equipment: recommendedEquipment
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Пошук техніки з подібними характеристиками
   */
  static getSimilarEquipment = async (req, res, next) => {
    try {
      const { equipmentId } = req.params;
      const limit = parseInt(req.query.limit, 10) || 4;

      // 1. Отримання поточної техніки
      const currentEquipment = await db.Equipment.findByPk(equipmentId, {
        attributes: ['categoryId', 'price', 'year', 'specifications']
      });

      if (!currentEquipment) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Техніка не знайдена'
        );
      }

      // 2. Формування умов пошуку
      const whereConditions = {
        id: { [Op.ne]: equipmentId }, // Виключаємо поточну техніку
        categoryId: currentEquipment.categoryId,
        status: 'active'
      };

      // 3. Запит до бази даних
      const similarEquipment = await db.Equipment.findAll({
        where: whereConditions,
        include: [
          {
            model: db.EquipmentImage,
            as: 'images',
            attributes: ['imageUrl'],
            limit: 1
          }
        ],
        order: [
          // Сортування за схожістю ціни
          [
            db.Sequelize.literal(`ABS(price - ${currentEquipment.price})`),
            'ASC'
          ],
          // Сортування за схожістю року
          [
            db.Sequelize.literal(`ABS(year - ${currentEquipment.year})`),
            'ASC'
          ]
        ],
        limit
      });

      res.status(200).json({
        status: 'success',
        data: {
          equipment: similarEquipment
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

export default SearchController;