import { Op } from 'sequelize';
import db from '../db/models/index.js';
import { ErrorHelper } from '../constants/errorCodes.js';
import { RoleManager } from '../constants/roles.js';
import slugify from 'slugify';

class CategoryController {
  /**
   * Створення нової категорії
   */
  static createCategory = async (req, res, next) => {
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'categories', 'create')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для створення категорій'
        );
      }

      const { name, specifications = {} } = req.body;

      // 2. Перевірка на унікальність назви
      const existingCategory = await db.Category.findOne({
        where: { name }
      });

      if (existingCategory) {
        throw ErrorHelper.generateError(
          'CONFLICT',
          'Категорія з такою назвою вже існує'
        );
      }

      // 3. Створення категорії
      const newCategory = await db.Category.create({
        name,
        slug: slugify(name, { lower: true, strict: true }),
        specifications
      });

      // 4. Відповідь
      res.status(201).json({
        status: 'success',
        data: {
          category: newCategory
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання списку всіх категорій
   */
  static getAllCategories = async (req, res, next) => {
    try {
      // 1. Параметри пагінації
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
      const { activeOnly = 'true', search } = req.query;

      // 2. Формування умов пошуку
      const whereConditions = {};
      if (activeOnly === 'true') whereConditions.isActive = true;
      if (search) {
        whereConditions.name = { [Op.iLike]: `%${search}%` };
      }

      // 3. Запит до бази даних
      const { count, rows } = await db.Category.findAndCountAll({
        where: whereConditions,
        limit,
        offset,
        order: [['order', 'ASC'], ['name', 'ASC']],
        include: [
          {
            model: db.Equipment,
            as: 'equipments',
            attributes: [],
            where: { status: 'active' },
            required: false
          }
        ],
        attributes: {
          include: [
            [db.Sequelize.fn('COUNT', db.Sequelize.col('equipments.id')), 'equipmentCount']
          ]
        },
        group: ['Category.id']
      });

      // 4. Відповідь
      res.status(200).json({
        status: 'success',
        pagination: {
          totalItems: count.length,
          totalPages: Math.ceil(count.length / limit),
          currentPage: page,
          itemsPerPage: limit
        },
        data: {
          categories: rows
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання категорії за ID
   */
  static getCategoryById = async (req, res, next) => {
    try {
      const category = await db.Category.findByPk(req.params.id, {
        include: [
          {
            model: db.Equipment,
            as: 'equipments',
            where: { status: 'active' },
            attributes: ['id', 'title', 'price', 'year', 'condition'],
            required: false,
            limit: 5,
            order: [['createdAt', 'DESC']]
          }
        ]
      });

      if (!category) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Категорія не знайдена'
        );
      }

      res.status(200).json({
        status: 'success',
        data: {
          category
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Оновлення категорії
   */
  static updateCategory = async (req, res, next) => {
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'categories', 'update')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для оновлення категорій'
        );
      }

      const { id } = req.params;
      const { name, specifications, isActive, order } = req.body;

      // 2. Пошук категорії
      const category = await db.Category.findByPk(id);
      if (!category) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Категорія не знайдена'
        );
      }

      // 3. Перевірка на унікальність нової назви
      if (name && name !== category.name) {
        const existingCategory = await db.Category.findOne({
          where: { name }
        });

        if (existingCategory) {
          throw ErrorHelper.generateError(
            'CONFLICT',
            'Категорія з такою назвою вже існує'
          );
        }
      }

      // 4. Оновлення даних
      const updateData = {};
      if (name) {
        updateData.name = name;
        updateData.slug = slugify(name, { lower: true, strict: true });
      }
      if (specifications) updateData.specifications = specifications;
      if (isActive !== undefined) updateData.isActive = isActive;
      if (order !== undefined) updateData.order = order;

      await category.update(updateData);

      // 5. Відповідь
      res.status(200).json({
        status: 'success',
        data: {
          category
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Видалення категорії
   */
  static deleteCategory = async (req, res, next) => {
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'categories', 'delete')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для видалення категорій'
        );
      }

      const { id } = req.params;

      // 2. Перевірка наявності пов'язаної техніки
      const equipmentCount = await db.Equipment.count({
        where: { categoryId: id }
      });

      if (equipmentCount > 0) {
        throw ErrorHelper.generateError(
          'CONFLICT',
          'Неможливо видалити категорію, оскільки до неї прив\'язана техніка'
        );
      }

      // 3. Видалення категорії
      const deleted = await db.Category.destroy({
        where: { id }
      });

      if (deleted === 0) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Категорія не знайдена'
        );
      }

      // 4. Відповідь
      res.status(204).json({
        status: 'success',
        data: null
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання техніки в категорії
   */
  static getCategoryEquipment = async (req, res, next) => {
    try {
      // 1. Параметри запиту
      const page = parseInt(req.query.page, 10) || 1;
      const limit = parseInt(req.query.limit, 10) || 10;
      const offset = (page - 1) * limit;
      const { minPrice, maxPrice, condition, year, sortBy = 'createdAt', sortOrder = 'DESC' } = req.query;

      // 2. Формування умов пошуку
      const whereConditions = {
        categoryId: req.params.id,
        status: 'active'
      };

      if (minPrice) whereConditions.price = { [Op.gte]: minPrice };
      if (maxPrice) whereConditions.price = { ...whereConditions.price, [Op.lte]: maxPrice };
      if (condition) whereConditions.condition = condition;
      if (year) whereConditions.year = year;

      // 3. Валідація сортування
      const validSortFields = ['price', 'year', 'createdAt', 'views'];
      const sortField = validSortFields.includes(sortBy) ? sortBy : 'createdAt';
      const sortDirection = sortOrder === 'ASC' ? 'ASC' : 'DESC';

      // 4. Запит до бази даних
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
        order: [[sortField, sortDirection]],
        distinct: true
      });

      // 5. Відповідь
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
   * Оновлення порядку категорій
   */
  static updateCategoriesOrder = async (req, res, next) => {
    try {
      // 1. Перевірка прав доступу
      if (!RoleManager.hasPermission(req.user.role, 'categories', 'update')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Недостатньо прав для оновлення порядку категорій'
        );
      }

      const { orderedIds } = req.body;

      // 2. Валідація вхідних даних
      if (!Array.isArray(orderedIds) || orderedIds.length === 0) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Необхідно надати масив ID категорій у новому порядку'
        );
      }

      // 3. Оновлення порядку
      const transaction = await db.sequelize.transaction();
      try {
        for (let i = 0; i < orderedIds.length; i++) {
          await db.Category.update(
            { order: i + 1 },
            { where: { id: orderedIds[i] }, transaction }
          );
        }
        await transaction.commit();
      } catch (error) {
        await transaction.rollback();
        throw error;
      }

      // 4. Відповідь
      res.status(200).json({
        status: 'success',
        message: 'Порядок категорій успішно оновлено'
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання характеристик категорії
   */
  static getCategorySpecs = async (req, res, next) => {
    try {
      const category = await db.Category.findByPk(req.params.id, {
        attributes: ['id', 'name', 'specifications']
      });

      if (!category) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Категорія не знайдена'
        );
      }

      res.status(200).json({
        status: 'success',
        data: {
          specifications: category.specifications || {}
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

export default CategoryController;