import { DataTypes } from 'sequelize';
import config from '../../config/config.js';

export default (sequelize) => {
  const Review = sequelize.define('Review', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    rating: {
      type: DataTypes.INTEGER,
      allowNull: false,
      validate: {
        min: {
          args: [1],
          msg: 'Рейтинг не може бути меншим за 1',
        },
        max: {
          args: [5],
          msg: 'Рейтинг не може бути більшим за 5',
        },
      },
    },
    comment: {
      type: DataTypes.TEXT,
      validate: {
        len: {
          args: [10, 2000],
          msg: 'Відгук повинен містити від 10 до 2000 символів',
        },
      },
    },
    isApproved: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    photos: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      validate: {
        validatePhotos(value) {
          if (value && value.length > 5) {
            throw new Error('Можна додати не більше 5 фото');
          }
        },
      },
    },
    response: {
      type: DataTypes.TEXT,
      validate: {
        len: {
          args: [2, 1000],
          msg: 'Відповідь повинна містити від 2 до 1000 символів',
        },
      },
    },
    responseDate: {
      type: DataTypes.DATE,
    },
  }, {
    timestamps: true,
    paranoid: true,
    indexes: [
      {
        fields: ['equipmentId'],
      },
      {
        fields: ['reviewerId'],
      },
      {
        fields: ['rating'],
      },
      {
        fields: ['createdAt'],
      },
    ],
    hooks: {
      beforeSave: async (review) => {
        if (review.changed('response') && review.response) {
          review.responseDate = new Date();
        }
      },
    },
  });

  // Асоціації з іншими моделями
  Review.associate = (models) => {
    Review.belongsTo(models.Equipment, {
      foreignKey: 'equipmentId',
      as: 'equipment',
      onDelete: 'CASCADE',
    });

    Review.belongsTo(models.User, {
      foreignKey: 'reviewerId',
      as: 'reviewer',
    });

    Review.belongsTo(models.User, {
      foreignKey: 'responderId',
      as: 'responder',
    });
  };

  // Методи екземпляра
  Review.prototype.approve = async function() {
    return await this.update({ isApproved: true });
  };

  Review.prototype.addPhoto = async function(photoUrl) {
    if (this.photos.length >= 5) {
      throw new Error('Досягнуто ліміт фотографій');
    }
    return await this.update({ photos: [...this.photos, photoUrl] });
  };

  Review.prototype.addResponse = async function(response, userId) {
    return await this.update({ 
      response,
      responderId: userId,
      responseDate: new Date(),
    });
  };

  // Статичні методи
  Review.getEquipmentReviews = async function(equipmentId, options = {}) {
    const defaults = {
      where: { equipmentId, isApproved: true },
      include: ['reviewer'],
      order: [['createdAt', 'DESC']],
    };

    return await Review.findAll({ ...defaults, ...options });
  };

  Review.calculateAverageRating = async function(equipmentId) {
    const result = await Review.findOne({
      where: { equipmentId, isApproved: true },
      attributes: [
        [sequelize.fn('AVG', sequelize.col('rating')), 'avgRating'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'reviewCount'],
      ],
      raw: true,
    });

    return {
      averageRating: parseFloat(result.avgRating) || 0,
      reviewCount: parseInt(result.reviewCount) || 0,
    };
  };

  return Review;
};