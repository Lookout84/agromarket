import { DataTypes } from 'sequelize';

export default (sequelize) => {
  const Message = sequelize.define('Message', {
    id: {
      type: DataTypes.UUID,
      defaultValue: DataTypes.UUIDV4,
      primaryKey: true,
    },
    content: {
      type: DataTypes.TEXT,
      allowNull: false,
      validate: {
        notEmpty: {
          msg: 'Повідомлення не може бути порожнім',
        },
        len: {
          args: [1, 2000],
          msg: 'Повідомлення повинно містити від 1 до 2000 символів',
        },
      },
    },
    isRead: {
      type: DataTypes.BOOLEAN,
      defaultValue: false,
    },
    attachments: {
      type: DataTypes.ARRAY(DataTypes.STRING),
      defaultValue: [],
      validate: {
        validateAttachments(value) {
          if (value && value.length > 5) {
            throw new Error('Можна додати не більше 5 вкладень');
          }
        },
      },
    },
    messageType: {
      type: DataTypes.ENUM('text', 'offer', 'system'),
      defaultValue: 'text',
    },
    offerDetails: {
      type: DataTypes.JSONB,
      defaultValue: null,
      validate: {
        validateOfferDetails(value) {
          if (this.messageType === 'offer' && !value) {
            throw new Error('Деталі пропозиції обов\'язкові для типів offer');
          }
        },
      },
    },
  }, {
    timestamps: true,
    paranoid: false,
    indexes: [
      {
        fields: ['chatId'],
      },
      {
        fields: ['senderId'],
      },
      {
        fields: ['createdAt'],
      },
      {
        fields: ['isRead'],
      },
    ],
    hooks: {
      afterCreate: async (message) => {
        // Оновлення чату при новому повідомленні
        await sequelize.models.Chat.update(
          { lastMessageAt: new Date() },
          { where: { id: message.chatId } }
        );
      },
    },
  });

  // Асоціації з іншими моделями
  Message.associate = (models) => {
    Message.belongsTo(models.Chat, {
      foreignKey: 'chatId',
      as: 'chat',
      onDelete: 'CASCADE',
    });

    Message.belongsTo(models.User, {
      foreignKey: 'senderId',
      as: 'sender',
    });

    Message.belongsTo(models.Equipment, {
      foreignKey: 'equipmentId',
      as: 'equipment',
    });
  };

  // Методи екземпляра
  Message.prototype.markAsRead = async function() {
    return await this.update({ isRead: true });
  };

  Message.prototype.addAttachment = async function(attachmentUrl) {
    if (this.attachments.length >= 5) {
      throw new Error('Досягнуто ліміт вкладень');
    }
    return await this.update({ 
      attachments: [...this.attachments, attachmentUrl] 
    });
  };

  Message.prototype.createOffer = async function(price, equipmentId, validUntil) {
    if (this.messageType !== 'offer') {
      throw new Error('Метод доступний тільки для повідомлень типу offer');
    }
    return await this.update({
      offerDetails: {
        price,
        equipmentId,
        validUntil: validUntil || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 днів
        status: 'pending',
      },
    });
  };

  // Статичні методи
  Message.getChatMessages = async function(chatId, options = {}) {
    const defaults = {
      where: { chatId },
      include: ['sender', 'equipment'],
      order: [['createdAt', 'ASC']],
    };
    return await Message.findAll({ ...defaults, ...options });
  };

  Message.getUnreadCount = async function(userId, chatId = null) {
    const where = {
      isRead: false,
      '$chat.participants$': { [sequelize.Op.contains]: [userId] },
      [sequelize.Op.not]: { senderId: userId },
    };

    if (chatId) {
      where.chatId = chatId;
    }

    return await Message.count({
      where,
      include: [{
        model: sequelize.models.Chat,
        as: 'chat',
        attributes: [],
      }],
    });
  };

  return Message;
};