import { DataTypes } from 'sequelize';
import slugify from 'slugify';

export default (sequelize) => {
  const Category = sequelize.define('Category', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    name: {
      type: DataTypes.STRING(100),
      allowNull: false,
      unique: true,
      validate: {
        notEmpty: {
          msg: 'Назва категорії обов\'язкова',
        },
        len: {
          args: [2, 100],
          msg: 'Назва категорії повинна містити від 2 до 100 символів',
        },
      },
    },
    slug: {
      type: DataTypes.STRING(120),
      unique: true,
    },
    icon: {
      type: DataTypes.STRING,
      validate: {
        isUrl: {
          msg: 'Посилання на іконку має бути валідним URL',
        },
      },
    },
    specifications: {
      type: DataTypes.JSONB,
      defaultValue: {},
      validate: {
        validateSpecs(value) {
          if (typeof value !== 'object') {
            throw new Error('Специфікації мають бути об\'єктом');
          }
        },
      },
    },
    isActive: {
      type: DataTypes.BOOLEAN,
      defaultValue: true,
    },
    order: {
      type: DataTypes.INTEGER,
      defaultValue: 0,
    },
  }, {
    timestamps: true,
    paranoid: true,
    hooks: {
      beforeValidate: (category) => {
        if (category.name) {
          category.slug = slugify(category.name, {
            lower: true,
            strict: true,
            locale: 'uk',
          });
        }
      },
      afterCreate: async (category) => {
        if (!category.order) {
          category.order = category.id;
          await category.save();
        }
      },
    },
    indexes: [
      {
        unique: true,
        fields: ['slug'],
      },
      {
        fields: ['order'],
      },
      {
        fields: ['isActive'],
      },
    ],
  });

  // Асоціації з іншими моделями
  Category.associate = (models) => {
    Category.hasMany(models.Equipment, {
      foreignKey: 'categoryId',
      as: 'equipments',
    });

    Category.belongsToMany(models.FilterGroup, {
      through: 'CategoryFilterGroups',
      foreignKey: 'categoryId',
      as: 'filterGroups',
    });
  };

  // Методи екземпляра
  Category.prototype.getSpecificationSchema = function() {
    return this.specifications || {};
  };

  Category.prototype.addSpecificationField = function(fieldName, fieldType, options = {}) {
    const specs = this.specifications || {};
    specs[fieldName] = { type: fieldType, ...options };
    return this.update({ specifications: specs });
  };

  // Статичні методи
  Category.findBySlug = async (slug) => {
    return await Category.findOne({ where: { slug } });
  };

  Category.getActiveCategories = async () => {
    return await Category.findAll({ 
      where: { isActive: true },
      order: [['order', 'ASC']],
    });
  };

  return Category;
};