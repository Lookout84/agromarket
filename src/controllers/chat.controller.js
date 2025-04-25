import { Op } from 'sequelize';
import db from '../db/models/index.js';
import { ErrorHelper } from '../constants/errorCodes.js';
import { RoleManager } from '../constants/roles.js';
import AuthMiddleware from '../middlewares/auth.middleware.js';

class ChatController {
  /**
   * Створення нового чату або отримання існуючого
   */
  static getOrCreateChat = async (req, res, next) => {
    try {
      const { equipmentId, recipientId } = req.body;
      const senderId = req.user.id;

      // 1. Перевірка, чи не намагається користувач створити чат із самим собою
      if (senderId === recipientId) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Не можна створити чат із самим собою'
        );
      }

      // 2. Пошук існуючого чату
      let chat = await db.Chat.findOne({
        where: {
          [Op.or]: [
            { buyerId: senderId, sellerId: recipientId, equipmentId },
            { buyerId: recipientId, sellerId: senderId, equipmentId }
          ]
        },
        include: [
          {
            model: db.User,
            as: 'buyer',
            attributes: ['id', 'email'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'avatar']
              }
            ]
          },
          {
            model: db.User,
            as: 'seller',
            attributes: ['id', 'email'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'avatar']
              }
            ]
          },
          {
            model: db.Equipment,
            as: 'equipment',
            attributes: ['id', 'title', 'price', 'status']
          }
        ]
      });

      // 3. Якщо чат не знайдено - створюємо новий
      if (!chat) {
        // Перевірка, чи існує отримувач
        const recipient = await db.User.findByPk(recipientId);
        if (!recipient) {
          throw ErrorHelper.generateError(
            'NOT_FOUND',
            'Отримувач не знайдений'
          );
        }

        // Перевірка, чи існує техніка
        const equipment = await db.Equipment.findByPk(equipmentId);
        if (!equipment) {
          throw ErrorHelper.generateError(
            'NOT_FOUND',
            'Техніка не знайдена'
          );
        }

        // Визначення, хто покупець, а хто продавець
        const isSeller = equipment.sellerId === senderId;
        const buyerId = isSeller ? recipientId : senderId;
        const sellerId = isSeller ? senderId : recipientId;

        // Створення чату
        chat = await db.Chat.create({
          buyerId,
          sellerId,
          equipmentId,
          initiatedBy: senderId
        });

        // Додаємо зв'язки для повної інформації у відповіді
        chat = await db.Chat.findByPk(chat.id, {
          include: [
            {
              model: db.User,
              as: 'buyer',
              attributes: ['id', 'email'],
              include: [
                {
                  model: db.UserProfile,
                  as: 'profile',
                  attributes: ['firstName', 'lastName', 'avatar']
                }
              ]
            },
            {
              model: db.User,
              as: 'seller',
              attributes: ['id', 'email'],
              include: [
                {
                  model: db.UserProfile,
                  as: 'profile',
                  attributes: ['firstName', 'lastName', 'avatar']
                }
              ]
            },
            {
              model: db.Equipment,
              as: 'equipment',
              attributes: ['id', 'title', 'price', 'status']
            }
          ]
        });
      }

      // 4. Відповідь
      res.status(200).json({
        status: 'success',
        data: {
          chat
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання списку чатів користувача
   */
  static getUserChats = async (req, res, next) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      // 1. Запит до бази даних
      const { count, rows } = await db.Chat.findAndCountAll({
        where: {
          [Op.or]: [
            { buyerId: userId },
            { sellerId: userId }
          ]
        },
        include: [
          {
            model: db.User,
            as: 'buyer',
            attributes: ['id', 'email'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'avatar']
              }
            ]
          },
          {
            model: db.User,
            as: 'seller',
            attributes: ['id', 'email'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'avatar']
              }
            ]
          },
          {
            model: db.Equipment,
            as: 'equipment',
            attributes: ['id', 'title', 'price', 'status']
          },
          {
            model: db.Message,
            as: 'messages',
            attributes: ['id', 'content', 'createdAt'],
            limit: 1,
            order: [['createdAt', 'DESC']]
          }
        ],
        order: [['lastMessageAt', 'DESC']],
        limit,
        offset,
        distinct: true
      });

      // 2. Форматування результатів
      const chats = rows.map(chat => {
        const lastMessage = chat.messages[0] || null;
        const otherUser = chat.buyerId === userId ? chat.seller : chat.buyer;
        return {
          id: chat.id,
          lastMessage,
          lastMessageAt: chat.lastMessageAt,
          otherUser,
          equipment: chat.equipment
        };
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
          chats
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання повідомлень чату
   */
  static getChatMessages = async (req, res, next) => {
    try {
      const { chatId } = req.params;
      const userId = req.user.id;
      const { page = 1, limit = 20 } = req.query;
      const offset = (page - 1) * limit;

      // 1. Перевірка, чи належить чат користувачу
      const chat = await db.Chat.findOne({
        where: {
          id: chatId,
          [Op.or]: [
            { buyerId: userId },
            { sellerId: userId }
          ]
        }
      });

      if (!chat) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Ви не маєте доступу до цього чату'
        );
      }

      // 2. Отримання повідомлень
      const { count, rows } = await db.Message.findAndCountAll({
        where: { chatId },
        include: [
          {
            model: db.User,
            as: 'sender',
            attributes: ['id', 'email'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'avatar']
              }
            ]
          }
        ],
        order: [['createdAt', 'DESC']],
        limit,
        offset
      });

      // 3. Позначення повідомлень як прочитаних
      await db.Message.update(
        { isRead: true },
        {
          where: {
            chatId,
            senderId: { [Op.ne]: userId },
            isRead: false
          }
        }
      );

      // 4. Оновлення чату (lastMessageAt)
      if (rows.length > 0) {
        await chat.update({ lastMessageAt: new Date() });
      }

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
          messages: rows.reverse() // Повертаємо у хронологічному порядку
        }
      });
    } catch (error) {
      next(error);
    }
  };

  /**
   * Надсилання повідомлення
   */
  static sendMessage = async (req, res, next) => {
    try {
      const { chatId, content } = req.body;
      const senderId = req.user.id;

      // 1. Перевірка, чи належить чат користувачу
      const chat = await db.Chat.findOne({
        where: {
          id: chatId,
          [Op.or]: [
            { buyerId: senderId },
            { sellerId: senderId }
          ]
        }
      });

      if (!chat) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Ви не маєте доступу до цього чату'
        );
      }

      // 2. Перевірка вмісту повідомлення
      if (!content || content.trim().length === 0) {
        throw ErrorHelper.generateError(
          'VALIDATION_ERROR',
          'Повідомлення не може бути порожнім'
        );
      }

      // 3. Створення повідомлення
      const message = await db.Message.create({
        chatId,
        senderId,
        content: content.trim()
      });

      // 4. Оновлення чату (lastMessageAt)
      await chat.update({ lastMessageAt: new Date() });

      // 5. Отримання повної інформації про повідомлення
      const fullMessage = await db.Message.findByPk(message.id, {
        include: [
          {
            model: db.User,
            as: 'sender',
            attributes: ['id', 'email'],
            include: [
              {
                model: db.UserProfile,
                as: 'profile',
                attributes: ['firstName', 'lastName', 'avatar']
              }
            ]
          }
        ]
      });

      // 6. Відповідь
      res.status(201).json({
        status: 'success',
        data: {
          message: fullMessage
        }
      });

      // 7. Відправка повідомлення через WebSocket (якщо підключено)
      if (req.app.get('io')) {
        const io = req.app.get('io');
        io.to(`chat_${chatId}`).emit('newMessage', {
          message: fullMessage,
          chatId
        });

        // Сповіщення для отримувача
        const recipientId = chat.buyerId === senderId ? chat.sellerId : chat.buyerId;
        io.to(`user_${recipientId}`).emit('newChatMessage', {
          message: fullMessage,
          chatId,
          senderId
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Видалення повідомлення
   */
  static deleteMessage = async (req, res, next) => {
    try {
      const { messageId } = req.params;
      const userId = req.user.id;

      // 1. Пошук повідомлення
      const message = await db.Message.findByPk(messageId, {
        include: [
          {
            model: db.Chat,
            as: 'chat',
            attributes: ['buyerId', 'sellerId']
          }
        ]
      });

      if (!message) {
        throw ErrorHelper.generateError(
          'NOT_FOUND',
          'Повідомлення не знайдено'
        );
      }

      // 2. Перевірка прав доступу
      if (message.senderId !== userId && !RoleManager.hasPermission(req.user.role, 'messages', 'delete')) {
        throw ErrorHelper.generateError(
          'FORBIDDEN',
          'Ви не можете видалити це повідомлення'
        );
      }

      // 3. Видалення повідомлення
      await message.destroy();

      // 4. Відповідь
      res.status(204).json({
        status: 'success',
        data: null
      });

      // 5. Сповіщення через WebSocket про видалення
      if (req.app.get('io')) {
        const io = req.app.get('io');
        io.to(`chat_${message.chatId}`).emit('messageDeleted', {
          messageId,
          chatId: message.chatId
        });
      }
    } catch (error) {
      next(error);
    }
  };

  /**
   * Отримання кількості непрочитаних повідомлень
   */
  static getUnreadCount = async (req, res, next) => {
    try {
      const userId = req.user.id;

      // 1. Отримання чатів користувача
      const userChats = await db.Chat.findAll({
        where: {
          [Op.or]: [
            { buyerId: userId },
            { sellerId: userId }
          ]
        },
        attributes: ['id']
      });

      const chatIds = userChats.map(chat => chat.id);

      // 2. Підрахунок непрочитаних повідомлень
      const unreadCount = await db.Message.count({
        where: {
          chatId: { [Op.in]: chatIds },
          senderId: { [Op.ne]: userId },
          isRead: false
        }
      });

      // 3. Відповідь
      res.status(200).json({
        status: 'success',
        data: {
          unreadCount
        }
      });
    } catch (error) {
      next(error);
    }
  };
}

export default ChatController;