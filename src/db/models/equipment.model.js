import { DataTypes } from 'sequelize';
import slugify from 'slugify';
import config from '../../config/config.js';

export default (sequelize) => {
  const Equipment = sequelize.define('Equipment', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    title: {
      type: DataTypes.STRING(120),
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Назва техніки обов\'язкова'
        },
        len: {
          args: [5, 120],
          msg: 'Назва повинна містити від 5 до 120 символів'
        }
      }
    },
    slug: {
      type: DataTypes.STRING(150),
      unique: true
    },
    description: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Опис техніки обов\'язковий'
        },
        len: {
          args: [30, 5000],
          msg: 'Опис повинен містити від 30 до 5000 символів'
        }
      }
    },
    price: {
      type: DataTypes.DECIMAL(12, 2),
      allowNull: false,
      validate: {
        isDecimal: {
          msg: 'Ціна повинна бути числом'
        },
        min: {
          args: [0],
          msg: 'Ціна не може бути від\'ємною'
        }
      }
    },
    currency: {
      type: DataTypes.ENUM('UAH', 'USD', 'EUR'),
      defaultValue: 'UAH'
    },
    year: {
      type: DataTypes.INTEGER,
      validate: {
        isInt: {
          msg: 'Рік повинен бути цілим числом'
        },
        min: {
          args: [1900],
          msg: 'Рік не може бути менше 1900'
        },
        max: {
          args: [new Date().getFullYear() + 1],
          msg: 'Рік не може бути у майбутньому'
        }
      }
    },
    workingHours: {
      type: DataTypes.INTEGER,
      validate: {
        isInt: {
          msg: 'Мотогодини повинні бути цілим числом'
        },
        min: {
          args: [0],
          msg: 'Мотогодини не можуть бути від\'ємними'
        }
      }
    },
    condition: {
      type: DataTypes.ENUM('new', 'used', 'repair'),
      defaultValue: 'used'
    },
    location: {
      type: DataTypes.JSONB,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Локація обов\'язкова'
        }
      }
    },
    specifications: {
      type: DataTypes.JSONB,
      defaultValue: {}
    },
    status: {
      type: DataTypes.ENUM('active', 'sold', 'archived'),
      defaultValue: 'active'
    },
    views: {
      type: DataTypes.INTEGER,
      defaultValue: 0
    },
    isFeatured: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    isNegotiable: {
      type: DataTypes.BOOLEAN,
      defaultValue: false
    },
    videoUrl: {
      type: DataTypes.STRING,
      validate: {
        isUrl: {
          msg: 'Посилання на відео має бути валідним URL'
        }
      }
    }
  }, {
    timestamps: true,
    paranoid: true,
    hooks: {
      beforeValidate: (equipment) => {
        if (equipment.title) {
          equipment.slug = slugify(equipment.title, {
            lower: true,
            strict: true,
            locale: 'uk'
          });
        }
      },
      beforeCreate: (equipment) => {
        if (!equipment.specifications || typeof equipment.specifications !== 'object') {
          equipment.specifications = {};
        }
      }
    },
    indexes: [
      {
        fields: ['slug']
      },
      {
        fields: ['categoryId']
      },
      {
        fields: ['sellerId']
      },
      {
        fields: ['status']
      },
      {
        fields: ['price']
      },
      {
        fields: ['year']
      },
      {
        fields: ['createdAt']
      },
      {
        name: 'equipment_search',
        using: 'GIN',
        fields: [sequelize.fn('to_tsvector', 'simple', sequelize.col('title')), 'description']
      }
    ]
  });

  // Асоціації
  Equipment.associate = (models) => {
    Equipment.belongsTo(models.Category, {
      foreignKey: 'categoryId',
      as: 'category'
    });

    Equipment.belongsTo(models.User, {
      foreignKey: 'sellerId',
      as: 'seller'
    });

    Equipment.hasMany(models.Review, {
      foreignKey: 'equipmentId',
      as: 'reviews'
    });

    Equipment.hasMany(models.EquipmentImage, {
      foreignKey: 'equipmentId',
      as: 'images'
    });

    Equipment.belongsToMany(models.User, {
      through: 'EquipmentFavorites',
      foreignKey: 'equipmentId',
      as: 'favoritedBy'
    });
  };

  // Методи екземпляра
  Equipment.prototype.incrementViews = async function() {
    return await this.increment('views');
  };

  Equipment.prototype.markAsSold = async function() {
    return await this.update({ status: 'sold' });
  };

  Equipment.prototype.getMainImage = function() {
    if (this.images && this.images.length > 0) {
      return this.images.find(img => img.isMain) || this.images[0];
    }
    return null;
  };

  Equipment.prototype.addImage = async function(imageUrl, isMain = false) {
    const EquipmentImage = sequelize.models.EquipmentImage;
    return await EquipmentImage.create({
      equipmentId: this.id,
      imageUrl,
      isMain
    });
  };

  // Статичні методи
  Equipment.findBySlug = async function(slug, options = {}) {
    const defaults = {
      where: { slug },
      include: ['seller', 'category', 'images', 'reviews']
    };
    return await Equipment.findOne({ ...defaults, ...options });
  };

  Equipment.getFeatured = async function(limit = 5) {
    return await Equipment.findAll({
      where: { isFeatured: true, status: 'active' },
      order: [['createdAt', 'DESC']],
      limit,
      include: ['images']
    });
  };

  Equipment.search = async function(query) {
    return await Equipment.findAll({
      where: sequelize.literal(`to_tsvector('simple', title) @@ to_tsquery('simple', '${query}:*')`),
      order: [['createdAt', 'DESC']],
      include: ['images']
    });
  };

  return Equipment;
};